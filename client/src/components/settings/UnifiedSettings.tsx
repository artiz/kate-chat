import React, { useMemo, useState } from "react";
import { Container, NavLink, Stack, Group, Title, Paper, ScrollArea, Grid, Divider } from "@mantine/core";
import {
  IconSettings,
  IconRobot,
  IconBrain,
  IconPlugConnected,
  IconWifi,
  IconShield,
  IconUser,
  IconUsers,
  IconPhoto,
  IconFile,
  IconKey,
} from "@tabler/icons-react";
import { useMutation } from "@apollo/client";
import { notifications } from "@mantine/notifications";

import { ModelsDashboard } from "@/components/models/ModelsDashboard";
import { AISettings } from "@/components/settings/AISettings";
import { MCPServersAdmin } from "@/components/admin/MCPServersAdmin";
import { ConnectivitySettings } from "@/components/settings/ConnectivitySettings";
import { ProfileSettings } from "@/components/settings/ProfileSettings";
import { PasswordSettings } from "@/components/settings/PasswordSettings";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ImageLibrary } from "@/components/library";
import { DocumentsDashboard } from "@/components/documents";

import { UPDATE_USER_MUTATION } from "@/store/services/graphql.queries";
import { useAppSelector, useAppDispatch } from "@/store";
import { setUser, UpdateUserInput, UserRole } from "@/store/slices/userSlice";

type MenuSection = "settings" | "admin" | "library";
type MenuItem =
  | "models"
  | "ai"
  | "mcp"
  | "connectivity"
  | "profile"
  | "password"
  | "users"
  | "media"
  | "documents";

interface IProps {
  onReloadAppData?: () => void;
  initialSection?: MenuSection;
  initialItem?: MenuItem;
}

export const UnifiedSettings: React.FC<IProps> = ({
  onReloadAppData,
  initialSection = "settings",
  initialItem = "models",
}) => {
  const { currentUser, appConfig } = useAppSelector(state => state.user);
  const dispatch = useAppDispatch();

  const [activeSection, setActiveSection] = useState<MenuSection>(initialSection);
  const [activeItem, setActiveItem] = useState<MenuItem>(initialItem);
  const [openSections, setOpenSections] = useState<Record<MenuSection, boolean>>({
    settings: true,
    admin: true,
    library: true,
  });

  const isLocalUser = useMemo(() => {
    return !currentUser?.googleId && !currentUser?.githubId && !currentUser?.microsoftId;
  }, [currentUser]);

  const isAdmin = currentUser?.role === UserRole.ADMIN;

  // Update user mutation
  const [updateUser, { loading: updateLoading }] = useMutation(UPDATE_USER_MUTATION, {
    onCompleted: data => {
      if (data?.updateUser) {
        dispatch(setUser(data.updateUser));
      }
      notifications.show({
        title: "Settings Updated",
        message: "Your settings have been updated successfully",
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
    await updateUser({
      variables: { input },
    });
    if (onReloadAppData) {
      onReloadAppData();
    }
  };

  const toggleSection = (section: MenuSection) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleItemClick = (section: MenuSection, item: MenuItem) => {
    setActiveSection(section);
    setActiveItem(item);
    // Auto-open section when clicking item
    if (!openSections[section]) {
      setOpenSections(prev => ({
        ...prev,
        [section]: true,
      }));
    }
  };

  const renderContent = () => {
    if (!currentUser) return null;

    switch (activeItem) {
      case "models":
        return <ModelsDashboard />;
      case "ai":
        return (
          <AISettings user={currentUser} updateUser={handleUpdateUser} updateLoading={updateLoading} />
        );
      case "mcp":
        return <MCPServersAdmin />;
      case "connectivity":
        return (
          <ConnectivitySettings
            user={currentUser}
            updateUser={handleUpdateUser}
            updateLoading={updateLoading}
          />
        );
      case "profile":
        return (
          <ProfileSettings user={currentUser} updateUser={handleUpdateUser} updateLoading={updateLoading} />
        );
      case "password":
        return <PasswordSettings />;
      case "users":
        return <AdminDashboard />;
      case "media":
        return <ImageLibrary />;
      case "documents":
        return <DocumentsDashboard />;
      default:
        return null;
    }
  };

  const getTitle = () => {
    switch (activeItem) {
      case "models":
        return "Models";
      case "ai":
        return "AI Settings";
      case "mcp":
        return "MCP Servers";
      case "connectivity":
        return "Connectivity";
      case "profile":
        return "Profile";
      case "password":
        return "Password";
      case "users":
        return "Users Management";
      case "media":
        return "Media Library";
      case "documents":
        return "Documents";
      default:
        return "Settings";
    }
  };

  if (!currentUser) return null;

  return (
    <Container size="xl" py="md">
      <Grid gutter="lg">
        {/* Left Sidebar Navigation */}
        <Grid.Col span={{ base: 12, sm: 3 }}>
          <Paper withBorder p="sm">
            <ScrollArea h={{ base: "auto", sm: "calc(100vh - 150px)" }} type="auto">
              <Stack gap={0}>
                {/* Settings Section */}
                <NavLink
                  label="Settings"
                  leftSection={<IconSettings size={18} />}
                  opened={openSections.settings}
                  onClick={() => toggleSection("settings")}
                  defaultOpened
                >
                  <NavLink
                    label="Models"
                    leftSection={<IconRobot size={16} />}
                    active={activeItem === "models"}
                    onClick={() => handleItemClick("settings", "models")}
                  />
                  <NavLink
                    label="AI"
                    leftSection={<IconBrain size={16} />}
                    active={activeItem === "ai"}
                    onClick={() => handleItemClick("settings", "ai")}
                  />
                  {isAdmin && (
                    <NavLink
                      label="MCP Servers"
                      leftSection={<IconPlugConnected size={16} />}
                      active={activeItem === "mcp"}
                      onClick={() => handleItemClick("settings", "mcp")}
                    />
                  )}
                  <NavLink
                    label="Connectivity"
                    leftSection={<IconWifi size={16} />}
                    active={activeItem === "connectivity"}
                    onClick={() => handleItemClick("settings", "connectivity")}
                  />
                </NavLink>

                <Divider my="xs" />

                {/* Admin Section */}
                <NavLink
                  label="Admin"
                  leftSection={<IconShield size={18} />}
                  opened={openSections.admin}
                  onClick={() => toggleSection("admin")}
                  defaultOpened
                >
                  <NavLink
                    label="Profile"
                    leftSection={<IconUser size={16} />}
                    active={activeItem === "profile"}
                    onClick={() => handleItemClick("admin", "profile")}
                  />
                  {isLocalUser && (
                    <NavLink
                      label="Password"
                      leftSection={<IconKey size={16} />}
                      active={activeItem === "password"}
                      onClick={() => handleItemClick("admin", "password")}
                    />
                  )}
                  {isAdmin && (
                    <NavLink
                      label="Users"
                      leftSection={<IconUsers size={16} />}
                      active={activeItem === "users"}
                      onClick={() => handleItemClick("admin", "users")}
                    />
                  )}
                </NavLink>

                <Divider my="xs" />

                {/* Library Section */}
                <NavLink
                  label="Library"
                  leftSection={<IconPhoto size={18} />}
                  opened={openSections.library}
                  onClick={() => toggleSection("library")}
                  defaultOpened
                >
                  <NavLink
                    label="Media"
                    leftSection={<IconPhoto size={16} />}
                    active={activeItem === "media"}
                    onClick={() => handleItemClick("library", "media")}
                  />
                  {appConfig?.ragEnabled && (
                    <NavLink
                      label="Documents"
                      leftSection={<IconFile size={16} />}
                      active={activeItem === "documents"}
                      onClick={() => handleItemClick("library", "documents")}
                    />
                  )}
                </NavLink>
              </Stack>
            </ScrollArea>
          </Paper>
        </Grid.Col>

        {/* Main Content Area */}
        <Grid.Col span={{ base: 12, sm: 9 }}>
          <Title order={2} mb="lg">
            {getTitle()}
          </Title>
          {renderContent()}
        </Grid.Col>
      </Grid>
    </Container>
  );
};
