import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, resultLog, matchHistory, follows, matches, clubs, clanMessages, giftLog } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, desc, sql, and, gt, or, inArray } from "drizzle-orm";
import {
  getDivisionForTrophies,
  getShopItem,
  STARTER_OWNED,
  DAILY_QUESTS,
  ACHIEVEMENTS,
  CAREER_STAGES,
  STREAK_SHIELD,
  emptyDailyStats,
  getDailyChallenge,
  currentSeasonId,
  seasonLabel,
  seasonDaysLeft,
  SEASON_REWARDS,
  isValidSecretCode,
  type DailyStats,
} from "@/lib/game-engine";
import { normalizeAvatar } from "@/lib/avatar";
import { hashPassword, verifyPassword, issueToken, verifyToken, adminUsernames } from "@/lib/auth-server";
import { sanitizeUsername, sanitizeText } from "@/lib/security";

type PlayerRow = typeof players.$inferSelect;

function publicPlayer(p: PlayerRow) {
  const { passwordHash, ...rest } = p;
  return {
    ...rest,
    avatarConfig: normalizeAvatar(p.avatarConfig),
    ownedCosmetics: Array.isArray(p.ownedCosmetics) ? p.ownedCosmetics : [...STARTER_OWNED],
    completedAchievements: Array.isArray(p.completedAchievements) ? p.completedAchievements : [],
    claimedDailyQuests: Array.isArray(p.claimedDailyQuests) ? p.claimedDailyQuests : [],
    isGuest: false,
  };
}

/** Local date (YYYY-MM-DD) for a client tz offset in minutes EAST of UTC. */
function localDateStr(tzOffsetEastMinutes: number, base = new Date()): string {
  const shifted = new Date(base.getTime() + tzOffsetEastMinutes * 60000);
  return shifted.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const da = Date.parse(a + "T00:00:00Z");
  const db2 = Date.parse(b + "T00:00:00Z");
  return Math.round((db2 - da) / 86400000);
}

/**
 * The REAL streak logic (the old app never had any):
 * - same day          -> streak unchanged
 * - yesterday         -> streak + 1 (+ login bonus, milestone gems)
 * - older / first day -> streak = 1
 */
async function applyStreak(p: PlayerRow, tzEast: number) {
  const today = localDateStr(tzEast);
  if (p.lastPlayDate === today) return { player: p, streakInfo: null as null | object };

  let streak = 1;
  let bonusCoins = 25;
  let bonusGems = 0;
  let shieldsUsed = 0;
  const gap = p.lastPlayDate ? daysBetween(p.lastPlayDate, today) : 999;
  if (gap === 1) {
    streak = (p.streakDays || 1) + 1;
    bonusCoins = 25 + Math.min(streak, 10) * 5;
    if (streak === 3) bonusGems = 10;
    if (streak === 7) bonusGems = 30;
    if (streak === 14) bonusGems = 60;
    if (streak === 30) bonusGems = 150;
  } else if (gap > 1 && (p.streakDays || 1) > 1 && (p.streakShields || 0) > 0) {
    // A Streak Shield saves the streak (one shield per missed chain).
    shieldsUsed = 1;
    streak = p.streakDays || 1;
  }

  const achievements = Array.isArray(p.completedAchievements) ? [...p.completedAchievements] : [];
  if (streak >= 3 && !achievements.includes("streak_3")) { achievements.push("streak_3"); bonusGems += 25; }
  if (streak >= 7 && !achievements.includes("streak_7")) { achievements.push("streak_7"); bonusGems += 80; }

  const stats: DailyStats =
    p.dailyStats && p.dailyStats.date === today ? p.dailyStats : emptyDailyStats(today);

  const [updated] = await db
    .update(players)
    .set({
      streakDays: streak,
      lastPlayDate: today,
      dailyStats: stats,
      coins: p.coins + bonusCoins,
      gems: p.gems + bonusGems,
      streakShields: Math.max(0, (p.streakShields || 0) - shieldsUsed),
      completedAchievements: achievements,
      lastSeenAt: new Date(),
      isOnline: true,
    })
    .where(eq(players.id, p.id))
    .returning();

  return {
    player: updated,
    streakInfo: { streakDays: streak, bonusCoins, bonusGems, isNewDay: true, shieldUsed: shieldsUsed > 0 },
  };
}

/**
 * Ranked seasons (calendar months). First sight (seasonId === "") just stamps
 * the current season — nobody loses trophies for the feature launching.
 * A real rollover pays rewards by peak division and soft-resets trophies 50%.
 */
async function applySeason(p: PlayerRow) {
  const cur = currentSeasonId();
  const info = { id: cur, label: seasonLabel(cur), daysLeft: seasonDaysLeft(), rolled: null as null | object };
  if (p.seasonId === cur) return { player: p, season: info };
  if (!p.seasonId) {
    const [updated] = await db
      .update(players)
      .set({ seasonId: cur, seasonPeakTrophies: Math.max(p.seasonPeakTrophies || 0, p.trophies), seasonXp: 0 })
      .where(eq(players.id, p.id))
      .returning();
    return { player: updated, season: info };
  }
  const peak = Math.max(p.seasonPeakTrophies || 0, p.trophies);
  const prevDivision = getDivisionForTrophies(peak).name;
  const reward = SEASON_REWARDS[prevDivision];
  const resetTo = Math.floor(p.trophies * 0.5);
  const [updated] = await db
    .update(players)
    .set({
      seasonId: cur,
      seasonPeakTrophies: resetTo,
      seasonXp: 0,
      trophies: resetTo,
      division: getDivisionForTrophies(resetTo).name,
      coins: p.coins + reward.coins,
      gems: p.gems + reward.gems,
    })
    .where(eq(players.id, p.id))
    .returning();
  return {
    player: updated,
    season: { ...info, rolled: { prevDivision, coins: reward.coins, gems: reward.gems, trophiesResetTo: resetTo } },
  };
}

/** Validate + persist a client-reported match record for replays. Never throws. */
async function saveHistory(playerId: number, raw: unknown, fallback: { won: boolean; mode: string; turnsTaken: number }) {
  try {
    if (!raw || typeof raw !== "object") return;
    const h = raw as Record<string, unknown>;
    const historyId = String(h.historyId || "").slice(0, 60);
    if (!historyId) return;
    const rawGuesses = Array.isArray(h.guesses) ? h.guesses.slice(0, 90) : [];
    const guesses = rawGuesses.map((g) => {
      const e = (g || {}) as Record<string, unknown>;
      return {
        id: String(e.id || "").slice(0, 40),
        playerSlot: (e.playerSlot === 2 ? 2 : 1) as 1 | 2,
        playerName: String(e.playerName || "").slice(0, 24),
        guess: String(e.guess || "").slice(0, 8),
        points: Math.max(0, Math.min(4, Number(e.points || 0))),
        orders: Math.max(0, Math.min(4, Number(e.orders || 0))),
        isTimeout: Boolean(e.isTimeout),
        turnNumber: Math.max(0, Math.min(99, Number(e.turnNumber || 0))),
        timestamp: String(e.timestamp || new Date().toISOString()).slice(0, 32),
      };
    });
    await db
      .insert(matchHistory)
      .values({
        historyId,
        playerId,
        opponentPlayerId: h.oppPlayerId ? Number(h.oppPlayerId) : null,
        opponentName: String(h.oppName || "Rival").slice(0, 24),
        opponentAvatar: normalizeAvatar(h.oppAvatar),
        myAvatar: normalizeAvatar(h.myAvatar),
        mode: String(h.mode || fallback.mode).slice(0, 20),
        result: fallback.won ? "win" : "loss",
        mySecret: isValidSecretCode(String(h.mySecret || "")) ? String(h.mySecret) : "",
        oppSecret: isValidSecretCode(String(h.oppSecret || "")) ? String(h.oppSecret) : "",
        guesses,
        endReason: h.endReason ? String(h.endReason).slice(0, 20) : null,
        turnsTaken: fallback.turnsTaken,
      })
      .onConflictDoNothing();
  } catch {
    /* history is best-effort */
  }
}

async function findByUsername(name: string): Promise<PlayerRow | null> {
  const exact = await db.select().from(players).where(eq(players.username, name)).limit(1);
  if (exact[0]) return exact[0];
  const ci = await db
    .select()
    .from(players)
    .where(sql`lower(${players.username}) = lower(${name})`)
    .limit(1);
  return ci[0] || null;
}

function guestProfile(name: string) {
  return {
    id: null,
    username: name.slice(0, 16),
    authProvider: "guest",
    avatarConfig: { base: "owl", color: "classic", accessory: "none" },
    title: "Code Breaker",
    frameId: "frame_emerald",
    themeId: "theme_classic",
    effectId: "effect_confetti",
    division: "Bronze",
    trophies: 0,
    level: 1,
    xp: 0,
    ownedCosmetics: [...STARTER_OWNED],
    completedAchievements: [] as string[],
    claimedDailyQuests: [] as string[],
    dailyStats: emptyDailyStats(new Date().toISOString().slice(0, 10)),
    dailyChallengeDone: null,
    dailyCodeDone: null,
    seasonId: "",
    seasonPeakTrophies: 0,
    coins: 250,
    gems: 20,
    streakDays: 1,
    lastPlayDate: new Date().toISOString().slice(0, 10),
    wins: 0,
    losses: 0,
    totalGames: 0,
    fastestWinTurns: null,
    tutorialSeen: false,
    isAdmin: false,
    isGuest: true,
  };
}

/* --------------------------------- GET --------------------------------- */

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token") || req.headers.get("authorization")?.replace("Bearer ", "");
    const playerId = verifyToken(token);
    const tzEast = Number(searchParams.get("tz") || 0);

    let currentPlayer: ReturnType<typeof publicPlayer> | null = null;
    let streakInfo: object | null = null;
    let season: object | null = null;

    if (playerId) {
      let [row] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
      if (row && !row.referralCode) {
        // Give older accounts a referral code lazily so they can invite friends too.
        const [stamped] = await db
          .update(players)
          .set({ referralCode: `cc${row.id.toString(36)}${Math.random().toString(36).slice(2, 5)}` })
          .where(eq(players.id, row.id))
          .returning();
        row = stamped;
      }
      if (row) {
        const res = await applyStreak(row, Number.isFinite(tzEast) ? tzEast : 0);
        streakInfo = res.streakInfo;
        const sRes = await applySeason(res.player);
        season = sRes.season;
        currentPlayer = publicPlayer(sRes.player);
        // Presence heartbeat is owned by the client's POST "heartbeat" action,
        // so GET stays read-only and single-flight (no racing writes).
      }
    }

    const top = await db.select().from(players).orderBy(desc(players.trophies)).limit(100);
    const now = Date.now();
    const leaderboard = top.map((p) => ({
      id: p.id,
      username: p.username,
      avatarConfig: normalizeAvatar(p.avatarConfig),
      frameId: p.frameId,
      title: p.title,
      division: p.division,
      trophies: p.trophies,
      level: p.level,
      wins: p.wins,
      totalGames: p.totalGames,
      streakDays: p.streakDays,
      isOnline: p.isOnline && now - new Date(p.lastSeenAt).getTime() < 3 * 60 * 1000,
    }));

    return NextResponse.json({ currentPlayer, leaderboard, streakInfo, season });
  } catch (error) {
    console.error("GET /api/state error:", error);
    return NextResponse.json({ error: "Failed to load game state" }, { status: 500 });
  }
}

/* --------------------------------- POST -------------------------------- */

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json().catch(() => ({}));
    const { action } = body;
    const tzEast = Number(body.tz ?? 0);

    /* ------------------------------ AUTH ------------------------------ */
    if (action === "auth") {
      const mode = body.mode as string;
      const name = sanitizeUsername(body.username || "");
      const password = typeof body.password === "string" ? body.password : "";

      if (mode === "guest") {
        const guestName = name || `Guest${Math.floor(1000 + Math.random() * 9000)}`;
        return NextResponse.json({ player: guestProfile(guestName), token: null });
      }

      if (name.length < 3) {
        return NextResponse.json({ error: "Username must be at least 3 characters." }, { status: 400 });
      }

      const existing = await findByUsername(name);

      if (mode === "register") {
        if (existing) {
          return NextResponse.json({ error: "That username is taken. Try signing in!" }, { status: 400 });
        }
        if (password.length < 4) {
          return NextResponse.json({ error: "Password must be at least 4 characters." }, { status: 400 });
        }
        const today = localDateStr(Number.isFinite(tzEast) ? tzEast : 0);
        const [created] = await db
          .insert(players)
          .values({
            username: name,
            passwordHash: hashPassword(password),
            authProvider: "local",
            coins: 250,
            gems: 20,
            streakDays: 1,
            lastPlayDate: today,
            dailyStats: emptyDailyStats(today),
            ownedCosmetics: [...STARTER_OWNED],
            isAdmin: adminUsernames().includes(name.toLowerCase()),
            referredBy: typeof body.ref === "string" ? body.ref.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || null : null,
          })
          .returning();

        // Stamp a personal referral code on every new account.
        const [withCode] = await db
          .update(players)
          .set({ referralCode: `cc${created.id.toString(36)}${Math.random().toString(36).slice(2, 5)}` })
          .where(eq(players.id, created.id))
          .returning();

        // Referral rewards: both sides get +200 coins, paid once.
        let refBonus = 0;
        if (withCode.referredBy) {
          const [referrer] = await db.select().from(players).where(eq(players.referralCode, withCode.referredBy)).limit(1);
          if (referrer && referrer.id !== withCode.id) {
            await db.update(players).set({ coins: referrer.coins + 200 }).where(eq(players.id, referrer.id));
            refBonus = 200;
          }
        }
        const finalPlayer = refBonus
          ? (await db.update(players).set({ coins: withCode.coins + 200, referralRewarded: true }).where(eq(players.id, withCode.id)).returning())[0]
          : withCode;
        return NextResponse.json({ player: publicPlayer(finalPlayer), token: issueToken(created.id), refBonus });
      }

      // login
      if (!existing) {
        return NextResponse.json({ error: "Username not found. Create an account first!" }, { status: 404 });
      }
      if (!existing.passwordHash) {
        // Legacy account without a password: let them claim it now.
        if (password.length < 4) {
          return NextResponse.json(
            { error: "This account has no password yet. Enter a new password (4+ characters) to secure it." },
            { status: 400 }
          );
        }
        const [claimed] = await db
          .update(players)
          .set({ passwordHash: hashPassword(password) })
          .where(eq(players.id, existing.id))
          .returning();
        const res = await applyStreak(claimed, Number.isFinite(tzEast) ? tzEast : 0);
        return NextResponse.json({ player: publicPlayer(res.player), token: issueToken(existing.id), streakInfo: res.streakInfo });
      }

      const check = verifyPassword(password, existing.passwordHash);
      if (!check.ok) {
        return NextResponse.json({ error: "Incorrect password for this username." }, { status: 401 });
      }
      let row = existing;
      if (check.needsUpgrade) {
        const [up] = await db
          .update(players)
          .set({ passwordHash: hashPassword(password) })
          .where(eq(players.id, existing.id))
          .returning();
        row = up;
      }
      if (adminUsernames().includes(row.username.toLowerCase()) && !row.isAdmin) {
        const [up] = await db.update(players).set({ isAdmin: true }).where(eq(players.id, row.id)).returning();
        row = up;
      }
      const res = await applyStreak(row, Number.isFinite(tzEast) ? tzEast : 0);
      return NextResponse.json({ player: publicPlayer(res.player), token: issueToken(existing.id), streakInfo: res.streakInfo });
    }

    /* ------------------------- public profile ------------------------- */
    if (action === "get_public_profile") {
      const targetId = Number(body.targetId || 0);
      const [target] = await db.select().from(players).where(eq(players.id, targetId)).limit(1);
      if (!target) return NextResponse.json({ error: "Player not found" }, { status: 404 });
      const requesterId = verifyToken(body.token || req.headers.get("authorization")?.replace("Bearer ", ""));

      const [{ c: followersC }] = await db.select({ c: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followingId, targetId));
      const [{ c: followingC }] = await db.select({ c: sql<number>`count(*)::int` }).from(follows).where(eq(follows.followerId, targetId));

      let isFollowing = false;
      let followsMe = false;
      let h2h: { wins: number; losses: number } | null = null;
      if (requesterId && requesterId !== targetId) {
        const rel = await db
          .select()
          .from(follows)
          .where(
            or(
              and(eq(follows.followerId, requesterId), eq(follows.followingId, targetId)),
              and(eq(follows.followerId, targetId), eq(follows.followingId, requesterId))
            )
          );
        isFollowing = rel.some((r) => r.followerId === requesterId);
        followsMe = rel.some((r) => r.followerId === targetId);
        const mine = await db
          .select()
          .from(matchHistory)
          .where(and(eq(matchHistory.playerId, requesterId), eq(matchHistory.opponentPlayerId, targetId)))
          .limit(200);
        if (mine.length) {
          h2h = {
            wins: mine.filter((m) => m.result === "win").length,
            losses: mine.filter((m) => m.result === "loss").length,
          };
        }
      }

      let inMatchRoom: string | null = null;
      const liveMatches = await db
        .select()
        .from(matches)
        .where(and(inArray(matches.status, ["playing", "setup"]), or(eq(matches.player1Id, targetId), eq(matches.player2Id, targetId))))
        .orderBy(desc(matches.createdAt))
        .limit(3);
      for (const m of liveMatches) {
        const seen = m.player1Id === targetId ? m.p1SeenAt : m.p2SeenAt;
        if (seen && Date.now() - new Date(seen).getTime() < 90_000) { inMatchRoom = m.roomCode; break; }
      }

      return NextResponse.json({
        profile: {
          id: target.id,
          username: target.username,
          avatarConfig: normalizeAvatar(target.avatarConfig),
          frameId: target.frameId,
          themeId: target.themeId,
          title: target.title,
          division: target.division,
          trophies: target.trophies,
          level: target.level,
          wins: target.wins,
          losses: target.losses,
          totalGames: target.totalGames,
          fastestWinTurns: target.fastestWinTurns,
          streakDays: target.streakDays,
          isOnline: target.isOnline && Date.now() - new Date(target.lastSeenAt).getTime() < 100_000,
          inMatchRoom,
          createdAt: new Date(target.createdAt).toISOString(),
          followers: Number(followersC) || 0,
          following: Number(followingC) || 0,
          isFollowing,
          followsMe,
          achievements: Array.isArray(target.completedAchievements) ? target.completedAchievements : [],
          pinnedAchievements: Array.isArray(target.pinnedAchievements) ? target.pinnedAchievements : [],
          referralCode: null, // never expose another player's referral code
          h2h,
        },
      });
    }

    /* ---------------------- everything below needs auth ---------------------- */
    const playerId = verifyToken(body.token || req.headers.get("authorization")?.replace("Bearer ", ""));
    if (!playerId) {
      return NextResponse.json({ error: "Please sign in again to continue.", code: "auth" }, { status: 401 });
    }
    const [player] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
    if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    if (action === "heartbeat") {
      await db.update(players).set({ isOnline: true, lastSeenAt: new Date() }).where(eq(players.id, player.id));
      return NextResponse.json({ ok: true });
    }

    if (action === "mark_tutorial") {
      const grant = player.tutorialSeen ? 0 : 50;
      const [updated] = await db
        .update(players)
        .set({ tutorialSeen: true, coins: player.coins + grant })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: publicPlayer(updated), granted: grant });
    }

    if (action === "list_history") {
      const rows = await db
        .select()
        .from(matchHistory)
        .where(eq(matchHistory.playerId, player.id))
        .orderBy(desc(matchHistory.createdAt))
        .limit(20);
      return NextResponse.json({
        history: rows.map((r) => ({
          historyId: r.historyId,
          mode: r.mode,
          result: r.result,
          myName: player.username,
          myAvatar: normalizeAvatar(r.myAvatar),
          oppName: r.opponentName,
          oppAvatar: normalizeAvatar(r.opponentAvatar),
          oppPlayerId: r.opponentPlayerId,
          mySecret: r.mySecret,
          oppSecret: r.oppSecret,
          guesses: Array.isArray(r.guesses) ? r.guesses : [],
          endReason: r.endReason,
          turnsTaken: r.turnsTaken,
          createdAt: new Date(r.createdAt).toISOString(),
        })),
      });
    }

    if (action === "record_daily_code") {
      const resultId = String(body.resultId || "");
      if (resultId) {
        const inserted = await db.insert(resultLog).values({ resultId, playerId: player.id }).onConflictDoNothing().returning();
        if (inserted.length === 0) return NextResponse.json({ player: publicPlayer(player), applied: false });
      }
      const today = localDateStr(Number.isFinite(tzEast) ? tzEast : 0);
      if (player.dailyCodeDone === today) {
        return NextResponse.json({ player: publicPlayer(player), applied: false });
      }
      const won = Boolean(body.won);
      const guessesUsed = Math.max(1, Math.min(8, Number(body.guessesUsed || 8)));
      const coins = won ? 50 + (8 - guessesUsed) * 10 : 10;
      const xp = won ? 70 : 20;
      const stats: DailyStats =
        player.dailyStats && player.dailyStats.date === today ? { ...player.dailyStats } : emptyDailyStats(today);
      stats.games += 1;
      if (won) stats.wins += 1;
      const newXp = player.xp + xp;
      const [updated] = await db
        .update(players)
        .set({
          coins: player.coins + coins,
          xp: newXp,
          level: Math.max(player.level, Math.floor(newXp / 200) + 1),
          dailyCodeDone: today,
          dailyStats: stats,
          lastSeenAt: new Date(),
          isOnline: true,
        })
        .where(eq(players.id, player.id))
        .returning();
      await saveHistory(player.id, body.history, { won, mode: "daily_code", turnsTaken: guessesUsed });
      return NextResponse.json({ player: publicPlayer(updated), applied: true, coins });
    }

    /* --------------------------- cosmetics --------------------------- */
    const applyEquip = (row: PlayerRow, itemId: string) => {
      const item = getShopItem(itemId);
      if (!item) return null;
      const updates: Partial<typeof players.$inferInsert> = {};
      const avatar = normalizeAvatar(row.avatarConfig);
      switch (item.category) {
        case "avatar_base": updates.avatarConfig = { ...avatar, base: item.meta }; break;
        case "avatar_color": updates.avatarConfig = { ...avatar, color: item.meta }; break;
        case "avatar_accessory": updates.avatarConfig = { ...avatar, accessory: item.meta }; break;
        case "avatar_pattern": updates.avatarConfig = { ...avatar, pattern: item.meta }; break;
        case "frame": updates.frameId = item.id; break;
        case "theme": updates.themeId = item.id; break;
        case "effect": updates.effectId = item.id; break;
        case "title": updates.title = item.meta; break;
        case "sound": updates.soundTheme = item.meta; break;
      }
      return updates;
    };

    if (action === "equip_cosmetic") {
      const itemId = String(body.itemId || "");
      const owned = Array.isArray(player.ownedCosmetics) ? [...player.ownedCosmetics] : [];
      const item = getShopItem(itemId);
      const isFree = !!item && !(item.priceCoins || 0) && !(item.priceGems || 0);
      if (!owned.includes(itemId) && !isFree) {
        return NextResponse.json({ error: "You don't own this item yet." }, { status: 400 });
      }
      const updates = applyEquip(player, itemId);
      if (!updates) return NextResponse.json({ error: "Item not found" }, { status: 404 });
      // Free items (e.g. "No Pattern") become owned on first equip.
      if (isFree && !owned.includes(itemId)) {
        (updates as Record<string, unknown>).ownedCosmetics = [...owned, itemId];
      }
      const [updated] = await db.update(players).set(updates as Partial<PlayerRow>).where(eq(players.id, player.id)).returning();
      return NextResponse.json({ player: publicPlayer(updated) });
    }

    if (action === "buy_cosmetic") {
      const item = getShopItem(String(body.itemId || ""));
      if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
      const owned = Array.isArray(player.ownedCosmetics) ? [...player.ownedCosmetics] : [];
      if (owned.includes(item.id)) return NextResponse.json({ player: publicPlayer(player) });

      let coins = player.coins;
      let gems = player.gems;
      if (item.priceCoins && item.priceCoins > 0) {
        if (coins < item.priceCoins) return NextResponse.json({ error: `Need ${item.priceCoins} coins (you have ${coins}). Win matches to earn more!` }, { status: 400 });
        coins -= item.priceCoins;
      } else if (item.priceGems && item.priceGems > 0) {
        if (gems < item.priceGems) return NextResponse.json({ error: `Need ${item.priceGems} gems (you have ${gems}). Complete quests & achievements!` }, { status: 400 });
        gems -= item.priceGems;
      }
      owned.push(item.id);
      const equip = applyEquip(player, item.id) || {};
      const [updated] = await db
        .update(players)
        .set({ coins, gems, ownedCosmetics: owned, ...equip })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: publicPlayer(updated) });
    }

    /* ---------------------------- quests ----------------------------- */
    if (action === "claim_quest") {
      const quest = DAILY_QUESTS.find((q) => q.id === body.questId);
      if (!quest) return NextResponse.json({ error: "Quest not found" }, { status: 404 });
      const today = localDateStr(Number.isFinite(tzEast) ? tzEast : 0);
      const claimKey = `${quest.id}:${today}`;
      const claimed = Array.isArray(player.claimedDailyQuests) ? [...player.claimedDailyQuests] : [];
      if (claimed.includes(claimKey)) return NextResponse.json({ player: publicPlayer(player) });
      const stats = player.dailyStats && player.dailyStats.date === today ? player.dailyStats : emptyDailyStats(today);
      if ((stats[quest.statKey] || 0) < quest.target) {
        return NextResponse.json({ error: "Quest not finished yet — keep playing!" }, { status: 400 });
      }
      claimed.push(claimKey);
      const newXp = player.xp + quest.rewardXp;
      const [updated] = await db
        .update(players)
        .set({
          coins: player.coins + quest.rewardCoins,
          gems: player.gems + (quest.rewardGems || 0),
          xp: newXp,
          level: Math.max(player.level, Math.floor(newXp / 200) + 1),
          claimedDailyQuests: claimed.filter((c) => c.endsWith(today) || c === claimKey),
        })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: publicPlayer(updated) });
    }

    /* ------------------------- match results ------------------------- */
    if (action === "record_match_result") {
      const base = (await applySeason(player)).player;
      const resultId = String(body.resultId || "");
      if (resultId) {
        const inserted = await db
          .insert(resultLog)
          .values({ resultId, playerId: base.id })
          .onConflictDoNothing()
          .returning();
        if (inserted.length === 0) {
          return NextResponse.json({ player: publicPlayer(player), applied: false });
        }
      }

      const won = Boolean(body.won);
      const turnsTaken = Math.max(1, Math.min(60, Number(body.turnsTaken || 6)));
      const ordersTotal = Math.max(0, Math.min(240, Number(body.ordersTotal || 0)));
      const trophyDelta = Math.max(-25, Math.min(60, Number(body.trophyDelta || 0)));
      const coinsEarned = Math.max(0, Math.min(600, Number(body.coinsEarned || 0)));
      const xpEarned = Math.max(0, Math.min(600, Number(body.xpEarned || 0)));
      const aiDifficulty = typeof body.aiDifficulty === "string" ? body.aiDifficulty : undefined;

      const today = localDateStr(Number.isFinite(tzEast) ? tzEast : 0);
      const stats: DailyStats =
        base.dailyStats && base.dailyStats.date === today ? { ...base.dailyStats } : emptyDailyStats(today);
      stats.games += 1;
      stats.orders += ordersTotal;
      if (won) stats.wins += 1;
      if (won && turnsTaken <= 6) stats.fastWins += 1;

      let dailyBonus = 0;
      let dailyDone = base.dailyChallengeDone;
      if (won && body.dailyChallengeId) {
        const dc = getDailyChallenge(new Date(Date.now() + (Number.isFinite(tzEast) ? tzEast : 0) * 60000));
        if (body.dailyChallengeId === dc.id && base.dailyChallengeDone !== dc.dateKey) {
          dailyBonus = Math.round(120 * dc.bonusMultiplier);
          dailyDone = dc.dateKey;
        }
      }

      const newTrophies = Math.max(0, base.trophies + trophyDelta);
      const newXp = base.xp + xpEarned;
      const newWins = base.wins + (won ? 1 : 0);

      const achievements = Array.isArray(base.completedAchievements) ? [...base.completedAchievements] : [];
      const unlocked: string[] = [];
      let bonusGems = 0;
      const check = (cond: boolean, id: string) => {
        if (cond && !achievements.includes(id)) {
          achievements.push(id);
          unlocked.push(id);
          bonusGems += ACHIEVEMENTS.find((a) => a.id === id)?.rewardGems || 0;
        }
      };
      check(won, "first_crack");
      check(newWins >= 10, "win_10");
      check(newWins >= 50, "win_50");
      check(newWins >= 100, "win_100");
      check(won && turnsTaken <= 4, "mind_reader");
      check(won && turnsTaken <= 3, "perfect_game");
      check(won && turnsTaken === 2, "fast_2");
      check(won && aiDifficulty === "Mastermind", "mastermind_beat");
      check(won && aiDifficulty === "Oracle", "oracle_slayer");
      check(newTrophies >= 100, "trophies_100");
      check(newTrophies >= 250, "trophies_250");
      check(newTrophies >= 700, "trophies_700");
      check(newTrophies >= 1000, "trophies_1000");
      check(newTrophies >= 1900, "trophies_1900");

      const [updated] = await db
        .update(players)
        .set({
          trophies: newTrophies,
          division: getDivisionForTrophies(newTrophies).name,
          xp: newXp,
          level: Math.max(base.level, Math.floor(newXp / 200) + 1),
          coins: base.coins + coinsEarned + dailyBonus,
          gems: base.gems + bonusGems,
          wins: newWins,
          losses: base.losses + (won ? 0 : 1),
          totalGames: base.totalGames + 1,
          fastestWinTurns: won && (!base.fastestWinTurns || turnsTaken < base.fastestWinTurns) ? turnsTaken : base.fastestWinTurns,
          seasonPeakTrophies: Math.max(base.seasonPeakTrophies || 0, newTrophies),
          seasonXp: (base.seasonXp || 0) + xpEarned,
          completedAchievements: achievements,
          dailyStats: stats,
          dailyChallengeDone: dailyDone,
          lastSeenAt: new Date(),
          isOnline: true,
        })
        .where(eq(players.id, base.id))
        .returning();

      await saveHistory(base.id, body.history, { won, mode: String(body.mode || "ai"), turnsTaken });
      return NextResponse.json({ player: publicPlayer(updated), applied: true, unlocked, bonusGems, dailyBonus });
    }

    /* ------------------------- v4.2: clans, shields, gifts, career ------------------------- */

    if (action === "clan_info") {
      if (!player.clubId) return NextResponse.json({ club: null });
      const [club] = await db.select().from(clubs).where(eq(clubs.id, player.clubId)).limit(1);
      if (!club) return NextResponse.json({ club: null });
      const roster = await db
        .select()
        .from(players)
        .where(eq(players.clubId, club.id))
        .orderBy(desc(players.trophies))
        .limit(30);
      const msgs = await db
        .select()
        .from(clanMessages)
        .where(eq(clanMessages.clubId, club.id))
        .orderBy(desc(clanMessages.id))
        .limit(40);
      return NextResponse.json({
        club: {
          id: club.id, name: club.name, tag: club.tag, badgeEmoji: club.badgeEmoji,
          description: club.description, memberCount: club.memberCount,
          totalTrophies: roster.reduce((s, r) => s + r.trophies, 0),
          weeklyGoal: club.weeklyGoal,
        },
        roster: roster.map((r) => ({
          id: r.id, username: r.username, trophies: r.trophies, division: r.division,
          avatarConfig: normalizeAvatar(r.avatarConfig), frameId: r.frameId,
          isOnline: r.isOnline && Date.now() - new Date(r.lastSeenAt).getTime() < 3 * 60 * 1000,
        })),
        messages: msgs.reverse().map((m) => ({
          id: m.id, senderId: m.senderId, senderName: m.senderName,
          senderAvatar: normalizeAvatar(m.senderAvatarConfig), content: m.content,
          createdAt: new Date(m.createdAt).toISOString(),
        })),
      });
    }

    if (action === "clan_create") {
      if (player.clubId) return NextResponse.json({ error: "Leave your current clan first." }, { status: 400 });
      const name = sanitizeText(body.name, 24);
      const tag = String(body.tag || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      if (!name || name.length < 3) return NextResponse.json({ error: "Clan name must be 3+ characters." }, { status: 400 });
      if (tag.length < 2) return NextResponse.json({ error: "Clan tag must be 2-4 letters/numbers." }, { status: 400 });
      const [existing] = await db.select().from(clubs).where(eq(clubs.tag, tag)).limit(1);
      if (existing) return NextResponse.json({ error: "That tag is taken — pick another." }, { status: 400 });
      const [club] = await db
        .insert(clubs)
        .values({
          name, tag,
          badgeEmoji: ["🛡️", "⚔️", "🦉", "🔥", "💎", "🐍", "⭐", "👑"].includes(String(body.badgeEmoji)) ? String(body.badgeEmoji) : "🛡️",
          description: sanitizeText(body.description, 120) || "No description yet.",
          memberCount: 1,
        })
        .returning();
      const [updated] = await db
        .update(players)
        .set({ clubId: club.id, clubJoinedAt: new Date() })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: publicPlayer(updated), clubId: club.id });
    }

    if (action === "clan_join") {
      if (player.clubId) return NextResponse.json({ error: "Leave your current clan first." }, { status: 400 });
      const tag = String(body.tag || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      const [club] = await db.select().from(clubs).where(eq(clubs.tag, tag)).limit(1);
      if (!club) return NextResponse.json({ error: "No clan with that tag." }, { status: 404 });
      if (club.memberCount >= 30) return NextResponse.json({ error: "That clan is full (30/30)." }, { status: 400 });
      const [updatedClub] = await db
        .update(clubs)
        .set({ memberCount: club.memberCount + 1 })
        .where(eq(clubs.id, club.id))
        .returning();
      const [updated] = await db
        .update(players)
        .set({ clubId: club.id, clubJoinedAt: new Date() })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: publicPlayer(updated), clubId: updatedClub.id });
    }

    if (action === "clan_leave") {
      if (!player.clubId) return NextResponse.json({ error: "You're not in a clan." }, { status: 400 });
      const [club] = await db.select().from(clubs).where(eq(clubs.id, player.clubId)).limit(1);
      const [updated] = await db.update(players).set({ clubId: null, clubJoinedAt: null }).where(eq(players.id, player.id)).returning();
      if (club) {
        const left = Math.max(0, club.memberCount - 1);
        if (left === 0) await db.delete(clubs).where(eq(clubs.id, club.id));
        else await db.update(clubs).set({ memberCount: left }).where(eq(clubs.id, club.id));
      }
      return NextResponse.json({ player: publicPlayer(updated) });
    }

    if (action === "buy_streak_shield") {
      if ((player.streakShields || 0) >= STREAK_SHIELD.max) {
        return NextResponse.json({ error: `You already hold ${STREAK_SHIELD.max} shields — the max!` }, { status: 400 });
      }
      if (player.coins < STREAK_SHIELD.priceCoins) {
        return NextResponse.json({ error: `Need ${STREAK_SHIELD.priceCoins} coins (you have ${player.coins}).` }, { status: 400 });
      }
      const [updated] = await db
        .update(players)
        .set({ coins: player.coins - STREAK_SHIELD.priceCoins, streakShields: (player.streakShields || 0) + 1 })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: publicPlayer(updated) });
    }

    if (action === "pin_achievements") {
      const ids = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === "string").slice(0, 3) : [];
      const done = Array.isArray(player.completedAchievements) ? player.completedAchievements : [];
      const pinned = ids.filter((i: string) => done.includes(i));
      const [updated] = await db.update(players).set({ pinnedAchievements: pinned }).where(eq(players.id, player.id)).returning();
      return NextResponse.json({ player: publicPlayer(updated) });
    }

    if (action === "send_gift") {
      const targetId = Number(body.targetId || 0);
      if (!targetId || targetId === player.id) return NextResponse.json({ error: "Invalid target." }, { status: 400 });
      if (player.coins < 10) return NextResponse.json({ error: "You need at least 10 coins to gift." }, { status: 400 });
      const [target] = await db.select().from(players).where(eq(players.id, targetId)).limit(1);
      if (!target) return NextResponse.json({ error: "Player not found." }, { status: 404 });
      const day = localDateStr(0);
      try {
        await db.insert(giftLog).values({ senderId: player.id, targetId, kind: "coins", day });
      } catch {
        return NextResponse.json({ error: "You already gifted them today — come back tomorrow!" }, { status: 400 });
      }
      await db.update(players).set({ coins: player.coins - 10 }).where(eq(players.id, player.id));
      await db.update(players).set({ coins: target.coins + 10 }).where(eq(players.id, target.id));
      const [updated] = await db.select().from(players).where(eq(players.id, player.id)).limit(1);
      return NextResponse.json({ player: publicPlayer(updated), sent: true });
    }

    if (action === "career_claim") {
      const stageId = String(body.stageId || "").replace(/[^a-z0-9]/gi, "").slice(0, 8);
      const stage = CAREER_STAGES.find((s) => s.id === stageId);
      if (!stage) return NextResponse.json({ error: "Unknown stage." }, { status: 400 });
      const claimed = Array.isArray(player.careerClaimed) ? [...player.careerClaimed] : [];
      if (claimed.includes(stageId)) return NextResponse.json({ player: publicPlayer(player), already: true });
      claimed.push(stageId);
      const [updated] = await db
        .update(players)
        .set({ coins: player.coins + stage.coins, gems: player.gems + (stage.gems || 0), careerClaimed: claimed })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: publicPlayer(updated), coins: stage.coins, gems: stage.gems || 0 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/state error:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
