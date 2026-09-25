import { UserChatEvent } from "@/types/graphql";

// Per browser, like the permission itself: on unless the user turned it off in their profile
const ENABLED_KEY = "browser-notifications";
// the permission prompt comes once, on the first message sent; the profile setting asks again
const ASKED_KEY = "browser-notifications-asked";
const TEXT_LENGTH = 160;
const SHOWN_LIMIT = 200;

type Translate = (key: string, options?: Record<string, unknown>) => string;

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the setting lasts for this page only
  }
};

export const notificationsSupported = (): boolean => typeof window !== "undefined" && "Notification" in window;

export const notificationPermission = (): NotificationPermission | "unsupported" =>
  notificationsSupported() ? Notification.permission : "unsupported";

/** Whether the user wants notifications in this browser (the permission is a separate matter) */
export const notificationsWanted = (): boolean => readStorage(ENABLED_KEY) !== "off";

export const notificationsEnabled = (): boolean => notificationsWanted() && notificationPermission() === "granted";

/** Turns notifications on or off in this browser; turning them on asks for the permission if needed */
export async function setNotificationsWanted(wanted: boolean): Promise<NotificationPermission | "unsupported"> {
  writeStorage(ENABLED_KEY, wanted ? "on" : "off");
  if (!wanted || !notificationsSupported()) return notificationPermission();

  writeStorage(ASKED_KEY, "1");
  if (Notification.permission === "default") {
    return await Notification.requestPermission();
  }
  return Notification.permission;
}

/** Asks for the permission once per browser, on a user action such as sending a message */
export function askNotificationsOnce(): void {
  if (!notificationsSupported() || !notificationsWanted()) return;
  if (Notification.permission !== "default" || readStorage(ASKED_KEY)) return;

  writeStorage(ASKED_KEY, "1");
  Notification.requestPermission().catch(() => undefined);
}

export interface ViewState {
  /** the page is visible and has the focus */
  active: boolean;
  /** the chat open on the page, if any */
  chatId?: string;
}

export const currentViewState = (chatId?: string): ViewState => ({
  active: typeof document !== "undefined" && document.visibilityState === "visible" && document.hasFocus(),
  chatId,
});

/** Tell the user unless they are looking at that chat right now */
export const shouldNotify = (event: UserChatEvent, view: ViewState): boolean =>
  !(view.active && view.chatId === event.chatId);

const eventKey = (event: UserChatEvent) => [event.kind, event.messageId, event.callId].filter(Boolean).join(":");

const plainText = (text?: string) =>
  (text || "")
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/[#*_`>|~[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEXT_LENGTH);

export interface NotificationContent {
  title: string;
  body: string;
  tag: string;
  requireInteraction: boolean;
}

export function notificationContent(event: UserChatEvent, t: Translate): NotificationContent {
  const chat = event.chatTitle || t("notifications.untitledChat");
  const tag = eventKey(event);

  if (event.kind === "approval") {
    return {
      title: t("notifications.approvalTitle"),
      body: t("notifications.approvalBody", { chat, tool: event.text || "" }),
      tag,
      // a waiting answer goes nowhere until the user comes back
      requireInteraction: true,
    };
  }

  return {
    title: t(event.kind === "error" ? "notifications.errorTitle" : "notifications.completedTitle", { chat }),
    body: plainText(event.text) || t("notifications.completedBody"),
    tag,
    requireInteraction: false,
  };
}

// several events may name the same answer (another tab, a republished message): each is shown once
const shown = new Set<string>();

/** Shows a browser notification for the event; false when it was not shown */
export function showBrowserNotification(event: UserChatEvent, t: Translate, onClick: () => void): boolean {
  if (!notificationsEnabled()) return false;

  const key = eventKey(event);
  if (shown.has(key)) return true;
  if (shown.size >= SHOWN_LIMIT) shown.clear();
  shown.add(key);

  const { title, body, tag, requireInteraction } = notificationContent(event, t);
  try {
    const notification = new Notification(title, { body, tag, requireInteraction, icon: "/favicon.ico" });
    notification.onclick = () => {
      window.focus();
      onClick();
      notification.close();
    };
    return true;
  } catch {
    // Android Chrome allows notifications from a service worker only
    return false;
  }
}
