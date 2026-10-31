import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, matchChatMessages, matchReactions } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, and, gt, asc } from "drizzle-orm";
import { rateLimit, sanitizeText } from "@/lib/security";
import { REACTION_IDS, QUICK_PHRASES } from "@/lib/game-engine";

/**
 * Private in-match chat + reactions between the two players of a room.
 * Auth = the room slot token (works for guests too).
 * Polling uses id cursors (sinceChat / sinceReact) so it stays cheap.
 */

async function authSlot(roomCode: string, token: string) {
  const rows = await db.select().from(matches).where(eq(matches.roomCode, roomCode)).limit(1);
  const m = rows[0];
  if (!m) return null;
  if (token && m.p1Token === token) return { match: m, slot: 1 as const, name: m.player1Name };
  if (token && m.p2Token === token) return { match: m, slot: 2 as const, name: m.player2Name };
  return null;
}

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const roomCode = (searchParams.get("roomCode") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const sinceChat = Number(searchParams.get("sinceChat") || 0);
    const sinceReact = Number(searchParams.get("sinceReact") || 0);
    if (!roomCode) return NextResponse.json({ messages: [], reactions: [] });

    const messages = await db
      .select()
      .from(matchChatMessages)
      .where(and(eq(matchChatMessages.roomCode, roomCode), gt(matchChatMessages.id, sinceChat)))
      .orderBy(asc(matchChatMessages.id))
      .limit(100);

    const reactions = await db
      .select()
      .from(matchReactions)
      .where(and(eq(matchReactions.roomCode, roomCode), gt(matchReactions.id, sinceReact)))
      .orderBy(asc(matchReactions.id))
      .limit(50);

    return NextResponse.json({
      messages: messages.map((x) => ({
        id: x.id,
        senderSlot: x.senderSlot,
        senderName: x.senderName,
        content: x.content,
        createdAt: new Date(x.createdAt).toISOString(),
      })),
      reactions: reactions.map((x) => ({
        id: x.id,
        senderSlot: x.senderSlot,
        senderName: x.senderName,
        reaction: x.emoji,
        createdAt: new Date(x.createdAt).toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/match-chat error:", error);
    return NextResponse.json({ messages: [], reactions: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json().catch(() => ({}));
    const roomCode = String(body.roomCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const auth = await authSlot(roomCode, String(body.token || ""));
    if (!auth) return NextResponse.json({ error: "Not in this match" }, { status: 403 });

    const rl = rateLimit(`mc:${roomCode}:${auth.slot}`, 20, 30000);
    if (!rl.ok) return NextResponse.json({ error: "Slow down a little!" }, { status: 429 });

    if (body.action === "message") {
      const content = sanitizeText(body.content, 220);
      if (!content) return NextResponse.json({ error: "Empty message" }, { status: 400 });
      const [row] = await db
        .insert(matchChatMessages)
        .values({ roomCode, senderSlot: auth.slot, senderName: auth.name, content })
        .returning();
      return NextResponse.json({
        message: { id: row.id, senderSlot: row.senderSlot, senderName: row.senderName, content: row.content, createdAt: new Date(row.createdAt).toISOString() },
      });
    }

    if (body.action === "phrase") {
      const phrase = String(body.phrase || "");
      if (!QUICK_PHRASES.includes(phrase)) return NextResponse.json({ error: "Unknown phrase" }, { status: 400 });
      const [row] = await db
        .insert(matchChatMessages)
        .values({ roomCode, senderSlot: auth.slot, senderName: auth.name, content: phrase })
        .returning();
      return NextResponse.json({
        message: { id: row.id, senderSlot: row.senderSlot, senderName: row.senderName, content: row.content, createdAt: new Date(row.createdAt).toISOString() },
      });
    }

    if (body.action === "reaction") {
      const reaction = String(body.reaction || "");
      if (!(REACTION_IDS as readonly string[]).includes(reaction)) {
        return NextResponse.json({ error: "Unknown reaction" }, { status: 400 });
      }
      const [row] = await db
        .insert(matchReactions)
        .values({ matchId: auth.match.id, roomCode, senderSlot: auth.slot, senderName: auth.name, emoji: reaction })
        .returning();
      return NextResponse.json({
        reaction: { id: row.id, senderSlot: row.senderSlot, senderName: row.senderName, reaction: row.emoji, createdAt: new Date(row.createdAt).toISOString() },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/match-chat error:", error);
    return NextResponse.json({ error: "Failed to send" }, { status: 500 });
  }
}
