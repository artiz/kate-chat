import {
  askNotificationsOnce,
  notificationContent,
  setNotificationsWanted,
  shouldNotify,
  showBrowserNotification,
} from "../lib/browserNotifications";
import { UserChatEvent } from "../types/graphql";

const t = (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key);

const event = (kind: UserChatEvent["kind"], extra: Partial<UserChatEvent> = {}): UserChatEvent => ({
  chatId: "chat-1",
  messageId: `m-${Math.random()}`,
  kind,
  chatTitle: "Trip plan",
  ...extra,
});

class FakeNotification {
  static permission: NotificationPermission = "granted";
  static requestPermission = jest.fn(async () => FakeNotification.permission);
  static shown: FakeNotification[] = [];
  onclick?: () => void;
  close = jest.fn();
  constructor(
    public title: string,
    public options: NotificationOptions
  ) {
    FakeNotification.shown.push(this);
  }
}

beforeEach(() => {
  localStorage.clear();
  window.focus = jest.fn(); // jsdom has none
  FakeNotification.permission = "granted";
  FakeNotification.shown = [];
  FakeNotification.requestPermission.mockClear();
  (window as unknown as { Notification: unknown }).Notification = FakeNotification;
});

describe("shouldNotify", () => {
  it("stays quiet only while the user looks at that chat", () => {
    expect(shouldNotify(event("completed"), { active: true, chatId: "chat-1" })).toBe(false);
    expect(shouldNotify(event("completed"), { active: true, chatId: "chat-2" })).toBe(true);
    expect(shouldNotify(event("completed"), { active: false, chatId: "chat-1" })).toBe(true);
    expect(shouldNotify(event("approval"), { active: true })).toBe(true);
  });
});

describe("notificationContent", () => {
  it("names the chat and a plain-text start of the answer", () => {
    const content = notificationContent(
      event("completed", { messageId: "m1", text: "## Plan\n\n**Day 1**: Rome\n```js\ncode()\n```" }),
      t
    );
    expect(content.title).toBe('notifications.completedTitle {"chat":"Trip plan"}');
    expect(content.body).toBe("Plan Day 1: Rome");
    expect(content.tag).toBe("completed:m1");
    expect(content.requireInteraction).toBe(false);
  });

  it("keeps an approval request on screen until the user acts", () => {
    const content = notificationContent(event("approval", { messageId: "m1", callId: "c1", text: "Gmail: send" }), t);
    expect(content.body).toBe('notifications.approvalBody {"chat":"Trip plan","tool":"Gmail: send"}');
    expect(content.tag).toBe("approval:m1:c1");
    expect(content.requireInteraction).toBe(true);
  });
});

describe("showBrowserNotification", () => {
  it("shows each event once and opens the chat on click", () => {
    const open = jest.fn();
    const e = event("completed", { text: "Done" });
    expect(showBrowserNotification(e, t, open)).toBe(true);
    expect(showBrowserNotification(e, t, open)).toBe(true);
    expect(FakeNotification.shown).toHaveLength(1);

    FakeNotification.shown[0].onclick?.();
    expect(open).toHaveBeenCalled();
    expect(FakeNotification.shown[0].close).toHaveBeenCalled();
  });

  it("shows nothing without the permission or when turned off", async () => {
    FakeNotification.permission = "denied";
    expect(showBrowserNotification(event("completed"), t, jest.fn())).toBe(false);

    FakeNotification.permission = "granted";
    await setNotificationsWanted(false);
    expect(showBrowserNotification(event("completed"), t, jest.fn())).toBe(false);
    expect(FakeNotification.shown).toHaveLength(0);
  });
});

describe("the permission prompt", () => {
  it("comes once, on the first message", () => {
    FakeNotification.permission = "default";
    askNotificationsOnce();
    askNotificationsOnce();
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("comes again when the user turns notifications on", async () => {
    FakeNotification.permission = "default";
    askNotificationsOnce();
    await setNotificationsWanted(true);
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(2);
  });

  it("does not come when the user turned notifications off", async () => {
    FakeNotification.permission = "default";
    await setNotificationsWanted(false);
    askNotificationsOnce();
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });
});
