import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, MatchGuessEntry } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  evaluateGuess,
  isValidSecretCode,
} from "@/lib/game-engine";

function safeMatch<T extends {player1Secret: string; player2Secret: string}>(match: T) {
  return { ...match, player1Secret: "", player2Secret: "" };
}

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const roomCode = searchParams.get("roomCode");

    if (roomCode) {
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.roomCode, roomCode.toUpperCase()));
      if (!match) return NextResponse.json({ match: null });
      // Never expose secrets in general fetch — only during active play with proper slot
      const safe = {
        ...match,
        player1Secret: "",
        player2Secret: "",
      };
      return NextResponse.json({ match: safe });
    }

    const recentMatches = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(20);

    const safeList = recentMatches.map((m) => ({
      ...m,
      player1Secret: "",
      player2Secret: "",
    }));

    return NextResponse.json({ matches: safeList });
  } catch (error) {
    console.error("GET /api/matches error:", error);
    return NextResponse.json({ error: "Failed to load matches" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json();
    const { action } = body;

    // 1. Create a Real Challenge / Match Room (Online 1v1 or Local 2-Phone)
    if (action === "create_room") {
      const {
        mode = "online_1v1",
        timerSeconds = 45,
        player1Id,
        player1Name,
        player1Avatar = "🦉",
        player1Division = "Bronze",
        player1Secret = "",
        targetOpponentName,
        targetOpponentAvatar,
        targetOpponentDivision,
        customRoomCode,
      } = body;

      if (!player1Name) {
        return NextResponse.json(
          { error: "Player name is required to host a room" },
          { status: 400 }
        );
      }

      const prefix = mode === "local_offline" ? "LOCAL" : "ROOM";
      const roomCode =
        customRoomCode?.toUpperCase() ||
        `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;

      const [created] = await db
        .insert(matches)
        .values({
          roomCode,
          mode,
          status: "waiting",
          timerSeconds: Number(timerSeconds),
          player1Id: player1Id ? Number(player1Id) : null,
          player1Name,
          player1Avatar,
          player1Division,
          player1Secret: isValidSecretCode(player1Secret) ? player1Secret : "",
          player2Name: targetOpponentName || "Waiting for Player 2...",
          player2Avatar: targetOpponentAvatar || "⚔️",
          player2Division: targetOpponentDivision || "Bronze",
          player2Secret: "",
          currentTurn: 1,
          guesses: [],
        })
        .returning();

      return NextResponse.json({ match: safeMatch(created) });
    }

    // 2. Join an existing Room (by roomCode) as Player 2
    if (action === "join_room") {
      const {
        roomCode,
        player2Id,
        player2Name,
        player2Avatar = "🦊",
        player2Division = "Bronze",
        player2Secret = "",
      } = body;

      const cleanCode = (roomCode || "").trim().toUpperCase();
      const [existing] = await db
        .select()
        .from(matches)
        .where(eq(matches.roomCode, cleanCode));

      if (!existing) {
        return NextResponse.json(
          { error: "Room code not found. Check the code and try again!" },
          { status: 404 }
        );
      }

      if (existing.status !== "waiting") return NextResponse.json({ error: "This room is already full." }, { status: 409 });
      const nextSecret2 = isValidSecretCode(player2Secret)
        ? player2Secret
        : existing.player2Secret;

      const bothSecretsReady =
        isValidSecretCode(existing.player1Secret) &&
        isValidSecretCode(nextSecret2);

      const [updated] = await db
        .update(matches)
        .set({
          status: bothSecretsReady ? "playing" : "setup",
          player2Id: player2Id ? Number(player2Id) : existing.player2Id,
          player2Name: player2Name || existing.player2Name,
          player2Avatar: player2Avatar || existing.player2Avatar,
          player2Division: player2Division || existing.player2Division,
          player2Secret: nextSecret2,
          turnStartedAt: new Date(),
        })
        .where(and(eq(matches.id, existing.id), eq(matches.status, "waiting")))
        .returning();

      if (!updated) return NextResponse.json({ error: "Room was just joined by another player." }, { status: 409 });
      return NextResponse.json({ match: safeMatch(updated) });
    }

    // 3. Lock in Secret Code for Player 1 or Player 2 in a Room
    if (action === "set_secret") {
      const { roomCode, playerSlot, secret } = body;
      if (!isValidSecretCode(secret)) {
        return NextResponse.json(
          { error: "Secret code must be 4 unique digits from 1-9" },
          { status: 400 }
        );
      }

      const [existing] = await db
        .select()
        .from(matches)
        .where(eq(matches.roomCode, (roomCode || "").toUpperCase()));

      if (!existing) {
        return NextResponse.json({ error: "Room not found" }, { status: 404 });
      }

      const slot: 1 | 2 = playerSlot === 2 ? 2 : 1;
      // Each player only writes their own secret. SQL evaluates readiness against the
      // current row, so simultaneous locks cannot overwrite one another.
      const [updated] = await db.update(matches).set({
        ...(slot === 1 ? { player1Secret: secret } : { player2Secret: secret }),
        status: sql`CASE WHEN ${slot === 1 ? matches.player2Secret : matches.player1Secret} <> '' AND ${matches.status} <> 'waiting' THEN 'playing' ELSE ${matches.status} END`,
        turnStartedAt: sql`CASE WHEN ${slot === 1 ? matches.player2Secret : matches.player1Secret} <> '' AND ${matches.status} <> 'waiting' THEN NOW() ELSE ${matches.turnStartedAt} END`,
      }).where(and(eq(matches.id, existing.id), sql`${matches.status} IN ('waiting', 'setup')`)).returning();
      if (!updated) return NextResponse.json({ error: "This match has already started." }, { status: 409 });
      return NextResponse.json({ match: safeMatch(updated) });
    }

    // 4. Submit a Real Guess or Timeout in a Room
    if (action === "submit_turn") {
      const { roomCode, playerSlot, guess, isTimeout = false } = body;
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.roomCode, (roomCode || "").toUpperCase()));

      if (!match) {
        return NextResponse.json({ error: "Match not found" }, { status: 404 });
      }
      if (match.status === "finished") {
        return NextResponse.json({ match: safeMatch(match) });
      }

      const slot: 1 | 2 = playerSlot === 2 ? 2 : 1;
      if (match.status !== "playing" || match.currentTurn !== slot) return NextResponse.json({ error: "Not your turn yet." }, { status: 409 });
      if (!isTimeout && !isValidSecretCode(guess)) return NextResponse.json({ error: "Enter four unique digits from 1 to 9." }, { status: 400 });
      if (isTimeout && (match.timerSeconds <= 0 || Date.now() < new Date(match.turnStartedAt).getTime() + match.timerSeconds * 1000 - 500)) return NextResponse.json({ error: "Turn has not timed out yet." }, { status: 409 });
      const targetSecret = slot === 1 ? match.player2Secret : match.player1Secret;

      if (!isTimeout && !isValidSecretCode(targetSecret)) {
        return NextResponse.json(
          { error: "Waiting for your opponent to lock in their secret 4-digit code first!" },
          { status: 400 }
        );
      }

      const currentGuesses: MatchGuessEntry[] = Array.isArray(match.guesses)
        ? [...match.guesses]
        : [];

      const turnNum =
        currentGuesses.filter((g) => g.playerSlot === slot).length + 1;

      let points = 0;
      let orders = 0;
      let isWin = false;

      if (!isTimeout) {
        const res = evaluateGuess(targetSecret, guess);
        points = res.points;
        orders = res.orders;
        isWin = res.isWin;
      }

      const entry: MatchGuessEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        playerSlot: slot,
        playerName: slot === 1 ? match.player1Name : match.player2Name,
        guess: isTimeout ? "TIMEOUT" : guess,
        points,
        orders,
        isTimeout: Boolean(isTimeout),
        turnNumber: turnNum,
        timestamp: new Date().toISOString(),
      };

      currentGuesses.push(entry);

      let newStatus = match.status;
      let winnerSlot = match.winnerSlot;
      let winnerName = match.winnerName;
      const nextTurn: 1 | 2 = slot === 1 ? 2 : 1;

      if (isWin) {
        newStatus = "finished";
        winnerSlot = slot;
        winnerName = slot === 1 ? match.player1Name : match.player2Name;
      }

      const [updated] = await db
        .update(matches)
        .set({
          guesses: currentGuesses,
          status: newStatus,
          winnerSlot,
          winnerName,
          currentTurn: nextTurn,
          turnStartedAt: new Date(),
        })
        .where(and(eq(matches.id, match.id), eq(matches.status, "playing"), eq(matches.currentTurn, slot), eq(matches.turnStartedAt, match.turnStartedAt)))
        .returning();

      if (!updated) return NextResponse.json({ error: "Turn already changed. Syncing match." }, { status: 409 });
      return NextResponse.json({ match: safeMatch(updated) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/matches error:", error);
    return NextResponse.json(
      { error: "Failed to process match action" },
      { status: 500 }
    );
  }
}
