import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@apollo/client";
import { Center, Loader, Text } from "@mantine/core";
import { useAppSelector, useAppDispatch } from "../store";
import { addChat } from "@/store/slices/chatSlice";
import { notifications } from "@mantine/notifications";
import { FIND_PRISTINE_CHAT, CREATE_CHAT_MUTATION } from "@/store/services/graphql.queries";
import { useChatMessages } from "@/hooks";
import { ModelType } from "@katechat/ui";
import { CreateChatInput } from "@/types/graphql";

export const CreateChat: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { models: allModels } = useAppSelector(state => state.models);
  const { chats } = useAppSelector(state => state.chats);

  const user = useAppSelector(state => state.user.currentUser);
  const { updateChat } = useChatMessages();

  // Find model to use - priority:
  // 1. User's default model
  // 2. First active model
  const modelToUse = useMemo(() => {
    const models = allModels.filter(model => model.isActive && model.type !== ModelType.EMBEDDING);
    const userDefaultModel = user?.settings?.defaultModelId
      ? models.find(model => model.modelId === user.settings!.defaultModelId)
      : null;
    return userDefaultModel || models[0] || null;
  }, [allModels, user]);

  const pristineChat = useMemo(() => {
    return chats?.find(chat => chat.isPristine);
  }, [chats]);

  useEffect(() => {
    if (pristineChat) {
      // Navigate to the pristine chat
      navigate(`/chat/${pristineChat.id}`);
    }
  }, [pristineChat]);

  // Find pristine chat query
  useQuery(FIND_PRISTINE_CHAT, {
    fetchPolicy: "network-only",
    skip: !!pristineChat, // Skip if we already have a pristine chat in the store
    onCompleted: data => {
      const pristineChat = data?.findPristineChat;

      if (pristineChat) {
        // Found a pristine chat, navigate to it
        updateChat(pristineChat.id, { modelId: modelToUse?.modelId }, () => {
          navigate(`/chat/${pristineChat.id}`);
        });
      } else {
        // No pristine chat found, create a new one
        createNewChat();
      }
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToCheckChats"),
        color: "red",
      });
      navigate("/chat");
    },
  });

  // Create chat mutation
  const [createChat] = useMutation(CREATE_CHAT_MUTATION, {
    onCompleted: data => {
      dispatch(addChat(data.createChat));
      navigate(`/chat/${data.createChat.id}`);
    },
    onError: error => {
      notifications.show({
        title: t("common.error"),
        message: error.message || t("chat.failedToCreateChat"),
        color: "red",
      });
      navigate("/chat");
    },
  });

  // Create new chat function
  const createNewChat = () => {
    if (!modelToUse) {
      notifications.show({
        title: t("chat.noModelsAvailable"),
        message: t("chat.configureModels"),
        color: "yellow",
      });
      navigate("/chat");
      return;
    }

    const chatInput: CreateChatInput = {
      modelId: modelToUse.modelId,
    };

    // Add system prompt if available
    if (user?.settings?.defaultSystemPrompt) {
      chatInput.systemPrompt = user.settings.defaultSystemPrompt;
    }

    createChat({
      variables: {
        input: chatInput,
      },
    });
  };

  return (
    <Center flex={1} m="xl">
      <Loader size="lg" />
      <Text ml="md">{t("chat.creatingNewChat")}</Text>
    </Center>
  );
};
