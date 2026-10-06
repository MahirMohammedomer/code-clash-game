import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  tournaments,
  players,
  TournamentParticipant,
  BracketDuel,
} from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, desc } from "drizzle-orm";
import {
  generateRandomCode,
  isValidSecretCode,
  evaluateGuess,
} from "@/lib/game-engine";

export async function GET() {
  try {
    await ensureDatabaseReady();
    const list = await db
      .select()
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt));
    return NextResponse.json({ tournaments: list });
  } catch (error) {
    console.error("GET /api/tournaments error:", error);
    return NextResponse.json(
      { error: "Failed to load tournaments" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json();
    const { action } = body;

    // 1. Create a New Tournament (Mass Code Hunt or Bracket League, Public or Private)
    if (action === "create_tournament") {
      const {
        name,
        type = "mass_hunt",
        isPrivate = false,
        secretCode,
        prizeCoins = 500,
        prizeGems = 25,
        createdBy,
        creatorId,
        creatorEmoji = "🦉",
        creatorDivision = "Bronze",
      } = body;

      if (!name || !name.trim()) {
        return NextResponse.json(
          { error: "Please enter a tournament name" },
          { status: 400 }
        );
      }

      const cleanSecret = isValidSecretCode(secretCode)
        ? secretCode
        : generateRandomCode();

      const inviteCode = isPrivate
        ? `PRIV-${Math.floor(1000 + Math.random() * 9000)}`
        : null;

      const initialParticipants: TournamentParticipant[] = creatorId
        ? [
            {
              playerId: Number(creatorId),
              username: createdBy || "Host",
              avatarEmoji: creatorEmoji,
              division: creatorDivision,
              attempts: 0,
              solved: false,
              bestPoints: 0,
              bestOrders: 0,
              timeSeconds: 0,
            },
          ]
        : [];

      const initialBracket: BracketDuel[] =
        type === "bracket"
          ? [
              {
                id: "match-1",
                round: 1,
                label: "Round 1 Duel",
                player1Name: createdBy || "Host",
                player1Emoji: creatorEmoji,
                player2Name: "Waiting for Challenger...",
                player2Emoji: "⚔️",
                score1: 0,
                score2: 0,
                winnerName: null,
                status: "live",
              },
            ]
          : [];

      const [created] = await db
        .insert(tournaments)
        .values({
          name: name.trim(),
          type,
          status: "live",
          isPrivate: Boolean(isPrivate),
          inviteCode,
          secretCode: cleanSecret,
          prizeCoins: Number(prizeCoins),
          prizeGems: Number(prizeGems),
          participants: initialParticipants,
          bracketMatches: initialBracket,
          createdBy: createdBy || "Host",
        })
        .returning();

      return NextResponse.json({ tournament: created });
    }

    // 2. Join a Tournament as a Real Participant
    if (action === "join_tournament") {
      const {
        tournamentId,
        playerId,
        username,
        avatarEmoji = "🦉",
        division = "Bronze",
      } = body;

      const [tourney] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, Number(tournamentId)));

      if (!tourney) {
        return NextResponse.json(
          { error: "Tournament not found" },
          { status: 404 }
        );
      }

      const participants: TournamentParticipant[] = Array.isArray(
        tourney.participants
      )
        ? [...tourney.participants]
        : [];

      const alreadyIn = participants.some(
        (p) => p.playerId === Number(playerId) || p.username === username
      );

      if (!alreadyIn && username) {
        participants.push({
          playerId: Number(playerId || Date.now()),
          username,
          avatarEmoji,
          division,
          attempts: 0,
          solved: false,
          bestPoints: 0,
          bestOrders: 0,
          timeSeconds: 0,
        });
      }

      // If Bracket tournament has an open slot, slot this real challenger into the bracket
      const bracketMatches: BracketDuel[] = Array.isArray(
        tourney.bracketMatches
      )
        ? tourney.bracketMatches.map((duel) => {
            if (
              duel.player2Name === "Waiting for Challenger..." &&
              duel.player1Name !== username
            ) {
              return {
                ...duel,
                player2Name: username,
                player2Emoji: avatarEmoji,
              };
            }
            return duel;
          })
        : [];

      const [updated] = await db
        .update(tournaments)
        .set({ participants, bracketMatches })
        .where(eq(tournaments.id, tourney.id))
        .returning();

      return NextResponse.json({ tournament: updated });
    }

    // 3. Submit a Mass Code Hunt Guess
    if (action === "submit_hunt_guess") {
      const {
        tournamentId,
        playerId,
        username,
        avatarEmoji = "🦉",
        division = "Bronze",
        guess,
        elapsedSeconds = 20,
      } = body;

      const [tourney] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, Number(tournamentId)));

      if (!tourney) {
        return NextResponse.json(
          { error: "Tournament not found" },
          { status: 404 }
        );
      }

      const result = evaluateGuess(tourney.secretCode, guess);
      const participants: TournamentParticipant[] = Array.isArray(
        tourney.participants
      )
        ? [...tourney.participants]
        : [];

      const idx = participants.findIndex(
        (p) => p.playerId === Number(playerId) || p.username === username
      );

      if (idx >= 0) {
        const existing = participants[idx];
        participants[idx] = {
          ...existing,
          attempts: existing.attempts + 1,
          solved: existing.solved || result.isWin,
          bestPoints: Math.max(existing.bestPoints, result.points),
          bestOrders: Math.max(existing.bestOrders, result.orders),
          timeSeconds: result.isWin
            ? Number(elapsedSeconds)
            : existing.timeSeconds,
        };
      } else {
        participants.push({
          playerId: Number(playerId || Date.now()),
          username: username || "Challenger",
          avatarEmoji,
          division,
          attempts: 1,
          solved: result.isWin,
          bestPoints: result.points,
          bestOrders: result.orders,
          timeSeconds: Number(elapsedSeconds),
        });
      }

      participants.sort((a, b) => {
        if (a.solved !== b.solved) return a.solved ? -1 : 1;
        if (a.solved && b.solved) {
          if (a.attempts !== b.attempts) return a.attempts - b.attempts;
          return a.timeSeconds - b.timeSeconds;
        }
        if (b.bestOrders !== a.bestOrders) return b.bestOrders - a.bestOrders;
        return b.bestPoints - a.bestPoints;
      });

      const [updated] = await db
        .update(tournaments)
        .set({ participants })
        .where(eq(tournaments.id, tourney.id))
        .returning();

      if (result.isWin && playerId) {
        const [p] = await db
          .select()
          .from(players)
          .where(eq(players.id, Number(playerId)));
        if (p) {
          await db
            .update(players)
            .set({
              coins: p.coins + tourney.prizeCoins,
              gems: p.gems + tourney.prizeGems,
              seasonXp: p.seasonXp + 150,
            })
            .where(eq(players.id, p.id));
        }
      }

      return NextResponse.json({
        tournament: updated,
        evaluation: result,
      });
    }

    // 4. Complete a Bracket Match Victory
    if (action === "advance_bracket") {
      const { tournamentId, winnerName } = body;
      const [tourney] = await db
        .select()
        .from(tournaments)
        .where(eq(tournaments.id, Number(tournamentId)));

      if (!tourney) {
        return NextResponse.json(
          { error: "Tournament not found" },
          { status: 404 }
        );
      }

      const brackets: BracketDuel[] = Array.isArray(tourney.bracketMatches)
        ? tourney.bracketMatches.map((b) =>
            b.status === "live"
              ? {
                  ...b,
                  score1: b.player1Name === winnerName ? b.score1 + 1 : b.score1,
                  score2: b.player2Name === winnerName ? b.score2 + 1 : b.score2,
                  winnerName,
                  status: "completed" as const,
                }
              : b
          )
        : [];

      const [updated] = await db
        .update(tournaments)
        .set({
          bracketMatches: brackets,
          status: "completed",
        })
        .where(eq(tournaments.id, tourney.id))
        .returning();

      return NextResponse.json({ tournament: updated });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/tournaments error:", error);
    return NextResponse.json(
      { error: "Failed to process tournament action" },
      { status: 500 }
    );
  }
}
