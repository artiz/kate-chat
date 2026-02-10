import React, { useMemo } from "react";
import { Tabs } from "@mantine/core";
import { AISettings } from "./AISettings";
import { ProfileSettings } from "./ProfileSettings";
import { PasswordSettings } from "./PasswordSettings";
import { useMutation } from "@apollo/client";
import { UPDATE_USER_MUTATION } from "@/store/services/graphql.queries";
import { useAppSelector, useAppDispatch } from "@/store";
import { notifications } from "@mantine/notifications";
import { setUser, UpdateUserInput } from "@/store/slices/userSlice";
import { ConnectivitySettings } from "./ConnectivitySettings";

interface IProps {
  onReloadAppData?: () => void;
}

export const ApplicationSettings: React.FC<IProps> = ({ onReloadAppData }: IProps) => {
  const { currentUser } = useAppSelector(state => state.user);
  const dispatch = useAppDispatch();

  const isLocalUser = useMemo(() => {
    return !currentUser?.authProvider || currentUser?.authProvider === "local";
  }, [currentUser]);

  // Update user mutation
  const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION, {
    onCompleted: data => {
      // Update the user in the Redux store
      if (data?.updateUser) {
        dispatch(setUser(data.updateUser));
      }

      notifications.show({
        title: "Profile Updated",
        message: "Your profile information has been updated successfully",
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
    await updateUser({
      variables: { input },
    });
    if (onReloadAppData) {
      onReloadAppData();
    }
  };

  if (!currentUser) return null;

  return (
    <Tabs defaultValue="ai">
      <Tabs.List mb="md">
        <Tabs.Tab value="ai">AI Settings</Tabs.Tab>
        <Tabs.Tab value="connectivity">Connectivity Settings</Tabs.Tab>
        <Tabs.Tab value="profile">Profile Settings</Tabs.Tab>
        {isLocalUser && <Tabs.Tab value="password">Password</Tabs.Tab>}
      </Tabs.List>

      <Tabs.Panel value="connectivity">
        <ConnectivitySettings user={currentUser} updateUser={handleUpdateUser} updateLoading={updateLoading} />
      </Tabs.Panel>

      <Tabs.Panel value="ai">
        <AISettings user={currentUser} updateUser={handleUpdateUser} updateLoading={updateLoading} />
      </Tabs.Panel>

      <Tabs.Panel value="profile">
        <ProfileSettings user={currentUser} updateUser={handleUpdateUser} updateLoading={updateLoading} />
      </Tabs.Panel>

      {isLocalUser && (
        <Tabs.Panel value="password">
          <PasswordSettings />
        </Tabs.Panel>
      )}
    </Tabs>
  );
};
