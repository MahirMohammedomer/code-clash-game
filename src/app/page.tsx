"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Bot, CalendarCheck, Check, ChevronRight, Coins, Download, Flame, Gem,
  Globe, GraduationCap, KeyRound, Loader2, Lock, LogOut, Medal, MessageSquare,
  Moon, Play, Plus, Settings, Shield, ShoppingBag, Star, Sun, Swords, Target, Trophy,
  User, Users, Volume2, VolumeX, Zap, Crown, Timer, Sparkles, X, DoorOpen,
  Bell, BellOff, Eye, Gamepad2, History, QrCode, UserPlus, Wifi,
} from "lucide-react";
import dynamic from "next/dynamic";
import GameBoard, { type GameConfig, type GameOutcome } from "@/components/GameBoard";

// Heavy screens are code-split so the first load stays snappy.
const Shop = dynamic(() => import("@/components/Shop"), { loading: () => <ScreenLoading label="Opening the shop..." /> });
const Community = dynamic(() => import("@/components/Community"), { loading: () => <ScreenLoading label="Loading community..." /> });
const Tutorial = dynamic(() => import("@/components/Tutorial"), { loading: () => <ScreenLoading label="Loading the guide..." /> });
const Friends = dynamic(() => import("@/components/Friends"), { loading: () => <ScreenLoading label="Finding your friends..." /> });
const PlayerCard = dynamic(() => import("@/components/PlayerCard"), { loading: () => null });
const PeerLocal = dynamic(() => import("@/components/PeerLocal"), { loading: () => <ScreenLoading label="Warming up local WiFi play..." /> });
const Spectate = dynamic(() => import("@/components/Spectate"), { loading: () => <ScreenLoading label="Grabbing a front-row seat..." /> });
const MatchHistory = dynamic(() => import("@/components/MatchHistory"), { loading: () => <ScreenLoading label="Loading your replays..." /> });
const DailyCode = dynamic(() => import("@/components/DailyCode"), { loading: () => <ScreenLoading label="Hiding today's code..." /> });
const Tournament = dynamic(() => import("@/components/Tournament"), { loading: () => <ScreenLoading label="Loading hunts..." /> });
const MoreGames = dynamic(() => import("@/components/MoreGames"), { loading: () => <ScreenLoading label="Opening the arcade..." /> });
import { Character, CharacterAvatar } from "@/components/Character";
import {
  ACHIEVEMENTS, AI_BOTS, DAILY_QUESTS, DIVISIONS, currentSeasonId, emptyDailyStats, getDailyChallenge,
  seasonDaysLeft, seasonLabel,
  getDivisionForTrophies, getShopItem, nextDivision, type AIDifficulty, type CosmeticItem,
} from "@/lib/game-engine";
import { historyPayload, saveLocalHistoryEntry } from "@/lib/history";
import { normalizeAvatar } from "@/lib/avatar";
import {
  clearPendingResults, clearSession, lastUsername, loadCachedProfile, loadGuestProfile, loadPendingResults,
  loadRoomSession, loadSession, makeId, queuePendingResult, saveCachedProfile, saveGuestProfile,
  saveRoomSession, saveSession, tzEastMinutes, type SessionData,
} from "@/lib/session";
import { soundEngine } from "@/lib/sound-effects";
import type { InviteView, LeaderboardRow, Player, RoomSession, SeasonInfo, SocialPlayer } from "@/lib/types";

type Screen = "boot" | "welcome" | "home" | "shop" | "rank" | "community" | "game" | "friends" | "history" | "dailycode" | "tournaments" | "spectate" | "moregames";

interface Toast { id: number; msg: string; kind: "ok" | "err" }

let toastSeq = 0;

function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

function DivisionBadge({ trophies, size = "md" }: { trophies: number; size?: "sm" | "md" }) {
  const div = getDivisionForTrophies(trophies);
  return (
    <span className={`inline-flex items-center gap-1 font-black text-white rounded-lg ${size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"}`}
      style={{ background: div.gradient, textShadow: "0 1px 2px rgba(0,0,0,.35)" }}>
      <Shield size={size === "sm" ? 11 : 13} strokeWidth={2.8} /> {div.name}
    </span>
  );
}

function ScreenLoading({ label }: { label: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center animate-fade">
      <Loader2 className="animate-spin mx-auto" size={30} style={{ color: "var(--brand)" }} />
      <p className="font-black mt-3" style={{ color: "var(--ink-soft)" }}>{label}</p>
    </div>
  );
}

/** Build a guest profile entirely on-device (works even if the server is unreachable). */
function makeLocalGuest(name: string): Player {
  return {
    id: null,
    username: (name || `Guest${Math.floor(1000 + Math.random() * 9000)}`).slice(0, 16),
    authProvider: "guest",
    avatarConfig: { base: "owl", color: "classic", accessory: "none" },
    title: "Code Breaker",
    frameId: "frame_emerald",
    themeId: "theme_classic",
    effectId: "effect_confetti",
    division: "Bronze",
    trophies: 0, level: 1, xp: 0,
    ownedCosmetics: ["base_owl", "color_classic", "acc_none", "frame_emerald", "theme_classic", "effect_confetti", "title_breaker"],
    completedAchievements: [], claimedDailyQuests: [],
    dailyStats: emptyDailyStats(localToday()),
    dailyChallengeDone: null,
    coins: 250, gems: 20, streakDays: 1, lastPlayDate: localToday(),
    wins: 0, losses: 0, totalGames: 0, fastestWinTurns: null,
    tutorialSeen: false, isAdmin: false, isGuest: true,
  };
}

/** Apply a match result to a guest profile locally (mirrors the server logic). */
function applyResultToGuest(p: Player, o: GameOutcome): Player {
  const today = localToday();
  const stats = p.dailyStats && p.dailyStats.date === today ? { ...p.dailyStats } : emptyDailyStats(today);
  stats.games += 1; stats.orders += o.ordersTotal;
  if (o.won) stats.wins += 1;
  if (o.won && o.turnsTaken <= 6) stats.fastWins += 1;

  const newTrophies = Math.max(0, p.trophies + o.trophyDelta);
  const newWins = p.wins + (o.won ? 1 : 0);
  const achievements = [...p.completedAchievements];
  let bonusGems = 0;
  const check = (cond: boolean, id: string) => {
    if (cond && !achievements.includes(id)) { achievements.push(id); bonusGems += ACHIEVEMENTS.find((a) => a.id === id)?.rewardGems || 0; }
  };
  check(o.won, "first_crack");
  check(newWins >= 10, "win_10"); check(newWins >= 50, "win_50"); check(newWins >= 100, "win_100");
  check(o.won && o.turnsTaken <= 4, "mind_reader");
  check(o.won && o.turnsTaken <= 3, "perfect_game");
  check(o.won && o.turnsTaken === 2, "fast_2");
  check(o.won && o.aiDifficulty === "Mastermind", "mastermind_beat");
  check(o.won && o.aiDifficulty === "Oracle", "oracle_slayer");
  check(newTrophies >= 100, "trophies_100"); check(newTrophies >= 250, "trophies_250");
  check(newTrophies >= 700, "trophies_700"); check(newTrophies >= 1000, "trophies_1000"); check(newTrophies >= 1900, "trophies_1900");

  let dailyBonus = 0;
  let dailyDone = p.dailyChallengeDone || null;
  if (o.won && o.dailyChallengeId) {
    const dc = getDailyChallenge();
    if (o.dailyChallengeId === dc.id && dailyDone !== dc.dateKey) { dailyBonus = Math.round(120 * dc.bonusMultiplier); dailyDone = dc.dateKey; }
  }

  const newXp = p.xp + o.xpEarned;
  return {
    ...p,
    trophies: newTrophies,
    division: getDivisionForTrophies(newTrophies).name,
    coins: p.coins + o.coinsEarned + dailyBonus,
    gems: p.gems + bonusGems,
    xp: newXp,
    level: Math.max(p.level, Math.floor(newXp / 200) + 1),
    wins: newWins,
    losses: p.losses + (o.won ? 0 : 1),
    totalGames: p.totalGames + 1,
    fastestWinTurns: o.won && (!p.fastestWinTurns || o.turnsTaken < p.fastestWinTurns) ? o.turnsTaken : p.fastestWinTurns,
    completedAchievements: achievements,
    dailyStats: stats,
    dailyChallengeDone: dailyDone,
  };
}

function equipOnPlayer(p: Player, item: CosmeticItem): Player {
  const next = { ...p, avatarConfig: { ...p.avatarConfig } };
  switch (item.category) {
    case "avatar_base": next.avatarConfig.base = item.meta; break;
    case "avatar_color": next.avatarConfig.color = item.meta; break;
    case "avatar_accessory": next.avatarConfig.accessory = item.meta; break;
    case "avatar_pattern": next.avatarConfig.pattern = item.meta; break;
    case "frame": next.frameId = item.id; break;
    case "theme": next.themeId = item.id; break;
    case "effect": next.effectId = item.id; break;
    case "title": next.title = item.meta; break;
  }
  return next;
}

export default function Page() {
  const [screen, setScreen] = useState<Screen>("boot");
  const [session, setSession] = useState<SessionData | null>(null);
  const [me, setMe] = useState<Player | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [showPlaySheet, setShowPlaySheet] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [communityTab, setCommunityTab] = useState<"reviews" | "feedback" | "lobby" | "admin">("reviews");
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosInstall, setShowIosInstall] = useState(false);
  const [roomResume, setRoomResume] = useState<RoomSession | null>(null);
  const [stageMood, setStageMood] = useState<"idle" | "happy" | "win">("idle");
  const [season, setSeason] = useState<SeasonInfo | null>(null);
  const [profilePlayerId, setProfilePlayerId] = useState<number | null>(null);
  const [spectateRoom, setSpectateRoom] = useState("");
  const [incomingInvites, setIncomingInvites] = useState<InviteView[]>([]);
  const [socialFollowing, setSocialFollowing] = useState<SocialPlayer[] | null>(null);
  const [friendsOnline, setFriendsOnline] = useState(0);
  const [pushOn, setPushOn] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);

  const lastSeasonToastRef = useRef("");
  const seenOnlineRef = useRef<Set<number>>(new Set());
  const seenInviteIdsRef = useRef<Set<number>>(new Set());
  const socialInitRef = useRef(false);
  const enteredInviteRef = useRef<number | null>(null);
  const screenRef = useRef(screen);
  // eslint-disable-next-line react-hooks/refs
  screenRef.current = screen;

  const [installEvt, setInstallEvt] = useState<{ prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [lastTimer, setLastTimer] = useState(45);

  const showToast = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = ++toastSeq;
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);

  const token = session?.token || null;

  /** Store season info and celebrate a rollover exactly once per season. */
  const applySeasonToUi = useCallback((info: SeasonInfo) => {
    setSeason(info);
    if (info.rolled && lastSeasonToastRef.current !== info.id) {
      lastSeasonToastRef.current = info.id;
      const r = info.rolled;
      setTimeout(() => {
        showToast(`🏁 New season! You finished ${r.prevDivision} — +${r.coins} coins${r.gems ? ` +${r.gems} gems` : ""}. Trophies reset to ${r.trophiesResetTo}. Climb again!`);
        soundEngine.playReward();
      }, 900);
    }
  }, [showToast]);

  /* ------------------------------ boot ------------------------------ */
  useEffect(() => {
    // Hydration-safe one-time init from browser APIs (runs once on mount).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMuted(soundEngine.isMuted());
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onBIP = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as unknown as { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    const onInstalled = () => { setInstallEvt(null); setIsStandalone(true); showToast("Cipher Clash installed! Find it on your home screen."); };
    window.addEventListener("appinstalled", onInstalled);

    (async () => {
      const s = loadSession();
      if (!s) { setScreen("welcome"); return; }
      setSession(s);
      if (s.isGuest) {
        let g = loadGuestProfile();
        if (!g) {
          try {
            const res = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auth", mode: "guest", username: s.username }) });
            const data = await res.json();
            g = data.player as Player;
          } catch {}
          if (!g) g = makeLocalGuest(s.username);
        }
        if (g) {
          g = { ...g, avatarConfig: normalizeAvatar(g.avatarConfig) };
          // guest streak (local): simple day check
          const today = localToday();
          if (g.lastPlayDate !== today) {
            const yday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
            g = { ...g, streakDays: g.lastPlayDate === yday ? (g.streakDays || 1) + 1 : 1, lastPlayDate: today };
          }
          saveGuestProfile(g);
          setMe(g);
          setScreen("home");
          setRoomResume(loadRoomSession());
          if (!g.tutorialSeen) setShowTutorial(true);
          fetch("/api/state").then((r) => r.json()).then((d) => setLeaderboard(d.leaderboard || [])).catch(() => {});
          return;
        }
        setScreen("welcome");
        return;
      }
      // registered — show the cached profile INSTANTLY so launch never waits
      // on the network; fresh state then loads in the background.
      const cachedProfile = loadCachedProfile();
      const showedCached = !!(cachedProfile && cachedProfile.username === s.username);
      if (showedCached && cachedProfile) {
        setMe({ ...cachedProfile, avatarConfig: normalizeAvatar(cachedProfile.avatarConfig) });
        setScreen("home");
        setRoomResume(loadRoomSession());
      }
      try {
        const res = await fetch(`/api/state?token=${s.token}&tz=${tzEastMinutes()}`);
        const data = await res.json();
        if (!data.currentPlayer) throw new Error("session expired");
        const p = { ...(data.currentPlayer as Player), avatarConfig: normalizeAvatar(data.currentPlayer.avatarConfig) };
        setMe(p);
        setLeaderboard(data.leaderboard || []);
        if (data.season) applySeasonToUi(data.season as SeasonInfo);
        setScreen("home");
        setRoomResume(loadRoomSession());
        if (data.streakInfo?.isNewDay) {
          setTimeout(() => showToast(`Day ${data.streakInfo.streakDays} streak! +${data.streakInfo.bonusCoins} coins login bonus${data.streakInfo.bonusGems ? ` and +${data.streakInfo.bonusGems} gems!` : ""}`), 600);
        }
        if (!p.tutorialSeen) setTimeout(() => setShowTutorial(true), 500);
        // flush queued results
        const pending = loadPendingResults();
        if (pending.length) {
          clearPendingResults();
          for (const pr of pending) {
            await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...pr.payload, token: s.token }) }).catch(() => {});
          }
          const r2 = await fetch(`/api/state?token=${s.token}&tz=${tzEastMinutes()}`).then((r) => r.json()).catch(() => null);
          if (r2?.currentPlayer) setMe({ ...r2.currentPlayer, avatarConfig: normalizeAvatar(r2.currentPlayer.avatarConfig) });
        }
      } catch (e) {
        // Network failure? Keep the stored token so the next launch can retry.
        if (e instanceof Error && e.message === "session expired") {
          clearSession();
          setSession(null);
          setScreen("welcome");
        } else if (showedCached) {
          // Offline but we have a saved profile: stay in the app.
          setTimeout(() => showToast("You're offline — showing your saved profile. Bot & arcade modes work!", "err"), 600);
        } else {
          setTimeout(() => showToast("Couldn't reach the server — check your connection. Guest & bot modes still work!", "err"), 600);
          setScreen("welcome");
        }
      }
    })();

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Keep the on-device profile cache fresh for instant launches. */
  useEffect(() => {
    if (me && session && !session.isGuest) saveCachedProfile(me);
  }, [me, session]);

  /* Warm up heavy screens (arcade, shop) while the home screen idles, so
     opening them is instant. Skipped on data-saver / 2G connections. */
  useEffect(() => {
    if (screen !== "home") return;
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (conn?.saveData || (conn?.effectiveType && conn.effectiveType.includes("2g"))) return;
    const warm = () => {
      void import("@/components/MoreGames");
      void import("@/components/Shop");
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) {
      const id = ric(warm, { timeout: 5000 });
      return () => (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = setTimeout(warm, 3000);
    return () => clearTimeout(t);
  }, [screen]);

  /* heartbeat + light refresh */
  useEffect(() => {
    if (!token) return;
    const beat = () => fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "heartbeat", token }) }).catch(() => {});
    const t = setInterval(beat, 45000);
    return () => clearInterval(t);
  }, [token]);

  const refreshState = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/state?token=${token}&tz=${tzEastMinutes()}`);
      const data = await res.json();
      if (data.currentPlayer) setMe({ ...data.currentPlayer, avatarConfig: normalizeAvatar(data.currentPlayer.avatarConfig) });
      if (data.leaderboard) setLeaderboard(data.leaderboard);
      if (data.season) applySeasonToUi(data.season as SeasonInfo);
    } catch {}
  }, [token, applySeasonToUi]);

  /* ------------------------------ auth ------------------------------ */
  const doAuth = async (mode: "login" | "register" | "guest", username: string, password: string) => {
    if (mode === "guest") {
      const existing = loadGuestProfile();
      const name = username.trim() || existing?.username || "";
      const guest = existing && (!name || existing.username === name) ? existing : makeLocalGuest(name);
      saveGuestProfile(guest);
      const gs: SessionData = { playerId: null, username: guest.username, token: null, isGuest: true };
      saveSession(gs); setSession(gs); setMe(guest);
      setScreen("home");
      soundEngine.playJoin();
      fetch("/api/state").then((r) => r.json()).then((d) => setLeaderboard(d.leaderboard || [])).catch(() => {});
      if (!guest.tutorialSeen) setTimeout(() => setShowTutorial(true), 400);
      return;
    }
    const res = await fetch("/api/state", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "auth", mode, username, password, tz: tzEastMinutes() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    const player = { ...(data.player as Player), avatarConfig: normalizeAvatar(data.player.avatarConfig) };
    {
      const s: SessionData = { playerId: player.id, username: player.username, token: data.token, isGuest: false };
      saveSession(s); setSession(s); setMe(player);
      if (data.streakInfo?.isNewDay) setTimeout(() => showToast(`Day ${data.streakInfo.streakDays} streak! +${data.streakInfo.bonusCoins} coins`), 500);
      fetch("/api/state").then((r) => r.json()).then((d) => setLeaderboard(d.leaderboard || [])).catch(() => {});
    }
    if (data.season) applySeasonToUi(data.season as SeasonInfo);
    setScreen("home");
    soundEngine.playJoin();
    if (!player.tutorialSeen) setTimeout(() => setShowTutorial(true), 400);
  };

  const logout = () => {
    clearSession();
    setSession(null);
    setMe(null);
    setSeason(null);
    setIncomingInvites([]);
    setSocialFollowing(null);
    setFriendsOnline(0);
    setProfilePlayerId(null);
    setShowSettings(false);
    setShowProfile(false);
    setScreen("welcome");
  };

  /* --------------------------- results --------------------------- */
  const handleResult = useCallback(async (outcome: GameOutcome) => {
    if (!me) return;
    // Always keep a local replay copy (works offline & for guests too).
    if (outcome.history) saveLocalHistoryEntry(outcome.history);
    if (session?.isGuest || !token) {
      const updated = applyResultToGuest(me, outcome);
      const newOnes = updated.completedAchievements.filter((a) => !me.completedAchievements.includes(a));
      saveGuestProfile(updated);
      setMe(updated);
      for (const id of newOnes) {
        const ach = ACHIEVEMENTS.find((a) => a.id === id);
        if (ach) setTimeout(() => showToast(`Achievement unlocked: ${ach.title} (+${ach.rewardGems} gems)`), 900);
      }
      return;
    }
    const payload = {
      action: "record_match_result", tz: tzEastMinutes(), resultId: makeId("res"),
      won: outcome.won, mode: outcome.mode, turnsTaken: outcome.turnsTaken,
      ordersTotal: outcome.ordersTotal, aiDifficulty: outcome.aiDifficulty,
      trophyDelta: outcome.trophyDelta, coinsEarned: outcome.coinsEarned,
      xpEarned: outcome.xpEarned, dailyChallengeId: outcome.dailyChallengeId,
      history: outcome.history ? historyPayload(outcome.history) : undefined,
    };
    try {
      const res = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, token }) });
      const data = await res.json();
      if (data.player) setMe({ ...data.player, avatarConfig: normalizeAvatar(data.player.avatarConfig) });
      if (data.season) applySeasonToUi(data.season as SeasonInfo);
      if (Array.isArray(data.unlocked)) {
        for (const id of data.unlocked) {
          const ach = ACHIEVEMENTS.find((a) => a.id === id);
          if (ach) setTimeout(() => showToast(`Achievement unlocked: ${ach.title} (+${ach.rewardGems} gems)`), 900);
        }
      }
      if (data.dailyBonus) setTimeout(() => showToast(`Daily challenge complete! +${data.dailyBonus} bonus coins`), 1200);
    } catch {
      queuePendingResult(payload);
    }
  }, [me, session, token, showToast, applySeasonToUi]);

  /* --------------------------- shop actions --------------------------- */
  const handleBuy = async (item: CosmeticItem) => {
    if (!me) return;
    setBusyItem(item.id);
    if (session?.isGuest || !token) {
      const priceC = item.priceCoins || 0, priceG = item.priceGems || 0;
      if (priceC && me.coins < priceC) { showToast(`Need ${priceC} coins — win matches to earn!`, "err"); setBusyItem(null); return; }
      if (priceG && me.gems < priceG) { showToast(`Need ${priceG} gems — finish quests & achievements!`, "err"); setBusyItem(null); return; }
      let updated: Player = { ...me, coins: me.coins - priceC, gems: me.gems - priceG, ownedCosmetics: [...me.ownedCosmetics, item.id] };
      updated = equipOnPlayer(updated, item);
      saveGuestProfile(updated); setMe(updated);
      soundEngine.playReward(); showToast(`${item.name} is yours!`);
      setBusyItem(null);
      return;
    }
    try {
      const res = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "buy_cosmetic", token, itemId: item.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purchase failed");
      setMe({ ...data.player, avatarConfig: normalizeAvatar(data.player.avatarConfig) });
      soundEngine.playReward();
      showToast(`${item.name} equipped!`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Purchase failed", "err");
    }
    setBusyItem(null);
  };

  const handleEquip = async (item: CosmeticItem) => {
    if (!me) return;
    setBusyItem(item.id);
    // optimistic for snappy feel
    const optimistic = equipOnPlayer(me, item);
    setMe(optimistic);
    if (session?.isGuest || !token) {
      saveGuestProfile(optimistic);
      soundEngine.playTap(700);
      setBusyItem(null);
      return;
    }
    try {
      const res = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "equip_cosmetic", token, itemId: item.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Equip failed");
      setMe({ ...data.player, avatarConfig: normalizeAvatar(data.player.avatarConfig) });
      soundEngine.playTap(700);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Equip failed", "err");
      refreshState();
    }
    setBusyItem(null);
  };

  const claimQuest = async (questId: string) => {
    if (!me) return;
    const quest = DAILY_QUESTS.find((q) => q.id === questId);
    if (!quest) return;
    if (session?.isGuest || !token) {
      const today = localToday();
      const key = `${questId}:${today}`;
      if (me.claimedDailyQuests?.includes(key)) return;
      const stats = me.dailyStats?.date === today ? me.dailyStats : emptyDailyStats(today);
      if ((stats[quest.statKey] || 0) < quest.target) { showToast("Quest not finished yet!", "err"); return; }
      const newXp = me.xp + quest.rewardXp;
      const updated = {
        ...me, coins: me.coins + quest.rewardCoins, gems: me.gems + (quest.rewardGems || 0),
        xp: newXp, level: Math.max(me.level, Math.floor(newXp / 200) + 1),
        claimedDailyQuests: [...(me.claimedDailyQuests || []), key],
      };
      saveGuestProfile(updated); setMe(updated);
      soundEngine.playReward(); showToast(`Quest complete! +${quest.rewardCoins} coins`);
      return;
    }
    try {
      const res = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "claim_quest", token, questId, tz: tzEastMinutes() }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Claim failed");
      setMe({ ...data.player, avatarConfig: normalizeAvatar(data.player.avatarConfig) });
      soundEngine.playReward();
      showToast(`Quest complete! +${quest.rewardCoins} coins${quest.rewardGems ? ` +${quest.rewardGems} gems` : ""}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Claim failed", "err");
    }
  };

  /* --------------------------- install --------------------------- */
  const installApp = async () => {
    if (installEvt) {
      try {
        installEvt.prompt();
        await installEvt.userChoice;
        setInstallEvt(null);
      } catch {}
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) setShowIosInstall(true);
    else showToast("Almost there — open your browser menu and tap “Install app”.");
  };

  const setTheme = (dark: boolean) => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("cipherclash_theme", dark ? "dark" : "light");
    setIsDark(dark);
    soundEngine.playTap(600);
  };

  /* --------------------------- push notifications --------------------------- */
  const refreshPushState = useCallback(async () => {
    try {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      setPushSupported(supported);
      if (!supported) return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setPushOn(!!sub && Notification.permission === "granted");
    } catch {}
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- read push subscription status when settings open
  useEffect(() => { if (showSettings) void refreshPushState(); }, [showSettings, refreshPushState]);

  const togglePush = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint: existing.endpoint }) }).catch(() => {});
        await existing.unsubscribe();
        setPushOn(false);
        showToast("Notifications off 🔕");
        return;
      }
      const cfg = await fetch("/api/push").then((r) => r.json()).catch(() => null);
      if (!cfg?.publicKey) { showToast("Push isn't enabled on this server yet 🔕", "err"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { showToast("Notifications are blocked by your browser", "err"); return; }
      const key = cfg.publicKey as string;
      const pad = "=".repeat((4 - (key.length % 4)) % 4);
      const raw = atob((key + pad).replace(/-/g, "+").replace(/_/g, "/"));
      const appKey = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) appKey[i] = raw.charCodeAt(i);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey.buffer as ArrayBuffer });
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "subscribe", token, subscription: sub.toJSON() }) });
      if (!res.ok) throw new Error("save failed");
      setPushOn(true);
      showToast("Notifications on! 🔔 We'll ping you for challenges.");
      soundEngine.playReward();
    } catch {
      showToast("Couldn't change notification settings", "err");
    }
  };

  /* --------------------------- game starters --------------------------- */
  const startAI = (difficulty: AIDifficulty, timer: number, daily?: { rule: GameConfig["dailyRule"]; id: string }) => {
    setLastTimer(timer);
    setGameConfig({ mode: "ai", aiDifficulty: difficulty, timerSeconds: timer, dailyRule: daily?.rule, dailyChallengeId: daily?.id });
    setShowPlaySheet(false);
    setScreen("game");
    soundEngine.playTap(660);
  };

  const startHotseat = (timer: number) => {
    setLastTimer(timer);
    setGameConfig({ mode: "hotseat", timerSeconds: timer });
    setShowPlaySheet(false);
    setScreen("game");
  };

  const enterOnline = (room: RoomSession & { timerSeconds?: number }, race = false) => {
    saveRoomSession(room);
    setRoomResume(room);
    setGameConfig({ mode: "online", roomCode: room.roomCode, slot: room.slot, token: room.token, timerSeconds: room.timerSeconds || 45, race });
    setShowPlaySheet(false);
    setScreen("game");
  };

  const startOnlineAction = async (action: "quick_match" | "create_room" | "join_room", timer: number, joinCode?: string, mode: "duel" | "race" = "duel") => {
    if (!me) return;
    setLastTimer(timer);
    const body: Record<string, unknown> = {
      action,
      name: me.username,
      avatar: me.avatarConfig,
      frame: me.frameId,
      division: me.division,
      playerId: me.id,
      timerSeconds: timer,
      isPrivate: action === "create_room",
      mode: mode === "race" ? "race" : "duel",
    };
    if (action === "join_room") {
      body.roomCode = joinCode;
      const existing = loadRoomSession();
      if (existing && existing.roomCode === (joinCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "")) body.token = existing.token;
    }
    const res = await fetch("/api/matches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not start online match");
    enterOnline({ roomCode: data.match.roomCode, slot: data.slot, token: data.token, savedAt: Date.now(), timerSeconds: data.match.timerSeconds }, mode === "race");
    if (data.joined) showToast("Rival found! Hide your code!");
  };

  const playAgainOnline = () => {
    setScreen("home");
    setGameConfig(null);
    setTimeout(() => {
      startOnlineAction("quick_match", lastTimer || 45).catch((e) => showToast(e.message || "Matchmaking failed", "err"));
    }, 250);
  };

  const startRace = (difficulty: AIDifficulty) => {
    setGameConfig({ mode: "race", aiDifficulty: difficulty, timerSeconds: lastTimer || 45 });
    setShowPlaySheet(false);
    setScreen("game");
    soundEngine.playTap(660);
  };

  const startPeer = (timer: number) => {
    setLastTimer(timer);
    setGameConfig({ mode: "peer", timerSeconds: timer });
    setShowPlaySheet(false);
    setScreen("game");
    soundEngine.playTap(660);
  };

  const startSpectate = (roomCode: string) => {
    setSpectateRoom(roomCode);
    setProfilePlayerId(null);
    setScreen("spectate");
  };

  /** Accept/decline a challenge invite; accepting jumps straight into the room. */
  const answerInvite = async (invite: InviteView, acceptIt: boolean) => {
    if (!token) return;
    setIncomingInvites((list) => list.filter((i) => i.id !== invite.id));
    soundEngine.playTap(acceptIt ? 700 : 420);
    try {
      const res = await fetch("/api/social", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "respond_invite", token, inviteId: invite.id, accept: acceptIt }),
      });
      const data = await res.json();
      if (!acceptIt) return;
      if (res.ok && data.roomCode && data.token) {
        enterOnline({ roomCode: data.roomCode, slot: data.slot || 2, token: data.token, savedAt: Date.now(), timerSeconds: data.invite?.timerSeconds || 45 });
        showToast("⚔️ Let's clash!");
      } else {
        showToast(data.error || "That challenge is gone", "err");
      }
    } catch {
      if (acceptIt) showToast("Connection failed — try again", "err");
    }
  };

  /* Social poller: invites, friends online, accepted challenges auto-join. */
  useEffect(() => {
    if (!token) return;
    let alive = true;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/social?token=${token}`);
        const data = await res.json();
        if (!alive || !res.ok) return;
        const following: SocialPlayer[] = data.following || [];
        setSocialFollowing(following);
        setFriendsOnline(following.filter((f) => f.isOnline).length);

        const incoming: InviteView[] = (data.invitesIn || []).filter((i: InviteView) => i.status === "pending");
        const fresh = incoming.find((i) => !seenInviteIdsRef.current.has(i.id));
        incoming.forEach((i) => seenInviteIdsRef.current.add(i.id));
        setIncomingInvites(incoming);
        if (fresh && screenRef.current !== "game") soundEngine.playJoin();

        const nowOnline = following.filter((f) => f.isOnline);
        if (socialInitRef.current && screenRef.current !== "game") {
          for (const f of nowOnline) {
            if (!seenOnlineRef.current.has(f.id)) showToast(`🟢 ${f.username} is online!`);
          }
        }
        seenOnlineRef.current = new Set(nowOnline.map((f) => f.id));
        socialInitRef.current = true;

        const acc = (data.invitesOut || []).find((i: InviteView) => i.status === "accepted" && i.myToken && i.roomCode);
        if (acc && enteredInviteRef.current !== acc.id && screenRef.current !== "game" && screenRef.current !== "spectate") {
          enteredInviteRef.current = acc.id;
          enterOnline({ roomCode: acc.roomCode as string, slot: acc.mySlot || 1, token: acc.myToken as string, savedAt: Date.now(), timerSeconds: acc.timerSeconds });
          showToast("⚔️ Challenge accepted — hide your code!");
        }
      } catch {}
    };
    poll();
    const conn = (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    const slowNet = !!(conn?.saveData || (conn?.effectiveType && conn.effectiveType.includes("2g")));
    const t = setInterval(() => {
      if (!document.hidden) poll();
    }, slowNet ? 30000 : 12000);
    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* Deep links from push notifications (?go=...) + SW focus messages. */
  useEffect(() => {
    const applyGo = (go: string | null) => {
      if (go === "friends") setScreen("friends");
      else if (go === "tournaments") setScreen("tournaments");
      else if (go === "dailycode") setScreen("dailycode");
      else if (go === "home") setScreen("home");
    };
    try {
      const params = new URLSearchParams(window.location.search);
      const go = params.get("go");
      if (go) {
        window.history.replaceState({}, "", window.location.pathname);
        applyGo(go);
      }
    } catch {}
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "notification-click" && typeof e.data.url === "string") {
        try { applyGo(new URL(e.data.url, window.location.origin).searchParams.get("go")); } catch {}
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, []);

  /** Guests get Daily Code rewards applied locally (accounts use the server). */
  const handleGuestDaily = useCallback((won: boolean, used: number) => {
    if (!me) return;
    const coins = won ? 50 + Math.max(0, 8 - used) * 10 : 10;
    const xp = won ? 70 : 20;
    const newXp = me.xp + xp;
    const updated = { ...me, coins: me.coins + coins, xp: newXp, level: Math.max(me.level, Math.floor(newXp / 200) + 1) };
    saveGuestProfile(updated);
    setMe(updated);
    showToast(won ? `☀️ Daily Code cracked! +${coins} coins` : `☀️ Daily Code played! +${coins} coins`);
  }, [me, showToast]);

  const finishTutorial = async (goTo: "bot" | "home" | "skip") => {
    setShowTutorial(false);
    if (me && !me.tutorialSeen) {
      if (session?.isGuest || !token) {
        const updated = { ...me, tutorialSeen: true, coins: me.coins + (goTo === "skip" ? 0 : 50) };
        saveGuestProfile(updated); setMe(updated);
      } else {
        try {
          const res = await fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "mark_tutorial", token }) });
          const data = await res.json();
          if (data.player) setMe({ ...data.player, avatarConfig: normalizeAvatar(data.player.avatarConfig) });
        } catch {}
      }
    }
    if (goTo === "bot") startAI("Rookie", 45);
  };

  /* ------------------------------ render ------------------------------ */
  if (screen === "boot") {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3">
        <Character config={{ base: "owl", color: "classic", accessory: "crown" }} mood="happy" size={130} />
        <p className="font-display font-bold text-2xl tracking-wide">CIPHER CLASH</p>
        <p className="font-bold text-sm" style={{ color: "var(--ink-soft)" }}>Loading your arena...</p>
      </div>
    );
  }

  if (screen === "welcome" || !me) {
    return <Welcome doAuth={doAuth} showToast={showToast} toasts={toasts} />;
  }

  if (screen === "spectate" && spectateRoom) {
    return (
      <>
        <Spectate
          roomCode={spectateRoom}
          me={me}
          onExit={() => setScreen("home")}
          showToast={showToast}
        />
        <Toasts toasts={toasts} />
      </>
    );
  }

  if (screen === "game" && gameConfig) {
    return (
      <>
        {gameConfig.mode === "peer" ? (
          <PeerLocal
            me={me}
            config={gameConfig}
            onExit={() => { setScreen("home"); setGameConfig(null); refreshState(); }}
            onResult={handleResult}
            showToast={showToast}
          />
        ) : (
          <GameBoard
            me={me}
            config={gameConfig}
            onExit={() => { setScreen("home"); setGameConfig(null); setRoomResume(loadRoomSession()); refreshState(); }}
            onResult={handleResult}
            onPlayAgainOnline={playAgainOnline}
            showToast={showToast}
            authToken={token}
            onEnterRoom={(room) => enterOnline(room)}
          />
        )}
        <Toasts toasts={toasts} />
      </>
    );
  }

  const dc = getDailyChallenge();
  const dailyDone = me.dailyChallengeDone === dc.dateKey;
  const today = localToday();
  const stats = me.dailyStats?.date === today ? me.dailyStats : emptyDailyStats(today);
  const div = getDivisionForTrophies(me.trophies);
  const next = nextDivision(me.trophies);
  const divProgress = next ? Math.min(100, ((me.trophies - div.minTrophies) / Math.max(1, next.minTrophies - div.minTrophies)) * 100) : 100;
  const myRank = leaderboard.findIndex((r) => r.id === me.id);

  return (
    <div className="min-h-[100dvh]">
      {/* ---- HUD ---- */}
      <header className="sticky top-0 z-40" style={{ background: "var(--hud-bg)", backdropFilter: "blur(12px)", borderBottom: "2px solid var(--border)" }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-5 py-2 flex items-center gap-2">
          <button onClick={() => { setShowProfile(true); soundEngine.playTap(520); }} className="flex items-center gap-2 min-w-0 active:scale-95 transition-transform">
            <CharacterAvatar config={me.avatarConfig} frameId={me.frameId} size={44} ringWidth={3} />
            <span className="text-left min-w-0">
              <span className="block font-display font-semibold leading-none truncate max-w-[110px]">{me.username}</span>
              <span className="block mt-1 w-24 h-2.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)", border: "1.5px solid var(--border)" }}>
                <span className="block h-full rounded-full" style={{ width: `${(me.xp % 200) / 2}%`, background: "var(--purple)" }} />
              </span>
              <span className="block text-[9px] font-black" style={{ color: "var(--ink-faint)" }}>LEVEL {me.level}</span>
            </span>
          </button>

          <div className="flex-1" />

          <span className="chip px-2.5 py-1.5 font-black text-sm flex items-center gap-1" title={`${me.streakDays}-day streak`}>
            <Flame size={16} className="animate-flame" style={{ color: "#FF7A18" }} fill="#FF7A18" /> {me.streakDays}
          </span>
          <button onClick={() => setScreen("rank")} className="chip px-2.5 py-1.5 font-black text-sm flex items-center gap-1 active:scale-95 transition-transform" title="Trophies — view rankings">
            <Trophy size={16} style={{ color: "#E0A800" }} /> {me.trophies.toLocaleString()}
          </button>
          <span className="chip px-2.5 py-1.5 font-black text-sm hidden sm:flex items-center gap-1" title="Coins">
            <Coins size={16} style={{ color: "#E0A800" }} /> {me.coins.toLocaleString()}
          </span>
          <span className="chip px-2.5 py-1.5 font-black text-sm hidden sm:flex items-center gap-1" title="Gems">
            <Gem size={16} style={{ color: "#1CB0F6" }} /> {me.gems.toLocaleString()}
          </span>
          <button onClick={() => setScreen("friends")} className="btn-game btn-ghost w-9 h-9 !rounded-xl flex items-center justify-center relative" title="Friends">
            <Users size={17} strokeWidth={2.6} />
            {(friendsOnline > 0 || incomingInvites.length > 0) && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[9px] font-black flex items-center justify-center animate-pop" style={{ background: incomingInvites.length ? "#FF4B4B" : "#58CC02" }}>
                {incomingInvites.length || friendsOnline}
              </span>
            )}
          </button>
          <button onClick={() => setTheme(!isDark)} className="btn-game btn-ghost w-9 h-9 !rounded-xl flex items-center justify-center" title={isDark ? "Switch to light mode" : "Switch to dark mode"}>
            {isDark ? <Sun size={17} strokeWidth={2.6} /> : <Moon size={17} strokeWidth={2.6} />}
          </button>
          <button onClick={() => setShowSettings(true)} className="btn-game btn-ghost w-9 h-9 !rounded-xl flex items-center justify-center" title="Settings">
            <Settings size={17} strokeWidth={2.6} />
          </button>
        </div>
      </header>

      {screen === "home" && (
        <main className="max-w-6xl mx-auto px-3 sm:px-5 py-4 pb-14">
          {/* resume banner */}
          {roomResume && (
            <div className="card-game p-3 mb-3 flex items-center gap-3 animate-pop" style={{ borderColor: "var(--gold)" }}>
              <span className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: "var(--gold-dark)" }}>
                <Swords size={19} strokeWidth={2.6} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold leading-tight">Match in progress — room {roomResume.roomCode}</p>
                <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>Jump back in before your rival claims the win!</p>
              </div>
              <button onClick={() => { saveRoomSession(null); setRoomResume(null); }} className="btn-game btn-ghost px-3 py-2 text-xs">Discard</button>
              <button onClick={() => enterOnline(roomResume)} className="btn-game btn-gold px-4 py-2.5">Rejoin</button>
            </div>
          )}

          {/* season banner */}
          {(() => {
            const sInfo: SeasonInfo = season ?? { id: currentSeasonId(), label: seasonLabel(currentSeasonId()), daysLeft: seasonDaysLeft() };
            return (
              <div className="card-game p-3 mb-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg, rgba(255,200,0,.20), rgba(165,96,232,.14))" }}>
                <span className="text-[26px] leading-none" aria-hidden>🏁</span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold leading-tight">{sInfo.label}</p>
                  <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>{sInfo.daysLeft} days left — higher division = bigger end-of-season rewards!</p>
                </div>
                <DivisionBadge trophies={me.trophies} />
              </div>
            );
          })()}

          <div className="grid lg:grid-cols-[380px_1fr] gap-4 items-start">
            {/* character stage */}
            <section className="board-theme rounded-3xl border-2 p-4 relative overflow-hidden" data-board={me.themeId} style={{ borderColor: "var(--board-border)" }}>
              <div className="flex flex-col items-center text-center relative">
                <button
                  onClick={() => { setStageMood(stageMood === "idle" ? "happy" : stageMood === "happy" ? "win" : "idle"); soundEngine.playTap(700); }}
                  className="active:scale-95 transition-transform" title="Tap me!">
                  <CharacterAvatar config={me.avatarConfig} frameId={me.frameId} mood={stageMood} size={168} ringWidth={6} />
                </button>
                <h2 className="font-display font-bold text-2xl mt-1" style={{ color: "var(--board-ink)" }}>{me.username}</h2>
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--board-soft)" }}>{me.title}</p>
                <div className="flex items-center gap-2 mt-2">
                  <DivisionBadge trophies={me.trophies} />
                  <span className="text-xs font-black" style={{ color: "var(--board-soft)" }}>{me.trophies} trophies{myRank >= 0 ? ` · Rank #${myRank + 1}` : ""}</span>
                </div>
                {next && (
                  <div className="w-full max-w-[240px] mt-2">
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.14)", border: "2px solid var(--board-border)" }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${divProgress}%`, background: div.gradient }} />
                    </div>
                    <p className="text-[10px] font-black mt-0.5" style={{ color: "var(--board-soft)" }}>{next.minTrophies - me.trophies} trophies to {next.name}</p>
                  </div>
                )}
                <div className="flex gap-4 mt-3 text-center" style={{ color: "var(--board-ink)" }}>
                  <div><p className="font-display font-bold text-lg leading-none">{me.wins}</p><p className="text-[10px] font-black" style={{ color: "var(--board-soft)" }}>WINS</p></div>
                  <div><p className="font-display font-bold text-lg leading-none">{me.totalGames ? Math.round((me.wins / me.totalGames) * 100) : 0}%</p><p className="text-[10px] font-black" style={{ color: "var(--board-soft)" }}>WIN RATE</p></div>
                  <div><p className="font-display font-bold text-lg leading-none">{me.fastestWinTurns ?? "—"}</p><p className="text-[10px] font-black" style={{ color: "var(--board-soft)" }}>FASTEST</p></div>
                </div>
                <button onClick={() => setScreen("shop")} className="btn-game btn-purple px-5 py-2.5 mt-3 flex items-center gap-2 text-sm">
                  <ShoppingBag size={16} strokeWidth={2.6} /> Customize my character
                </button>
              </div>
            </section>

            {/* right column */}
            <div className="space-y-4">
              {/* PLAY */}
              <button onClick={() => { setShowPlaySheet(true); soundEngine.playTap(600); }}
                className="btn-game btn-green w-full py-5 sm:py-6 text-2xl sm:text-3xl flex items-center justify-center gap-3 !rounded-3xl">
                <Play size={30} strokeWidth={2.8} fill="#fff" /> PLAY
              </button>

              {/* friends online */}
              {token && socialFollowing && socialFollowing.some((f) => f.isOnline) && (
                <div className="card-game p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display font-semibold flex items-center gap-1.5"><Users size={17} style={{ color: "#58CC02" }} /> Friends online</h3>
                    <button onClick={() => setScreen("friends")} className="text-xs font-black flex items-center gap-0.5" style={{ color: "var(--blue)" }}>All friends <ChevronRight size={13} strokeWidth={3} /></button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                    {socialFollowing.filter((f) => f.isOnline).slice(0, 10).map((f) => (
                      <button key={f.id} onClick={() => setProfilePlayerId(f.id)} className="flex flex-col items-center shrink-0 w-[62px] active:scale-95 transition-transform">
                        <span className="relative">
                          <CharacterAvatar config={f.avatarConfig} frameId={f.frameId} size={48} ringWidth={3} />
                          <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-white" style={{ background: f.inMatchRoom ? "#FFC800" : "#58CC02" }} />
                        </span>
                        <span className="font-black text-[10px] mt-1 truncate w-full text-center">{f.username}</span>
                        <span className="text-[8px] font-black uppercase tracking-wide" style={{ color: f.inMatchRoom ? "#E0A800" : "#58CC02" }}>{f.inMatchRoom ? "In match" : "Online"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* daily challenge */}
              <div className="card-game p-3.5 flex items-center gap-3">
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: dailyDone ? "#58CC02" : "var(--orange)" }}>
                  {dailyDone ? <Check size={24} strokeWidth={3} /> : <CalendarCheck size={24} strokeWidth={2.5} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold leading-tight">Today: {dc.title} <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md text-white align-middle" style={{ background: "var(--purple)" }}>{dc.bonusMultiplier}× bonus</span></p>
                  <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>{dc.description}</p>
                </div>
                <button
                  disabled={dailyDone}
                  onClick={() => {
                    const diff: AIDifficulty =
                      dc.rule === "hard_ai_only" ? (me.trophies >= 450 ? "Oracle" : "Mastermind")
                      : dc.rule === "no_orders_hint" ? "Mastermind"
                      : dc.title === "Blitz Duel" ? "Mastermind" : "Tactician";
                    const timer = dc.rule === "speed_30" ? 30 : dc.rule === "classic" ? 45 : 60;
                    startAI(diff, timer, { rule: dc.rule, id: dc.id });
                  }}
                  className={`btn-game px-4 py-2.5 shrink-0 ${dailyDone ? "btn-ghost" : "btn-gold"}`}>
                  {dailyDone ? "Done!" : "Play"}
                </button>
              </div>

              {/* Daily Code + Code Hunts */}
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => { setScreen("dailycode"); soundEngine.playTap(620); }} className="card-game p-3.5 text-left active:scale-[0.98] transition-transform hover:-translate-y-0.5">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-[22px] mb-2" style={{ background: "linear-gradient(135deg,#FFC800,#FF7A18)" }} aria-hidden>☀️</span>
                  <span className="font-display font-semibold block leading-tight">Daily Code</span>
                  <span className="text-[11px] font-bold block" style={{ color: "var(--ink-soft)" }}>One puzzle a day — 8 tries, up to 120 coins!</span>
                </button>
                <button onClick={() => { setScreen("tournaments"); soundEngine.playTap(620); }} className="card-game p-3.5 text-left active:scale-[0.98] transition-transform hover:-translate-y-0.5">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-[22px] mb-2" style={{ background: "linear-gradient(135deg,#A560E8,#FF4B6E)" }} aria-hidden>🏆</span>
                  <span className="font-display font-semibold block leading-tight">Code Hunts</span>
                  <span className="text-[11px] font-bold block" style={{ color: "var(--ink-soft)" }}>First to crack the hunt code wins the prize pot!</span>
                </button>
              </div>

              {/* More Games arcade banner */}
              <button onClick={() => { setScreen("moregames"); soundEngine.playTap(640); }}
                className="w-full rounded-3xl p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform hover:-translate-y-0.5"
                style={{ background: "linear-gradient(120deg,#FF4B6E,#A560E8 55%,#1CB0F6)", color: "#fff", border: "2px solid rgba(255,255,255,0.35)", boxShadow: "var(--shadow-card)" }}>
                <span className="text-[34px] leading-none shrink-0" aria-hidden>🎮</span>
                <span className="flex-1 min-w-0">
                  <span className="font-display font-bold text-xl block leading-tight">More Games <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md align-middle" style={{ background: "#fff", color: "#D33131" }}>★ 23 REMAKES</span></span>
                  <span className="text-xs font-bold block" style={{ color: "rgba(255,255,255,0.9)" }}>2048, Snake, Castle Defense, Creature Cards &amp; 19 more rebuilt for phones!</span>
                </span>
                <span className="btn-game px-4 py-2.5 shrink-0 text-sm" style={{ background: "#fff", color: "#7B2CBF", boxShadow: "0 4px 0 rgba(0,0,0,.25)" }}>Play</span>
              </button>

              {/* bots preview strip */}
              <div className="card-game p-3.5">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display font-semibold flex items-center gap-1.5"><Bot size={17} style={{ color: "var(--purple)" }} /> Meet your rivals</h3>
                  <button onClick={() => setShowPlaySheet(true)} className="text-xs font-black flex items-center gap-0.5" style={{ color: "var(--blue)" }}>Battle <ChevronRight size={13} strokeWidth={3} /></button>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {(Object.keys(AI_BOTS) as AIDifficulty[]).map((d, i) => {
                    const b = AI_BOTS[d];
                    return (
                      <button key={d} onClick={() => startAI(d, lastTimer || 45)} className="flex flex-col items-center p-1.5 rounded-2xl active:scale-95 transition-transform"
                        style={{ background: "var(--surface-3)", border: "2px solid var(--border)" }}>
                        <CharacterAvatar config={b.avatar} frameId={b.frameId} size={52} ringWidth={3} mood="idle" />
                        <span className="font-display font-semibold text-[13px] leading-tight mt-1">{b.name}</span>
                        <span className="flex gap-0.5 mt-0.5">
                          {[0, 1, 2, 3].map((s) => <Star key={s} size={9} fill={s <= i ? "#FFC800" : "none"} style={{ color: s <= i ? "#FFC800" : "var(--border-strong)" }} />)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* daily quests */}
              <div className="card-game p-3.5">
                <h3 className="font-display font-semibold flex items-center gap-1.5 mb-2.5">
                  <Target size={17} style={{ color: "var(--blue)" }} /> Daily quests
                  <span className="ml-auto chip px-2 py-1 text-[11px] font-black flex items-center gap-1"><Flame size={12} style={{ color: "#FF7A18" }} fill="#FF7A18" /> {me.streakDays} day streak</span>
                </h3>
                <div className="space-y-2.5">
                  {DAILY_QUESTS.map((q) => {
                    const prog = Math.min(stats[q.statKey] || 0, q.target);
                    const done = prog >= q.target;
                    const claimed = me.claimedDailyQuests?.includes(`${q.id}:${today}`);
                    return (
                      <div key={q.id} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between gap-2">
                            <p className="font-black text-[13px] truncate">{q.title}</p>
                            <p className="text-[11px] font-black shrink-0" style={{ color: "var(--ink-faint)" }}>{prog}/{q.target}</p>
                          </div>
                          <div className="h-2.5 rounded-full overflow-hidden mt-1" style={{ background: "var(--surface-3)", border: "1.5px solid var(--border)" }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${(prog / q.target) * 100}%`, background: done ? "#58CC02" : "var(--blue)" }} />
                          </div>
                        </div>
                        <button disabled={!done || claimed} onClick={() => claimQuest(q.id)}
                          className={`btn-game px-3 py-2 text-xs shrink-0 ${claimed ? "btn-ghost" : done ? "btn-gold" : "btn-ghost"}`}>
                          {claimed ? "Claimed" : `+${q.rewardCoins}c`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* menu grid */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {[
                  { label: "Shop", icon: ShoppingBag, color: "#A560E8", go: () => setScreen("shop") },
                  { label: "More Games", icon: Gamepad2, color: "#FF4B6E", go: () => setScreen("moregames") },
                  { label: "Friends", icon: UserPlus, color: "#58CC02", go: () => setScreen("friends") },
                  { label: "Replays", icon: History, color: "#7B5CFF", go: () => setScreen("history") },
                  { label: "Rankings", icon: Trophy, color: "#E0A800", go: () => setScreen("rank") },
                  { label: "How to Play", icon: GraduationCap, color: "#1CB0F6", go: () => setShowTutorial(true) },
                  { label: "Reviews", icon: Star, color: "#FFC800", go: () => { setCommunityTab("reviews"); setScreen("community"); } },
                  { label: "Feedback", icon: MessageSquare, color: "#FF4B6E", go: () => { setCommunityTab("feedback"); setScreen("community"); } },
                  { label: "Lobby Chat", icon: Users, color: "#58CC02", go: () => { setCommunityTab("lobby"); setScreen("community"); } },
                  { label: "My Profile", icon: User, color: "#FF7A18", go: () => setShowProfile(true) },
                  ...(installEvt && !isStandalone ? [{ label: "Install App", icon: Download, color: "#14D4C5", go: installApp }] : []),
                  ...(me.isAdmin ? [{ label: "Admin", icon: Crown, color: "#E85D04", go: () => { setCommunityTab("admin"); setScreen("community"); } }] : []),
                ].map((m) => {
                  const Icon = m.icon;
                  return (
                    <button key={m.label} onClick={() => { soundEngine.playTap(520); m.go(); }}
                      className="card-game p-3 flex flex-col items-center gap-1.5 active:scale-95 transition-transform hover:-translate-y-0.5">
                      <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white" style={{ background: m.color }}>
                        <Icon size={21} strokeWidth={2.5} />
                      </span>
                      <span className="font-display font-semibold text-[13px] leading-none">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {session?.isGuest && (
                <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg,#1CB0F6,#7B5CFF)", color: "#fff" }}>
                  <Sparkles size={26} className="shrink-0" />
                  <p className="font-bold text-sm flex-1">You&rsquo;re playing as a guest. Create a free account to save progress on any device and appear on the leaderboard!</p>
                  <button onClick={logout} className="btn-game px-3.5 py-2 text-sm shrink-0" style={{ background: "#fff", color: "#2456E6", boxShadow: "0 4px 0 rgba(0,0,0,.25)" }}>Sign up</button>
                </div>
              )}

              {/* mini leaderboard */}
              {leaderboard.length > 0 && (
                <div className="card-game p-3.5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display font-semibold flex items-center gap-1.5"><Trophy size={17} style={{ color: "#E0A800" }} /> Top code breakers</h3>
                    <button onClick={() => setScreen("rank")} className="text-xs font-black flex items-center gap-0.5" style={{ color: "var(--blue)" }}>See all <ChevronRight size={13} strokeWidth={3} /></button>
                  </div>
                  <div className="space-y-1.5">
                    {leaderboard.slice(0, 5).map((r, i) => (
                      <button key={r.id} type="button" onClick={() => { if (r.id !== me.id) setProfilePlayerId(r.id); }}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-xl w-full text-left active:scale-[0.99] transition-transform" style={{ background: r.id === me.id ? "rgba(88,204,2,0.14)" : "var(--surface-3)" }}>
                        <span className="font-display font-bold w-6 text-center" style={{ color: i === 0 ? "#E0A800" : "var(--ink-soft)" }}>{i + 1}</span>
                        <CharacterAvatar config={r.avatarConfig} frameId={r.frameId} size={32} ringWidth={2} />
                        <span className="font-black text-sm flex-1 truncate">{r.username}</span>
                        <DivisionBadge trophies={r.trophies} size="sm" />
                        <span className="font-black text-sm flex items-center gap-1"><Trophy size={13} style={{ color: "#E0A800" }} />{r.trophies}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] font-bold mt-8" style={{ color: "var(--ink-faint)" }}>
            Cipher Clash v4 — hide your code, crack theirs, become a Legend.
          </p>
        </main>
      )}

      {screen === "shop" && (
        <Shop me={me} onBack={() => setScreen("home")} onBuy={handleBuy} onEquip={handleEquip} busyId={busyItem} />
      )}

      {screen === "rank" && (
        <RankScreen leaderboard={leaderboard} me={me} onBack={() => setScreen("home")} onRefresh={refreshState} onOpenPlayer={(id) => setProfilePlayerId(id)} />
      )}

      {screen === "community" && (
        <Community me={me} token={token} onBack={() => setScreen("home")} showToast={showToast} initialTab={communityTab} />
      )}

      {screen === "friends" && (
        <Friends me={me} token={token} leaderboard={leaderboard} onBack={() => setScreen("home")} showToast={showToast}
          onOpenPlayer={(id) => setProfilePlayerId(id)} onSpectate={startSpectate}
          onEnterRoom={(room) => enterOnline(room)} />
      )}

      {screen === "history" && (
        <MatchHistory me={me} token={token} onBack={() => setScreen("home")} />
      )}

      {screen === "dailycode" && (
        <DailyCode me={me} token={token} onBack={() => setScreen("home")} showToast={showToast}
          onPlayerUpdate={(p) => setMe({ ...p, avatarConfig: normalizeAvatar(p.avatarConfig) })} onGuestDaily={handleGuestDaily} />
      )}

      {screen === "tournaments" && (
        <Tournament me={me} token={token} onBack={() => setScreen("home")} showToast={showToast} onRefresh={refreshState} />
      )}

      {screen === "moregames" && (
        <MoreGames onBack={() => setScreen("home")} />
      )}

      {showPlaySheet && (
        <PlaySheet
          me={me}
          onClose={() => setShowPlaySheet(false)}
          onStartAI={startAI}
          onStartHotseat={startHotseat}
          onStartOnline={startOnlineAction}
          onStartRace={startRace}
          onStartPeer={startPeer}
          showToast={showToast}
        />
      )}

      {showProfile && (
        <ProfileModal me={me} rank={myRank >= 0 ? myRank + 1 : null} onClose={() => setShowProfile(false)}
          onCustomize={() => { setShowProfile(false); setScreen("shop"); }} onLogout={logout} isGuest={!!session?.isGuest} />
      )}

      {showSettings && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/45 animate-fade" onClick={() => setShowSettings(false)} />
          <div className="relative card-game w-full sm:max-w-sm p-5 rounded-b-none sm:rounded-b-[1.4rem] animate-slide-up">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-xl flex items-center gap-2"><Settings size={20} /> Settings</h3>
              <button onClick={() => setShowSettings(false)} className="btn-game btn-ghost w-9 h-9 !rounded-xl flex items-center justify-center"><X size={17} strokeWidth={2.8} /></button>
            </div>
            <div className="space-y-2">
              <button onClick={() => { const m = soundEngine.toggleMute(); setMuted(m); }} className="btn-game btn-ghost w-full py-3 px-4 flex items-center gap-3">
                {muted ? <VolumeX size={19} /> : <Volume2 size={19} />} <span className="flex-1 text-left">Sound effects</span>
                <span className="font-black text-xs" style={{ color: muted ? "var(--red)" : "#58CC02" }}>{muted ? "OFF" : "ON"}</span>
              </button>
              <button onClick={() => setTheme(!isDark)} className="btn-game btn-ghost w-full py-3 px-4 flex items-center gap-3">
                {isDark ? <Sun size={19} /> : <Moon size={19} />} <span className="flex-1 text-left">Dark mode</span>
                <span className="font-black text-xs" style={{ color: isDark ? "#58CC02" : "var(--ink-faint)" }}>{isDark ? "ON" : "OFF"}</span>
              </button>
              {pushSupported && token && (
                <button onClick={togglePush} className="btn-game btn-ghost w-full py-3 px-4 flex items-center gap-3">
                  {pushOn ? <Bell size={19} /> : <BellOff size={19} />} <span className="flex-1 text-left">Challenge notifications</span>
                  <span className="font-black text-xs" style={{ color: pushOn ? "#58CC02" : "var(--ink-faint)" }}>{pushOn ? "ON" : "OFF"}</span>
                </button>
              )}
              {!isStandalone && (
                <button onClick={() => { setShowSettings(false); installApp(); }} className="btn-game btn-green w-full py-3 px-4 flex items-center gap-3">
                  <Download size={19} /> Install Cipher Clash app
                </button>
              )}
              <button onClick={() => { setShowSettings(false); setShowTutorial(true); }} className="btn-game btn-ghost w-full py-3 px-4 flex items-center gap-3">
                <GraduationCap size={19} /> Replay how-to-play guide
              </button>
              <button onClick={() => { setShowSettings(false); setCommunityTab("feedback"); setScreen("community"); }} className="btn-game btn-ghost w-full py-3 px-4 flex items-center gap-3">
                <MessageSquare size={19} /> Send feedback
              </button>
              <button onClick={logout} className="btn-game btn-red w-full py-3 px-4 flex items-center gap-3">
                <LogOut size={19} /> {session?.isGuest ? "Exit guest mode" : "Log out"}
              </button>
            </div>
            <p className="text-center text-[11px] font-bold mt-4" style={{ color: "var(--ink-faint)" }}>Cipher Clash v4.0</p>
          </div>
        </div>
      )}

      {showIosInstall && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/45 animate-fade" onClick={() => setShowIosInstall(false)} />
          <div className="relative card-game w-full sm:max-w-sm p-5 rounded-b-none sm:rounded-b-[1.4rem] animate-slide-up text-center">
            <Character config={{ base: "owl", color: "classic", accessory: "crown" }} mood="happy" size={90} />
            <h3 className="font-display font-bold text-xl mt-1">Install on iPhone/iPad</h3>
            <p className="text-sm font-bold mt-1" style={{ color: "var(--ink-soft)" }}>
              Apple only allows installing from Safari: tap the <b>Share</b> button, then <b>“Add to Home Screen”</b>. That&rsquo;s it — Cipher Clash becomes a real app icon!
            </p>
            <button onClick={() => setShowIosInstall(false)} className="btn-game btn-green w-full py-3 mt-4">Got it!</button>
          </div>
        </div>
      )}

      {showTutorial && (
        <Tutorial me={me} onFinish={(go) => finishTutorial(go)} onSkip={() => finishTutorial("skip")} />
      )}

      {profilePlayerId !== null && (
        <PlayerCard
          playerId={profilePlayerId}
          token={token}
          meId={me.id}
          onClose={() => setProfilePlayerId(null)}
          showToast={showToast}
          onEnterRoom={(room) => { setProfilePlayerId(null); enterOnline(room); }}
          onSpectate={startSpectate}
          onChallengeSent={() => showToast("⚔️ Challenge sent! Waiting for them to accept...")}
        />
      )}

      {incomingInvites.length > 0 && (
        <InvitePopup invite={incomingInvites[0]} onAnswer={answerInvite} />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}

/* ------------------------------- Invite popup ------------------------------- */

function InvitePopup({ invite, onAnswer }: { invite: InviteView; onAnswer: (inv: InviteView, acceptIt: boolean) => void }) {
  const [leftSec, setLeftSec] = useState(75);
  useEffect(() => {
    const calc = () => Math.max(0, Math.round((new Date(invite.expiresAt).getTime() - Date.now()) / 1000));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeftSec(calc());
    const t = setInterval(() => setLeftSec(calc()), 500);
    return () => clearInterval(t);
  }, [invite.id, invite.expiresAt]);
  if (leftSec <= 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[85] px-3 flex justify-center pointer-events-none">
      <div className="card-game w-full max-w-md p-3.5 pointer-events-auto animate-pop" style={{ borderColor: "#A560E8", boxShadow: "0 12px 40px rgba(165,96,232,.4)" }}>
        <div className="flex items-center gap-3">
          <CharacterAvatar config={invite.fromAvatar} frameId={invite.fromFrame} size={52} ringWidth={3} mood="happy" />
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold leading-tight truncate">{invite.fromName} wants to clash! ⚔️</p>
            <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>{invite.timerSeconds}s per turn · expires in {leftSec}s</p>
            <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: "var(--surface-3)" }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (leftSec / 75) * 100)}%`, background: leftSec > 20 ? "#A560E8" : "#FF4B4B" }} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => onAnswer(invite, false)} className="btn-game btn-ghost py-2.5">Not now</button>
          <button onClick={() => onAnswer(invite, true)} className="btn-game btn-green py-2.5 flex items-center justify-center gap-1.5">
            <Swords size={16} strokeWidth={2.7} /> Accept!
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Toasts ------------------------------- */

function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] inset-x-0 z-[90] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="animate-pop pointer-events-auto max-w-md text-center font-black text-sm px-4 py-2.5 rounded-2xl shadow-xl border-2"
          style={{
            background: t.kind === "err" ? "#FF4B4B" : "#26283B",
            color: "#fff", borderColor: "rgba(255,255,255,0.25)",
          }}>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- Welcome ------------------------------- */

function Welcome({ doAuth, showToast, toasts }: {
  doAuth: (mode: "login" | "register" | "guest", u: string, p: string) => Promise<void>;
  showToast: (m: string, k?: "ok" | "err") => void;
  toasts: Toast[];
}) {
  const [mode, setMode] = useState<"login" | "register">("register");
  const [username, setUsername] = useState(() => lastUsername());
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const run = async (m: "login" | "register" | "guest") => {
    setBusy(m); setError("");
    try {
      await doAuth(m, username.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Check your connection!");
    }
    setBusy("");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-md text-center animate-rise">
        <div className="flex justify-center">
          <Character config={{ base: "owl", color: "classic", accessory: "crown" }} mood="win" size={150} />
        </div>
        <h1 className="font-display font-bold text-5xl tracking-wide leading-none">
          CIPHER <span style={{ color: "var(--brand)" }}>CLASH</span>
        </h1>
        <p className="font-black mt-2" style={{ color: "var(--ink-soft)" }}>Hide your code. Crack theirs first!</p>

        <div className="flex justify-center gap-2 mt-4">
          {(Object.keys(AI_BOTS) as AIDifficulty[]).map((d) => (
            <div key={d} className="flex flex-col items-center">
              <CharacterAvatar config={AI_BOTS[d].avatar} frameId={AI_BOTS[d].frameId} size={52} ringWidth={3} />
              <span className="text-[10px] font-black mt-0.5" style={{ color: "var(--ink-soft)" }}>{AI_BOTS[d].name}</span>
            </div>
          ))}
        </div>
        <p className="text-[11px] font-black mt-1" style={{ color: "var(--ink-faint)" }}>4 ANIMATED RIVALS ARE WAITING FOR YOU</p>

        <button onClick={() => run("guest")} disabled={!!busy} className="btn-game btn-green w-full py-4 text-xl mt-5 flex items-center justify-center gap-2">
          {busy === "guest" ? <Loader2 className="animate-spin" size={22} /> : <Play size={22} fill="#fff" />} PLAY NOW — no sign up!
        </button>

        <div className="card-game p-4 mt-3 text-left">
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <button onClick={() => { setMode("register"); setError(""); }} className={`btn-game py-2.5 ${mode === "register" ? "btn-blue" : "btn-ghost"}`}>Create account</button>
            <button onClick={() => { setMode("login"); setError(""); }} className={`btn-game py-2.5 ${mode === "login" ? "btn-blue" : "btn-ghost"}`}>I have an account</button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); run(mode); }} className="space-y-2">
            <input value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} placeholder="Pick a username"
              className="input-game w-full px-3.5 py-3 font-black" autoComplete="username" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password (4+ characters)"
              className="input-game w-full px-3.5 py-3 font-black" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {error && <p className="text-sm font-black rounded-xl px-3 py-2 animate-pop" style={{ background: "rgba(255,75,75,0.14)", color: "#D33131" }}>{error}</p>}
            <button type="submit" disabled={!!busy || username.trim().length < 3} className="btn-game btn-blue w-full py-3.5 text-lg flex items-center justify-center gap-2">
              {busy ? <Loader2 className="animate-spin" size={20} /> : mode === "register" ? "Create my account" : "Log in & play"}
            </button>
          </form>
          <p className="text-[11px] font-bold text-center mt-2" style={{ color: "var(--ink-faint)" }}>
            An account saves your trophies, streak &amp; character on every device.
          </p>
        </div>
      </div>
      <Toasts toasts={toasts} />
    </div>
  );
}

function TimerChips({ options, value, set }: { options: number[]; value: number; set: (n: number) => void }) {
  return (
  <div className="flex items-center gap-1.5 flex-wrap">
    <span className="text-[11px] font-black flex items-center gap-1" style={{ color: "var(--ink-faint)" }}><Timer size={12} /> PER TURN:</span>
    {options.map((o) => (
      <button key={o} onClick={() => { set(o); soundEngine.playTap(500); }}
        className={`btn-game px-3 py-1.5 text-xs ${value === o ? "btn-blue" : "btn-ghost"}`}>
        {o === 0 ? "No limit" : `${o}s`}
      </button>
    ))}
  </div>
  );
}

/* ------------------------------- PlaySheet ------------------------------- */

function PlaySheet({ me, onClose, onStartAI, onStartHotseat, onStartOnline, onStartRace, onStartPeer, showToast }: {
  me: Player;
  onClose: () => void;
  onStartAI: (d: AIDifficulty, timer: number) => void;
  onStartHotseat: (timer: number) => void;
  onStartOnline: (action: "quick_match" | "create_room" | "join_room", timer: number, code?: string, mode?: "duel" | "race") => Promise<void>;
  onStartRace: (d: AIDifficulty) => void;
  onStartPeer: (timer: number) => void;
  showToast: (m: string, k?: "ok" | "err") => void;
}) {
  const [step, setStep] = useState<"modes" | "bots" | "online" | "hotseat" | "peer">("modes");
  const [bot, setBot] = useState<AIDifficulty>("Rookie");
  const [timer, setTimer] = useState(45);
  const [raceMode, setRaceMode] = useState(false);
  const [onlineMode, setOnlineMode] = useState<"duel" | "race">("duel");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState("");
  const [onlineError, setOnlineError] = useState("");


  const online = async (action: "quick_match" | "create_room" | "join_room") => {
    setBusy(action); setOnlineError("");
    try {
      await onStartOnline(action, timer, joinCode.trim(), action === "join_room" ? "duel" : onlineMode);
    } catch (e) {
      setOnlineError(e instanceof Error ? e.message : "Connection failed — try again!");
    }
    setBusy("");
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div className="relative card-game w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto pretty-scroll rounded-b-none sm:rounded-b-[1.4rem] p-4 sm:p-5 animate-slide-up">
        <div className="flex items-center gap-2 mb-3">
          {step !== "modes" && (
            <button onClick={() => setStep("modes")} className="btn-game btn-ghost w-9 h-9 !rounded-xl flex items-center justify-center"><ArrowLeft size={17} strokeWidth={2.8} /></button>
          )}
          <h3 className="font-display font-bold text-2xl flex-1">
            {step === "modes" && "Choose your battle"}
            {step === "bots" && (raceMode ? "🏁 Race a bot!" : "Pick your rival bot")}
            {step === "online" && (onlineMode === "race" ? "🏁 Race online!" : "Online battle")}
            {step === "hotseat" && "2 players, 1 device"}
            {step === "peer" && "📶 Local WiFi duel"}
          </h3>
          <button onClick={onClose} className="btn-game btn-ghost w-9 h-9 !rounded-xl flex items-center justify-center"><X size={17} strokeWidth={2.8} /></button>
        </div>

        {step === "modes" && (
          <div className="space-y-2.5">
            <button onClick={() => { setRaceMode(false); setStep("bots"); }} className="w-full card-game p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform hover:-translate-y-0.5">
              <span className="flex -space-x-3">
                <CharacterAvatar config={AI_BOTS.Rookie.avatar} frameId={AI_BOTS.Rookie.frameId} size={46} ringWidth={3} />
                <CharacterAvatar config={AI_BOTS.Oracle.avatar} frameId={AI_BOTS.Oracle.frameId} size={46} ringWidth={3} />
              </span>
              <span className="flex-1">
                <span className="font-display font-semibold text-lg block leading-tight">Vs Bots</span>
                <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>4 animated rivals, easy to nearly-impossible. Instant action!</span>
              </span>
              <ChevronRight size={20} style={{ color: "var(--ink-faint)" }} />
            </button>

            <button onClick={() => { setRaceMode(true); setStep("bots"); }} className="w-full card-game p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform hover:-translate-y-0.5" style={{ borderColor: "#FF7A18" }}>
              <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-[26px] shrink-0" style={{ background: "linear-gradient(135deg,#FF7A18,#FF4B4B)" }} aria-hidden>🏁</span>
              <span className="flex-1">
                <span className="font-display font-semibold text-lg block leading-tight">Race Mode <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md text-white align-middle" style={{ background: "#FF4B4B" }}>NEW</span></span>
                <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>Same code, no turns — first to crack it wins! Pure speed.</span>
              </span>
              <ChevronRight size={20} style={{ color: "var(--ink-faint)" }} />
            </button>

            <button onClick={() => setStep("online")} className="w-full card-game p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform hover:-translate-y-0.5">
              <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#1CB0F6,#7B5CFF)" }}>
                <Globe size={26} strokeWidth={2.4} />
              </span>
              <span className="flex-1">
                <span className="font-display font-semibold text-lg block leading-tight">Online Battle</span>
                <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>Real players! Quick match, or a private room with a friend. Chat &amp; reactions included.</span>
              </span>
              <ChevronRight size={20} style={{ color: "var(--ink-faint)" }} />
            </button>

            <button onClick={() => setStep("peer")} className="w-full card-game p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform hover:-translate-y-0.5" style={{ borderColor: "#58CC02" }}>
              <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#58CC02,#14D4C5)" }}>
                <Wifi size={26} strokeWidth={2.4} />
              </span>
              <span className="flex-1">
                <span className="font-display font-semibold text-lg block leading-tight">Local WiFi <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md text-white align-middle" style={{ background: "#58CC02" }}>NEW</span></span>
                <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>No internet! Pair two phones by QR code on any WiFi/hotspot.</span>
              </span>
              <ChevronRight size={20} style={{ color: "var(--ink-faint)" }} />
            </button>

            <button onClick={() => setStep("hotseat")} className="w-full card-game p-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform hover:-translate-y-0.5">
              <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#FF7A18,#FF4B6E)" }}>
                <Users size={26} strokeWidth={2.4} />
              </span>
              <span className="flex-1">
                <span className="font-display font-semibold text-lg block leading-tight">2 Players</span>
                <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>Pass-and-play on this device. Perfect for friends nearby!</span>
              </span>
              <ChevronRight size={20} style={{ color: "var(--ink-faint)" }} />
            </button>
          </div>
        )}

        {step === "bots" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(AI_BOTS) as AIDifficulty[]).map((d, i) => {
                const b = AI_BOTS[d];
                const sel = bot === d;
                return (
                  <button key={d} onClick={() => { setBot(d); soundEngine.playTap(560 + i * 40); }}
                    className="card-game p-3 flex flex-col items-center text-center active:scale-[0.97] transition-transform"
                    style={sel ? { borderColor: b.accent, boxShadow: `0 0 0 2px ${b.accent}, var(--shadow-card)` } : undefined}>
                    <CharacterAvatar config={b.avatar} frameId={b.frameId} size={76} ringWidth={4} mood={sel ? "happy" : "idle"} />
                    <span className="font-display font-semibold leading-tight mt-1">{b.name}</span>
                    <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: b.accent }}>{b.title}</span>
                    <span className="flex gap-0.5 my-1">
                      {[0, 1, 2, 3].map((s) => <Star key={s} size={10} fill={s <= i ? "#FFC800" : "none"} style={{ color: s <= i ? "#FFC800" : "var(--border-strong)" }} />)}
                    </span>
                    <span className="text-[11px] font-bold leading-tight" style={{ color: "var(--ink-soft)" }}>{b.tagline}</span>
                    <span className="text-[11px] font-black mt-1 flex items-center gap-1" style={{ color: "#58CC02" }}>
                      Win: +{b.rewardCoins}<Coins size={11} /> +{b.trophyDelta}<Trophy size={11} />
                    </span>
                  </button>
                );
              })}
            </div>
            {raceMode ? (
              <p className="text-sm font-bold text-center rounded-2xl px-3 py-2.5" style={{ background: "rgba(255,122,24,0.14)", color: "var(--ink-soft)" }}>
                🏁 You and {AI_BOTS[bot].name} attack the SAME code at the same time — no turns, no waiting. First to crack it (max 15 guesses) wins!
              </p>
            ) : (
              <TimerChips options={[15, 30, 45, 60, 0]} value={timer} set={setTimer} />
            )}
            <button onClick={() => (raceMode ? onStartRace(bot) : onStartAI(bot, timer))} className="btn-game btn-green w-full py-4 text-xl flex items-center justify-center gap-2">
              <Swords size={22} strokeWidth={2.7} /> {raceMode ? `Race ${AI_BOTS[bot].name}!` : `Battle ${AI_BOTS[bot].name}!`}
            </button>
          </div>
        )}

        {step === "online" && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => { setOnlineMode("duel"); soundEngine.playTap(520); }} className={`btn-game py-2.5 ${onlineMode === "duel" ? "btn-blue" : "btn-ghost"}`}>
                ⚔️ Classic duel
              </button>
              <button onClick={() => { setOnlineMode("race"); soundEngine.playTap(520); }} className={`btn-game py-2.5 ${onlineMode === "race" ? "btn-red" : "btn-ghost"}`}>
                🏁 Race mode
              </button>
            </div>
            {onlineMode === "race" ? (
              <p className="text-[12px] font-bold text-center rounded-2xl px-3 py-2" style={{ background: "rgba(255,75,75,0.12)", color: "var(--ink-soft)" }}>
                Both players crack one shared code at the same time. First to solve wins +24 trophies!
              </p>
            ) : (
              <TimerChips options={[30, 45, 60, 90]} value={timer} set={setTimer} />
            )}
            <button onClick={() => online("quick_match")} disabled={!!busy} className="btn-game btn-green w-full py-4 text-lg flex items-center justify-center gap-2">
              {busy === "quick_match" ? <Loader2 className="animate-spin" size={21} /> : <Zap size={21} strokeWidth={2.7} />} Quick Match — find a rival now!
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => online("create_room")} disabled={!!busy} className="btn-game btn-blue py-3.5 flex items-center justify-center gap-1.5">
                {busy === "create_room" ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} strokeWidth={2.8} />} Create room
              </button>
              <div className="flex gap-1.5">
                <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
                  placeholder="CODE" className="input-game w-full px-2 py-2 font-display font-bold text-center tracking-[0.2em] uppercase" />
              </div>
            </div>
            <button onClick={() => online("join_room")} disabled={!!busy || joinCode.length < 4} className="btn-game btn-purple w-full py-3 flex items-center justify-center gap-2">
              {busy === "join_room" ? <Loader2 className="animate-spin" size={18} /> : <KeyRound size={18} strokeWidth={2.6} />} Join with code
            </button>
            {onlineError && <p className="text-sm font-black rounded-xl px-3 py-2 animate-pop" style={{ background: "rgba(255,75,75,0.14)", color: "#D33131" }}>{onlineError}</p>}
            <p className="text-[11px] font-bold text-center" style={{ color: "var(--ink-faint)" }}>
              Quick Match pairs you instantly. Create a room to get a code you can share with a friend. If you get disconnected, come back and tap Rejoin — your match waits for you!
            </p>
          </div>
        )}

        {step === "peer" && (
          <div className="space-y-3">
            <div className="flex justify-center items-center gap-2 py-2">
              <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#58CC02,#14D4C5)" }}>
                <QrCode size={28} strokeWidth={2.4} />
              </span>
              <span className="font-display font-bold text-2xl" style={{ color: "var(--ink-faint)" }}>⇄</span>
              <span className="w-14 h-14 rounded-full flex items-center justify-center text-white" style={{ background: "linear-gradient(135deg,#A560E8,#1CB0F6)" }}>
                <Wifi size={28} strokeWidth={2.4} />
              </span>
            </div>
            <p className="text-sm font-bold text-center" style={{ color: "var(--ink-soft)" }}>
              Two phones, one WiFi (or hotspot), <b>zero internet</b>. One phone hosts and shows a QR code — the other scans it — and you duel directly, like Mini Militia!
            </p>
            <TimerChips options={[30, 45, 60, 0]} value={timer} set={setTimer} />
            <button onClick={() => onStartPeer(timer)} className="btn-game btn-green w-full py-4 text-xl flex items-center justify-center gap-2">
              <Wifi size={21} strokeWidth={2.6} /> Start local duel
            </button>
            <p className="text-[11px] font-bold text-center" style={{ color: "var(--ink-faint)" }}>
              Tip: install the app on both phones first — after that it works fully offline.
            </p>
          </div>
        )}

        {step === "hotseat" && (
          <div className="space-y-3">
            <div className="flex justify-center items-end gap-3 py-2">
              <CharacterAvatar config={me.avatarConfig} frameId={me.frameId} size={84} ringWidth={4} mood="happy" />
              <span className="font-display font-bold text-xl pb-6" style={{ color: "var(--ink-faint)" }}>VS</span>
              <CharacterAvatar config={{ base: "cat", color: "sky", accessory: "cap" }} frameId="frame_neon" size={84} ringWidth={4} mood="happy" />
            </div>
            <p className="text-sm font-bold text-center" style={{ color: "var(--ink-soft)" }}>
              {me.username} hides a code, passes the device, Player 2 hides theirs — then take turns guessing. The screen hides between turns so nobody can peek!
            </p>
            <TimerChips options={[15, 30, 45, 60, 0]} value={timer} set={setTimer} />
            <button onClick={() => onStartHotseat(timer)} className="btn-game btn-green w-full py-4 text-xl flex items-center justify-center gap-2">
              <Users size={21} strokeWidth={2.6} /> Start 2-player duel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Rank ------------------------------- */

function RankScreen({ leaderboard, me, onBack, onRefresh, onOpenPlayer }: {
  leaderboard: LeaderboardRow[]; me: Player; onBack: () => void; onRefresh: () => void; onOpenPlayer: (id: number) => void;
}) {
  const myIdx = leaderboard.findIndex((r) => r.id === me.id);
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 pb-16 animate-fade">
      <div className="flex items-center gap-2 py-3 sticky top-0 z-20" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)" }}>
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center"><ArrowLeft size={19} strokeWidth={2.8} /></button>
        <h2 className="font-display font-bold text-2xl flex-1">Leaderboard</h2>
        <button onClick={onRefresh} className="btn-game btn-ghost px-3 py-2 text-xs">Refresh</button>
      </div>

      {/* divisions overview */}
      <div className="card-game p-3 mb-3">
        <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--ink-faint)" }}>Road to Legend — win matches to earn trophies</p>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {DIVISIONS.map((d) => (
            <span key={d.name} className="shrink-0 rounded-xl px-2.5 py-1.5 text-center" style={{ background: d.gradient, opacity: me.trophies >= d.minTrophies ? 1 : 0.45 }}>
              <span className="block text-white font-black text-[11px] leading-none" style={{ textShadow: "0 1px 2px rgba(0,0,0,.4)" }}>{d.name}</span>
              <span className="block text-white/90 font-black text-[9px]">{d.minTrophies}+</span>
            </span>
          ))}
        </div>
      </div>

      {myIdx >= 0 && (
        <div className="rounded-2xl p-3 mb-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg, rgba(88,204,2,.22), rgba(28,176,246,.18))", border: "2px solid #58CC02" }}>
          <span className="font-display font-bold text-2xl">#{myIdx + 1}</span>
          <CharacterAvatar config={me.avatarConfig} frameId={me.frameId} size={44} ringWidth={3} />
          <div className="flex-1">
            <p className="font-display font-semibold leading-tight">You</p>
            <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>{me.wins} wins · {me.totalGames} games</p>
          </div>
          <DivisionBadge trophies={me.trophies} />
          <span className="font-black flex items-center gap-1"><Trophy size={15} style={{ color: "#E0A800" }} />{me.trophies}</span>
        </div>
      )}

      <div className="space-y-1.5">
        {leaderboard.length === 0 && <p className="text-center font-bold py-10" style={{ color: "var(--ink-faint)" }}>No ranked players yet — be the first Legend!</p>}
        {leaderboard.map((r, i) => (
          <div key={r.id} role="button" tabIndex={0} onClick={() => { if (r.id !== me.id) onOpenPlayer(r.id); }}
            className="card-game px-3 py-2 flex items-center gap-2.5 animate-rise cursor-pointer active:scale-[0.99] transition-transform" style={r.id === me.id ? { borderColor: "#58CC02" } : undefined}>
            <span className={`font-display font-bold w-8 text-center text-lg`} style={{ color: i === 0 ? "#E0A800" : i === 1 ? "#8A97AD" : i === 2 ? "#B0703C" : "var(--ink-soft)" }}>
              {i < 3 ? <Medal size={22} className="mx-auto" /> : i + 1}
            </span>
            <span className="relative">
              <CharacterAvatar config={r.avatarConfig} frameId={r.frameId} size={42} ringWidth={3} />
              {r.isOnline && <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white" style={{ background: "#58CC02" }} />}
            </span>
            <span className="flex-1 min-w-0">
              <span className="font-black text-sm block truncate">{r.username}{r.id === me.id ? " (you)" : ""}</span>
              <span className="text-[11px] font-bold block" style={{ color: "var(--ink-faint)" }}>{r.title} · {r.wins} wins · {r.streakDays}d streak</span>
            </span>
            <DivisionBadge trophies={r.trophies} size="sm" />
            <span className="font-black text-sm flex items-center gap-1 w-16 justify-end"><Trophy size={14} style={{ color: "#E0A800" }} />{r.trophies}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Profile ------------------------------- */

function ProfileModal({ me, rank, onClose, onCustomize, onLogout, isGuest }: {
  me: Player; rank: number | null; onClose: () => void; onCustomize: () => void; onLogout: () => void; isGuest: boolean;
}) {
  const winRate = me.totalGames ? Math.round((me.wins / me.totalGames) * 100) : 0;
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div className="relative card-game w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto pretty-scroll rounded-b-none sm:rounded-b-[1.4rem] animate-slide-up">
        <div className="board-theme p-5 pb-4 rounded-t-[1.4rem]" data-board={me.themeId}>
          <button onClick={onClose} className="btn-game w-9 h-9 !rounded-xl flex items-center justify-center float-right"
            style={{ background: "var(--board-key)", color: "var(--board-ink)", border: "2px solid var(--board-border)", boxShadow: "0 3px 0 var(--board-border)" }}>
            <X size={17} strokeWidth={2.8} />
          </button>
          <div className="flex flex-col items-center text-center clear-both">
            <CharacterAvatar config={me.avatarConfig} frameId={me.frameId} size={130} ringWidth={5} mood="happy" />
            <h3 className="font-display font-bold text-2xl mt-1" style={{ color: "var(--board-ink)" }}>{me.username}</h3>
            <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--board-soft)" }}>{me.title}{isGuest ? " · Guest" : ""}</p>
            <div className="flex items-center gap-2 mt-2">
              <DivisionBadge trophies={me.trophies} />
              {rank && <span className="chip px-2 py-1 text-[11px] font-black">Rank #{rank}</span>}
              <span className="chip px-2 py-1 text-[11px] font-black flex items-center gap-1"><Flame size={12} style={{ color: "#FF7A18" }} fill="#FF7A18" /> {me.streakDays} days</span>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              { v: me.trophies, l: "Trophies" }, { v: me.wins, l: "Wins" },
              { v: `${winRate}%`, l: "Win rate" }, { v: me.level, l: "Level" },
              { v: me.totalGames, l: "Games" }, { v: me.losses, l: "Losses" },
              { v: me.fastestWinTurns ?? "—", l: "Fastest win" }, { v: me.xp, l: "Total XP" },
            ].map((s) => (
              <div key={s.l} className="rounded-2xl py-2.5 px-1" style={{ background: "var(--surface-3)", border: "2px solid var(--border)" }}>
                <p className="font-display font-bold text-lg leading-none">{s.v}</p>
                <p className="text-[9px] font-black uppercase tracking-wide mt-1" style={{ color: "var(--ink-faint)" }}>{s.l}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <span className="chip flex-1 py-2.5 font-black flex items-center justify-center gap-1.5"><Coins size={17} style={{ color: "#E0A800" }} /> {me.coins.toLocaleString()} coins</span>
            <span className="chip flex-1 py-2.5 font-black flex items-center justify-center gap-1.5"><Gem size={17} style={{ color: "#1CB0F6" }} /> {me.gems.toLocaleString()} gems</span>
          </div>

          <div>
            <h4 className="font-display font-semibold mb-2">Achievements ({me.completedAchievements.length}/{ACHIEVEMENTS.length})</h4>
            <div className="grid grid-cols-2 gap-1.5">
              {ACHIEVEMENTS.map((a) => {
                const has = me.completedAchievements.includes(a.id);
                return (
                  <div key={a.id} className="rounded-2xl p-2.5 flex items-start gap-2" style={{
                    background: has ? "rgba(255,200,0,0.14)" : "var(--surface-3)",
                    border: `2px solid ${has ? "#FFC800" : "var(--border)"}`, opacity: has ? 1 : 0.65,
                  }}>
                    <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white" style={{ background: has ? "#E0A800" : "var(--border-strong)" }}>
                      {has ? <Medal size={17} strokeWidth={2.5} /> : <Lock size={15} />}
                    </span>
                    <span className="min-w-0">
                      <span className="font-black text-[12px] block leading-tight">{a.title}</span>
                      <span className="text-[10px] font-bold block leading-tight" style={{ color: "var(--ink-soft)" }}>{a.description}</span>
                      <span className="text-[10px] font-black flex items-center gap-0.5" style={{ color: "#1CB0F6" }}>+{a.rewardGems} <Gem size={10} /></span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pb-1">
            <button onClick={onCustomize} className="btn-game btn-purple py-3 flex items-center justify-center gap-2">
              <ShoppingBag size={17} strokeWidth={2.6} /> Customize
            </button>
            <button onClick={onLogout} className="btn-game btn-ghost py-3 flex items-center justify-center gap-2">
              <DoorOpen size={17} strokeWidth={2.6} /> {isGuest ? "Exit guest" : "Log out"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
