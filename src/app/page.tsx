"use client";

import React, { useState, useEffect, useCallback } from "react";
import confetti from "canvas-confetti";
import {
  AIDifficulty,
  AI_PROFILES,
  TurnTimerOption,
  DIVISIONS,
  getDivisionForTrophies,
  SEASON_PASS_TIERS,
  COSMETIC_SHOP_ITEMS,
  getAllShopItems,
  DAILY_QUESTS,
  getDailyChallenge,
  getAllAchievements,
  computeTrophyDelta,
} from "@/lib/game-engine";
import { soundEngine } from "@/lib/sound-effects";
import CodeClashArena, { ActiveGameMode } from "@/components/CodeClashArena";
import DynamicProfileModal, {
  PlayerRecord,
  getFrameClasses,
} from "@/components/DynamicProfileModal";
import ChatPanel from "@/components/ChatPanel";
import MatchSideChat from "@/components/MatchSideChat";
import MatchReplay from "@/components/MatchReplay";
import {
  loadSession,
  saveSession,
  createGuestSession,
  clearSession,
  pushOfflineResult,
  generateLocalId,
  getOfflineQueue,
  clearOfflineQueue,
} from "@/lib/session";
import {
  Flame,
  Trophy,
  Volume2,
  VolumeX,
  Swords,
  Bot,
  Smartphone,
  Crown,
  Users,
  ShoppingBag,
  Sparkles,
  Search,
  UserPlus,
  UserCheck,
  Plus,
  Lock,
  Unlock,
  Check,
  Clock,
  Shield,
  Play,
  CheckCircle2,
  Compass,
  HelpCircle,
  Database,
} from "lucide-react";

interface ClubRecord {
  id: number;
  name: string;
  tag: string;
  badgeEmoji: string;
  description: string;
  totalTrophies: number;
  memberCount: number;
}

interface MatchRecord {
  id: number;
  roomCode: string;
  mode: string;
  status: string;
  timerSeconds: number;
  player1Id: number | null;
  player1Name: string;
  player1Avatar: string;
  player1Division: string;
  player2Name: string;
  player2Avatar: string;
  player2Division: string;
}

interface TournamentRecord {
  id: number;
  name: string;
  type: "mass_hunt" | "bracket";
  status: string;
  isPrivate: boolean;
  inviteCode: string | null;
  secretCode: string;
  prizeCoins: number;
  prizeGems: number;
  participants: Array<{
    playerId: number;
    username: string;
    avatarEmoji: string;
    division: string;
    attempts: number;
    solved: boolean;
    bestPoints: number;
    bestOrders: number;
    timeSeconds: number;
  }>;
  bracketMatches: Array<{
    id: string;
    round: number;
    label: string;
    player1Name: string;
    player1Emoji: string;
    player2Name: string;
    player2Emoji: string;
    score1: number;
    score2: number;
    winnerName: string | null;
    status: "completed" | "live" | "upcoming";
  }>;
  createdBy: string;
}

const TIMER_OPTIONS: { value: TurnTimerOption; label: string }[] = [
  { value: 15, label: "15s" },
  { value: 30, label: "30s" },
  { value: 45, label: "45s" },
  { value: 60, label: "60s" },
  { value: 90, label: "90s" },
  { value: 0, label: "Unlimited" },
];

const STARTER_AVATARS = ["🦉", "🦊", "🐉", "🦄", "🐼", "🦁", "🐸", "🐣"];

export default function CodeClashApp() {
  // Bottom Navigation Tabs
  const [activeNav, setActiveNav] = useState<
    "play" | "rank" | "tournaments" | "social" | "shop"
  >("play");

  // Focused Mode Tab inside Play Hub to reduce visual clutter
  const [selectedPlayTab, setSelectedPlayTab] = useState<
    "ai" | "online_1v1" | "hotseat" | "local_offline"
  >("ai");

  // Real Server-backed Game State (No fake fallbacks)
  const [currentPlayer, setCurrentPlayer] = useState<PlayerRecord | null>(null);
  const [leaderboard, setLeaderboard] = useState<PlayerRecord[]>([]);
  const [clubs, setClubs] = useState<ClubRecord[]>([]);
  const [followingIds, setFollowingIds] = useState<number[]>([]);
  const [openMatches, setOpenMatches] = useState<MatchRecord[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRecord[]>([]);
  const [supabaseReady, setSupabaseReady] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [deferredInstall, setDeferredInstall] = useState<any>(null);
  const [isOnlineNet, setIsOnlineNet] = useState(true);
  const dailyChallenge = getDailyChallenge();
  const knownOnlineRef = React.useRef<Set<number>>(new Set());


  // First-time Guided Profile Creation State
  const [onboardingName, setOnboardingName] = useState<string>("");
  const [onboardingPassword, setOnboardingPassword] = useState<string>("");
  const [onboardingEmoji, setOnboardingEmoji] = useState<string>("🦉");
  const [onboardingMode, setOnboardingMode] = useState<"register" | "login">(
    "register"
  );
  const [onboardingError, setOnboardingError] = useState<string>("");
  const [showHowToPlay, setShowHowToPlay] = useState<boolean>(false);

  // Audio Mute State
  const [muted, setMuted] = useState<boolean>(false);

  // Toast Notification Banner
  const [toast, setToast] = useState<string | null>(null);

  // Active Match Configuration
  const [inArena, setInArena] = useState<boolean>(false);
  const [arenaMode, setArenaMode] = useState<ActiveGameMode>("ai");
  const [selectedTimer, setSelectedTimer] = useState<TurnTimerOption>(45);
  const [selectedAiDifficulty, setSelectedAiDifficulty] =
    useState<AIDifficulty>("Rookie");
  const [activeRoomCode, setActiveRoomCode] = useState<string | undefined>(
    undefined
  );
  const [isPlayer2Seat, setIsPlayer2Seat] = useState<boolean>(false);
  const [arenaOpponentName, setArenaOpponentName] =
    useState<string>("Opponent");
  const [arenaOpponentAvatar, setArenaOpponentAvatar] = useState<string>("🦊");
  const [activeTournament, setActiveTournament] =
    useState<TournamentRecord | null>(null);

  // Online 1v1 & Local Offline Room Inputs
  const [joinRoomInput, setJoinRoomInput] = useState<string>("");
  const [hotseatP2Name, setHotseatP2Name] = useState<string>("Player 2");

  // Social Search & Dynamic Profile Inspection
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [inspectedPlayer, setInspectedPlayer] = useState<PlayerRecord | null>(
    null
  );
  const [newClubName, setNewClubName] = useState<string>("");
  const [newClubTag, setNewClubTag] = useState<string>("");
  const [newClubDesc, setNewClubDesc] = useState<string>("");
  const [showCreateClub, setShowCreateClub] = useState<boolean>(false);

  // Create Tournament Form State
  const [showCreateTourney, setShowCreateTourney] = useState<boolean>(false);
  const [newTourneyName, setNewTourneyName] = useState<string>("");
  const [newTourneyType, setNewTourneyType] = useState<"mass_hunt" | "bracket">(
    "mass_hunt"
  );
  const [newTourneyPrivate, setNewTourneyPrivate] = useState<boolean>(false);
  const [newTourneySecret, setNewTourneySecret] = useState<string>("");
  const [privateInviteSearch, setPrivateInviteSearch] = useState<string>("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Register PWA Service Worker
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    setMuted(soundEngine.isMuted());
  }, []);

  // Fetch real state from PostgreSQL / Supabase API
  const fetchGameState = useCallback(async (explicitPlayerId?: number | null) => {
    try {
      const savedId =
        explicitPlayerId !== undefined
          ? explicitPlayerId
          : typeof window !== "undefined"
          ? window.localStorage.getItem("code_clash_player_id")
          : null;

      const query = savedId ? `?playerId=${savedId}` : "";
      const res = await fetch(`/api/state${query}`);
      if (!res.ok) return;
      const data = await res.json();

      setCurrentPlayer(data.currentPlayer || null);
      setLeaderboard(data.leaderboard || []);
      setClubs(data.clubs || []);
      setFollowingIds(data.followingIds || []);
      setOpenMatches(data.matches || []);
      setTournaments(data.tournaments || []);
      setSupabaseReady(Boolean(data.supabaseReady));
    } catch (e) {
      console.error("Failed to fetch state:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGameState();
  }, [fetchGameState]);

  // PWA install prompt capture
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstall(e);
    };
    window.addEventListener("beforeinstallprompt", handler as any);
    setIsOnlineNet(navigator.onLine);
    const on = () => setIsOnlineNet(true);
    const off = () => setIsOnlineNet(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("beforeinstallprompt", handler as any);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // Ensure a player profile exists (Guest = local only, never written to DB)
  const ensurePlayerProfile = async (): Promise<PlayerRecord | null> => {
    if (currentPlayer) return currentPlayer;

    // Restore from local session first
    const saved = loadSession();
    if (saved && saved.isGuest) {
      const guestPlayer = {
        id: null as any,
        username: saved.username,
        avatarEmoji: saved.avatarEmoji,
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
        claimedFreeTiers: [] as number[],
        claimedPremiumTiers: [] as number[],
        ownedCosmetics: ["frame_emerald", "theme_classic", "effect_confetti", "title_breaker"],
        completedAchievements: [] as string[],
        claimedQuests: [] as string[],
        coins: 0,
        gems: 0,
        streakDays: 1,
        wins: 0,
        losses: 0,
        totalGames: 0,
        fastestWinTurns: null as number | null,
        clubId: null as number | null,
        isOnline: true,
        lastSeenAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        authProvider: "guest",
        passwordHash: "",
      };
      setCurrentPlayer(guestPlayer as any);
      return guestPlayer as any;
    }

    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "auth",
          mode: "guest",
          avatarEmoji: onboardingEmoji,
        }),
      });
      const data = await res.json();
      if (data.player) {
        // Guests: save only to local session, never store null id as real id
        if (data.player.id == null || data.player.isGuest) {
          createGuestSession(data.player.username);
        } else if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "code_clash_player_id",
            String(data.player.id)
          );
          saveSession({
            id: data.player.id,
            username: data.player.username,
            avatarEmoji: data.player.avatarEmoji,
            isGuest: false,
          });
        }
        setCurrentPlayer(data.player);
        if (data.player.id) fetchGameState(data.player.id);
        return data.player;
      }
    } catch {}
    // Fully offline fallback
    const g = createGuestSession();
    const offlineGuest = {
      id: null as any,
      username: g.username,
      avatarEmoji: g.avatarEmoji,
      title: "Guest Breaker",
      division: "Bronze",
      trophies: 0,
      level: 1,
      xp: 0,
      coins: 0,
      gems: 0,
      wins: 0,
      losses: 0,
      totalGames: 0,
      streakDays: 1,
      isOnline: true,
      authProvider: "guest",
    };
    setCurrentPlayer(offlineGuest as any);
    return offlineGuest as any;
  };

  // Launch vs AI Match
  const handleStartAIMatch = async (diff: AIDifficulty) => {
    soundEngine.playTap(580);
    await ensurePlayerProfile();
    setSelectedAiDifficulty(diff);
    setArenaMode("ai");
    setActiveRoomCode(undefined);
    setIsPlayer2Seat(false);
    setInArena(true);
  };

  // Launch Hotseat Match (Same Phone)
  const handleStartHotseat = async () => {
    soundEngine.playTap(580);
    await ensurePlayerProfile();
    setArenaMode("hotseat");
    setArenaOpponentName(hotseatP2Name.trim() || "Player 2");
    setArenaOpponentAvatar("🦁");
    setActiveRoomCode(undefined);
    setIsPlayer2Seat(false);
    setInArena(true);
  };

  // Create Online 1v1 or Local 2-Phone Room
  const handleCreateOrChallengeOnline = async (
    targetPlayer?: PlayerRecord,
    mode: "online_1v1" | "local_offline" = "online_1v1"
  ) => {
    soundEngine.playTap(600);
    const active = await ensurePlayerProfile();
    if (!active) return;

    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_room",
          mode,
          timerSeconds: selectedTimer,
          player1Id: active.id,
          player1Name: active.username,
          player1Avatar: active.avatarEmoji,
          player1Division: active.division,
          targetOpponentName: targetPlayer?.username,
          targetOpponentAvatar: targetPlayer?.avatarEmoji,
          targetOpponentDivision: targetPlayer?.division,
        }),
      });
      const data = await res.json();
      if (data.match) {
        setArenaMode(mode);
        setActiveRoomCode(data.match.roomCode);
        setArenaOpponentName(
          targetPlayer?.username || "Waiting for Player 2..."
        );
        setArenaOpponentAvatar(targetPlayer?.avatarEmoji || "⚔️");
        setIsPlayer2Seat(false);
        setInspectedPlayer(null);
        setInArena(true);
        showToast(
          `📡 Room ${data.match.roomCode} created! Lock your secret code to begin.`
        );
        fetchGameState(active.id);
      }
    } catch {
      showToast("Could not create room — check your connection.");
    }
  };

  // Join an existing Online 1v1 or Local 2-Phone Room by Code
  const handleJoinRoomByCode = async (
    codeToJoin: string,
    mode: "online_1v1" | "local_offline" = "online_1v1"
  ) => {
    const clean = codeToJoin.trim().toUpperCase();
    if (!clean) {
      showToast("Enter a valid Room Code first!");
      return;
    }
    soundEngine.playTap(600);
    const active = await ensurePlayerProfile();
    if (!active) return;

    try {
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join_room",
          roomCode: clean,
          player2Id: active.id,
          player2Name: active.username,
          player2Avatar: active.avatarEmoji,
          player2Division: active.division,
        }),
      });
      const data = await res.json();
      if (data.match) {
        setArenaMode(mode);
        setActiveRoomCode(data.match.roomCode);
        setArenaOpponentName(data.match.player1Name);
        setArenaOpponentAvatar(data.match.player1Avatar || "🦉");
        setIsPlayer2Seat(true);
        setInArena(true);
        showToast(
          `⚡ Joined Room ${data.match.roomCode} vs ${data.match.player1Name}!`
        );
      } else {
        showToast(data.error || "Room code not found!");
      }
    } catch {
      showToast("Could not join room.");
    }
  };

  // Enter a Real Tournament Match
  const handleEnterTournamentMatch = async (tourney: TournamentRecord) => {
    soundEngine.playTap(620);
    const active = await ensurePlayerProfile();
    if (!active) return;

    // Register participant in tournament
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join_tournament",
          tournamentId: tourney.id,
          playerId: active.id,
          username: active.username,
          avatarEmoji: active.avatarEmoji,
          division: active.division,
        }),
      });
      const data = await res.json();
      if (data.tournament) {
        setActiveTournament(data.tournament);
      } else {
        setActiveTournament(tourney);
      }
    } catch {
      setActiveTournament(tourney);
    }

    if (tourney.type === "mass_hunt") {
      setArenaMode("mass_hunt");
      setArenaOpponentName(tourney.name);
      setArenaOpponentAvatar("🏦");
      setInArena(true);
    } else {
      setArenaMode("ai");
      setSelectedAiDifficulty("Mastermind");
      setArenaOpponentName(`${tourney.name} Challenger`);
      setArenaOpponentAvatar("⚔️");
      setInArena(true);
    }
  };

  // Record Match Outcome — works online + queues offline; guests update locally
  const handleMatchComplete = async (result: {
    won: boolean;
    turnsTaken: number;
    trophyDelta: number;
    coinsEarned: number;
    xpEarned: number;
    aiDifficulty?: AIDifficulty;
  }) => {
    if (!currentPlayer) return;

    const isGuest = !currentPlayer.id || (currentPlayer as any).isGuest || (currentPlayer as any).authProvider === "guest";

    // Always apply local optimistic update so UI & leaderboard feel alive
    const applyLocal = (p: PlayerRecord) => {
      const delta = result.won ? result.trophyDelta : -Math.floor(result.trophyDelta * 0.5);
      const newTrophies = Math.max(0, (p.trophies || 0) + delta);
      const div = getDivisionForTrophies(newTrophies);
      const newXp = (p.xp || 0) + result.xpEarned;
      return {
        ...p,
        trophies: newTrophies,
        division: div.name,
        xp: newXp,
        seasonXp: (p.seasonXp || 0) + result.xpEarned,
        level: Math.max(p.level || 1, Math.floor(newXp / 200) + 1),
        coins: (p.coins || 0) + result.coinsEarned,
        wins: (p.wins || 0) + (result.won ? 1 : 0),
        losses: (p.losses || 0) + (result.won ? 0 : 1),
        totalGames: (p.totalGames || 0) + 1,
        fastestWinTurns:
          result.won && (!p.fastestWinTurns || result.turnsTaken < p.fastestWinTurns)
            ? result.turnsTaken
            : p.fastestWinTurns,
      } as PlayerRecord;
    };

    const updatedLocal = applyLocal(currentPlayer);
    setCurrentPlayer(updatedLocal);

    // Guests: local only, never hit DB
    if (isGuest) {
      saveSession({
        id: null,
        username: updatedLocal.username,
        avatarEmoji: updatedLocal.avatarEmoji || "🦉",
        isGuest: true,
      });
      // Persist guest stats in localStorage so they survive refresh
      try {
        localStorage.setItem(
          "codeclash_guest_stats",
          JSON.stringify({
            trophies: updatedLocal.trophies,
            wins: updatedLocal.wins,
            losses: updatedLocal.losses,
            totalGames: updatedLocal.totalGames,
            coins: updatedLocal.coins,
            xp: updatedLocal.xp,
            level: updatedLocal.level,
            division: updatedLocal.division,
          })
        );
      } catch {}
      showToast(
        result.won
          ? `🎉 Win! +${result.trophyDelta} trophies (Guest — create account to appear on global board)`
          : `Match over. Stats saved on this device.`
      );
      return;
    }

    // Registered player: try server, else queue offline
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_match_result",
          playerId: currentPlayer.id,
          ...result,
        }),
      });
      if (!res.ok) throw new Error("server error");
      const data = await res.json();
      if (data.player) {
        setCurrentPlayer(data.player);
        if (data.bonusGems > 0) {
          showToast(`🏅 Achievement Unlocked! +${data.bonusGems} Royal Gems!`);
        } else if (result.won) {
          showToast(`🏆 +${result.trophyDelta} trophies · Rank: ${data.player.division}`);
        }
      }
      if (
        activeTournament &&
        activeTournament.type === "bracket" &&
        result.won
      ) {
        await fetch("/api/tournaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "advance_bracket",
            tournamentId: activeTournament.id,
            winnerName: currentPlayer.username,
          }),
        });
      }
      if (currentPlayer.id) fetchGameState(currentPlayer.id);
    } catch {
      // Offline or network fail — queue for later sync
      pushOfflineResult({
        id: generateLocalId(),
        mode: result.aiDifficulty ? "ai" : "match",
        won: result.won,
        turns: result.turnsTaken,
        opponentName: "offline",
        timestamp: new Date().toISOString(),
        coinsEarned: result.coinsEarned,
        trophiesDelta: result.trophyDelta,
      });
      showToast(
        result.won
          ? `🏆 Win saved offline · +${result.trophyDelta} trophies (will sync when online)`
          : `Result saved offline — will sync later`
      );
    }
  };

  // Sync offline match queue when back online (batch — ranks update correctly)
  const syncOfflineQueue = useCallback(async () => {
    if (!currentPlayer?.id) return;
    const queue = getOfflineQueue();
    if (!queue.length) return;
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_offline_batch",
          playerId: currentPlayer.id,
          results: queue.map((item) => ({
            won: item.won,
            turnsTaken: item.turns,
            trophyDelta: item.trophiesDelta,
            coinsEarned: item.coinsEarned,
            xpEarned: item.won ? 100 : 40,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        clearOfflineQueue();
        if (data.player) setCurrentPlayer(data.player);
        if (data.applied > 0) {
          showToast(`☁️ Synced ${data.applied} offline match${data.applied > 1 ? "es" : ""} → rank updated!`);
        }
        fetchGameState(currentPlayer.id);
      }
    } catch {
      // keep queue
    }
  }, [currentPlayer, fetchGameState, showToast]);

  // Heartbeat + sync offline results (after syncOfflineQueue is defined)
  useEffect(() => {
    if (!currentPlayer?.id) return;

    const beat = () => {
      fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", playerId: currentPlayer.id }),
      }).catch(() => {});
    };
    beat();
    const hb = setInterval(beat, 45000);

    const sync = () => {
      if (navigator.onLine) syncOfflineQueue();
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("focus", sync);

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    return () => {
      clearInterval(hb);
      window.removeEventListener("online", sync);
      window.removeEventListener("focus", sync);
    };
  }, [currentPlayer?.id, syncOfflineQueue]);

  // Detect friends coming online
  useEffect(() => {
    if (!leaderboard.length || !followingIds.length) return;
    const onlineNow = new Set(
      leaderboard.filter((p) => p.isOnline && followingIds.includes(p.id)).map((p) => p.id)
    );
    onlineNow.forEach((id) => {
      if (!knownOnlineRef.current.has(id)) {
        const p = leaderboard.find((x) => x.id === id);
        if (p && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification("Code Clash", {
              body: `${p.username} is online — challenge them!`,
              icon: "/icon-192.svg",
            });
          } catch {}
        }
      }
    });
    knownOnlineRef.current = onlineNow;
  }, [leaderboard, followingIds]);

  // Toggle Follow / Unfollow
  const handleToggleFollow = async (targetId: number) => {
    if (!currentPlayer) {
      showToast("Create your profile first to follow players!");
      return;
    }
    soundEngine.playTap(520);
    const already = followingIds.includes(targetId);
    setFollowingIds((prev) =>
      already ? prev.filter((id) => id !== targetId) : [...prev, targetId]
    );
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "toggle_follow",
        playerId: currentPlayer.id,
        targetId,
      }),
    });
    showToast(already ? "Unfollowed player." : "🤝 Following player!");
  };

  // Update Cosmetics
  const handleUpdateCosmetics = async (updates: {
    frameId?: string;
    themeId?: string;
    effectId?: string;
    title?: string;
    avatarEmoji?: string;
  }) => {
    if (!currentPlayer) return;
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update_cosmetics",
        playerId: currentPlayer.id,
        ...updates,
      }),
    });
    const data = await res.json();
    if (data.player) {
      setCurrentPlayer(data.player);
      setInspectedPlayer(data.player);
      showToast("✨ Profile updated!");
      fetchGameState(data.player.id);
    }
  };

  // Auth Action (Login, Register, Google, Guest)
  const handleAuthAction = async (payload: {
    mode: "login" | "register" | "google" | "guest";
    username?: string;
    password?: string;
    avatarEmoji?: string;
  }) => {
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "auth",
        ...payload,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Authentication failed");
    }
    if (data.player) {
      const isGuest = !data.player.id || data.player.isGuest || data.player.authProvider === "guest";
      if (typeof window !== "undefined") {
        if (isGuest) {
          // Guests stay local only
          window.localStorage.removeItem("code_clash_player_id");
          createGuestSession(data.player.username);
        } else {
          window.localStorage.setItem(
            "code_clash_player_id",
            String(data.player.id)
          );
          saveSession({
            id: data.player.id,
            username: data.player.username,
            avatarEmoji: data.player.avatarEmoji || "🦉",
            isGuest: false,
          });
        }
      }
      setCurrentPlayer(data.player);
      if (inspectedPlayer && !isGuest) setInspectedPlayer(data.player);
      showToast(`🎉 Welcome to Code Clash, ${data.player.username}!`);
      if (!isGuest && data.player.id) fetchGameState(data.player.id);
    }
  };

  // Quick Onboarding Form Submit
  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingError("");
    if (!onboardingName.trim()) {
      setOnboardingError("Please enter a username to begin.");
      return;
    }
    try {
      await handleAuthAction({
        mode: onboardingMode,
        username: onboardingName.trim(),
        password: onboardingPassword,
        avatarEmoji: onboardingEmoji,
      });
      setOnboardingName("");
      setOnboardingPassword("");
    } catch (err: unknown) {
      setOnboardingError(
        err instanceof Error ? err.message : "Could not sign in"
      );
    }
  };

  // Buy Cosmetic Item
  const handleBuyCosmetic = async (itemId: string) => {
    if (!currentPlayer) {
      showToast("Create your profile first to unlock cosmetics!");
      return;
    }
    soundEngine.playReward();
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "buy_cosmetic",
        playerId: currentPlayer.id,
        itemId,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(`⚠️ ${data.error || "Cannot purchase"}`);
      return;
    }
    if (data.player) {
      setCurrentPlayer(data.player);
      confetti({ particleCount: 55, spread: 60, origin: { y: 0.7 } });
      showToast("🎨 Cosmetic unlocked & equipped!");
    }
  };

  // Claim Season Pass Tier
  const handleClaimPassTier = async (tier: number, isPremium: boolean) => {
    if (!currentPlayer) return;
    soundEngine.playReward();
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "claim_pass_tier",
        playerId: currentPlayer.id,
        tier,
        isPremium,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(`⚠️ ${data.error}`);
      return;
    }
    if (data.player) {
      setCurrentPlayer(data.player);
      confetti({ particleCount: 60, spread: 65, origin: { y: 0.6 } });
      showToast(`🎁 Claimed Season Pass Tier ${tier} reward!`);
    }
  };

  // Unlock Premium Season Pass
  const handleUnlockPremiumPass = async () => {
    if (!currentPlayer) {
      showToast("Create your profile first!");
      return;
    }
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "unlock_premium_pass",
        playerId: currentPlayer.id,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(`⚠️ ${data.error}`);
      return;
    }
    if (data.player) {
      soundEngine.playVictory();
      setCurrentPlayer(data.player);
      confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
      showToast("👑 Royal Season Pass Unlocked!");
    }
  };

  // Claim Daily Quest
  const handleClaimQuest = async (questId: string) => {
    if (!currentPlayer) {
      showToast("Create a profile and complete the quest first!");
      return;
    }
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "claim_quest",
        playerId: currentPlayer.id,
        questId,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(`⚠️ ${data.error}`);
      return;
    }
    if (data.player) {
      soundEngine.playReward();
      setCurrentPlayer(data.player);
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      showToast("🔥 Daily Quest Claimed!");
    }
  };

  // Create New Tournament
  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    const active = await ensurePlayerProfile();
    if (!active) return;

    if (!newTourneyName.trim()) {
      showToast("Please enter a tournament name.");
      return;
    }

    soundEngine.playReward();
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_tournament",
        name: newTourneyName.trim(),
        type: newTourneyType,
        isPrivate: newTourneyPrivate,
        secretCode: newTourneySecret.trim(),
        prizeCoins: 500,
        prizeGems: 25,
        createdBy: active.username,
        creatorId: active.id,
        creatorEmoji: active.avatarEmoji,
        creatorDivision: active.division,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      showToast(`⚠️ ${data.error || "Failed to create tournament"}`);
      return;
    }
    if (data.tournament) {
      setTournaments((prev) => [data.tournament, ...prev]);
      setShowCreateTourney(false);
      setNewTourneyName("");
      setNewTourneySecret("");
      showToast(
        data.tournament.inviteCode
          ? `🔒 Private Tournament Created! Invite Code: ${data.tournament.inviteCode}`
          : "🏆 Tournament Created!"
      );
    }
  };

  const divInfo = getDivisionForTrophies(currentPlayer?.trophies || 0);
  const filteredPlayers = leaderboard.filter((p) =>
    p.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Helper to check real quest progress for currentPlayer
  const getQuestProgress = (questId: string) => {
    if (!currentPlayer) return { current: 0, target: 1, done: false };
    if (questId === "quest_play_2") {
      return {
        current: Math.min(2, currentPlayer.totalGames),
        target: 2,
        done: currentPlayer.totalGames >= 2,
      };
    }
    if (questId === "quest_orders_8") {
      return {
        current: currentPlayer.totalGames >= 1 ? 1 : 0,
        target: 1,
        done: currentPlayer.totalGames >= 1,
      };
    }
    if (questId === "quest_beat_ai") {
      return {
        current: Math.min(1, currentPlayer.wins),
        target: 1,
        done: currentPlayer.wins >= 1,
      };
    }
    if (questId === "quest_fast_win") {
      const fast =
        currentPlayer.fastestWinTurns !== null &&
        currentPlayer.fastestWinTurns <= 6;
      return {
        current: fast ? 1 : 0,
        target: 1,
        done: fast,
      };
    }
    return { current: 0, target: 1, done: false };
  };

  return (
    <div className="min-h-screen bg-[#FFFDF7] text-[#2B2D42] flex flex-col">
      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-[#2B2D42] text-white font-display font-bold text-xs shadow-xl border-b-4 border-black flex items-center gap-2 animate-pop-in">
          <Sparkles className="w-4 h-4 text-[#FFC800]" />
          <span>{toast}</span>
        </div>
      )}

      {/* TOP HUD BAR */}
      <header className="sticky top-0 z-40 bg-[#FFFDF7]/95 backdrop-blur-md border-b-2 border-[#E5E0D5]">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-2">
          {/* Player Profile Pill or Sign-In Prompt */}
          <div className="flex items-center gap-2.5">
            {currentPlayer ? (
              <button
                onClick={() => {
                  soundEngine.playTap(500);
                  setInspectedPlayer(currentPlayer);
                }}
                className="flex items-center gap-2.5 p-1 pr-3 rounded-2xl bg-[#F3F0E6] hover:bg-[#E5E0D5] border-2 border-[#E5E0D5] transition"
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${getFrameClasses(
                    currentPlayer.frameId
                  )}`}
                >
                  {currentPlayer.avatarEmoji}
                </div>
                <div className="text-left">
                  <div className="text-xs font-display font-bold text-[#2B2D42] leading-tight flex items-center gap-1">
                    <span>{currentPlayer.username}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[#58CC02] text-white font-black">
                      Lv.{currentPlayer.level}
                    </span>
                  </div>
                  <div className="text-[10px] font-extrabold text-[#6C757D] flex items-center gap-1">
                    <span>{divInfo.badgeEmoji}</span>
                    <span>{divInfo.name}</span>
                    <span>• {currentPlayer.trophies} 🏆</span>
                  </div>
                </div>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-[#58CC02] text-white flex items-center justify-center text-lg font-bold shadow-xs">
                  🔐
                </div>
                <div>
                  <div className="text-sm font-display font-bold text-[#2B2D42] leading-none">
                    Code Clash
                  </div>
                  <div className="text-[10px] font-extrabold text-[#6C757D]">
                    4-Digit Code Breaker
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Currencies & Controls */}
          <div className="flex items-center gap-2">
            {currentPlayer && (
              <>
                <div
                  onClick={() => setActiveNav("shop")}
                  className="cursor-pointer px-2.5 py-1.5 rounded-xl bg-orange-50 border-2 border-orange-200 text-[#FF9600] font-display font-bold text-xs flex items-center gap-1"
                  title="Daily Streak"
                >
                  <Flame className="w-4 h-4 fill-[#FF9600]" />
                  <span>{currentPlayer.streakDays}</span>
                </div>

                <div
                  onClick={() => setActiveNav("shop")}
                  className="cursor-pointer px-2.5 py-1.5 rounded-xl bg-amber-50 border-2 border-amber-200 text-[#D97706] font-display font-bold text-xs flex items-center gap-1"
                  title="Clash Coins"
                >
                  <span>🪙</span>
                  <span>{currentPlayer.coins}</span>
                </div>

                <div
                  onClick={() => setActiveNav("shop")}
                  className="hidden sm:flex cursor-pointer px-2.5 py-1.5 rounded-xl bg-purple-50 border-2 border-purple-200 text-[#9333EA] font-display font-bold text-xs items-center gap-1"
                  title="Royal Gems"
                >
                  <span>💎</span>
                  <span>{currentPlayer.gems}</span>
                </div>
              </>
            )}

            <button
              onClick={() => setShowHowToPlay(!showHowToPlay)}
              className="px-2.5 py-1.5 rounded-xl bg-[#F3F0E6] hover:bg-[#E5E0D5] border-2 border-[#E5E0D5] text-xs font-extrabold text-[#2B2D42] flex items-center gap-1"
              title="How to Play Guide"
            >
              <HelpCircle className="w-4 h-4 text-[#1CB0F6]" />
              <span className="hidden sm:inline">Guide</span>
            </button>

            <button
              onClick={() => {
                const nextMuted = soundEngine.toggleMute();
                setMuted(nextMuted);
              }}
              className="w-9 h-9 rounded-xl bg-[#F3F0E6] hover:bg-[#E5E0D5] border-2 border-[#E5E0D5] flex items-center justify-center text-[#2B2D42]"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <VolumeX className="w-4 h-4 text-[#FF4B4B]" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#58CC02]" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* COLLAPSIBLE VISUAL "HOW TO PLAY" GUIDE */}
      {showHowToPlay && (
        <div className="max-w-5xl w-full mx-auto px-4 pt-3">
          <div className="bg-amber-50 rounded-3xl p-4 border-2 border-[#FFC800] space-y-2 animate-pop-in">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-[#2B2D42]">
                🎓 How to Play Code Clash in 3 Simple Steps
              </h3>
              <button
                onClick={() => setShowHowToPlay(false)}
                className="text-xs font-extrabold text-[#6C757D] hover:text-[#2B2D42]"
              >
                Close ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="bg-white p-3 rounded-2xl border border-[#E5E0D5]">
                <div className="font-display font-bold text-[#58CC02] mb-1">
                  1. Pick 4 Unique Digits
                </div>
                <p className="text-[#6C757D] font-semibold">
                  Both players create a secret 4-digit code using unique digits from <strong>1 to 9</strong> (no repeats, no zero).
                </p>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-[#E5E0D5]">
                <div className="font-display font-bold text-[#D97706] mb-1">
                  2. Read Points & Orders
                </div>
                <p className="text-[#6C757D] font-semibold">
                  After every guess you get <strong>Points</strong> (correct digits anywhere) and <strong>Orders</strong> (digits in the exact right position).
                </p>
              </div>
              <div className="bg-white p-3 rounded-2xl border border-[#E5E0D5]">
                <div className="font-display font-bold text-[#1CB0F6] mb-1">
                  3. Reach 4P + 4O First!
                </div>
                <p className="text-[#6C757D] font-semibold">
                  Use the clues to deduce the code. First player to hit <strong>4 Points + 4 Orders</strong> wins!
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 pt-4 pb-28 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT / PRIMARY COLUMN */}
        <div className="lg:col-span-7 space-y-5">
          {inArena ? (
            <CodeClashArena
              mode={arenaMode}
              aiDifficulty={selectedAiDifficulty}
              timerOption={selectedTimer}
              player1Id={currentPlayer?.id}
              player1Name={currentPlayer?.username || "Guest"}
              player1Avatar={currentPlayer?.avatarEmoji || onboardingEmoji}
              player2Name={arenaOpponentName}
              player2Avatar={arenaOpponentAvatar}
              roomCode={activeRoomCode}
              isPlayer2Seat={isPlayer2Seat}
              tournamentId={activeTournament?.id}
              tournamentName={activeTournament?.name}
              tournamentSecret={activeTournament?.secretCode}
              themeId={currentPlayer?.themeId || "theme_classic"}
              onMatchComplete={handleMatchComplete}
              onExitArena={() => {
                soundEngine.playTap(420);
                setInArena(false);
                setActiveTournament(null);
                fetchGameState(currentPlayer?.id);
              }}
            />
          ) : (
            <>
              {/* STEP 1 FOR NEW VISITORS: REAL ACCOUNT / GUEST SETUP CARD */}
              {!currentPlayer && !loading && (
                <section className="bg-white rounded-3xl p-5 border-2 border-[#58CC02] border-b-[6px] shadow-sm space-y-4 animate-pop-in">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full bg-lime-100 text-[#46A302] text-[11px] font-black uppercase">
                        👋 Step 1: Welcome to Code Clash
                      </span>
                      <h2 className="text-xl font-display font-bold text-[#2B2D42] mt-1">
                        Create Your Profile or Play as Guest
                      </h2>
                      <p className="text-xs font-semibold text-[#6C757D]">
                        All stats, rankings, and matches are 100% real and saved to the database.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAuthAction({ mode: "guest", avatarEmoji: onboardingEmoji })}
                      className="px-4 py-2.5 rounded-2xl bg-[#FFC800] text-[#2B2D42] font-display font-bold text-xs border-b-4 border-[#E5B400] btn-tactile shrink-0"
                    >
                      ⚡ Instant Guest Play
                    </button>
                  </div>

                  <form onSubmit={handleOnboardingSubmit} className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase text-[#6C757D] mb-1.5">
                        Pick Your Avatar
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {STARTER_AVATARS.map((emo) => (
                          <button
                            type="button"
                            key={emo}
                            onClick={() => setOnboardingEmoji(emo)}
                            className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center border-2 transition ${
                              onboardingEmoji === emo
                                ? "bg-lime-100 border-[#58CC02] scale-105"
                                : "bg-[#F3F0E6] border-[#E5E0D5]"
                            }`}
                          >
                            {emo}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={onboardingName}
                        onChange={(e) => setOnboardingName(e.target.value)}
                        placeholder="Choose a Username"
                        className="px-3.5 py-2.5 rounded-xl bg-[#F3F0E6] border-2 border-[#E5E0D5] text-xs font-bold focus:outline-none focus:border-[#58CC02]"
                      />
                      <input
                        type="password"
                        value={onboardingPassword}
                        onChange={(e) => setOnboardingPassword(e.target.value)}
                        placeholder="Password (optional for Guest)"
                        className="px-3.5 py-2.5 rounded-xl bg-[#F3F0E6] border-2 border-[#E5E0D5] text-xs font-bold focus:outline-none focus:border-[#58CC02]"
                      />
                    </div>

                    {onboardingError && (
                      <p className="text-xs font-extrabold text-[#FF4B4B]">
                        {onboardingError}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        onClick={() => setOnboardingMode("register")}
                        className="flex-1 py-3 rounded-2xl bg-[#58CC02] text-white font-display font-bold text-xs border-b-4 border-[#46A302] btn-tactile"
                      >
                        Create Account & Start
                      </button>
                      <button
                        type="submit"
                        onClick={() => setOnboardingMode("login")}
                        className="px-4 py-3 rounded-2xl bg-[#1CB0F6] text-white font-display font-bold text-xs border-b-4 border-[#1899D6] btn-tactile"
                      >
                        Log In
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {/* TAB 1: GUIDED PLAY HUB */}
              {activeNav === "play" && (
                <div className="space-y-5 animate-pop-in">
                  {/* Network + Install strip */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold border-2 ${
                        isOnlineNet
                          ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                          : "bg-amber-50 border-amber-300 text-amber-800"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isOnlineNet ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {isOnlineNet ? "Online — ranks sync live" : "Offline — games queue for sync"}
                    </span>
                    {deferredInstall && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            deferredInstall.prompt();
                            await deferredInstall.userChoice;
                            setDeferredInstall(null);
                            showToast("📲 App installed — play offline anytime!");
                          } catch {}
                        }}
                        className="px-3 py-1.5 rounded-full bg-[#1CB0F6] text-white text-[11px] font-extrabold border-b-3 border-[#1899D6] btn-tactile"
                      >
                        📲 Install App
                      </button>
                    )}
                  </div>

                  {/* Daily Challenge */}
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playTap(620);
                      if (dailyChallenge.rule === "hard_ai_only") {
                        handleStartAIMatch("Mastermind");
                      } else if (dailyChallenge.rule === "speed_30") {
                        handleStartAIMatch("Tactician");
                      } else {
                        handleStartAIMatch("Rookie");
                      }
                      showToast(`${dailyChallenge.icon} ${dailyChallenge.title} — ${dailyChallenge.description}`);
                    }}
                    className="w-full text-left rounded-3xl p-4 border-2 border-[#CE82FF] border-b-[6px] bg-gradient-to-br from-purple-50 to-fuchsia-50 hover:brightness-105 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#CE82FF] text-white flex items-center justify-center text-2xl shrink-0">
                        {dailyChallenge.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-black uppercase tracking-wider text-[#CE82FF]">
                            Daily Challenge
                          </span>
                          <span className="text-[10px] font-bold text-[#6C757D]">
                            {dailyChallenge.dateKey}
                          </span>
                          <span className="text-[10px] font-black text-amber-600">
                            ×{dailyChallenge.bonusMultiplier} rewards
                          </span>
                        </div>
                        <h3 className="font-display font-bold text-[#2B2D42] text-base">
                          {dailyChallenge.title}
                        </h3>
                        <p className="text-xs font-semibold text-[#6C757D] mt-0.5 break-safe">
                          {dailyChallenge.description}
                        </p>
                      </div>
                      <span className="text-[#CE82FF] font-black text-sm shrink-0">Play →</span>
                    </div>
                  </button>

                  {/* Guided 3-Step Journey Banner */}
                  <div className="rounded-3xl bg-gradient-to-br from-[#58CC02] to-[#46A302] text-white p-5 border-b-[6px] border-[#388402] shadow-md space-y-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/20 text-[11px] font-black uppercase">
                          <Compass className="w-3.5 h-3.5" /> Guided Journey
                        </div>
                        <h1 className="text-2xl font-display font-bold leading-tight">
                          {!currentPlayer
                            ? "Step 1: Pick a Mode or Start Warmup!"
                            : currentPlayer.totalGames === 0
                            ? `Welcome, ${currentPlayer.username}! Play Your First Match`
                            : `Ready for Your Next Duel, ${currentPlayer.username}?`}
                        </h1>
                        <p className="text-xs font-bold text-white/90">
                          Guess your opponent&apos;s 4 unique digits (1–9). First to{" "}
                          <span className="underline decoration-[#FFC800] decoration-2">
                            4 Points + 4 Orders
                          </span>{" "}
                          wins!
                        </p>
                      </div>

                      <button
                        onClick={() => handleStartAIMatch("Rookie")}
                        className="px-4 py-3 rounded-2xl bg-[#FFC800] text-[#2B2D42] font-display font-bold text-xs border-b-4 border-[#E5B400] btn-tactile shrink-0 flex items-center gap-1.5 shadow-sm"
                      >
                        <Play className="w-4 h-4 fill-[#2B2D42]" />
                        <span>Quick Warmup</span>
                      </button>
                    </div>

                    {/* Guided Progress Steps */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/20 text-xs">
                      <div className="bg-black/20 rounded-xl p-2 flex items-center gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            currentPlayer ? "text-[#FFC800]" : "text-white/50"
                          }`}
                        />
                        <span className="font-bold truncate">1. Profile Ready</span>
                      </div>
                      <div className="bg-black/20 rounded-xl p-2 flex items-center gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            (currentPlayer?.totalGames || 0) > 0
                              ? "text-[#FFC800]"
                              : "text-white/50"
                          }`}
                        />
                        <span className="font-bold truncate">2. First Match</span>
                      </div>
                      <div className="bg-black/20 rounded-xl p-2 flex items-center gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 ${
                            (currentPlayer?.wins || 0) > 0
                              ? "text-[#FFC800]"
                              : "text-white/50"
                          }`}
                        />
                        <span className="font-bold truncate">3. First Victory</span>
                      </div>
                    </div>

                    {/* Turn Timer Selector */}
                    <div className="pt-2 border-t border-white/20 flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-black uppercase text-white/90 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Turn Timer:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {TIMER_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              soundEngine.playTap(500);
                              setSelectedTimer(opt.value);
                            }}
                            className={`py-1 px-2.5 rounded-xl text-xs font-display font-bold transition border-b-2 ${
                              selectedTimer === opt.value
                                ? "bg-[#FFC800] text-[#2B2D42] border-[#E5B400]"
                                : "bg-black/20 text-white border-black/30 hover:bg-black/30"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* CLEAN 4-MODE SELECTOR PILLS */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { id: "ai", label: "🤖 vs AI", desc: "4 Smart Tiers" },
                      {
                        id: "online_1v1",
                        label: "🌍 Online 1v1",
                        desc: "Live Rooms",
                      },
                      {
                        id: "hotseat",
                        label: "📱 Pass & Play",
                        desc: "1 Phone",
                      },
                      {
                        id: "local_offline",
                        label: "📡 2-Phone",
                        desc: "Local Link",
                      },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          soundEngine.playTap(480);
                          setSelectedPlayTab(
                            m.id as
                              | "ai"
                              | "online_1v1"
                              | "hotseat"
                              | "local_offline"
                          );
                        }}
                        className={`p-3 rounded-2xl border-2 border-b-4 text-left transition btn-tactile ${
                          selectedPlayTab === m.id
                            ? "bg-white border-[#58CC02] shadow-xs"
                            : "bg-[#F3F0E6] border-[#E5E0D5] text-[#6C757D]"
                        }`}
                      >
                        <div className="text-sm font-display font-bold text-[#2B2D42]">
                          {m.label}
                        </div>
                        <div className="text-[11px] font-bold text-[#6C757D]">
                          {m.desc}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* FOCUSED MODE VIEW 1: VS AI */}
                  {selectedPlayTab === "ai" && (
                    <section className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-3.5 animate-pop-in">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-lg font-display font-bold text-[#2B2D42] flex items-center gap-2">
                            <Bot className="w-5 h-5 text-[#58CC02]" />
                            <span>Choose Your AI Opponent</span>
                          </h2>
                          <p className="text-xs font-semibold text-[#6C757D]">
                            Start with <strong>Rookie</strong> to learn the ropes, then work your way up to <strong>Oracle</strong>!
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {(
                          [
                            "Rookie",
                            "Tactician",
                            "Mastermind",
                            "Oracle",
                          ] as AIDifficulty[]
                        ).map((diff) => {
                          const bot = AI_PROFILES[diff];
                          return (
                            <div
                              key={diff}
                              className="p-3.5 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] flex flex-col justify-between gap-3 hover:border-[#1CB0F6] transition"
                            >
                              <div className="flex items-start gap-3">
                                <div
                                  className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 text-white shadow-xs"
                                  style={{ backgroundColor: bot.color }}
                                >
                                  {bot.emoji}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase text-white"
                                      style={{ backgroundColor: bot.color }}
                                    >
                                      {diff}
                                    </span>
                                    <span className="text-[11px] font-extrabold text-[#6C757D]">
                                      +{bot.rewardCoins} 🪙
                                    </span>
                                  </div>
                                  <div className="text-sm font-display font-bold text-[#2B2D42] mt-0.5">
                                    {bot.name}
                                  </div>
                                  <p className="text-[11px] font-semibold text-[#6C757D] leading-snug">
                                    {bot.tagline}
                                  </p>
                                </div>
                              </div>

                              <button
                                onClick={() => handleStartAIMatch(diff)}
                                style={{
                                  backgroundColor: bot.color,
                                  borderColor: bot.borderColor,
                                }}
                                className="w-full py-2.5 rounded-xl text-white font-display font-bold text-xs border-b-4 btn-tactile flex items-center justify-center gap-1.5"
                              >
                                <Play className="w-3.5 h-3.5 fill-white" />
                                <span>Play vs {diff}</span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* FOCUSED MODE VIEW 2: ONLINE 1V1 */}
                  {selectedPlayTab === "online_1v1" && (
                    <section className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4 animate-pop-in">
                      <div>
                        <h2 className="text-lg font-display font-bold text-[#2B2D42] flex items-center gap-2">
                          <Swords className="w-5 h-5 text-[#1CB0F6]" />
                          <span>Online 1v1 Multiplayer</span>
                        </h2>
                        <p className="text-xs font-semibold text-[#6C757D]">
                          Create a room to get a 1v1 Room Code, or enter a friend&apos;s Room Code to join immediately.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          onClick={() =>
                            handleCreateOrChallengeOnline(
                              undefined,
                              "online_1v1"
                            )
                          }
                          className="py-3 px-4 rounded-2xl bg-[#1CB0F6] text-white font-display font-bold text-xs border-b-4 border-[#1899D6] btn-tactile flex items-center justify-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> Create 1v1 Room
                        </button>

                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={joinRoomInput}
                            onChange={(e) => setJoinRoomInput(e.target.value)}
                            placeholder="Enter Room Code"
                            className="flex-1 min-w-0 px-3 py-2 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] font-code text-xs font-bold uppercase focus:outline-none focus:border-[#1CB0F6]"
                          />
                          <button
                            onClick={() =>
                              handleJoinRoomByCode(joinRoomInput, "online_1v1")
                            }
                            className="px-4 py-2 rounded-2xl bg-[#58CC02] text-white font-display font-bold text-xs border-b-4 border-[#46A302] btn-tactile"
                          >
                            Join
                          </button>
                        </div>
                      </div>

                      {/* Real Online Players List */}
                      <div className="space-y-2 pt-2 border-t border-[#E5E0D5]">
                        <div className="text-xs font-extrabold uppercase tracking-wider text-[#6C757D]">
                          🌍 Online Players ({leaderboard.filter((p) => p.isOnline && p.id !== currentPlayer?.id).length})
                        </div>
                        {leaderboard.filter(
                          (p) => p.isOnline && p.id !== currentPlayer?.id
                        ).length === 0 ? (
                          <div className="p-4 rounded-2xl bg-[#F3F0E6] text-center text-xs font-semibold text-[#6C757D]">
                            No other players are online right now. Tap <strong>Create 1v1 Room</strong> above and share the code with a friend!
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {leaderboard
                              .filter(
                                (p) => p.isOnline && p.id !== currentPlayer?.id
                              )
                              .map((rival) => {
                                const rDiv = getDivisionForTrophies(
                                  rival.trophies
                                );
                                return (
                                  <div
                                    key={rival.id}
                                    className="p-2.5 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] flex items-center justify-between gap-2"
                                  >
                                    <div
                                      onClick={() => setInspectedPlayer(rival)}
                                      className="flex items-center gap-2.5 cursor-pointer min-w-0"
                                    >
                                      <div className="w-10 h-10 rounded-xl bg-white border border-[#E5E0D5] flex items-center justify-center text-xl">
                                        {rival.avatarEmoji}
                                      </div>
                                      <div className="min-w-0">
                                        <div className="text-xs font-extrabold text-[#2B2D42] truncate">
                                          {rival.username}
                                        </div>
                                        <div className="text-[10px] font-bold text-[#6C757D]">
                                          {rDiv.badgeEmoji} {rival.division} •{" "}
                                          {rival.trophies} 🏆
                                        </div>
                                      </div>
                                    </div>

                                    <button
                                      onClick={() =>
                                        handleCreateOrChallengeOnline(
                                          rival,
                                          "online_1v1"
                                        )
                                      }
                                      className="px-3 py-2 rounded-xl bg-[#58CC02] text-white font-display font-bold text-[11px] border-b-3 border-[#46A302] btn-tactile shrink-0"
                                    >
                                      ⚔️ Challenge
                                    </button>
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* FOCUSED MODE VIEW 3: HOTSEAT (PASS & PLAY) */}
                  {selectedPlayTab === "hotseat" && (
                    <section className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4 animate-pop-in">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 border-2 border-[#FFC800] flex items-center justify-center text-2xl shrink-0">
                          📱🤝
                        </div>
                        <div>
                          <h2 className="text-lg font-display font-bold text-[#2B2D42]">
                            Pass & Play Hotseat (1 Phone)
                          </h2>
                          <p className="text-xs font-semibold text-[#6C757D]">
                            Two players on the same device! Player 1 sets a secret code, then Player 2 sets theirs, and a privacy curtain protects secrets between turns.
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <input
                          type="text"
                          value={hotseatP2Name}
                          onChange={(e) => setHotseatP2Name(e.target.value)}
                          placeholder="Enter Player 2 Name"
                          className="flex-1 px-4 py-3 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] text-xs font-bold"
                        />
                        <button
                          onClick={handleStartHotseat}
                          className="px-6 py-3 rounded-2xl bg-[#FFC800] text-[#2B2D42] font-display font-bold text-sm border-b-4 border-[#E5B400] btn-tactile"
                        >
                          Start Hotseat Match
                        </button>
                      </div>
                    </section>
                  )}

                  {/* FOCUSED MODE VIEW 4: LOCAL 2-PHONE */}
                  {selectedPlayTab === "local_offline" && (
                    <section className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4 animate-pop-in">
                      <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-purple-100 border-2 border-[#CE82FF] flex items-center justify-center text-2xl shrink-0">
                          📡📲
                        </div>
                        <div>
                          <h2 className="text-lg font-display font-bold text-[#2B2D42]">
                            Local 2-Phone Duel (Same Network / Hotspot)
                          </h2>
                          <p className="text-xs font-semibold text-[#6C757D]">
                            <strong>Step 1:</strong> Tap &quot;Host on Phone 1&quot; to get a local room code.<br />
                            <strong>Step 2:</strong> Enter that code on Phone 2 to connect directly.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <button
                          onClick={() =>
                            handleCreateOrChallengeOnline(
                              undefined,
                              "local_offline"
                            )
                          }
                          className="py-3 px-4 rounded-2xl bg-[#CE82FF] text-white font-display font-bold text-xs border-b-4 border-[#A560E8] btn-tactile flex items-center justify-center gap-2"
                        >
                          <Smartphone className="w-4 h-4" /> Host on Phone 1
                        </button>

                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={joinRoomInput}
                            onChange={(e) => setJoinRoomInput(e.target.value)}
                            placeholder="Phone 1 Room Code"
                            className="flex-1 min-w-0 px-3 py-2 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] font-code text-xs font-bold uppercase"
                          />
                          <button
                            onClick={() =>
                              handleJoinRoomByCode(
                                joinRoomInput,
                                "local_offline"
                              )
                            }
                            className="px-4 py-2 rounded-2xl bg-[#58CC02] text-white font-display font-bold text-xs border-b-4 border-[#46A302] btn-tactile"
                          >
                            Connect Phone 2
                          </button>
                        </div>
                      </div>
                    </section>
                  )}
                </div>
              )}

              {/* TAB 2: RANKING DIVISIONS & SEASON PASS */}
              {activeNav === "rank" && (
                <div className="space-y-5 animate-pop-in">
                  <div
                    className={`rounded-3xl p-5 bg-gradient-to-r ${divInfo.bgGradient} text-white border-b-[6px] shadow-md`}
                    style={{ borderColor: divInfo.borderColor }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full bg-black/25 text-[11px] font-black uppercase">
                          Your Competitive Rank
                        </span>
                        <h2 className="text-2xl font-display font-bold mt-1 flex items-center gap-2">
                          <span>{divInfo.badgeEmoji}</span>
                          <span>{divInfo.name} Division</span>
                        </h2>
                        <p className="text-xs font-bold text-white/90 mt-0.5">
                          {currentPlayer?.trophies || 0} Trophies • Win Bonus: +
                          {divInfo.winRewardCoins} Coins/Match
                        </p>
                      </div>
                      <div className="text-5xl">{divInfo.badgeEmoji}</div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/20 grid grid-cols-4 sm:grid-cols-8 gap-1.5 text-center">
                      {DIVISIONS.map((d) => {
                        const reached =
                          (currentPlayer?.trophies || 0) >= d.minTrophies;
                        return (
                          <div
                            key={d.name}
                            className={`p-1.5 rounded-xl border ${
                              d.name === divInfo.name
                                ? "bg-white text-[#2B2D42] border-white font-black scale-105"
                                : reached
                                ? "bg-black/25 text-white border-white/30"
                                : "bg-black/10 text-white/60 border-transparent"
                            }`}
                          >
                            <div className="text-base">{d.badgeEmoji}</div>
                            <div className="text-[9px] font-extrabold truncate">
                              {d.name}
                            </div>
                            <div className="text-[8px] opacity-80">
                              {d.minTrophies}+
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <section className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="inline-flex items-center gap-1 text-[11px] font-black uppercase text-[#CE82FF]">
                          <Crown className="w-3.5 h-3.5" /> Cosmetic Rewards Only • No Pay-to-Win
                        </div>
                        <h3 className="text-xl font-display font-bold text-[#2B2D42]">
                          Season Pass
                        </h3>
                        <p className="text-xs font-bold text-[#6C757D]">
                          Your Season XP:{" "}
                          <span className="text-[#58CC02] font-black">
                            {currentPlayer?.seasonXp || 0} XP
                          </span>
                        </p>
                      </div>

                      {!currentPlayer?.hasPremiumPass ? (
                        <button
                          onClick={handleUnlockPremiumPass}
                          className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#CE82FF] to-[#9333EA] text-white font-display font-bold text-xs border-b-4 border-[#7E22CE] btn-tactile flex items-center gap-1.5 shadow-sm"
                        >
                          <Crown className="w-4 h-4 text-[#FFC800]" />
                          <span>Unlock Royal Pass (80 💎)</span>
                        </button>
                      ) : (
                        <span className="px-3 py-1.5 rounded-xl bg-purple-100 border-2 border-[#CE82FF] text-[#7E22CE] font-display font-bold text-xs flex items-center gap-1">
                          <Crown className="w-4 h-4" /> Royal Pass Active
                        </span>
                      )}
                    </div>

                    <div className="space-y-2.5">
                      {SEASON_PASS_TIERS.map((tierObj) => {
                        const unlocked =
                          (currentPlayer?.seasonXp || 0) >= tierObj.xpRequired;
                        const freeClaimed = (
                          currentPlayer?.claimedFreeTiers || []
                        ).includes(tierObj.tier);
                        const premClaimed = (
                          currentPlayer?.claimedPremiumTiers || []
                        ).includes(tierObj.tier);

                        return (
                          <div
                            key={tierObj.tier}
                            className={`p-3 rounded-2xl border-2 transition grid grid-cols-12 items-center gap-2.5 ${
                              unlocked
                                ? "bg-lime-50/50 border-[#58CC02]/50"
                                : "bg-[#F3F0E6] border-[#E5E0D5]"
                            }`}
                          >
                            <div className="col-span-2 text-center">
                              <div
                                className={`w-10 h-10 mx-auto rounded-2xl font-display font-bold text-sm flex items-center justify-center border-b-3 ${
                                  unlocked
                                    ? "bg-[#58CC02] text-white border-[#46A302]"
                                    : "bg-white text-[#6C757D] border-[#D6CFC0]"
                                }`}
                              >
                                T{tierObj.tier}
                              </div>
                              <div className="text-[10px] font-extrabold text-[#6C757D] mt-0.5">
                                {tierObj.xpRequired} XP
                              </div>
                            </div>

                            <div className="col-span-5 bg-white p-2.5 rounded-xl border border-[#E5E0D5] flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xl">
                                  {tierObj.freeReward.icon}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[10px] font-black uppercase text-[#58CC02]">
                                    FREE
                                  </div>
                                  <div className="text-xs font-extrabold text-[#2B2D42] truncate">
                                    {tierObj.freeReward.name}
                                  </div>
                                </div>
                              </div>
                              {freeClaimed ? (
                                <span className="px-2 py-1 rounded-lg bg-lime-100 text-[#46A302] text-[10px] font-black">
                                  ✓
                                </span>
                              ) : unlocked ? (
                                <button
                                  onClick={() =>
                                    handleClaimPassTier(tierObj.tier, false)
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-[#58CC02] text-white text-[10px] font-black border-b-2 border-[#46A302] btn-tactile"
                                >
                                  Claim
                                </button>
                              ) : (
                                <Lock className="w-3.5 h-3.5 text-[#6C757D]" />
                              )}
                            </div>

                            <div className="col-span-5 bg-purple-50/70 p-2.5 rounded-xl border border-purple-200 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xl">
                                  {tierObj.premiumReward.icon}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-[10px] font-black uppercase text-[#9333EA]">
                                    ROYAL
                                  </div>
                                  <div className="text-xs font-extrabold text-[#2B2D42] truncate">
                                    {tierObj.premiumReward.name}
                                  </div>
                                </div>
                              </div>
                              {premClaimed ? (
                                <span className="px-2 py-1 rounded-lg bg-purple-200 text-[#7E22CE] text-[10px] font-black">
                                  ✓
                                </span>
                              ) : unlocked && currentPlayer?.hasPremiumPass ? (
                                <button
                                  onClick={() =>
                                    handleClaimPassTier(tierObj.tier, true)
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-[#CE82FF] text-white text-[10px] font-black border-b-2 border-[#A560E8] btn-tactile"
                                >
                                  Claim
                                </button>
                              ) : (
                                <Lock className="w-3.5 h-3.5 text-[#9333EA]" />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              )}

              {/* TAB 3: TOURNAMENTS (100% Real Player-Created Events) */}
              {activeNav === "tournaments" && (
                <div className="space-y-5 animate-pop-in">
                  <div className="bg-gradient-to-r from-[#FFC800] to-[#FF9600] text-[#2B2D42] rounded-3xl p-5 border-b-[6px] border-[#D97706] flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full bg-black/10 text-[11px] font-black uppercase">
                        🏆 Community & Private Tournaments
                      </span>
                      <h2 className="text-2xl font-display font-bold mt-1">
                        Code Clash Tournaments
                      </h2>
                      <p className="text-xs font-bold text-[#2B2D42]/80">
                        Host or join real Mass Code Hunts and 1v1 Bracket Duels!
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        soundEngine.playTap(540);
                        setShowCreateTourney(!showCreateTourney);
                      }}
                      className="px-4 py-3 rounded-2xl bg-[#2B2D42] text-white font-display font-bold text-xs border-b-4 border-black btn-tactile flex items-center gap-1.5"
                    >
                      <Plus className="w-4 h-4 text-[#FFC800]" />
                      <span>Host Tournament</span>
                    </button>
                  </div>

                  {showCreateTourney && (
                    <form
                      onSubmit={handleCreateTournament}
                      className="bg-white rounded-3xl p-5 border-2 border-[#FFC800] border-b-[6px] space-y-3.5 animate-pop-in"
                    >
                      <h3 className="text-base font-display font-bold text-[#2B2D42]">
                        🛠️ Create a New Tournament
                      </h3>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setNewTourneyType("mass_hunt")}
                          className={`p-3 rounded-2xl border-2 text-left ${
                            newTourneyType === "mass_hunt"
                              ? "bg-lime-50 border-[#58CC02]"
                              : "bg-[#F3F0E6] border-[#E5E0D5]"
                          }`}
                        >
                          <div className="text-sm font-display font-bold">
                            🏦 Mass Code Hunt
                          </div>
                          <div className="text-[11px] font-semibold text-[#6C757D]">
                            Players race to crack the same 4-digit secret code.
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewTourneyType("bracket")}
                          className={`p-3 rounded-2xl border-2 text-left ${
                            newTourneyType === "bracket"
                              ? "bg-sky-50 border-[#1CB0F6]"
                              : "bg-[#F3F0E6] border-[#E5E0D5]"
                          }`}
                        >
                          <div className="text-sm font-display font-bold">
                            ⚔️ Bracket League
                          </div>
                          <div className="text-[11px] font-semibold text-[#6C757D]">
                            1v1 elimination bracket where winners advance.
                          </div>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-extrabold text-[#6C757D] uppercase mb-1">
                            Tournament Name
                          </label>
                          <input
                            type="text"
                            value={newTourneyName}
                            onChange={(e) => setNewTourneyName(e.target.value)}
                            placeholder="Enter Tournament Title"
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F0E6] border border-[#E5E0D5] text-xs font-bold"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-extrabold text-[#6C757D] uppercase mb-1">
                            Secret Vault Code (Optional — Random if blank)
                          </label>
                          <input
                            type="text"
                            maxLength={4}
                            value={newTourneySecret}
                            onChange={(e) => setNewTourneySecret(e.target.value)}
                            placeholder="4 unique digits (1-9)"
                            className="w-full px-3.5 py-2.5 rounded-xl bg-[#F3F0E6] border border-[#E5E0D5] font-code text-xs font-bold"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setNewTourneyPrivate(!newTourneyPrivate)
                          }
                          className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border-2 ${
                            newTourneyPrivate
                              ? "bg-purple-100 border-[#CE82FF] text-[#7E22CE]"
                              : "bg-[#F3F0E6] border-[#E5E0D5] text-[#6C757D]"
                          }`}
                        >
                          {newTourneyPrivate ? (
                            <>
                              <Lock className="w-3.5 h-3.5" /> Private (Invite Code)
                            </>
                          ) : (
                            <>
                              <Unlock className="w-3.5 h-3.5" /> Public Event
                            </>
                          )}
                        </button>

                        <button
                          type="submit"
                          className="px-5 py-2.5 rounded-2xl bg-[#58CC02] text-white font-display font-bold text-xs border-b-4 border-[#46A302] btn-tactile"
                        >
                          Launch Tournament
                        </button>
                      </div>
                    </form>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={privateInviteSearch}
                      onChange={(e) => setPrivateInviteSearch(e.target.value)}
                      placeholder="Enter Private Tournament Invite Code (if joining a private event)"
                      className="flex-1 px-4 py-2.5 rounded-2xl bg-white border-2 border-[#E5E0D5] text-xs font-bold"
                    />
                  </div>

                  {tournaments.length === 0 ? (
                    <div className="bg-white rounded-3xl p-8 border-2 border-[#E5E0D5] text-center space-y-2">
                      <div className="text-3xl">🏆</div>
                      <h3 className="text-base font-display font-bold text-[#2B2D42]">
                        No Live Tournaments Yet
                      </h3>
                      <p className="text-xs font-semibold text-[#6C757D] max-w-sm mx-auto">
                        Tap <strong>Host Tournament</strong> above to launch the first Mass Code Hunt or Bracket League!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tournaments
                        .filter(
                          (t) =>
                            !t.isPrivate ||
                            !privateInviteSearch ||
                            t.inviteCode
                              ?.toLowerCase()
                              .includes(privateInviteSearch.toLowerCase()) ||
                            t.createdBy === currentPlayer?.username
                        )
                        .map((tourney) => (
                          <div
                            key={tourney.id}
                            className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase text-white ${
                                      tourney.type === "mass_hunt"
                                        ? "bg-[#58CC02]"
                                        : "bg-[#1CB0F6]"
                                    }`}
                                  >
                                    {tourney.type === "mass_hunt"
                                      ? "🏦 MASS CODE HUNT"
                                      : "⚔️ BRACKET LEAGUE"}
                                  </span>
                                  {tourney.isPrivate && (
                                    <span className="px-2 py-0.5 rounded-full bg-purple-100 text-[#7E22CE] text-[10px] font-black font-code">
                                      🔒 CODE: {tourney.inviteCode}
                                    </span>
                                  )}
                                </div>
                                <h3 className="text-lg font-display font-bold text-[#2B2D42] mt-1">
                                  {tourney.name}
                                </h3>
                                <p className="text-xs font-bold text-[#6C757D]">
                                  Hosted by {tourney.createdBy} • Prize:{" "}
                                  <span className="text-[#D97706]">
                                    🪙 {tourney.prizeCoins}
                                  </span>{" "}
                                  +{" "}
                                  <span className="text-[#9333EA]">
                                    💎 {tourney.prizeGems}
                                  </span>
                                </p>
                              </div>

                              <button
                                onClick={() =>
                                  handleEnterTournamentMatch(tourney)
                                }
                                className="px-4 py-2.5 rounded-2xl bg-[#58CC02] text-white font-display font-bold text-xs border-b-4 border-[#46A302] btn-tactile flex items-center gap-1.5"
                              >
                                <Play className="w-3.5 h-3.5 fill-white" />
                                <span>
                                  {tourney.type === "mass_hunt"
                                    ? "Crack Vault Now"
                                    : "Enter Bracket"}
                                </span>
                              </button>
                            </div>

                            {tourney.type === "mass_hunt" && (
                              <div className="bg-[#F3F0E6] rounded-2xl p-3 space-y-2">
                                <div className="text-[11px] font-extrabold uppercase text-[#6C757D] flex justify-between">
                                  <span>
                                    Participants ({tourney.participants.length})
                                  </span>
                                  <span>Progress</span>
                                </div>
                                {tourney.participants.map((part, idx) => (
                                  <div
                                    key={idx}
                                    className="bg-white rounded-xl px-3 py-2 flex items-center justify-between text-xs border border-[#E5E0D5]"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-code font-black text-[#6C757D]">
                                        #{idx + 1}
                                      </span>
                                      <span>{part.avatarEmoji}</span>
                                      <span className="font-extrabold text-[#2B2D42]">
                                        {part.username}
                                      </span>
                                    </div>
                                    <div className="font-code font-bold">
                                      {part.solved ? (
                                        <span className="px-2 py-0.5 rounded-md bg-lime-100 text-[#46A302] text-[11px]">
                                          ✓ CRACKED ({part.attempts} turns •{" "}
                                          {part.timeSeconds}s)
                                        </span>
                                      ) : part.attempts > 0 ? (
                                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-[#D97706] text-[11px]">
                                          {part.bestPoints}P / {part.bestOrders}O (
                                          {part.attempts} tries)
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-[#6C757D]">
                                          Joined
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {tourney.type === "bracket" &&
                              tourney.bracketMatches.length > 0 && (
                                <div className="grid grid-cols-1 gap-2.5 bg-[#F3F0E6] p-3 rounded-2xl">
                                  {tourney.bracketMatches.map((duel) => (
                                    <div
                                      key={duel.id}
                                      className="p-2.5 rounded-xl border-2 bg-white border-[#E5E0D5] space-y-1.5"
                                    >
                                      <div className="text-[10px] font-black uppercase text-[#6C757D] flex justify-between">
                                        <span>{duel.label}</span>
                                        <span>{duel.status.toUpperCase()}</span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs font-extrabold">
                                        <span>
                                          {duel.player1Emoji} {duel.player1Name}
                                        </span>
                                        <span className="font-code px-1.5 py-0.5 rounded bg-[#F3F0E6]">
                                          {duel.score1}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center text-xs font-extrabold">
                                        <span>
                                          {duel.player2Emoji} {duel.player2Name}
                                        </span>
                                        <span className="font-code px-1.5 py-0.5 rounded bg-[#F3F0E6]">
                                          {duel.score2}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: SOCIAL, PLAYER SEARCH & CLUBS (100% Real Data) */}
              {activeNav === "social" && (
                <div className="space-y-5 animate-pop-in">
                  <div className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4">
                    <div>
                      <h2 className="text-lg font-display font-bold text-[#2B2D42] flex items-center gap-2">
                        <Users className="w-5 h-5 text-[#1CB0F6]" />
                        <span>Player Directory & Friends</span>
                      </h2>
                      <p className="text-xs font-semibold text-[#6C757D]">
                        Search real players by username to inspect their profile, follow them, or send a 1v1 challenge.
                      </p>
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 text-[#6C757D] absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search players by username..."
                        className="w-full pl-10 pr-4 py-3 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] text-xs font-bold focus:outline-none focus:border-[#1CB0F6]"
                      />
                    </div>

                    {filteredPlayers.length === 0 ? (
                      <div className="p-6 rounded-2xl bg-[#F3F0E6] text-center text-xs font-semibold text-[#6C757D]">
                        No players found matching your search.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredPlayers.map((p) => {
                          const pDiv = getDivisionForTrophies(p.trophies);
                          const isFollowing = followingIds.includes(p.id);
                          const isMe = p.id === currentPlayer?.id;

                          return (
                            <div
                              key={p.id}
                              className="p-3 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] flex items-center justify-between gap-2 hover:border-[#1CB0F6] transition"
                            >
                              <div
                                onClick={() => {
                                  soundEngine.playTap(480);
                                  setInspectedPlayer(p);
                                }}
                                className="flex items-center gap-3 cursor-pointer min-w-0 flex-1"
                              >
                                <div
                                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${getFrameClasses(
                                    p.frameId
                                  )}`}
                                >
                                  {p.avatarEmoji}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-display font-bold text-[#2B2D42] flex items-center gap-1.5">
                                    <span className="truncate">
                                      {p.username}
                                    </span>
                                    {isMe && (
                                      <span className="px-1.5 py-0.5 rounded bg-[#58CC02] text-white text-[9px] font-black">
                                        YOU
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] font-bold text-[#6C757D] flex items-center gap-2">
                                    <span>
                                      {pDiv.badgeEmoji} {p.division} (
                                      {p.trophies} 🏆)
                                    </span>
                                    <span>
                                      • {p.wins}W / {p.losses}L
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {!isMe && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleToggleFollow(p.id)}
                                    className={`px-3 py-2 rounded-xl text-xs font-extrabold border-b-3 btn-tactile flex items-center gap-1 ${
                                      isFollowing
                                        ? "bg-white text-[#2B2D42] border-[#D6CFC0]"
                                        : "bg-[#1CB0F6] text-white border-[#1899D6]"
                                    }`}
                                  >
                                    {isFollowing ? (
                                      <>
                                        <UserCheck className="w-3.5 h-3.5" />{" "}
                                        Following
                                      </>
                                    ) : (
                                      <>
                                        <UserPlus className="w-3.5 h-3.5" />{" "}
                                        Follow
                                      </>
                                    )}
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleCreateOrChallengeOnline(
                                        p,
                                        "online_1v1"
                                      )
                                    }
                                    className="px-3 py-2 rounded-xl bg-[#58CC02] text-white text-xs font-extrabold border-b-3 border-[#46A302] btn-tactile"
                                  >
                                    ⚔️
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* REAL CLUBS / TEAMS SECTION */}
                  <div className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-display font-bold text-[#2B2D42] flex items-center gap-2">
                          <Shield className="w-5 h-5 text-[#58CC02]" />
                          <span>Clubs & Teams</span>
                        </h3>
                        <p className="text-xs font-semibold text-[#6C757D]">
                          Create or join a player club. Club trophies equal the combined real trophies of all members!
                        </p>
                      </div>
                      <button
                        onClick={() => setShowCreateClub(!showCreateClub)}
                        className="px-3.5 py-2 rounded-xl bg-[#58CC02] text-white font-display font-bold text-xs border-b-3 border-[#46A302] btn-tactile"
                      >
                        + Create Club
                      </button>
                    </div>

                    {showCreateClub && (
                      <div className="p-3.5 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] space-y-2.5">
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="text"
                            value={newClubName}
                            onChange={(e) => setNewClubName(e.target.value)}
                            placeholder="Club Name"
                            className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#E5E0D5] text-xs font-bold"
                          />
                          <input
                            type="text"
                            maxLength={4}
                            value={newClubTag}
                            onChange={(e) => setNewClubTag(e.target.value)}
                            placeholder="TAG"
                            className="w-20 px-3 py-2 rounded-xl bg-white border border-[#E5E0D5] font-code text-xs font-bold uppercase"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newClubDesc}
                            onChange={(e) => setNewClubDesc(e.target.value)}
                            placeholder="Club description..."
                            className="flex-1 px-3 py-2 rounded-xl bg-white border border-[#E5E0D5] text-xs font-bold"
                          />
                          <button
                            onClick={async () => {
                              const active = await ensurePlayerProfile();
                              if (!active || !newClubName.trim()) return;
                              const res = await fetch("/api/state", {
                                method: "POST",
                                headers: {
                                  "Content-Type": "application/json",
                                },
                                body: JSON.stringify({
                                  action: "create_club",
                                  playerId: active.id,
                                  name: newClubName.trim(),
                                  tag: newClubTag || "CLB",
                                  description:
                                    newClubDesc.trim() ||
                                    "Code Clash Club",
                                  badgeEmoji: "🛡️",
                                }),
                              });
                              const data = await res.json();
                              if (data.club) {
                                setClubs((prev) => [data.club, ...prev]);
                                setCurrentPlayer(data.player);
                                setShowCreateClub(false);
                                setNewClubName("");
                                setNewClubTag("");
                                setNewClubDesc("");
                                showToast(
                                  `🛡️ Created & joined ${data.club.name}!`
                                );
                              }
                            }}
                            className="px-4 py-2 rounded-xl bg-[#1CB0F6] text-white font-display font-bold text-xs"
                          >
                            Save Club
                          </button>
                        </div>
                      </div>
                    )}

                    {clubs.length === 0 ? (
                      <div className="p-6 rounded-2xl bg-[#F3F0E6] text-center text-xs font-semibold text-[#6C757D]">
                        No clubs created yet. Tap <strong>+ Create Club</strong> to found the first club!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {clubs.map((club) => {
                          const isMember = currentPlayer?.clubId === club.id;
                          return (
                            <div
                              key={club.id}
                              className={`p-3.5 rounded-2xl border-2 flex flex-col justify-between gap-3 ${
                                isMember
                                  ? "bg-lime-50 border-[#58CC02]"
                                  : "bg-[#F3F0E6] border-[#E5E0D5]"
                              }`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-2xl bg-white border border-[#E5E0D5] flex items-center justify-center text-2xl">
                                  {club.badgeEmoji}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-display font-bold text-[#2B2D42] flex items-center gap-1.5">
                                    <span className="truncate">
                                      {club.name}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded bg-[#2B2D42] text-white font-code text-[9px]">
                                      [{club.tag}]
                                    </span>
                                  </div>
                                  <p className="text-[11px] font-semibold text-[#6C757D] line-clamp-2">
                                    {club.description}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-1 border-t border-[#E5E0D5]">
                                <span className="text-xs font-extrabold text-[#2B2D42]">
                                  🏆 {club.totalTrophies.toLocaleString()} • 👥{" "}
                                  {club.memberCount}
                                </span>
                                <button
                                  disabled={isMember}
                                  onClick={async () => {
                                    const active = await ensurePlayerProfile();
                                    if (!active) return;
                                    soundEngine.playReward();
                                    const res = await fetch("/api/state", {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        action: "join_club",
                                        playerId: active.id,
                                        clubId: club.id,
                                      }),
                                    });
                                    const data = await res.json();
                                    if (data.player) {
                                      setCurrentPlayer(data.player);
                                      fetchGameState(active.id);
                                      showToast(`🛡️ Joined ${club.name}!`);
                                    }
                                  }}
                                  className={`px-3 py-1.5 rounded-xl font-display font-bold text-xs ${
                                    isMember
                                      ? "bg-[#58CC02] text-white"
                                      : "bg-white border border-[#D6CFC0] text-[#2B2D42] hover:border-[#58CC02]"
                                  }`}
                                >
                                  {isMember ? "✓ Member" : "Join Club"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: DAILY QUESTS & COSMETIC SHOP */}
              {activeNav === "shop" && (
                <div className="space-y-5 animate-pop-in">
                  {/* Install App — always visible in Quests & Shop */}
                  <section className="rounded-3xl p-4 border-2 border-[#1CB0F6] border-b-[6px] bg-gradient-to-br from-sky-50 to-cyan-50 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#1CB0F6] text-white flex items-center justify-center text-2xl shrink-0">
                        📲
                      </div>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-base font-display font-bold text-[#2B2D42]">
                          Install Code Clash
                        </h2>
                        <p className="text-xs font-semibold text-[#6C757D] mt-0.5">
                          Add to your home screen for full-screen play and offline matches (AI, Hotseat, Local).
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {deferredInstall ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              deferredInstall.prompt();
                              const choice = await deferredInstall.userChoice;
                              setDeferredInstall(null);
                              if (choice?.outcome === "accepted") {
                                showToast("📲 Installed! Open it from your home screen.");
                              }
                            } catch {
                              showToast("Use browser menu → Add to Home Screen");
                            }
                          }}
                          className="px-4 py-2.5 rounded-2xl bg-[#1CB0F6] text-white font-display font-bold text-sm border-b-4 border-[#1899D6] btn-tactile"
                        >
                          📲 Install App Now
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            showToast(
                              "On phone: browser menu (⋮) → Add to Home Screen / Install app"
                            );
                          }}
                          className="px-4 py-2.5 rounded-2xl bg-[#1CB0F6] text-white font-display font-bold text-sm border-b-4 border-[#1899D6] btn-tactile"
                        >
                          📲 How to Install
                        </button>
                      )}
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-[11px] font-extrabold border-2 ${
                          isOnlineNet
                            ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                            : "bg-amber-50 border-amber-300 text-amber-800"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isOnlineNet ? "bg-emerald-500" : "bg-amber-500"}`} />
                        {isOnlineNet ? "Online" : "Offline mode"}
                      </span>
                    </div>
                  </section>

                  <section className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-3.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-display font-bold text-[#2B2D42] flex items-center gap-2">
                          <Flame className="w-5 h-5 text-[#FF9600] fill-[#FF9600]" />
                          <span>Daily Quests</span>
                        </h2>
                        <p className="text-xs font-semibold text-[#6C757D]">
                          Play matches to fill your quest progress bars and claim rewards!
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2.5">
                      {DAILY_QUESTS.map((quest) => {
                        const isClaimed = (
                          currentPlayer?.claimedQuests || []
                        ).includes(quest.id);
                        const prog = getQuestProgress(quest.id);

                        return (
                          <div
                            key={quest.id}
                            className="p-3.5 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="w-11 h-11 rounded-2xl bg-white border border-[#E5E0D5] flex items-center justify-center text-2xl shrink-0">
                                {quest.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-display font-bold text-[#2B2D42] flex items-center gap-2">
                                  <span>{quest.title}</span>
                                  <span className="text-[11px] font-code font-bold text-[#6C757D]">
                                    ({prog.current}/{prog.target})
                                  </span>
                                </div>
                                <div className="text-xs font-semibold text-[#6C757D]">
                                  {quest.description}
                                </div>
                                <div className="mt-1.5 flex items-center gap-2 text-[11px] font-black">
                                  <span className="text-[#D97706]">
                                    +{quest.rewardCoins} 🪙
                                  </span>
                                  <span className="text-[#58CC02]">
                                    +{quest.rewardXp} XP
                                  </span>
                                  {quest.rewardGems && (
                                    <span className="text-[#9333EA]">
                                      +{quest.rewardGems} 💎
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {isClaimed ? (
                              <span className="px-3 py-2 rounded-xl bg-lime-100 text-[#46A302] font-display font-bold text-xs flex items-center gap-1">
                                <Check className="w-4 h-4" /> Claimed
                              </span>
                            ) : prog.done ? (
                              <button
                                onClick={() => handleClaimQuest(quest.id)}
                                className="px-4 py-2.5 rounded-xl bg-[#FFC800] text-[#2B2D42] font-display font-bold text-xs border-b-4 border-[#E5B400] btn-tactile shrink-0"
                              >
                                Claim Reward
                              </button>
                            ) : (
                              <span className="px-3 py-2 rounded-xl bg-white border border-[#E5E0D5] text-[#6C757D] font-display font-bold text-xs shrink-0">
                                In Progress
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4">
                    <div>
                      <h2 className="text-lg font-display font-bold text-[#2B2D42] flex items-center gap-2">
                        <ShoppingBag className="w-5 h-5 text-[#CE82FF]" />
                        <span>Cosmetic Shop</span>
                      </h2>
                      <p className="text-xs font-semibold text-[#6C757D]">
                        Use the Coins and Gems you earn from matches to unlock frames, board themes, and titles.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {getAllShopItems().map((item) => {
                        const owned =
                          item.priceCoins === 0 ||
                          (currentPlayer?.ownedCosmetics || []).includes(
                            item.id
                          );
                        const equipped =
                          currentPlayer?.frameId === item.id ||
                          currentPlayer?.themeId === item.id ||
                          currentPlayer?.effectId === item.id ||
                          currentPlayer?.title === item.name;

                        return (
                          <div
                            key={item.id}
                            className="p-3.5 rounded-2xl bg-[#F3F0E6] border-2 border-[#E5E0D5] flex flex-col justify-between gap-3"
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${item.previewStyle}`}
                              >
                                {item.icon}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] font-black uppercase text-[#6C757D]">
                                  {item.category}
                                </span>
                                <div className="text-sm font-display font-bold text-[#2B2D42] truncate">
                                  {item.name}
                                </div>
                                <p className="text-[11px] font-semibold text-[#6C757D]">
                                  {item.description}
                                </p>
                              </div>
                            </div>

                            {equipped ? (
                              <div className="w-full py-2 rounded-xl bg-lime-100 text-[#46A302] font-display font-bold text-xs text-center">
                                ✓ Equipped
                              </div>
                            ) : owned ? (
                              <button
                                onClick={() => {
                                  if (item.category === "frame")
                                    handleUpdateCosmetics({ frameId: item.id });
                                  if (item.category === "theme")
                                    handleUpdateCosmetics({ themeId: item.id });
                                  if (item.category === "effect")
                                    handleUpdateCosmetics({
                                      effectId: item.id,
                                    });
                                  if (item.category === "title")
                                    handleUpdateCosmetics({ title: item.name });
                                }}
                                className="w-full py-2 rounded-xl bg-[#1CB0F6] text-white font-display font-bold text-xs border-b-3 border-[#1899D6] btn-tactile"
                              >
                                Equip Now
                              </button>
                            ) : (
                              <button
                                onClick={() => handleBuyCosmetic(item.id)}
                                className="w-full py-2 rounded-xl bg-[#58CC02] text-white font-display font-bold text-xs border-b-3 border-[#46A302] btn-tactile"
                              >
                                {item.priceCoins
                                  ? `Unlock • 🪙 ${item.priceCoins}`
                                  : `Unlock • 💎 ${item.priceGems}`}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </div>

        {/* RIGHT COMPANION COLUMN (Real Player Card, Open Rooms, Real Leaderboard & Supabase DB Status) */}
        <aside className="lg:col-span-5 space-y-5">
          {/* Player Summary or Onboarding Prompt */}
          {currentPlayer ? (
            <div className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${getFrameClasses(
                      currentPlayer.frameId
                    )}`}
                  >
                    {currentPlayer.avatarEmoji}
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase text-[#58CC02]">
                      {currentPlayer.title}
                    </div>
                    <h3 className="text-lg font-display font-bold text-[#2B2D42]">
                      {currentPlayer.username}
                    </h3>
                    <div className="text-xs font-bold text-[#6C757D]">
                      {divInfo.badgeEmoji} {divInfo.name} • {currentPlayer.wins}
                      W / {currentPlayer.losses}L
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    soundEngine.playTap(500);
                    setInspectedPlayer(currentPlayer);
                  }}
                  className="px-3 py-2 rounded-xl bg-[#F3F0E6] hover:bg-[#E5E0D5] text-xs font-extrabold text-[#2B2D42]"
                >
                  Profile
                </button>
              </div>

              {/* Open 1v1 Rooms Feed */}
              <div className="pt-2 border-t border-[#E5E0D5] space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-[#6C757D] flex items-center justify-between">
                  <span>⚡ Open 1v1 Rooms</span>
                  <span className="text-[#58CC02]">Live</span>
                </div>
                {openMatches.filter((m) => m.status === "waiting").length ===
                0 ? (
                  <div className="p-3 rounded-2xl bg-[#F3F0E6] text-xs font-semibold text-[#6C757D] text-center">
                    No open 1v1 rooms waiting right now.
                  </div>
                ) : (
                  openMatches
                    .filter((m) => m.status === "waiting")
                    .slice(0, 3)
                    .map((m) => (
                      <div
                        key={m.id}
                        className="p-2.5 rounded-2xl bg-[#F3F0E6] border border-[#E5E0D5] flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{m.player1Avatar}</span>
                          <div>
                            <div className="font-extrabold text-[#2B2D42]">
                              {m.player1Name}{" "}
                              <span className="font-code text-[10px] text-[#1899D6]">
                                [{m.roomCode}]
                              </span>
                            </div>
                            <div className="text-[10px] font-bold text-[#6C757D]">
                              {m.player1Division} •{" "}
                              {m.timerSeconds === 0
                                ? "Unlimited"
                                : `${m.timerSeconds}s Timer`}
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() =>
                            handleJoinRoomByCode(m.roomCode, "online_1v1")
                          }
                          className="px-3 py-1.5 rounded-xl bg-[#1CB0F6] text-white font-display font-bold text-[11px] border-b-2 border-[#1899D6] btn-tactile"
                        >
                          Join
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>
          ) : null}

          {/* Global Leaderboard (100% Real Players) */}
          <div className="bg-white rounded-3xl p-5 border-2 border-[#E5E0D5] border-b-[6px] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-display font-bold text-[#2B2D42] flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#FFC800]" />
                <span>Global Leaderboard</span>
              </h3>
              <span className="text-[11px] font-extrabold text-[#6C757D]">
                {leaderboard.length}{" "}
                {leaderboard.length === 1 ? "Player" : "Players"}
              </span>
            </div>

            {leaderboard.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#F3F0E6] text-center space-y-1">
                <div className="text-2xl">🥇</div>
                <div className="text-xs font-extrabold text-[#2B2D42]">
                  Leaderboard is Ready for the First Champion!
                </div>
                <div className="text-[11px] font-semibold text-[#6C757D]">
                  Create your profile and win a match to claim the #1 spot.
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.slice(0, 8).map((player, index) => {
                  const pDiv = getDivisionForTrophies(player.trophies);
                  return (
                    <div
                      key={player.id}
                      onClick={() => {
                        soundEngine.playTap(480);
                        setInspectedPlayer(player);
                      }}
                      className={`p-2.5 rounded-2xl border-2 flex items-center justify-between cursor-pointer transition ${
                        player.id === currentPlayer?.id
                          ? "bg-lime-50 border-[#58CC02]"
                          : "bg-[#F3F0E6] border-[#E5E0D5] hover:border-[#1CB0F6]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-lg font-code text-xs font-black flex items-center justify-center ${
                            index === 0
                              ? "bg-[#FFC800] text-[#2B2D42]"
                              : index === 1
                              ? "bg-slate-300 text-[#2B2D42]"
                              : index === 2
                              ? "bg-amber-600 text-white"
                              : "bg-white text-[#6C757D]"
                          }`}
                        >
                          {index + 1}
                        </span>
                        <div className="relative">
                          <span className="text-xl">{player.avatarEmoji}</span>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                              player.isOnline ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                            title={player.isOnline ? "Online" : "Offline"}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-extrabold text-[#2B2D42] truncate flex items-center gap-1">
                            {player.username}
                            {player.isOnline && (
                              <span className="text-[9px] font-black text-emerald-600">LIVE</span>
                            )}
                          </div>
                          <div className="text-[10px] font-bold text-[#6C757D]">
                            {pDiv.badgeEmoji} {player.division} • {player.wins}W/{player.losses}L • #{index + 1}
                          </div>
                        </div>
                      </div>

                      <div className="font-code text-xs font-black text-[#2B2D42] bg-white px-2.5 py-1 rounded-xl border border-[#E5E0D5]">
                        🏆 {player.trophies}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Supabase / PostgreSQL Auto-Migration Status Badge */}
          <div className="bg-[#F3F0E6] rounded-2xl p-3.5 border border-[#E5E0D5] flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#58CC02]" />
              <span className="font-bold text-[#2B2D42]">
                {supabaseReady
                  ? "Supabase Database Connected & Migrated"
                  : "PostgreSQL Active (Auto-Migrates on Supabase Env Connect)"}
              </span>
            </div>
            <span className="w-2.5 h-2.5 rounded-full bg-[#58CC02]" />
          </div>
        </aside>
      </main>

      {/* BOTTOM 5-TAB NAVIGATION DOCK */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-[#FFFDF7]/95 backdrop-blur-md border-t-2 border-[#E5E0D5]">
        <div className="max-w-xl mx-auto px-3 h-20 flex items-center justify-around gap-1">
          {[
            { id: "play", label: "Play", icon: Swords, color: "#58CC02" },
            { id: "rank", label: "Rank & Pass", icon: Crown, color: "#FFC800" },
            {
              id: "tournaments",
              label: "Tourneys",
              icon: Trophy,
              color: "#FF9600",
            },
            { id: "social", label: "Social", icon: Users, color: "#1CB0F6" },
            {
              id: "shop",
              label: "Quests & Shop",
              icon: Sparkles,
              color: "#CE82FF",
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeNav === tab.id && !inArena;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  soundEngine.playTap(500);
                  setInArena(false);
                  setActiveNav(
                    tab.id as
                      | "play"
                      | "rank"
                      | "tournaments"
                      | "social"
                      | "shop"
                  );
                }}
                className={`flex-1 py-2 px-1 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all ${
                  isSelected
                    ? "bg-[#F3F0E6] border-2 border-[#E5E0D5] -translate-y-1 shadow-xs"
                    : "text-[#6C757D] hover:text-[#2B2D42]"
                }`}
              >
                <Icon
                  className="w-5 h-5"
                  style={{ color: isSelected ? tab.color : undefined }}
                />
                <span
                  className={`text-[11px] font-display font-bold ${
                    isSelected ? "text-[#2B2D42]" : "text-[#6C757D]"
                  }`}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* DYNAMIC PLAYER PROFILE & ACCOUNT MODAL */}
      {inspectedPlayer && (
        <DynamicProfileModal
          player={inspectedPlayer}
          isSelf={inspectedPlayer.id === currentPlayer?.id}
          isFollowing={followingIds.includes(inspectedPlayer.id)}
          onClose={() => setInspectedPlayer(null)}
          onToggleFollow={handleToggleFollow}
          onSendChallenge={(target) =>
            handleCreateOrChallengeOnline(target, "online_1v1")
          }
          onUpdateCosmetics={handleUpdateCosmetics}
          onAuthAction={handleAuthAction}
        />
      )}

      {/* Global Chat */}
      <ChatPanel playerId={currentPlayer?.id ?? null} playerName={currentPlayer?.username} />

      {/* Credits footer */}
      <footer className="safe-bottom mt-auto border-t-2 border-[#E5E0D5] bg-[#F3F0E6]/80 px-4 py-3 text-center">
        <p className="text-[11px] font-bold text-[#6C757D] leading-relaxed">
          Built by <span className="text-[#2B2D42] font-black">Imad Mohammed</span>
          {" "}· Supported &amp; inspired by{" "}
          <span className="text-[#2B2D42] font-black">Esmael</span>,{" "}
          <span className="text-[#2B2D42] font-black">Aymen</span> and more
        </p>
        <p className="text-[10px] font-semibold text-[#9CA3AF] mt-0.5">
          Code Clash · Ranks = trophies · Create an account so wins count on the global leaderboard
        </p>
      </footer>
    </div>
  );
}
