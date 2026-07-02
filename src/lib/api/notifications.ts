import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriEnv } from "./env";
import { invokeBackend } from "./errors";

export interface NotificationRecord {
  id: number;
  videoId: string;
  title: string;
  channelId: string | null;
  channelName: string;
  thumbnailUrl: string | null;
  publishedText: string | null;
  kind: string;
  isRead: boolean;
  /** Unix epoch milliseconds. */
  createdAt: number;
}

/** Event name emitted by the Rust poll worker when new notifications land. */
const NEW_NOTIFICATIONS_EVENT = "notifications://new";

export async function getNotifications(limit = 200): Promise<NotificationRecord[]> {
  if (!(await isTauriEnv())) return [];
  return invokeBackend<NotificationRecord[]>("get_notifications", { limit });
}

export async function getUnreadNotificationCount(): Promise<number> {
  if (!(await isTauriEnv())) return 0;
  return invokeBackend<number>("get_unread_notification_count");
}

export async function markNotificationsRead(): Promise<void> {
  if (!(await isTauriEnv())) return;
  return invokeBackend<void>("mark_notifications_read");
}

export async function deleteNotification(id: number): Promise<void> {
  if (!(await isTauriEnv())) return;
  return invokeBackend<void>("delete_notification", { id });
}

export async function clearNotifications(): Promise<void> {
  if (!(await isTauriEnv())) return;
  return invokeBackend<void>("clear_notifications");
}

/** Manually triggers a subscription check; resolves with the count created. */
export async function checkSubscriptionsNow(): Promise<number> {
  if (!(await isTauriEnv())) return 0;
  return invokeBackend<number>("check_subscriptions_now");
}


export async function onNewNotifications(
  callback: (notifications: NotificationRecord[]) => void,
): Promise<UnlistenFn> {
  if (!(await isTauriEnv())) return () => {};
  return listen<NotificationRecord[]>(NEW_NOTIFICATIONS_EVENT, (event) => {
    callback(event.payload ?? []);
  });
}
