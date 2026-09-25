import React, { useState } from "react";
import { Stack, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  approvalNotificationsWanted,
  notificationPermission,
  notificationsSupported,
  notificationsWanted,
  setApprovalNotificationsWanted,
  setNotificationsWanted,
} from "@/lib/browserNotifications";

/**
 * Browser notifications, for this browser only: one switch for all of them, and one for MCP tool calls
 * that wait for approval, so answers that finish can notify without them
 */
export const NotificationSettings: React.FC = () => {
  const { t } = useTranslation();
  const [permission, setPermission] = useState(notificationPermission);
  const [wanted, setWanted] = useState(notificationsWanted);
  const [approvalsWanted, setApprovalsWanted] = useState(approvalNotificationsWanted);

  const handleChange = async (checked: boolean) => {
    setWanted(checked);
    setPermission(await setNotificationsWanted(checked));
  };

  const handleApprovalsChange = (checked: boolean) => {
    setApprovalsWanted(checked);
    setApprovalNotificationsWanted(checked);
  };

  const available = notificationsSupported() && permission !== "denied";
  const hint =
    permission === "unsupported"
      ? t("notifications.unsupported")
      : permission === "denied"
        ? t("notifications.blocked")
        : t("notifications.settingDescription");

  return (
    <Stack gap="xs" mb="lg">
      <Switch
        label={t("notifications.setting")}
        checked={available && wanted}
        disabled={!available}
        onChange={e => handleChange(e.currentTarget.checked)}
      />
      <Text size="sm" c="dimmed">
        {hint}
      </Text>
      <Switch
        ml="xl"
        label={t("notifications.approvalsSetting")}
        description={t("notifications.approvalsSettingDescription")}
        checked={available && wanted && approvalsWanted}
        disabled={!available || !wanted}
        onChange={e => handleApprovalsChange(e.currentTarget.checked)}
      />
    </Stack>
  );
};
