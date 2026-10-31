import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { pushSubscriptions } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { and, eq } from "drizzle-orm";
import { verifyToken } from "@/lib/auth-server";
import { pushPublicKey } from "@/lib/push-server";

export async function GET() {
  return NextResponse.json({ publicKey: pushPublicKey() });
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json().catch(() => ({}));
    const playerId = verifyToken(body.token || req.headers.get("authorization")?.replace("Bearer ", ""));
    if (!playerId) {
      return NextResponse.json({ error: "Please sign in again.", code: "auth" }, { status: 401 });
    }

    if (body.action === "subscribe") {
      const sub = body.subscription || {};
      const endpoint = String(sub.endpoint || "");
      const p256dh = String(sub.keys?.p256dh || "");
      const auth = String(sub.keys?.auth || "");
      if (!endpoint.startsWith("https://") || !p256dh || !auth) {
        return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
      }
      await db
        .insert(pushSubscriptions)
        .values({ playerId, endpoint, p256dh, auth })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: { playerId, p256dh, auth },
        });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "unsubscribe") {
      const endpoint = String(body.endpoint || "");
      if (endpoint) {
        await db
          .delete(pushSubscriptions)
          .where(and(eq(pushSubscriptions.playerId, playerId), eq(pushSubscriptions.endpoint, endpoint)));
      } else {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.playerId, playerId));
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/push error:", error);
    return NextResponse.json({ error: "Failed to process push action" }, { status: 500 });
  }
}
