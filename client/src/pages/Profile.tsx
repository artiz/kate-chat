import React from "react";
import { Container, Title } from "@mantine/core";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";
import { ProfileSettings as ProfileSettingsComponent } from "@/components/settings/ProfileSettings";
import { UPDATE_USER_MUTATION } from "@/store/services/graphql.queries";
import { useAppSelector, useAppDispatch } from "@/store";
import { setUser, UpdateUserInput } from "@/store/slices/userSlice";

interface IProps {
  onReloadAppData?: () => void;
}

export const Profile = ({ onReloadAppData }: IProps) => {
  const { currentUser } = useAppSelector(state => state.user);
  const dispatch = useAppDispatch();

  const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION, {
    onCompleted: data => {
      if (data?.updateUser) {
        dispatch(setUser(data.updateUser));
      }
      notifications.show({
        title: "Profile Updated",
        message: "Your profile has been updated successfully",
        color: "green",
      });
    },
    onError: error => {
      notifications.show({
        title: "Update Failed",
        message: error.message || "Failed to update profile",
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
        Profile
      </Title>
      <ProfileSettingsComponent user={currentUser} updateUser={handleUpdateUser} updateLoading={updateLoading} />
    </Container>
  );
};
