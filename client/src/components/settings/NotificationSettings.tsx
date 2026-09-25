import React, { useState } from "react";
import { Stack, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  notificationPermission,
  notificationsSupported,
  notificationsWanted,
  setNotificationsWanted,
} from "@/lib/browserNotifications";
import { UpdateUserInput, User } from "@/store/slices/userSlice";

interface NotificationSettingsProps {
  user: User;
  updateUser: (input: UpdateUserInput) => Promise<void>;
}

/**
 * Browser notifications (for this browser only) and MCP tool call approvals (for the account): with
 * approvals off, tools of servers set to ask first run right away, and nothing waits or notifies
 */
export const NotificationSettings: React.FC<NotificationSettingsProps> = ({ user, updateUser }) => {
  const { t } = useTranslation();
  const [permission, setPermission] = useState(notificationPermission);
  const [wanted, setWanted] = useState(notificationsWanted);
  const [approvals, setApprovals] = useState(user.settings?.mcpToolApprovals !== false);

  const handleChange = async (checked: boolean) => {
    setWanted(checked);
    setPermission(await setNotificationsWanted(checked));
  };

  const handleApprovalsChange = async (checked: boolean) => {
    setApprovals(checked);
    try {
      await updateUser({ settings: { mcpToolApprovals: checked } });
    } catch {
      setApprovals(!checked);
    }
  };

  const available = notificationsSupported() && permission !== "denied";
  const hint =
    permission === "unsupported"
      ? t("notifications.unsupported")
      : permission === "denied"
        ? t("notifications.blocked")
        : t("notifications.settingDescription");

  return (
    <Stack gap="md" mb="lg">
      <Stack gap="xs">
        <Switch
          label={t("notifications.setting")}
          checked={available && wanted}
          disabled={!available}
          onChange={e => handleChange(e.currentTarget.checked)}
        />
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      </Stack>
      <Switch
        label={t("notifications.approvalsSetting")}
        description={t("notifications.approvalsSettingDescription")}
        checked={approvals}
        onChange={e => handleApprovalsChange(e.currentTarget.checked)}
      />
    </Stack>
  );
};
