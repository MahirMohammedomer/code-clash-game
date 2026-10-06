import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatMessages, players } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, desc, or, and, isNull, sql } from "drizzle-orm";

// Simple in-memory rate limit (per IP / player)
const rateMap = new Map<string, { count: number; reset: number }>();

function checkRateLimit(key: string, max = 8, windowMs = 10000): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.reset) {
    rateMap.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

function sanitizeMessage(text: string): string {
  return text
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const playerId = Number(searchParams.get("playerId") || 0);
    const withPlayerId = searchParams.get("with")
      ? Number(searchParams.get("with"))
      : null;
    const limit = Math.min(Number(searchParams.get("limit") || 40), 80);

    let messages;

    if (withPlayerId && playerId) {
      // Private chat between two players
      messages = await db
        .select()
        .from(chatMessages)
        .where(
          or(
            and(
              eq(chatMessages.senderId, playerId),
              eq(chatMessages.receiverId, withPlayerId)
            ),
            and(
              eq(chatMessages.senderId, withPlayerId),
              eq(chatMessages.receiverId, playerId)
            )
          )
        )
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit);
    } else {
      // Global chat
      messages = await db
        .select()
        .from(chatMessages)
        .where(isNull(chatMessages.receiverId))
        .orderBy(desc(chatMessages.createdAt))
        .limit(limit);
    }

    return NextResponse.json({
      messages: messages.reverse(),
    });
  } catch (error) {
    console.error("Chat GET error:", error);
    return NextResponse.json(
      { error: "Failed to load messages" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json();
    const { playerId, content, receiverId } = body;

    if (!playerId || !content) {
      return NextResponse.json(
        { error: "playerId and content are required" },
        { status: 400 }
      );
    }

    const clean = sanitizeMessage(String(content));
    if (clean.length < 1) {
      return NextResponse.json(
        { error: "Message is empty or invalid" },
        { status: 400 }
      );
    }

    // Rate limit
    const rateKey = `chat_${playerId}`;
    if (!checkRateLimit(rateKey, 6, 12000)) {
      return NextResponse.json(
        { error: "You are sending messages too fast. Please wait a moment." },
        { status: 429 }
      );
    }

    // Verify player exists
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, Number(playerId)))
      .limit(1);

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Update online status
    await db
      .update(players)
      .set({ isOnline: true, lastSeenAt: new Date() })
      .where(eq(players.id, player.id));

    const [msg] = await db
      .insert(chatMessages)
      .values({
        senderId: player.id,
        senderName: player.username,
        senderAvatar: player.avatarEmoji || "🦉",
        receiverId: receiverId ? Number(receiverId) : null,
        content: clean,
      })
      .returning();

    return NextResponse.json({ message: msg });
  } catch (error) {
    console.error("Chat POST error:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}
