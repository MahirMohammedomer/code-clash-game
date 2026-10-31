import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, chatMessages } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, gt, asc, isNull, and } from "drizzle-orm";
import { verifyToken } from "@/lib/auth-server";
import { rateLimit, sanitizeText } from "@/lib/security";
import { normalizeAvatar } from "@/lib/avatar";

/** Global lobby chat (read by everyone, posted by signed-in players). */

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const since = Number(searchParams.get("since") || 0);
    const rows = await db
      .select()
      .from(chatMessages)
      .where(and(isNull(chatMessages.receiverId), gt(chatMessages.id, since)))
      .orderBy(asc(chatMessages.id))
      .limit(80);
    return NextResponse.json({
      messages: rows.map((m) => ({
        id: m.id,
        senderId: m.senderId,
        senderName: m.senderName,
        senderAvatar: normalizeAvatar(m.senderAvatarConfig),
        content: m.content,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
    });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json().catch(() => ({}));
    const playerId = verifyToken(body.token);
    if (!playerId) return NextResponse.json({ error: "Sign in to chat." }, { status: 401 });
    const [me] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!me) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const rl = rateLimit(`lobby:${me.id}`, 10, 30000);
    if (!rl.ok) return NextResponse.json({ error: "Slow down a little!" }, { status: 429 });

    const content = sanitizeText(body.content, 220);
    if (!content) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    const [row] = await db
      .insert(chatMessages)
      .values({
        senderId: me.id,
        senderName: me.username,
        senderAvatarConfig: normalizeAvatar(me.avatarConfig),
        receiverId: null,
        content,
      })
      .returning();

    return NextResponse.json({
      message: {
        id: row.id,
        senderId: row.senderId,
        senderName: row.senderName,
        senderAvatar: normalizeAvatar(row.senderAvatarConfig),
        content: row.content,
        createdAt: new Date(row.createdAt).toISOString(),
      },
    });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
