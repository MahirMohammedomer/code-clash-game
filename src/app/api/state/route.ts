import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, resultLog } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { eq, desc, sql } from "drizzle-orm";
import {
  getDivisionForTrophies,
  getShopItem,
  STARTER_OWNED,
  DAILY_QUESTS,
  ACHIEVEMENTS,
  emptyDailyStats,
  getDailyChallenge,
  type DailyStats,
} from "@/lib/game-engine";
import { normalizeAvatar } from "@/lib/avatar";
import { hashPassword, verifyPassword, issueToken, verifyToken, adminUsernames } from "@/lib/auth-server";
import { sanitizeUsername } from "@/lib/security";

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
  if (p.lastPlayDate && daysBetween(p.lastPlayDate, today) === 1) {
    streak = (p.streakDays || 1) + 1;
    bonusCoins = 25 + Math.min(streak, 10) * 5;
    if (streak === 3) bonusGems = 10;
    if (streak === 7) bonusGems = 30;
    if (streak === 14) bonusGems = 60;
    if (streak === 30) bonusGems = 150;
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
      completedAchievements: achievements,
      lastSeenAt: new Date(),
      isOnline: true,
    })
    .where(eq(players.id, p.id))
    .returning();

  return {
    player: updated,
    streakInfo: { streakDays: streak, bonusCoins, bonusGems, isNewDay: true },
  };
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

    if (playerId) {
      const [row] = await db.select().from(players).where(eq(players.id, playerId)).limit(1);
      if (row) {
        const res = await applyStreak(row, Number.isFinite(tzEast) ? tzEast : 0);
        streakInfo = res.streakInfo;
        currentPlayer = publicPlayer(res.player);
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

    return NextResponse.json({ currentPlayer, leaderboard, streakInfo });
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
          })
          .returning();
        return NextResponse.json({ player: publicPlayer(created), token: issueToken(created.id) });
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
        case "frame": updates.frameId = item.id; break;
        case "theme": updates.themeId = item.id; break;
        case "effect": updates.effectId = item.id; break;
        case "title": updates.title = item.meta; break;
      }
      return updates;
    };

    if (action === "equip_cosmetic") {
      const itemId = String(body.itemId || "");
      const owned = Array.isArray(player.ownedCosmetics) ? player.ownedCosmetics : [];
      if (!owned.includes(itemId)) {
        return NextResponse.json({ error: "You don't own this item yet." }, { status: 400 });
      }
      const updates = applyEquip(player, itemId);
      if (!updates) return NextResponse.json({ error: "Item not found" }, { status: 404 });
      const [updated] = await db.update(players).set(updates).where(eq(players.id, player.id)).returning();
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
      const resultId = String(body.resultId || "");
      if (resultId) {
        const inserted = await db
          .insert(resultLog)
          .values({ resultId, playerId: player.id })
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
        player.dailyStats && player.dailyStats.date === today ? { ...player.dailyStats } : emptyDailyStats(today);
      stats.games += 1;
      stats.orders += ordersTotal;
      if (won) stats.wins += 1;
      if (won && turnsTaken <= 6) stats.fastWins += 1;

      let dailyBonus = 0;
      let dailyDone = player.dailyChallengeDone;
      if (won && body.dailyChallengeId) {
        const dc = getDailyChallenge(new Date(Date.now() + (Number.isFinite(tzEast) ? tzEast : 0) * 60000));
        if (body.dailyChallengeId === dc.id && player.dailyChallengeDone !== dc.dateKey) {
          dailyBonus = Math.round(120 * dc.bonusMultiplier);
          dailyDone = dc.dateKey;
        }
      }

      const newTrophies = Math.max(0, player.trophies + trophyDelta);
      const newXp = player.xp + xpEarned;
      const newWins = player.wins + (won ? 1 : 0);

      const achievements = Array.isArray(player.completedAchievements) ? [...player.completedAchievements] : [];
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
          level: Math.max(player.level, Math.floor(newXp / 200) + 1),
          coins: player.coins + coinsEarned + dailyBonus,
          gems: player.gems + bonusGems,
          wins: newWins,
          losses: player.losses + (won ? 0 : 1),
          totalGames: player.totalGames + 1,
          fastestWinTurns: won && (!player.fastestWinTurns || turnsTaken < player.fastestWinTurns) ? turnsTaken : player.fastestWinTurns,
          completedAchievements: achievements,
          dailyStats: stats,
          dailyChallengeDone: dailyDone,
          lastSeenAt: new Date(),
          isOnline: true,
        })
        .where(eq(players.id, player.id))
        .returning();

      return NextResponse.json({ player: publicPlayer(updated), applied: true, unlocked, bonusGems, dailyBonus });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/state error:", error);
    return NextResponse.json({ error: "Failed to process action" }, { status: 500 });
  }
}
