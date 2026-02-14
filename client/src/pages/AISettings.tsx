import React from "react";
import { useTranslation } from "react-i18next";
import { Container, Title } from "@mantine/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { AISettings as AISettingsComponent } from "@/components/settings/AISettings";
import { UPDATE_USER_MUTATION } from "@/store/services/graphql.queries";
import { useAppSelector, useAppDispatch } from "@/store";
import { setUser, UpdateUserInput } from "@/store/slices/userSlice";

interface IProps {
  onReloadAppData?: () => void;
}

export const AISettings = ({ onReloadAppData }: IProps) => {
  const { t } = useTranslation();
  const { currentUser } = useAppSelector(state => state.user);
  const dispatch = useAppDispatch();

  const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION, {
    onCompleted: data => {
      if (data?.updateUser) {
        dispatch(setUser(data.updateUser));
      }
      notifications.show({
        title: t("settings.aiUpdated"),
        message: t("settings.aiUpdatedMessage"),
        color: "green",
      });
    },
    onError: error => {
      notifications.show({
        title: t("connectivity.updateFailed"),
        message: error.message || t("connectivity.updateFailedMessage"),
        color: "red",
      });
    },
  });

  const handleUpdateUser = async (input: UpdateUserInput) => {
    await updateUser({ variables: { input } });
    if (onReloadAppData) {
      onReloadAppData();
    }
  };

  if (!currentUser) return null;

  return (
    <Container size="lg" py="xl">
      <Title order={2} mb="lg">
        {t("aiSettings.title")}
      </Title>
      <AISettingsComponent user={currentUser} updateUser={handleUpdateUser} updateLoading={updateLoading} />
    </Container>
  );
};
