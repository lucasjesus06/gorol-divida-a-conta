import "server-only";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { sendNotification } from "web-push";
import { asService, getDb } from "@/db/client";
import { notifications, pushSubscriptions } from "@/db/schema";
import { DomainError } from "@/domain/domain-error";
import type { NotificationDraft } from "@/domain/notification";

const LIST_LIMIT = 50;

function vapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function pushIsConfigured() {
  return vapid() !== null;
}

async function pushTo(personId: string, notice: NotificationDraft, tag: string) {
  const keys = vapid();
  if (!keys) {
    return;
  }
  const subscriptions = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.personId, personId));
  const payload = JSON.stringify({ title: notice.title, body: notice.body, url: notice.url, tag });

  await Promise.allSettled(
    subscriptions.map(async (subscription) => {
      try {
        await sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          { vapidDetails: keys, TTL: 60 * 60 * 24 },
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id));
        }
      }
    }),
  );
}

/**
 * Records the notice in the person's list and tries to push it to their devices.
 * It never throws: a notice that fails must not undo the action that caused it.
 */
export async function notify(personId: string, notice: NotificationDraft): Promise<void> {
  try {
    await asService(async () => {
      const [row] = await getDb()
        .insert(notifications)
        .values({ personId, kind: notice.kind, title: notice.title, body: notice.body, url: notice.url })
        .returning({ id: notifications.id });
      await pushTo(personId, notice, row.id);
    });
  } catch {
    // The list entry and the push are best effort; the caller's work has already been saved.
  }
}

export async function listNotifications(personId: string) {
  return getDb()
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      url: notifications.url,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.personId, personId))
    .orderBy(desc(notifications.createdAt))
    .limit(LIST_LIMIT);
}

export async function countUnread(personId: string): Promise<number> {
  return asService(() =>
    getDb().$count(notifications, and(eq(notifications.personId, personId), isNull(notifications.readAt))),
  );
}

export async function markRead(personId: string, notificationId: string): Promise<void> {
  await getDb()
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.id, notificationId), eq(notifications.personId, personId), isNull(notifications.readAt)));
}

export async function markAllRead(personId: string): Promise<void> {
  await getDb()
    .update(notifications)
    .set({ readAt: sql`now()` })
    .where(and(eq(notifications.personId, personId), isNull(notifications.readAt)));
}

export type DeviceSubscription = { endpoint: string; p256dh: string; auth: string };

function checkedSubscription(input: DeviceSubscription): DeviceSubscription {
  let url: URL;
  try {
    url = new URL(input.endpoint);
  } catch {
    throw new DomainError("invalid_subscription", "Não foi possível ligar os avisos neste aparelho.");
  }
  if (url.protocol !== "https:" || !input.p256dh || !input.auth) {
    throw new DomainError("invalid_subscription", "Não foi possível ligar os avisos neste aparelho.");
  }
  return input;
}

/** Registers (or moves to this person) a device; the same device never ends up twice. */
export async function saveSubscription(personId: string, input: DeviceSubscription): Promise<void> {
  const subscription = checkedSubscription(input);
  await asService(() =>
    getDb()
      .insert(pushSubscriptions)
      .values({ personId, ...subscription })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { personId, p256dh: subscription.p256dh, auth: subscription.auth },
      }),
  );
}

export async function removeSubscription(personId: string, endpoint: string): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.personId, personId), eq(pushSubscriptions.endpoint, endpoint)));
}
