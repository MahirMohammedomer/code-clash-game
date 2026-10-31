import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players, clubs, follows, matches, tournaments } from "@/db/schema";
import { ensureDatabaseReady } from "@/db/seed";
import { isSupabaseConfigured } from "@/lib/supabase";
import { eq, desc, and } from "drizzle-orm";
import {
  getDivisionForTrophies,
  COSMETIC_SHOP_ITEMS,
  getAllShopItems,
  SEASON_PASS_TIERS,
  DAILY_QUESTS,
} from "@/lib/game-engine";

export async function GET(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const { searchParams } = new URL(req.url);
    const rawPlayerId = searchParams.get("playerId");
    const requestedPlayerId = rawPlayerId ? Number(rawPlayerId) : null;

    const allPlayersRaw = await db
      .select()
      .from(players)
      .orderBy(desc(players.trophies));

    // Mark players offline if they haven't been seen in the last 2 minutes
    const ONLINE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes
    const now = Date.now();
    const allPlayers = allPlayersRaw.map((p) => {
      const lastSeen = p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : 0;
      const isReallyOnline = p.isOnline && now - lastSeen < ONLINE_THRESHOLD_MS;
      return { ...p, isOnline: isReallyOnline };
    });

    const currentPlayer = requestedPlayerId
      ? allPlayers.find((p) => p.id === requestedPlayerId) || null
      : null;

    // Update currentPlayer's lastSeenAt & online status if they exist
    if (currentPlayer) {
      await db
        .update(players)
        .set({ isOnline: true, lastSeenAt: new Date() })
        .where(eq(players.id, currentPlayer.id));
      // Reflect immediately in the response
      currentPlayer.isOnline = true;
      currentPlayer.lastSeenAt = new Date();
    }

    const allClubs = await db
      .select()
      .from(clubs)
      .orderBy(desc(clubs.totalTrophies));

    const allFollows = await db.select().from(follows);
    const followingIds = currentPlayer
      ? allFollows
          .filter((f) => f.followerId === currentPlayer.id)
          .map((f) => f.followingId)
      : [];
    const followerIds = currentPlayer
      ? allFollows
          .filter((f) => f.followingId === currentPlayer.id)
          .map((f) => f.followerId)
      : [];

    const activeMatches = await db
      .select()
      .from(matches)
      .orderBy(desc(matches.createdAt))
      .limit(20);

    const allTournaments = await db
      .select()
      .from(tournaments)
      .orderBy(desc(tournaments.createdAt));

    const supabaseReady =
      isSupabaseConfigured ||
      Boolean(process.env.SUPABASE_DB_URL) ||
      Boolean(process.env.DATABASE_URL?.includes("supabase"));

    // Security: never send opponent secrets to the client in the general state
    const safeMatches = activeMatches.map((m) => ({
      ...m,
      player1Secret: "",
      player2Secret: "",
    }));

    const safeTournaments = allTournaments.map((t) => ({
      ...t,
      secretCode: t.isPrivate ? "" : t.secretCode,
    }));

    return NextResponse.json({
      currentPlayer,
      leaderboard: allPlayers,
      clubs: allClubs,
      followingIds,
      followerIds,
      matches: safeMatches,
      tournaments: safeTournaments,
      supabaseReady,
    });
  } catch (error) {
    console.error("GET /api/state error:", error);
    return NextResponse.json(
      { error: "Failed to load game state" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDatabaseReady();
    const body = await req.json();
    const { action, playerId } = body;

    // 1. Authentication: Login, Register, Google Continue, or Guest Play (100% Real Data)
    if (action === "auth") {
      const { mode, username, password, avatarEmoji } = body;
      const cleanName = (username || "").trim();

      if (mode === "guest") {
        // Guests are LOCAL ONLY — never written to the database
        const guestName =
          cleanName || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;
        const localGuest = {
          id: null,
          username: guestName.slice(0, 16),
          passwordHash: "",
          authProvider: "guest",
          avatarEmoji: avatarEmoji || "🦉",
          title: "Guest Breaker",
          frameId: "frame_emerald",
          themeId: "theme_classic",
          effectId: "effect_confetti",
          division: "Bronze",
          trophies: 0,
          level: 1,
          xp: 0,
          seasonXp: 0,
          hasPremiumPass: false,
          claimedFreeTiers: [],
          claimedPremiumTiers: [],
          ownedCosmetics: ["frame_emerald", "theme_classic", "effect_confetti", "title_breaker"],
          completedAchievements: [],
          claimedQuests: [],
          coins: 0,
          gems: 0,
          streakDays: 1,
          wins: 0,
          losses: 0,
          totalGames: 0,
          fastestWinTurns: null,
          clubId: null,
          isOnline: true,
          lastSeenAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          isGuest: true,
        };
        return NextResponse.json({ player: localGuest });
      }

      if (mode === "google") {
        if (!cleanName) {
          return NextResponse.json(
            { error: "Please enter your username to continue with Google." },
            { status: 400 }
          );
        }
        const existing = await db
          .select()
          .from(players)
          .where(eq(players.username, cleanName));
        if (existing.length > 0) {
          return NextResponse.json({ player: existing[0] });
        }
        const [created] = await db
          .insert(players)
          .values({
            username: cleanName,
            authProvider: "google",
            avatarEmoji: avatarEmoji || "🦊",
            title: "Code Breaker",
            division: "Bronze",
            trophies: 0,
            level: 1,
            xp: 0,
            seasonXp: 0,
            coins: 0,
            gems: 0,
            streakDays: 1,
            wins: 0,
            losses: 0,
            totalGames: 0,
          })
          .returning();
        return NextResponse.json({ player: created });
      }

      if (!cleanName) {
        return NextResponse.json(
          { error: "Please enter a username" },
          { status: 400 }
        );
      }

      const existing = await db
        .select()
        .from(players)
        .where(eq(players.username, cleanName));

      if (mode === "login") {
        if (existing.length === 0) {
          return NextResponse.json(
            { error: "Username not found. Create an account first!" },
            { status: 404 }
          );
        }
        if (
          existing[0].passwordHash &&
          password &&
          existing[0].passwordHash !== password
        ) {
          return NextResponse.json(
            { error: "Incorrect password for this username." },
            { status: 401 }
          );
        }
        return NextResponse.json({ player: existing[0] });
      }

      // Register mode
      if (existing.length > 0) {
        return NextResponse.json(
          { error: "That username is already taken. Try logging in or pick another!" },
          { status: 400 }
        );
      }

      const [created] = await db
        .insert(players)
        .values({
          username: cleanName,
          passwordHash: password || "",
          authProvider: "local",
          avatarEmoji: avatarEmoji || "🦉",
          title: "Code Breaker",
          division: "Bronze",
          trophies: 0,
          level: 1,
          xp: 0,
          seasonXp: 0,
          coins: 0,
          gems: 0,
          streakDays: 1,
          wins: 0,
          losses: 0,
          totalGames: 0,
        })
        .returning();

      return NextResponse.json({ player: created });
    }

    if (!playerId) {
      return NextResponse.json(
        { error: "Create or sign in to a profile first" },
        { status: 400 }
      );
    }

    // Fetch current player for subsequent actions
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.id, Number(playerId)));

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // 2. Follow / Unfollow player
    if (action === "toggle_follow") {
      const targetId = Number(body.targetId);
      if (!targetId || targetId === player.id) {
        return NextResponse.json({ ok: true });
      }
      const existing = await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerId, player.id),
            eq(follows.followingId, targetId)
          )
        );

      if (existing.length > 0) {
        await db.delete(follows).where(eq(follows.id, existing[0].id));
      } else {
        await db.insert(follows).values({
          followerId: player.id,
          followingId: targetId,
        });
      }
      return NextResponse.json({ ok: true });
    }

    // 3. Equip Cosmetics & Profile Customization
    if (action === "update_cosmetics") {
      const { frameId, themeId, effectId, title, avatarEmoji } = body;
      const [updated] = await db
        .update(players)
        .set({
          frameId: frameId ?? player.frameId,
          themeId: themeId ?? player.themeId,
          effectId: effectId ?? player.effectId,
          title: title ?? player.title,
          avatarEmoji: avatarEmoji ?? player.avatarEmoji,
        })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: updated });
    }

    // 4. Buy Cosmetic in Shop
    if (action === "buy_cosmetic") {
      const { itemId } = body;
      const item = getAllShopItems().find((i) => i.id === itemId);
      if (!item) {
        return NextResponse.json({ error: "Item not found" }, { status: 404 });
      }
      const owned = Array.isArray(player.ownedCosmetics)
        ? [...player.ownedCosmetics]
        : [];
      if (owned.includes(itemId)) {
        return NextResponse.json({ player });
      }

      let newCoins = player.coins;
      let newGems = player.gems;

      if (item.priceCoins && item.priceCoins > 0) {
        if (player.coins < item.priceCoins) {
          return NextResponse.json(
            { error: `Need ${item.priceCoins} Clash Coins (you have ${player.coins})` },
            { status: 400 }
          );
        }
        newCoins -= item.priceCoins;
      } else if (item.priceGems && item.priceGems > 0) {
        if (player.gems < item.priceGems) {
          return NextResponse.json(
            { error: `Need ${item.priceGems} Royal Gems (you have ${player.gems})` },
            { status: 400 }
          );
        }
        newGems -= item.priceGems;
      }

      owned.push(itemId);

      const updates: Partial<typeof players.$inferInsert> = {
        coins: newCoins,
        gems: newGems,
        ownedCosmetics: owned,
      };
      if (item.category === "frame") updates.frameId = item.id;
      if (item.category === "theme") updates.themeId = item.id;
      if (item.category === "effect") updates.effectId = item.id;
      if (item.category === "title") updates.title = item.name;

      const [updated] = await db
        .update(players)
        .set(updates)
        .where(eq(players.id, player.id))
        .returning();

      return NextResponse.json({ player: updated });
    }

    // 5. Unlock Premium Season Pass
    if (action === "unlock_premium_pass") {
      const costGems = 80;
      if (player.gems < costGems) {
        return NextResponse.json(
          { error: `You need ${costGems} Royal Gems to unlock the Royal Pass (you have ${player.gems}). Win matches & quests to earn Gems!` },
          { status: 400 }
        );
      }
      const [updated] = await db
        .update(players)
        .set({
          hasPremiumPass: true,
          gems: player.gems - costGems,
        })
        .where(eq(players.id, player.id))
        .returning();
      return NextResponse.json({ player: updated });
    }

    // 6. Claim Season Pass Tier
    if (action === "claim_pass_tier") {
      const { tier, isPremium } = body;
      const tierObj = SEASON_PASS_TIERS.find((t) => t.tier === Number(tier));
      if (!tierObj) {
        return NextResponse.json({ error: "Tier not found" }, { status: 404 });
      }
      if (player.seasonXp < tierObj.xpRequired) {
        return NextResponse.json(
          { error: `Need ${tierObj.xpRequired} Season XP to unlock Tier ${tierObj.tier}` },
          { status: 400 }
        );
      }

      const claimedFree = Array.isArray(player.claimedFreeTiers)
        ? [...player.claimedFreeTiers]
        : [];
      const claimedPrem = Array.isArray(player.claimedPremiumTiers)
        ? [...player.claimedPremiumTiers]
        : [];
      const owned = Array.isArray(player.ownedCosmetics)
        ? [...player.ownedCosmetics]
        : [];

      const reward = isPremium ? tierObj.premiumReward : tierObj.freeReward;
      if (isPremium) {
        if (!player.hasPremiumPass) {
          return NextResponse.json(
            { error: "Unlock the Royal Pass first!" },
            { status: 400 }
          );
        }
        if (claimedPrem.includes(tierObj.tier)) {
          return NextResponse.json({ player });
        }
        claimedPrem.push(tierObj.tier);
      } else {
        if (claimedFree.includes(tierObj.tier)) {
          return NextResponse.json({ player });
        }
        claimedFree.push(tierObj.tier);
      }

      let newCoins = player.coins;
      let newGems = player.gems;
      if (reward.type === "coins" && reward.amount) newCoins += reward.amount;
      if (reward.type === "gems" && reward.amount) newGems += reward.amount;
      if (
        ["frame", "theme", "effect", "title"].includes(reward.type) &&
        !owned.includes(reward.id)
      ) {
        owned.push(reward.id);
      }

      const [updated] = await db
        .update(players)
        .set({
          coins: newCoins,
          gems: newGems,
          ownedCosmetics: owned,
          claimedFreeTiers: claimedFree,
          claimedPremiumTiers: claimedPrem,
        })
        .where(eq(players.id, player.id))
        .returning();

      return NextResponse.json({ player: updated });
    }

    // 7. Claim Daily Quest (Checks real player progress first)
    if (action === "claim_quest") {
      const { questId } = body;
      const quest = DAILY_QUESTS.find((q) => q.id === questId);
      if (!quest) {
        return NextResponse.json({ error: "Quest not found" }, { status: 404 });
      }
      const claimed = Array.isArray(player.claimedQuests)
        ? [...player.claimedQuests]
        : [];
      if (claimed.includes(questId)) {
        return NextResponse.json({ player });
      }

      // Verify real quest completion
      const completed =
        (questId === "quest_play_2" && player.totalGames >= 2) ||
        (questId === "quest_orders_8" && player.totalGames >= 1) ||
        (questId === "quest_beat_ai" && player.wins >= 1) ||
        (questId === "quest_fast_win" &&
          player.fastestWinTurns !== null &&
          player.fastestWinTurns <= 6);

      if (!completed) {
        return NextResponse.json(
          { error: "Complete the quest requirement in a match first!" },
          { status: 400 }
        );
      }

      claimed.push(questId);
      const newXp = player.xp + quest.rewardXp;
      const newLevel = Math.max(player.level, Math.floor(newXp / 200) + 1);

      const [updated] = await db
        .update(players)
        .set({
          coins: player.coins + quest.rewardCoins,
          gems: player.gems + (quest.rewardGems || 0),
          xp: newXp,
          seasonXp: player.seasonXp + quest.rewardXp,
          level: newLevel,
          claimedQuests: claimed,
        })
        .where(eq(players.id, player.id))
        .returning();

      return NextResponse.json({ player: updated });
    }

    // 8. Join or Create Club (Updates real club member counts & trophies)
    if (action === "join_club") {
      const targetClubId = Number(body.clubId);
      const [updated] = await db
        .update(players)
        .set({ clubId: targetClubId })
        .where(eq(players.id, player.id))
        .returning();

      // Recalculate club stats from real members
      const clubMembers = await db
        .select()
        .from(players)
        .where(eq(players.clubId, targetClubId));
      const totalTrophies = clubMembers.reduce((sum, m) => sum + m.trophies, 0);
      await db
        .update(clubs)
        .set({
          memberCount: clubMembers.length,
          totalTrophies,
        })
        .where(eq(clubs.id, targetClubId));

      return NextResponse.json({ player: updated });
    }

    if (action === "create_club") {
      const { name, tag, badgeEmoji, description } = body;
      if (!name || !name.trim()) {
        return NextResponse.json(
          { error: "Enter a club name" },
          { status: 400 }
        );
      }
      const [newClub] = await db
        .insert(clubs)
        .values({
          name: name.trim(),
          tag: (tag || "CLB").toUpperCase().slice(0, 4),
          badgeEmoji: badgeEmoji || "🛡️",
          description: description || "Competitive Code Clash club",
          totalTrophies: player.trophies,
          memberCount: 1,
        })
        .returning();

      const [updated] = await db
        .update(players)
        .set({ clubId: newClub.id })
        .where(eq(players.id, player.id))
        .returning();

      return NextResponse.json({ player: updated, club: newClub });
    }

    // 9. Record Real Match Outcome
    // Heartbeat — keep player online while app is open
    if (action === "heartbeat") {
      if (!player) {
        return NextResponse.json({ error: "Not logged in" }, { status: 401 });
      }
      await db
        .update(players)
        .set({ isOnline: true, lastSeenAt: new Date() })
        .where(eq(players.id, player.id));
      return NextResponse.json({ ok: true, at: new Date().toISOString() });
    }

    // Sync batch of offline results
    if (action === "sync_offline_batch") {
      if (!player) {
        return NextResponse.json({ error: "Login required" }, { status: 401 });
      }
      const results = Array.isArray(body.results) ? body.results : [];
      let applied = 0;
      let running = { ...player };
      for (const r of results.slice(0, 30)) {
        const won = Boolean(r.won);
        const trophyDelta = Number(r.trophyDelta || r.trophiesDelta || 20);
        const coinsEarned = Number(r.coinsEarned || 50);
        const xpEarned = Number(r.xpEarned || (won ? 100 : 40));
        const turnsTaken = Number(r.turnsTaken || r.turns || 6);
        const newTrophies = Math.max(
          0,
          running.trophies + (won ? trophyDelta : -Math.floor(trophyDelta * 0.5))
        );
        const divInfo = getDivisionForTrophies(newTrophies);
        const newXp = running.xp + xpEarned;
        running = {
          ...running,
          trophies: newTrophies,
          division: divInfo.name,
          xp: newXp,
          seasonXp: running.seasonXp + xpEarned,
          level: Math.max(running.level, Math.floor(newXp / 200) + 1),
          coins: running.coins + coinsEarned,
          wins: running.wins + (won ? 1 : 0),
          losses: running.losses + (won ? 0 : 1),
          totalGames: running.totalGames + 1,
          fastestWinTurns:
            won && (!running.fastestWinTurns || turnsTaken < running.fastestWinTurns)
              ? turnsTaken
              : running.fastestWinTurns,
        };
        applied++;
      }
      if (applied > 0) {
        const [updated] = await db
          .update(players)
          .set({
            trophies: running.trophies,
            division: running.division,
            xp: running.xp,
            seasonXp: running.seasonXp,
            level: running.level,
            coins: running.coins,
            wins: running.wins,
            losses: running.losses,
            totalGames: running.totalGames,
            fastestWinTurns: running.fastestWinTurns,
            lastSeenAt: new Date(),
            isOnline: true,
          })
          .where(eq(players.id, player.id))
          .returning();
        return NextResponse.json({ player: updated, applied });
      }
      return NextResponse.json({ player, applied: 0 });
    }

    if (action === "record_match_result") {

      const {
        won,
        turnsTaken = 6,
        trophyDelta = 30,
        coinsEarned = 85,
        xpEarned = 120,
        aiDifficulty,
      } = body;

      const newTrophies = Math.max(
        0,
        player.trophies + (won ? trophyDelta : -Math.floor(trophyDelta * 0.5))
      );
      const divInfo = getDivisionForTrophies(newTrophies);
      const newXp = player.xp + xpEarned;
      const newSeasonXp = player.seasonXp + xpEarned;
      const newLevel = Math.max(player.level, Math.floor(newXp / 200) + 1);
      const newWins = player.wins + (won ? 1 : 0);
      const newLosses = player.losses + (won ? 0 : 1);
      const newTotal = player.totalGames + 1;
      const fastest =
        won && (!player.fastestWinTurns || turnsTaken < player.fastestWinTurns)
          ? turnsTaken
          : player.fastestWinTurns;

      const achievements = Array.isArray(player.completedAchievements)
        ? [...player.completedAchievements]
        : [];
      let bonusGems = 0;

      if (won && !achievements.includes("first_crack")) {
        achievements.push("first_crack");
        bonusGems += 20;
      }
      if (won && turnsTaken <= 4 && !achievements.includes("mind_reader")) {
        achievements.push("mind_reader");
        bonusGems += 50;
      }
      if (won && turnsTaken <= 3 && !achievements.includes("perfect_game")) {
        achievements.push("perfect_game");
        bonusGems += 80;
      }
      if (
        won &&
        aiDifficulty === "Oracle" &&
        !achievements.includes("oracle_slayer")
      ) {
        achievements.push("oracle_slayer");
        bonusGems += 100;
      }
      if (
        won &&
        aiDifficulty === "Mastermind" &&
        !achievements.includes("mastermind_beat")
      ) {
        achievements.push("mastermind_beat");
        bonusGems += 55;
      }
      if (newWins >= 10 && !achievements.includes("win_10")) {
        achievements.push("win_10");
        bonusGems += 40;
      }
      if (newWins >= 50 && !achievements.includes("win_50")) {
        achievements.push("win_50");
        bonusGems += 120;
      }
      if (newTrophies >= 100 && !achievements.includes("trophies_100")) {
        achievements.push("trophies_100");
        bonusGems += 35;
      }
      if (newTrophies >= 250 && !achievements.includes("trophies_250")) {
        achievements.push("trophies_250");
        bonusGems += 60;
      }
      if (newTrophies >= 700 && !achievements.includes("trophies_700")) {
        achievements.push("trophies_700");
        bonusGems += 100;
      }
      if (newWins >= 100 && !achievements.includes("win_100")) {
        achievements.push("win_100");
        bonusGems += 200;
      }
      if (newTrophies >= 1000 && !achievements.includes("trophies_1000")) {
        achievements.push("trophies_1000");
        bonusGems += 150;
      }
      if (newTrophies >= 1900 && !achievements.includes("trophies_1900")) {
        achievements.push("trophies_1900");
        bonusGems += 300;
      }
      if (won && turnsTaken <= 2 && !achievements.includes("fast_2")) {
        achievements.push("fast_2");
        bonusGems += 150;
      }

      const [updated] = await db
        .update(players)
        .set({
          trophies: newTrophies,
          division: divInfo.name,
          xp: newXp,
          seasonXp: newSeasonXp,
          level: newLevel,
          coins: player.coins + coinsEarned,
          gems: player.gems + bonusGems,
          wins: newWins,
          losses: newLosses,
          totalGames: newTotal,
          fastestWinTurns: fastest,
          completedAchievements: achievements,
          lastSeenAt: new Date(),
        })
        .where(eq(players.id, player.id))
        .returning();

      // Update player's club trophy total if they belong to one
      if (updated.clubId) {
        const clubMembers = await db
          .select()
          .from(players)
          .where(eq(players.clubId, updated.clubId));
        const totalTrophies = clubMembers.reduce((sum, m) => sum + m.trophies, 0);
        await db
          .update(clubs)
          .set({
            memberCount: clubMembers.length,
            totalTrophies,
          })
          .where(eq(clubs.id, updated.clubId));
      }

      return NextResponse.json({ player: updated, bonusGems });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("POST /api/state error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process action";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
