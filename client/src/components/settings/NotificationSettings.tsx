import React, { useState } from "react";
import { Stack, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  notificationPermission,
  notificationsSupported,
  notificationsWanted,
  setNotificationsWanted,
} from "@/lib/browserNotifications";

/** Browser notifications about answers and tool calls that wait, for this browser only */
export const NotificationSettings: React.FC = () => {
  const { t } = useTranslation();
  const [permission, setPermission] = useState(notificationPermission);
  const [wanted, setWanted] = useState(notificationsWanted);

  const handleChange = async (checked: boolean) => {
    setWanted(checked);
    setPermission(await setNotificationsWanted(checked));
  };

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
        checked={notificationsSupported() && wanted && permission !== "denied"}
        disabled={!notificationsSupported() || permission === "denied"}
        onChange={e => handleChange(e.currentTarget.checked)}
      />
      <Text size="sm" c="dimmed">
        {hint}
      </Text>
    </Stack>
  );
};
