import { useEffect, useRef } from "react";
import { useSubscription } from "@apollo/client";
import { matchPath, useLocation, useNavigate } from "react-router-dom";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { USER_CHAT_EVENTS_SUBSCRIPTION } from "@/store/services/graphql.queries";
import { UserChatEvent } from "@/types/graphql";
import {
  currentViewState,
  notificationContent,
  notificationsWanted,
  shouldNotify,
  showBrowserNotification,
} from "@/lib/browserNotifications";

/**
 * Tells the user when an answer in one of their chats finishes or fails, or a tool call waits for
 * their approval, while they look at another chat, tab or window. Without the browser's permission,
 * a waiting tool call still shows up inside the app.
 */
export const useBrowserNotifications = (enabled: boolean) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const chatIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    chatIdRef.current = matchPath("/chat/:id/*", location.pathname)?.params.id;
  }, [location.pathname]);

  useSubscription<{ userChatEvents?: UserChatEvent }>(USER_CHAT_EVENTS_SUBSCRIPTION, {
    skip: !enabled,
    fetchPolicy: "no-cache",
    onData: ({ data }) => {
      const event = data.data?.userChatEvents;
      if (!event || !notificationsWanted()) return;

      const view = currentViewState(chatIdRef.current);
      if (!shouldNotify(event, view)) return;

      const open = () => navigate(`/chat/${event.chatId}`);
      if (showBrowserNotification(event, t, open)) return;

      if (event.kind === "approval" && view.active) {
        const { title, body, tag } = notificationContent(event, t);
        notifications.show({
          id: tag,
          title,
          message: body,
          color: "orange",
          autoClose: false,
          onClick: () => {
            notifications.hide(tag);
            open();
          },
          style: { cursor: "pointer" },
        });
      }
    },
    onError: error => console.warn("Chat events subscription failed", error),
  });
};
