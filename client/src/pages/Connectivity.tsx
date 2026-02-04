import React from "react";
import { Container, Title } from "@mantine/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { ConnectivitySettings as ConnectivitySettingsComponent } from "@/components/settings/ConnectivitySettings";
import { UPDATE_USER_MUTATION } from "@/store/services/graphql.queries";
import { useAppSelector, useAppDispatch } from "@/store";
import { setUser, UpdateUserInput } from "@/store/slices/userSlice";

interface IProps {
  onReloadAppData?: () => void;
}

export const Connectivity = ({ onReloadAppData }: IProps) => {
  const { currentUser } = useAppSelector(state => state.user);
  const dispatch = useAppDispatch();

  const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION, {
    onCompleted: data => {
      if (data?.updateUser) {
        dispatch(setUser(data.updateUser));
      }
      notifications.show({
        title: "Settings Updated",
        message: "Your connectivity settings have been updated successfully",
        color: "green",
      });
    },
    onError: error => {
      notifications.show({
        title: "Update Failed",
        message: error.message || "Failed to update settings",
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
        Connectivity
      </Title>
      <ConnectivitySettingsComponent user={currentUser} updateUser={handleUpdateUser} updateLoading={updateLoading} />
    </Container>
  );
};
