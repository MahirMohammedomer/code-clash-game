import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { matches, MatchGuessEntry } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, and, desc, isNull, gt } from "drizzle-orm";
import { evaluateGuess, isValidSecretCode, generateRandomCode } from "@/lib/game-engine";
import { normalizeAvatar, DEFAULT_AVATAR } from "@/lib/avatar";
import { randomToken } from "@/lib/auth-server";
import { sanitizeText } from "@/lib/security";

type MatchRow = typeof matches.$inferSelect;

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeRoomCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

function cleanCode(raw: unknown): string {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Strip secrets & tokens before sending a match anywhere. */
function safeMatch(m: MatchRow, viewerSlot?: 1 | 2) {
  return {
    id: m.id,
    roomCode: m.roomCode,
    mode: m.mode,
    status: m.status,
    timerSeconds: m.timerSeconds,
    version: m.version,
    player1Id: m.player1Id,
    player1Name: m.player1Name,
    player1Avatar: normalizeAvatar(m.player1AvatarConfig || DEFAULT_AVATAR),
    player1Frame: m.player1Frame || "frame_emerald",
    player1Division: m.player1Division,
    player2Id: m.player2Id,
    player2Name: m.player2Name,
    player2Avatar: normalizeAvatar(m.player2AvatarConfig || DEFAULT_AVATAR),
    player2Frame: m.player2Frame || "frame_emerald",
    player2Division: m.player2Division,
    hasSecret1: isValidSecretCode(m.player1Secret || ""),
    hasSecret2: isValidSecretCode(m.player2Secret || ""),
    hasPlayer2: Boolean(m.p2Token),
    currentTurn: (m.currentTurn === 2 ? 2 : 1) as 1 | 2,
    turnStartedAt: new Date(m.turnStartedAt).toISOString(),
    guesses: (Array.isArray(m.guesses) ? m.guesses : []).map((g) =>
      // Race fairness: nobody sees rival digits until the race ends.
      m.mode === "online_race" && m.status !== "finished" && (!viewerSlot || g.playerSlot !== viewerSlot)
        ? { ...g, guess: "????" }
        : g
    ),
    winnerSlot: m.winnerSlot,
    winnerName: m.winnerName,
    endReason: m.endReason,
    p1SeenAt: m.p1SeenAt ? new Date(m.p1SeenAt).toISOString() : null,
    p2SeenAt: m.p2SeenAt ? new Date(m.p2SeenAt).toISOString() : null,
    yourSecret:
      viewerSlot === 1 ? m.player1Secret || "" : viewerSlot === 2 ? m.player2Secret || "" : undefined,
    secret1: m.status === "finished" ? m.player1Secret || "" : undefined,
    secret2: m.status === "finished" ? m.player2Secret || "" : undefined,
    raceCode: m.status === "finished" ? m.raceCode || undefined : undefined,
    serverNow: new Date().toISOString(),
    createdAt: new Date(m.createdAt).toISOString(),
  };
}

function slotForToken(m: MatchRow, token: string): 1 | 2 | null {
  if (!token) return null;
  if (m.p1Token && token === m.p1Token) return 1;
  if (m.p2Token && token === m.p2Token) return 2;
  return null;
}

async function touchSeen(m: MatchRow, slot: 1 | 2) {
  const last = slot === 1 ? m.p1SeenAt : m.p2SeenAt;
  if (last && Date.now() - new Date(last).getTime() < 2000) return;
  const set = slot === 1 ? { p1SeenAt: new Date() } : { p2SeenAt: new Date() };
  await db.update(matches).set(set).where(eq(matches.id, m.id)).catch(() => {});
}

async function getByCode(code: string): Promise<MatchRow | null> {
  const rows = await db.select().from(matches).where(eq(matches.roomCode, code)).limit(1);
  return rows[0] || null;
}

function deriveStatus(m: { player1Secret?: string | null; player2Secret?: string | null; p2Token?: string | null; status: string }): string {
  if (m.status === "finished" || m.status === "abandoned") return m.status;
  const s1 = isValidSecretCode(m.player1Secret || "");
  const s2 = isValidSecretCode(m.player2Secret || "");
  if (s1 && s2) return "playing";
  return m.p2Token ? "setup" : "waiting";
}

/* ---------------------------------- GET --------------------------------- */

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const code = cleanCode(searchParams.get("roomCode"));
    if (!code) return NextResponse.json({ match: null });

    const m = await getByCode(code);
    if (!m) return NextResponse.json({ match: null });

    const token = searchParams.get("token") || "";
    const slot = slotForToken(m, token);
    if (slot) await touchSeen(m, slot);

    const knownVersion = Number(searchParams.get("v") || 0);
    if (knownVersion && knownVersion === m.version && m.status !== "finished") {
      return NextResponse.json({
        match: { roomCode: m.roomCode, version: m.version, unchanged: true },
        presence: {
          p1SeenAt: m.p1SeenAt ? new Date(m.p1SeenAt).toISOString() : null,
          p2SeenAt: m.p2SeenAt ? new Date(m.p2SeenAt).toISOString() : null,
          serverNow: new Date().toISOString(),
        },
      });
    }

    return NextResponse.json({ match: safeMatch(m, slot || undefined) });
  } catch (error) {
    console.error("GET /api/matches error:", error);
    return NextResponse.json({ error: "Failed to load match" }, { status: 500 });
  }
}

/* ---------------------------------- POST -------------------------------- */

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    /* --------------------------- create room --------------------------- */
    if (action === "create_room" || action === "quick_match") {
      const name = sanitizeText(body.name || "Player", 16) || "Player";
      const avatar = normalizeAvatar(body.avatar);
      const frame = String(body.frame || "frame_emerald").slice(0, 40);
      const division = sanitizeText(body.division || "Bronze", 20);
      const playerId = body.playerId ? Number(body.playerId) : null;
      const secret = isValidSecretCode(body.secret || "") ? body.secret : "";
      const timerSeconds = [15, 30, 45, 60, 90].includes(Number(body.timerSeconds)) ? Number(body.timerSeconds) : 45;
      const raceMode = body.mode === "race";
      const matchMode = raceMode ? "online_race" : "online_1v1";

      // Quick match: first try to claim an open public room as Player 2.
      if (action === "quick_match") {
        const cutoff = new Date(Date.now() - 10 * 60 * 1000);
        const open = await db
          .select()
          .from(matches)
          .where(
            and(
              eq(matches.status, "waiting"),
              eq(matches.isPrivate, false),
              eq(matches.mode, matchMode),
              isNull(matches.p2Token),
              gt(matches.createdAt, cutoff)
            )
          )
          .orderBy(desc(matches.createdAt))
          .limit(5);

        for (const room of open) {
          // skip stale hosts (not seen in 30s) — and never join your own room
          if (room.player1Id && playerId && room.player1Id === playerId) continue;
          if (room.p1SeenAt && Date.now() - new Date(room.p1SeenAt).getTime() > 30000) continue;
          const token = randomToken(20);
          const status = raceMode ? "playing" : isValidSecretCode(room.player1Secret || "") && isValidSecretCode(secret) ? "playing" : "setup";
          const claimed = await db
            .update(matches)
            .set({
              player2Id: playerId,
              player2Name: name,
              player2AvatarConfig: avatar,
              player2Frame: frame,
              player2Division: division,
              player2Secret: secret,
              p2Token: token,
              p2SeenAt: new Date(),
              status,
              version: room.version + 1,
              turnStartedAt: new Date(),
            })
            .where(and(eq(matches.id, room.id), isNull(matches.p2Token)))
            .returning();
          if (claimed[0]) {
            return NextResponse.json({ match: safeMatch(claimed[0], 2), slot: 2, token, joined: true });
          }
        }
        // fall through: create a room and wait
      }

      const isPrivate = action === "create_room" ? Boolean(body.isPrivate) : false;
      const token = randomToken(20);

      for (let attempt = 0; attempt < 5; attempt++) {
        const roomCode = makeRoomCode();
        try {
          const [created] = await db
            .insert(matches)
            .values({
              roomCode,
              mode: matchMode,
              raceCode: raceMode ? generateRandomCode() : null,
              status: "waiting",
              timerSeconds,
              isPrivate,
              version: 1,
              player1Id: playerId,
              player1Name: name,
              player1AvatarConfig: avatar,
              player1Frame: frame,
              player1Division: division,
              player1Secret: raceMode ? "" : secret,
              p1Token: token,
              p1SeenAt: new Date(),
              player2Name: "Waiting for rival...",
              currentTurn: 1,
              guesses: [],
              turnStartedAt: new Date(),
            })
            .returning();
          return NextResponse.json({ match: safeMatch(created, 1), slot: 1, token, joined: false });
        } catch {
          // room code collision — retry
        }
      }
      return NextResponse.json({ error: "Could not create a room. Try again!" }, { status: 500 });
    }

    /* ---------------------------- join room ---------------------------- */
    if (action === "join_room") {
      const code = cleanCode(body.roomCode);
      const m = await getByCode(code);
      if (!m) return NextResponse.json({ error: "Room not found. Double-check the code!" }, { status: 404 });
      if (m.status === "abandoned") return NextResponse.json({ error: "This room was closed." }, { status: 410 });

      // Reconnect: token matches an existing slot
      const existingSlot = slotForToken(m, String(body.token || ""));
      if (existingSlot) {
        await touchSeen(m, existingSlot);
        return NextResponse.json({ match: safeMatch(m, existingSlot), slot: existingSlot, token: body.token, reconnected: true });
      }

      if (m.p2Token) {
        return NextResponse.json({ error: "This room is already full." }, { status: 409 });
      }
      if (m.status === "finished") {
        return NextResponse.json({ error: "That match already finished." }, { status: 410 });
      }

      const name = sanitizeText(body.name || "Player", 16) || "Player";
      const avatar = normalizeAvatar(body.avatar);
      const secret = isValidSecretCode(body.secret || "") ? body.secret : "";
      const token = randomToken(20);
      const status = m.mode === "online_race" ? "playing" : isValidSecretCode(m.player1Secret || "") && isValidSecretCode(secret) ? "playing" : "setup";

      const claimed = await db
        .update(matches)
        .set({
          player2Id: body.playerId ? Number(body.playerId) : null,
          player2Name: name,
          player2AvatarConfig: avatar,
          player2Frame: String(body.frame || "frame_emerald").slice(0, 40),
          player2Division: sanitizeText(body.division || "Bronze", 20),
          player2Secret: secret,
          p2Token: token,
          p2SeenAt: new Date(),
          status,
          version: m.version + 1,
          turnStartedAt: new Date(),
        })
        .where(and(eq(matches.id, m.id), isNull(matches.p2Token)))
        .returning();

      if (!claimed[0]) return NextResponse.json({ error: "Someone just took the last seat!" }, { status: 409 });
      return NextResponse.json({ match: safeMatch(claimed[0], 2), slot: 2, token, joined: true });
    }

    /* --------------------- everything below: token auth --------------------- */
    const code = cleanCode(body.roomCode);
    const m = await getByCode(code);
    if (!m) return NextResponse.json({ error: "Match not found" }, { status: 404 });
    const slot = slotForToken(m, String(body.token || ""));
    if (!slot) return NextResponse.json({ error: "You are not a player in this match.", code: "slot" }, { status: 403 });
    await touchSeen(m, slot);

    /* ---------------------------- set secret ---------------------------- */
    if (action === "set_secret") {
      if (m.mode === "online_race") return NextResponse.json({ match: safeMatch(m, slot) });
      const secret = String(body.secret || "");
      if (!isValidSecretCode(secret)) {
        return NextResponse.json({ error: "Secret must be 4 unique digits from 1-9." }, { status: 400 });
      }
      if (m.status === "playing" || m.status === "finished") {
        return NextResponse.json({ match: safeMatch(m, slot) });
      }
      const next1 = slot === 1 ? secret : m.player1Secret;
      const next2 = slot === 2 ? secret : m.player2Secret;
      const status = deriveStatus({ player1Secret: next1, player2Secret: next2, p2Token: m.p2Token, status: m.status });
      const [updated] = await db
        .update(matches)
        .set({
          player1Secret: next1,
          player2Secret: next2,
          status,
          version: m.version + 1,
          turnStartedAt: status === "playing" ? new Date() : m.turnStartedAt,
        })
        .where(eq(matches.id, m.id))
        .returning();
      return NextResponse.json({ match: safeMatch(updated, slot) });
    }

    /* ---------------------------- submit turn --------------------------- */
    if (action === "submit_turn") {
      if (m.status === "finished") return NextResponse.json({ match: safeMatch(m, slot) });
      if (m.status !== "playing") {
        return NextResponse.json({ error: "The match hasn't started yet.", match: safeMatch(m, slot) }, { status: 409 });
      }

      const guesses: MatchGuessEntry[] = Array.isArray(m.guesses) ? [...m.guesses] : [];
      const guessId = String(body.guessId || "");
      if (guessId && guesses.some((g) => g.id === guessId)) {
        return NextResponse.json({ match: safeMatch(m, slot), duplicate: true });
      }

      /* --------------------------- race mode --------------------------- */
      if (m.mode === "online_race") {
        if (body.isTimeout) return NextResponse.json({ match: safeMatch(m, slot) });
        const raceGuess = String(body.guess || "");
        if (!isValidSecretCode(raceGuess)) {
          return NextResponse.json({ error: "Guess must be 4 unique digits from 1-9." }, { status: 400 });
        }
        const RACE_CAP = 15;
        const mine = guesses.filter((g) => g.playerSlot === slot);
        if (mine.length >= RACE_CAP) {
          return NextResponse.json({ error: "You're out of guesses!", match: safeMatch(m, slot) }, { status: 400 });
        }
        const lastMine = mine[mine.length - 1];
        if (lastMine && Date.now() - new Date(lastMine.timestamp).getTime() < 600) {
          return NextResponse.json({ error: "Too fast — breathe!", match: safeMatch(m, slot) }, { status: 429 });
        }
        const raceRes = evaluateGuess(m.raceCode || "", raceGuess);
        const raceEntry: MatchGuessEntry = {
          id: guessId || `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          playerSlot: slot,
          playerName: slot === 1 ? m.player1Name : m.player2Name,
          guess: raceGuess,
          points: raceRes.points,
          orders: raceRes.orders,
          isTimeout: false,
          turnNumber: mine.length + 1,
          timestamp: new Date().toISOString(),
        };
        guesses.push(raceEntry);

        let rStatus = m.status;
        let rWinnerSlot = m.winnerSlot;
        let rWinnerName = m.winnerName;
        let rEndReason = m.endReason;
        if (raceRes.isWin) {
          rStatus = "finished";
          rWinnerSlot = slot;
          rWinnerName = raceEntry.playerName;
          rEndReason = "raced";
        } else {
          const c1 = guesses.filter((g) => g.playerSlot === 1).length;
          const c2 = guesses.filter((g) => g.playerSlot === 2).length;
          if (c1 >= RACE_CAP && c2 >= RACE_CAP) {
            const bestScore = (sl: 1 | 2) => guesses.filter((g) => g.playerSlot === sl).reduce((mx, g) => Math.max(mx, g.orders * 10 + g.points), 0);
            const b1 = bestScore(1);
            const b2 = bestScore(2);
            rStatus = "finished";
            rEndReason = b1 === b2 ? "race_draw" : "raced";
            rWinnerSlot = b1 === b2 ? null : b1 > b2 ? 1 : 2;
            rWinnerName = rWinnerSlot === 1 ? m.player1Name : rWinnerSlot === 2 ? m.player2Name : null;
          }
        }
        const [raceUpdated] = await db
          .update(matches)
          .set({ guesses, status: rStatus, winnerSlot: rWinnerSlot, winnerName: rWinnerName, endReason: rEndReason, version: m.version + 1 })
          .where(and(eq(matches.id, m.id), eq(matches.version, m.version)))
          .returning();
        if (!raceUpdated) {
          const fresh = await getByCode(code);
          return NextResponse.json({ match: fresh ? safeMatch(fresh, slot) : safeMatch(m, slot) });
        }
        return NextResponse.json({ match: safeMatch(raceUpdated, slot) });
      }

      const currentSlot: 1 | 2 = m.currentTurn === 2 ? 2 : 1;
      const isTimeout = Boolean(body.isTimeout);

      if (isTimeout) {
        // Either player may end an expired turn — but only if it really expired.
        if (m.timerSeconds > 0) {
          const elapsed = Date.now() - new Date(m.turnStartedAt).getTime();
          if (elapsed < m.timerSeconds * 1000 + 1500) {
            return NextResponse.json({ error: "Turn hasn't expired yet.", match: safeMatch(m, slot) }, { status: 409 });
          }
        } else if (slot !== currentSlot) {
          return NextResponse.json({ error: "Not your turn.", match: safeMatch(m, slot) }, { status: 409 });
        }
      } else if (slot !== currentSlot) {
        return NextResponse.json({ error: "Not your turn yet!", match: safeMatch(m, slot) }, { status: 409 });
      }

      if (body.version && Number(body.version) !== m.version) {
        return NextResponse.json({ error: "Game state changed — resyncing.", match: safeMatch(m, slot) }, { status: 409 });
      }

      const actorSlot: 1 | 2 = isTimeout ? currentSlot : slot;
      const targetSecret = actorSlot === 1 ? m.player2Secret : m.player1Secret;
      const guess = String(body.guess || "");

      let points = 0, orders = 0, isWin = false;
      if (!isTimeout) {
        if (!isValidSecretCode(guess)) {
          return NextResponse.json({ error: "Guess must be 4 unique digits from 1-9." }, { status: 400 });
        }
        const res = evaluateGuess(targetSecret || "", guess);
        points = res.points; orders = res.orders; isWin = res.isWin;
      }

      const entry: MatchGuessEntry = {
        id: guessId || `g-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        playerSlot: actorSlot,
        playerName: actorSlot === 1 ? m.player1Name : m.player2Name,
        guess: isTimeout ? "TIMEOUT" : guess,
        points,
        orders,
        isTimeout,
        turnNumber: guesses.filter((g) => g.playerSlot === actorSlot).length + 1,
        timestamp: new Date().toISOString(),
      };
      guesses.push(entry);

      let status = m.status;
      let winnerSlot = m.winnerSlot;
      let winnerName = m.winnerName;
      let endReason = m.endReason;

      if (isWin) {
        status = "finished";
        winnerSlot = actorSlot;
        winnerName = entry.playerName;
        endReason = "cracked";
      } else if (isTimeout) {
        // 3 timeouts in a row (of your own turns) = AFK forfeit
        const mine = guesses.filter((g) => g.playerSlot === actorSlot).slice(-3);
        if (mine.length === 3 && mine.every((g) => g.isTimeout)) {
          status = "finished";
          winnerSlot = actorSlot === 1 ? 2 : 1;
          winnerName = winnerSlot === 1 ? m.player1Name : m.player2Name;
          endReason = "afk";
        }
      }

      const [updated] = await db
        .update(matches)
        .set({
          guesses,
          status,
          winnerSlot,
          winnerName,
          endReason,
          currentTurn: actorSlot === 1 ? 2 : 1,
          turnStartedAt: new Date(),
          version: m.version + 1,
        })
        .where(and(eq(matches.id, m.id), eq(matches.version, m.version)))
        .returning();

      if (!updated) {
        const fresh = await getByCode(code);
        return NextResponse.json({ match: fresh ? safeMatch(fresh, slot) : safeMatch(m, slot) });
      }
      return NextResponse.json({ match: safeMatch(updated, slot) });
    }

    /* ------------------------------ forfeit ------------------------------ */
    if (action === "forfeit") {
      if (m.status === "finished") return NextResponse.json({ match: safeMatch(m, slot) });
      const hasOpponent = Boolean(m.p2Token);
      const [updated] = await db
        .update(matches)
        .set(
          hasOpponent && (m.status === "playing" || m.status === "setup")
            ? {
                status: "finished",
                winnerSlot: slot === 1 ? 2 : 1,
                winnerName: slot === 1 ? m.player2Name : m.player1Name,
                endReason: "forfeit",
                version: m.version + 1,
              }
            : { status: "abandoned", endReason: "left", version: m.version + 1 }
        )
        .where(eq(matches.id, m.id))
        .returning();
      return NextResponse.json({ match: safeMatch(updated, slot) });
    }

    /* ------------------------ claim disconnect win ------------------------ */
    if (action === "claim_disconnect_win") {
      if (m.status === "finished" || m.status === "abandoned") {
        return NextResponse.json({ match: safeMatch(m, slot) });
      }
      const oppSeen = slot === 1 ? m.p2SeenAt : m.p1SeenAt;
      const ageMs = Date.now() - new Date(m.createdAt).getTime();
      const silentMs = oppSeen ? Date.now() - new Date(oppSeen).getTime() : ageMs;

      if (m.status === "playing") {
        if (silentMs < 25000) {
          return NextResponse.json({ error: "Your rival is still connected.", match: safeMatch(m, slot) }, { status: 409 });
        }
        const [updated] = await db
          .update(matches)
          .set({
            status: "finished",
            winnerSlot: slot,
            winnerName: slot === 1 ? m.player1Name : m.player2Name,
            endReason: "disconnect",
            version: m.version + 1,
          })
          .where(eq(matches.id, m.id))
          .returning();
        return NextResponse.json({ match: safeMatch(updated, slot) });
      }

      // waiting/setup: just close the room, no winner
      if (silentMs < 20000 && m.p2Token) {
        return NextResponse.json({ error: "Give them a few more seconds.", match: safeMatch(m, slot) }, { status: 409 });
      }
      const [updated] = await db
        .update(matches)
        .set({ status: "abandoned", endReason: "no_show", version: m.version + 1 })
        .where(eq(matches.id, m.id))
        .returning();
      return NextResponse.json({ match: safeMatch(updated, slot) });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/matches error:", error);
    return NextResponse.json({ error: "Failed to process match action" }, { status: 500 });
  }
}
