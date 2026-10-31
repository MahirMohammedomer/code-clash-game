import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, tournaments, type HuntParticipant } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { and, desc, eq, gt } from "drizzle-orm";
import { evaluateGuess, generateRandomCode, isValidSecretCode } from "@/lib/game-engine";
import { normalizeAvatar, DEFAULT_AVATAR, type AvatarConfig } from "@/lib/avatar";
import { verifyToken } from "@/lib/auth-server";
import { sanitizeText, sanitizeUsername } from "@/lib/security";

type TournamentRow = typeof tournaments.$inferSelect;

const MAX_GUESSES = 25;

interface Identity {
  key: string;
  playerId: number | null;
  username: string;
  avatar: AvatarConfig;
}

async function identify(tokenRaw: unknown, guestKeyRaw: unknown, nameRaw: unknown, avatarRaw: unknown): Promise<Identity | null> {
  const playerId = verifyToken(typeof tokenRaw === "string" ? tokenRaw : null);
  if (playerId) {
    const [row] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (row) {
      return { key: `p${row.id}`, playerId: row.id, username: row.username, avatar: normalizeAvatar(row.avatarConfig) };
    }
  }
  const guestKey = String(guestKeyRaw || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
  if (!guestKey) return null;
  return {
    key: `g${guestKey}`,
    playerId: null,
    username: sanitizeUsername(String(nameRaw || "Guest")) || "Guest",
    avatar: normalizeAvatar(avatarRaw || DEFAULT_AVATAR),
  };
}

async function ensureSystemHunt(): Promise<TournamentRow> {
  const [live] = await db
    .select()
    .from(tournaments)
    .where(and(eq(tournaments.createdBy, "system"), eq(tournaments.status, "live"), gt(tournaments.endsAt, new Date())))
    .orderBy(desc(tournaments.createdAt))
    .limit(1);
  if (live) return live;
  const [created] = await db
    .insert(tournaments)
    .values({
      name: "🏆 Daily Grand Hunt",
      type: "mass_hunt",
      status: "live",
      isPrivate: false,
      secretCode: generateRandomCode(),
      prizeCoins: 500,
      prizeGems: 25,
      participants: [],
      bracketMatches: [],
      createdBy: "system",
      endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })
    .returning();
  return created;
}

function participantsOf(t: TournamentRow): HuntParticipant[] {
  return Array.isArray(t.participants) ? (t.participants as HuntParticipant[]) : [];
}

function isCreator(t: TournamentRow, me: Identity | null): boolean {
  return Boolean(me && me.playerId !== null && t.createdBy !== "system" && t.createdBy === me.username);
}

function huntView(t: TournamentRow, me: Identity | null) {
  const parts = participantsOf(t);
  const finished = t.status === "finished";
  const winner = parts.find((p) => p.solved);
  const leaderboard = parts
    .map((p) => ({
      username: p.username,
      avatar: normalizeAvatar(p.avatar || DEFAULT_AVATAR),
      attempts: p.guesses.length,
      bestOrders: p.guesses.reduce((mx, g) => Math.max(mx, g.orders), 0),
      bestPoints: p.guesses.reduce((mx, g) => Math.max(mx, g.points), 0),
      solved: p.solved,
      solvedAt: p.solvedAt || null,
      isMe: me ? p.key === me.key : false,
    }))
    .sort((a, b) => {
      if (a.solved !== b.solved) return a.solved ? -1 : 1;
      if (a.solved && b.solved) return String(a.solvedAt).localeCompare(String(b.solvedAt));
      if (b.bestOrders !== a.bestOrders) return b.bestOrders - a.bestOrders;
      if (b.bestPoints !== a.bestPoints) return b.bestPoints - a.bestPoints;
      return a.attempts - b.attempts;
    })
    .slice(0, 30);
  const minePart = me ? parts.find((p) => p.key === me.key) : undefined;
  return {
    id: t.id,
    name: t.name,
    status: t.status,
    isPrivate: t.isPrivate,
    inviteCode: t.inviteCode,
    prizeCoins: t.prizeCoins,
    prizeGems: t.prizeGems,
    createdBy: t.createdBy,
    endsAt: new Date(t.endsAt).toISOString(),
    createdAt: new Date(t.createdAt).toISOString(),
    secretCode: finished || isCreator(t, me) ? t.secretCode : undefined,
    winnerName: winner ? winner.username : null,
    leaderboard,
    mine: minePart ? { guesses: minePart.guesses, solved: minePart.solved } : null,
    canPlay: !isCreator(t, me),
  };
}

async function closeIfExpired(t: TournamentRow): Promise<TournamentRow> {
  if (t.status === "live" && new Date(t.endsAt).getTime() < Date.now()) {
    const [updated] = await db.update(tournaments).set({ status: "finished" }).where(eq(tournaments.id, t.id)).returning();
    return updated || t;
  }
  return t;
}

/* ---------------------------------- GET ---------------------------------- */

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const me = await identify(
      searchParams.get("token"),
      searchParams.get("guestKey"),
      searchParams.get("name"),
      undefined
    );

    const system = await closeIfExpired(await ensureSystemHunt());

    const recent = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.isPrivate, false))
      .orderBy(desc(tournaments.createdAt))
      .limit(8);

    const byId = new Map<number, TournamentRow>();
    byId.set(system.id, system);
    for (const t of recent) byId.set(t.id, await closeIfExpired(t));

    const code = String(searchParams.get("code") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code) {
      const [found] = await db.select().from(tournaments).where(eq(tournaments.inviteCode, code)).limit(1);
      if (found) byId.set(found.id, await closeIfExpired(found));
    }

    const idParam = Number(searchParams.get("id") || 0);
    if (idParam && !byId.has(idParam)) {
      const [found] = await db.select().from(tournaments).where(eq(tournaments.id, idParam)).limit(1);
      if (found && (!found.isPrivate || (me && participantsOf(found).some((p) => p.key === me.key)) || isCreator(found, me))) {
        byId.set(found.id, await closeIfExpired(found));
      }
    }

    const list = [...byId.values()]
      .sort((a, b) => {
        if ((a.status === "live") !== (b.status === "live")) return a.status === "live" ? -1 : 1;
        if (a.createdBy === "system" && b.createdBy !== "system") return -1;
        if (b.createdBy === "system" && a.createdBy !== "system") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .map((t) => huntView(t, me));

    return NextResponse.json({ tournaments: list });
  } catch (error) {
    console.error("GET /api/tournaments error:", error);
    return NextResponse.json({ error: "Failed to load tournaments" }, { status: 500 });
  }
}

/* ---------------------------------- POST --------------------------------- */

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    const me = await identify(body.token, body.guestKey, body.name, body.avatar);
    if (!me) {
      return NextResponse.json({ error: "Missing identity — reload and try again." }, { status: 400 });
    }

    /* ---------------------------- create hunt ---------------------------- */
    if (action === "create_hunt") {
      if (!me.playerId) {
        return NextResponse.json({ error: "Create a free account to host your own hunt!" }, { status: 401 });
      }
      const name = sanitizeText(String(body.name || ""), 40) || `${me.username}'s Hunt`;
      const secret = String(body.secret || "");
      if (!isValidSecretCode(secret)) {
        return NextResponse.json({ error: "Pick a secret: 4 unique digits from 1-9." }, { status: 400 });
      }
      const prizeCoins = Math.max(50, Math.min(2000, Number(body.prizeCoins || 300)));
      const inviteCode = Array.from({ length: 6 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
      const [created] = await db
        .insert(tournaments)
        .values({
          name,
          type: "mass_hunt",
          status: "live",
          isPrivate: true,
          inviteCode,
          secretCode: secret,
          prizeCoins,
          prizeGems: 0,
          participants: [],
          bracketMatches: [],
          createdBy: me.username,
          endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .returning();
      return NextResponse.json({ tournament: huntView(created, me) });
    }

    const tournamentId = Number(body.tournamentId || 0);
    const [rowRaw] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
    if (!rowRaw) return NextResponse.json({ error: "Tournament not found." }, { status: 404 });
    const row = await closeIfExpired(rowRaw);
    const parts = participantsOf(row);

    /* ------------------------------- join ------------------------------- */
    if (action === "join") {
      if (row.status !== "live") return NextResponse.json({ tournament: huntView(row, me) });
      if (isCreator(row, me)) {
        return NextResponse.json({ error: "You're hosting this hunt — you already know the code! 😄", tournament: huntView(row, me) }, { status: 400 });
      }
      if (!parts.some((p) => p.key === me.key)) {
        parts.push({
          key: me.key,
          playerId: me.playerId,
          username: me.username,
          avatar: me.avatar,
          guesses: [],
          solved: false,
          joinedAt: new Date().toISOString(),
        });
        const [updated] = await db.update(tournaments).set({ participants: parts }).where(eq(tournaments.id, row.id)).returning();
        return NextResponse.json({ tournament: huntView(updated, me) });
      }
      return NextResponse.json({ tournament: huntView(row, me) });
    }

    /* ------------------------------- guess ------------------------------- */
    if (action === "guess") {
      if (row.status !== "live") {
        return NextResponse.json({ error: "This hunt already ended.", tournament: huntView(row, me) }, { status: 410 });
      }
      if (isCreator(row, me)) {
        return NextResponse.json({ error: "Hosts can't guess in their own hunt!" }, { status: 400 });
      }
      const guess = String(body.guess || "");
      if (!isValidSecretCode(guess)) {
        return NextResponse.json({ error: "Guess must be 4 unique digits from 1-9." }, { status: 400 });
      }
      let mePart = parts.find((p) => p.key === me.key);
      if (!mePart) {
        mePart = { key: me.key, playerId: me.playerId, username: me.username, avatar: me.avatar, guesses: [], solved: false, joinedAt: new Date().toISOString() };
        parts.push(mePart);
      }
      if (mePart.solved) return NextResponse.json({ tournament: huntView(row, me) });
      if (mePart.guesses.some((g) => g.guess === guess)) {
        return NextResponse.json({ error: "You already tried that code!", tournament: huntView(row, me) }, { status: 400 });
      }
      if (mePart.guesses.length >= MAX_GUESSES) {
        return NextResponse.json({ error: `You're out of guesses (max ${MAX_GUESSES}).`, tournament: huntView(row, me) }, { status: 400 });
      }

      const ev = evaluateGuess(row.secretCode, guess);
      mePart.guesses.push({ guess, points: ev.points, orders: ev.orders });

      let status = row.status;
      let prizePaid = 0;
      if (ev.isWin && !parts.some((p) => p.solved && p.key !== me.key)) {
        mePart.solved = true;
        mePart.solvedAt = new Date().toISOString();
        status = "finished";
        if (me.playerId) {
          const [winner] = await db.select().from(players).where(eq(players.id, me.playerId)).limit(1);
          if (winner) {
            await db
              .update(players)
              .set({ coins: winner.coins + row.prizeCoins, gems: winner.gems + row.prizeGems })
              .where(eq(players.id, winner.id));
            prizePaid = row.prizeCoins;
          }
        }
      }

      const [updated] = await db
        .update(tournaments)
        .set({ participants: parts, status })
        .where(eq(tournaments.id, row.id))
        .returning();
      return NextResponse.json({
        tournament: huntView(updated, me),
        result: { points: ev.points, orders: ev.orders, isWin: ev.isWin, prizePaid },
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/tournaments error:", error);
    return NextResponse.json({ error: "Failed to process tournament action" }, { status: 500 });
  }
}
