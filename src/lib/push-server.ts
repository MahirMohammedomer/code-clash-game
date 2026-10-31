/**
 * Web Push (server-only). Everything degrades gracefully when VAPID keys
 * are not configured — the game simply skips push notifications.
 *
 * Owner setup (see DEPLOY_INSTRUCTIONS.md):
 *   npx web-push generate-vapid-keys
 *   VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...  VAPID_SUBJECT=mailto:you@example.com
 */
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { eq } from "drizzle-orm";

export function pushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function pushPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

let configured = false;
async function getWebPush() {
  const webpush = (await import("web-push")).default;
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:admin@cipherclash.game",
      process.env.VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
    configured = true;
  }
  return webpush;
}

/** Best-effort push to every device a player subscribed with. Never throws. */
export async function sendPushToPlayer(
  playerId: number,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!pushConfigured()) return;
  try {
    const subs = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.playerId, playerId));
    if (subs.length === 0) return;
    const webpush = await getWebPush();
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || "/",
      tag: payload.tag || "cipher-clash",
      icon: "/icon-192.png",
    });
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            body,
            { TTL: 3600 }
          );
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id)).catch(() => {});
          }
        }
      })
    );
  } catch {
    /* push is best-effort */
  }
}
