import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatMessages, matchReactions, players } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, desc, and, or } from "drizzle-orm";
import { rateLimit, sanitizeText, assertPlayerId } from "@/lib/security";

const ALLOWED_REACTIONS = ["👍", "🔥", "😱", "😂", "💪", "🎯", "😤", "👀"];

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const roomCode = (searchParams.get("roomCode") || "").toUpperCase();
    const playerId = assertPlayerId(searchParams.get("playerId"));
    const opponentId = assertPlayerId(searchParams.get("opponentId"));

    if (!roomCode) {
      return NextResponse.json({ error: "roomCode required" }, { status: 400 });
    }

    // Private messages between the two players in this match
    let messages: any[] = [];
    if (playerId && opponentId) {
      messages = await db
        .select()
        .from(chatMessages)
        .where(
          or(
            and(
              eq(chatMessages.senderId, playerId),
              eq(chatMessages.receiverId, opponentId)
            ),
            and(
              eq(chatMessages.senderId, opponentId),
              eq(chatMessages.receiverId, playerId)
            )
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(50);
      messages = messages.reverse();
    }

    const reactions = await db
      .select()
      .from(matchReactions)
      .where(eq(matchReactions.roomCode, roomCode))
      .orderBy(desc(matchReactions.createdAt))
      .limit(30);

    return NextResponse.json({
      messages,
      reactions: reactions.reverse(),
    });
  } catch (e) {
    console.error("match-chat GET", e);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json();
    const { action, roomCode, playerId, playerName, content, emoji, opponentId } =
      body;

    const pid = assertPlayerId(playerId);
    const code = String(roomCode || "").toUpperCase().slice(0, 20);

    if (!code) {
      return NextResponse.json({ error: "roomCode required" }, { status: 400 });
    }

    if (action === "react") {
      if (!ALLOWED_REACTIONS.includes(emoji)) {
        return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
      }
      const rl = rateLimit(`react_${pid || playerName}_${code}`, 12, 15000);
      if (!rl.ok) {
        return NextResponse.json(
          { error: "Too many reactions" },
          { status: 429 }
        );
      }

      const [row] = await db
        .insert(matchReactions)
        .values({
          matchId: 0,
          roomCode: code,
          senderId: pid,
          senderName: sanitizeText(playerName || "Player", 20),
          emoji,
        })
        .returning();

      return NextResponse.json({ reaction: row });
    }

    // Default: send private message to opponent
    if (!pid) {
      return NextResponse.json(
        { error: "Login required to chat in match" },
        { status: 401 }
      );
    }

    const clean = sanitizeText(content, 200);
    if (!clean) {
      return NextResponse.json({ error: "Empty message" }, { status: 400 });
    }

    const rl = rateLimit(`mchat_${pid}`, 8, 12000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Sending too fast" },
        { status: 429 }
      );
    }

    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, pid))
      .limit(1);

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const [msg] = await db
      .insert(chatMessages)
      .values({
        senderId: player.id,
        senderName: player.username,
        senderAvatar: player.avatarEmoji || "🦉",
        receiverId: opponentId ? Number(opponentId) : null,
        content: clean,
      })
      .returning();

    return NextResponse.json({ message: msg });
  } catch (e) {
    console.error("match-chat POST", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
