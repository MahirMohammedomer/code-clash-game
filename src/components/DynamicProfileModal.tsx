"use client";

import React, { useState } from "react";
import {
  getDivisionForTrophies,
  COSMETIC_SHOP_ITEMS,
  ACHIEVEMENTS,
} from "@/lib/game-engine";
import { soundEngine } from "@/lib/sound-effects";
import {
  X,
  Flame,
  Trophy,
  Zap,
  Shield,
  Sparkles,
  UserPlus,
  UserCheck,
  Swords,
  LogIn,
  Check,
} from "lucide-react";

export interface PlayerRecord {
  id: number;
  username: string;
  authProvider: string;
  avatarEmoji: string;
  title: string;
  frameId: string;
  themeId: string;
  effectId: string;
  division: string;
  trophies: number;
  level: number;
  xp: number;
  seasonXp: number;
  hasPremiumPass: boolean;
  claimedFreeTiers: number[];
  claimedPremiumTiers: number[];
  ownedCosmetics: string[];
  completedAchievements: string[];
  claimedQuests: string[];
  coins: number;
  gems: number;
  streakDays: number;
  wins: number;
  losses: number;
  totalGames: number;
  fastestWinTurns: number | null;
  clubId: number | null;
  isOnline: boolean;
}

interface DynamicProfileModalProps {
  player: PlayerRecord;
  isSelf: boolean;
  isFollowing?: boolean;
  onClose: () => void;
  onToggleFollow?: (targetId: number) => void;
  onSendChallenge?: (targetPlayer: PlayerRecord) => void;
  onUpdateCosmetics?: (updates: {
    frameId?: string;
    themeId?: string;
    effectId?: string;
    title?: string;
    avatarEmoji?: string;
  }) => Promise<void>;
  onAuthAction?: (payload: {
    mode: "login" | "register" | "google" | "guest";
    username?: string;
    password?: string;
    avatarEmoji?: string;
  }) => Promise<void>;
}

const AVATAR_CHOICES = ["🦉", "🦊", "🐉", "🦄", "🐼", "🦁", "🐸", "🐣", "🐯", "🤖", "🧙", "🥷"];

export function getFrameClasses(frameId: string): string {
  switch (frameId) {
    case "frame_gold":
      return "ring-4 ring-[#FFC800] bg-gradient-to-br from-amber-100 to-yellow-200 shadow-[0_0_18px_rgba(255,200,0,0.45)]";
    case "frame_neon":
      return "ring-4 ring-[#1CB0F6] bg-gradient-to-br from-sky-100 to-cyan-200 shadow-[0_0_18px_rgba(28,176,246,0.45)]";
    case "frame_dragon":
      return "ring-4 ring-[#FF4B4B] bg-gradient-to-br from-rose-100 to-orange-200 shadow-[0_0_20px_rgba(255,75,75,0.5)]";
    case "frame_celestial":
      return "ring-4 ring-[#CE82FF] bg-gradient-to-br from-purple-200 via-fuchsia-100 to-amber-100 shadow-[0_0_22px_rgba(206,130,255,0.6)]";
    case "frame_solar":
      return "ring-4 ring-orange-400 bg-gradient-to-br from-orange-100 to-amber-200";
    default:
      return "ring-4 ring-[#58CC02] bg-gradient-to-br from-lime-100 to-emerald-100";
  }
}

export default function DynamicProfileModal({
  player,
  isSelf,
  isFollowing = false,
  onClose,
  onToggleFollow,
  onSendChallenge,
  onUpdateCosmetics,
  onAuthAction,
}: DynamicProfileModalProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "customize" | "account">("overview");
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState(player.avatarEmoji || "🦉");
  const [authError, setAuthError] = useState("");

  const divInfo = getDivisionForTrophies(player.trophies);
  const winRate =
    player.totalGames > 0
      ? Math.round((player.wins / player.totalGames) * 100)
      : 0;

  // Dynamic visual aura based on real win rate + streak + division
  const isHotStreak =
    player.streakDays >= 3 || (player.totalGames >= 3 && winRate >= 70);
  const owned = Array.isArray(player.ownedCosmetics) ? player.ownedCosmetics : [];
  const completedAch = Array.isArray(player.completedAchievements)
    ? player.completedAchievements
    : [];

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onAuthAction) return;
    setAuthError("");
    if (!usernameInput.trim()) {
      setAuthError("Enter a cool username first!");
      return;
    }
    soundEngine.playTap(540);
    try {
      await onAuthAction({
        mode: authMode,
        username: usernameInput.trim(),
        password: passwordInput || "clash123",
        avatarEmoji: selectedEmoji,
      });
      setUsernameInput("");
      setPasswordInput("");
      setActiveTab("overview");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Auth failed");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
      <div className="w-full max-w-md bg-[#FFFDF7] rounded-3xl border-2 border-[#E5E0D5] border-b-[6px] shadow-2xl overflow-hidden animate-pop-in max-h-[90vh] flex flex-col">
        {/* Dynamic Division & Streak Header Banner */}
        <div
          className={`relative p-5 bg-gradient-to-r ${divInfo.bgGradient} text-white`}
        >
          <button
            onClick={() => {
              soundEngine.playTap(380);
              onClose();
            }}
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center text-white transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="relative">
              <div
                className={`w-20 h-20 rounded-2xl flex items-center justify-center text-4xl ${getFrameClasses(
                  player.frameId
                )}`}
              >
                {player.avatarEmoji}
              </div>
              <span
                className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${
                  player.isOnline ? "bg-emerald-400" : "bg-slate-400"
                }`}
                title={player.isOnline ? "Online now" : "Offline"}
              />
              <span className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full text-xs font-black bg-[#2B2D42] text-white border-2 border-white">
                LVL {player.level}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-black/25 text-xs font-extrabold uppercase tracking-wider flex items-center gap-1">
                  <span>{divInfo.badgeEmoji}</span> {divInfo.name} Division
                </span>
                {isHotStreak && (
                  <span className="px-2 py-0.5 rounded-full bg-[#FFC800] text-[#2B2D42] text-[11px] font-black uppercase flex items-center gap-0.5">
                    <Sparkles className="w-3 h-3" /> ON FIRE
                  </span>
                )}
              </div>

              <h2 className="text-2xl font-display font-bold truncate mt-1 drop-shadow-xs">
                {player.username}
              </h2>

              <p className="text-xs font-extrabold text-white/90 uppercase tracking-wider flex items-center gap-1.5">
                <span>✨ {player.title}</span>
                {player.hasPremiumPass && (
                  <span className="px-2 py-0.5 rounded-md bg-purple-900/60 border border-purple-300/40 text-[10px]">
                    👑 ROYAL PASS
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Dynamic Season & Level Progress Strip */}
          <div className="mt-4 bg-black/20 rounded-2xl p-2.5 flex items-center justify-between text-xs font-extrabold">
            <div className="flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-[#FFC800]" />
              <span>{player.trophies} Trophies</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-300" />
              <span>{player.streakDays} Day Streak</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-lime-300" />
              <span>{winRate}% Win Rate</span>
            </div>
          </div>
        </div>

        {/* Sub-navigation for Self Profile */}
        {isSelf && (
          <div className="flex border-b-2 border-[#E5E0D5] bg-[#F3F0E6] p-1.5 gap-1.5">
            <button
              onClick={() => {
                soundEngine.playTap(480);
                setActiveTab("overview");
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition ${
                activeTab === "overview"
                  ? "bg-white text-[#2B2D42] shadow-xs border-b-2 border-[#D6CFC0]"
                  : "text-[#6C757D] hover:text-[#2B2D42]"
              }`}
            >
              📊 Stats & Badges
            </button>
            <button
              onClick={() => {
                soundEngine.playTap(500);
                setActiveTab("customize");
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition ${
                activeTab === "customize"
                  ? "bg-white text-[#2B2D42] shadow-xs border-b-2 border-[#D6CFC0]"
                  : "text-[#6C757D] hover:text-[#2B2D42]"
              }`}
            >
              🎨 Locker
            </button>
            <button
              onClick={() => {
                soundEngine.playTap(520);
                setActiveTab("account");
              }}
              className={`flex-1 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider transition ${
                activeTab === "account"
                  ? "bg-white text-[#2B2D42] shadow-xs border-b-2 border-[#D6CFC0]"
                  : "text-[#6C757D] hover:text-[#2B2D42]"
              }`}
            >
              🔐 Account
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === "overview" && (
            <>
              {/* Action Buttons if viewing another player */}
              {!isSelf && (
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      soundEngine.playTap(520);
                      onToggleFollow?.(player.id);
                    }}
                    className={`flex-1 py-3 px-4 rounded-2xl font-display font-bold text-sm border-b-4 btn-tactile flex items-center justify-center gap-2 ${
                      isFollowing
                        ? "bg-[#F3F0E6] text-[#2B2D42] border-[#D6CFC0]"
                        : "bg-[#1CB0F6] text-white border-[#1899D6]"
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-4 h-4" /> Following
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" /> Follow Rival
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      soundEngine.playTap(600);
                      onSendChallenge?.(player);
                    }}
                    className="flex-1 py-3 px-4 rounded-2xl font-display font-bold text-sm bg-[#58CC02] text-white border-b-4 border-[#46A302] btn-tactile flex items-center justify-center gap-2"
                  >
                    <Swords className="w-4 h-4" /> Send 1v1 Duel
                  </button>
                </div>
              )}

              {/* Dynamic 2x3 Stat Bento Grid */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="bg-[#F3F0E6] rounded-2xl p-3 border-2 border-[#E5E0D5] text-center">
                  <div className="text-xs font-bold text-[#6C757D] uppercase">Wins</div>
                  <div className="text-xl font-display font-bold text-[#58CC02] mt-0.5">
                    {player.wins}
                  </div>
                </div>
                <div className="bg-[#F3F0E6] rounded-2xl p-3 border-2 border-[#E5E0D5] text-center">
                  <div className="text-xs font-bold text-[#6C757D] uppercase">Win Rate</div>
                  <div className="text-xl font-display font-bold text-[#1CB0F6] mt-0.5">
                    {winRate}%
                  </div>
                </div>
                <div className="bg-[#F3F0E6] rounded-2xl p-3 border-2 border-[#E5E0D5] text-center">
                  <div className="text-xs font-bold text-[#6C757D] uppercase">Best Crack</div>
                  <div className="text-xl font-display font-bold text-[#CE82FF] mt-0.5">
                    {player.fastestWinTurns ? `${player.fastestWinTurns} Turns` : "—"}
                  </div>
                </div>
                <div className="bg-[#F3F0E6] rounded-2xl p-3 border-2 border-[#E5E0D5] text-center">
                  <div className="text-xs font-bold text-[#6C757D] uppercase">Streak</div>
                  <div className="text-xl font-display font-bold text-[#FF9600] mt-0.5">
                    🔥 {player.streakDays}d
                  </div>
                </div>
                <div className="bg-[#F3F0E6] rounded-2xl p-3 border-2 border-[#E5E0D5] text-center">
                  <div className="text-xs font-bold text-[#6C757D] uppercase">Season XP</div>
                  <div className="text-xl font-display font-bold text-[#FFC800] mt-0.5">
                    {player.seasonXp}
                  </div>
                </div>
                <div className="bg-[#F3F0E6] rounded-2xl p-3 border-2 border-[#E5E0D5] text-center">
                  <div className="text-xs font-bold text-[#6C757D] uppercase">Matches</div>
                  <div className="text-xl font-display font-bold text-[#2B2D42] mt-0.5">
                    {player.totalGames}
                  </div>
                </div>
              </div>

              {/* Dynamic Rank Evolution Meter */}
              <div className="bg-white rounded-2xl p-4 border-2 border-[#E5E0D5]">
                <div className="flex items-center justify-between text-xs font-extrabold mb-2">
                  <span className="flex items-center gap-1.5 text-[#2B2D42]">
                    <Shield className="w-4 h-4 text-[#58CC02]" /> Division Progress:{" "}
                    {divInfo.name}
                  </span>
                  <span className="text-[#6C757D]">
                    {player.trophies} / {divInfo.maxTrophies + 1} 🏆
                  </span>
                </div>
                <div className="w-full h-3.5 bg-[#F3F0E6] rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#58CC02] to-[#FFC800] transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          12,
                          ((player.trophies - divInfo.minTrophies) /
                            Math.max(1, divInfo.maxTrophies - divInfo.minTrophies)) *
                            100
                        )
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Achievements Showcase */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#6C757D] mb-2">
                  🏅 Unlocked Achievements ({completedAch.length}/{ACHIEVEMENTS.length})
                </h3>
                <div className="space-y-2">
                  {ACHIEVEMENTS.map((ach) => {
                    const unlocked = completedAch.includes(ach.id);
                    return (
                      <div
                        key={ach.id}
                        className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition ${
                          unlocked
                            ? "bg-lime-50/70 border-[#58CC02]/40"
                            : "bg-[#F3F0E6]/60 border-[#E5E0D5] opacity-60"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-white border border-[#E5E0D5] flex items-center justify-center text-xl">
                          {ach.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-extrabold text-[#2B2D42] flex items-center gap-1.5">
                            <span>{ach.title}</span>
                            {unlocked && (
                              <span className="px-2 py-0.5 text-[10px] rounded-full bg-[#58CC02] text-white font-black">
                                UNLOCKED
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#6C757D] font-semibold">
                            {ach.description}
                          </div>
                        </div>
                        <div className="text-xs font-black text-[#CE82FF]">
                          +{ach.rewardGems} 💎
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === "customize" && isSelf && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#6C757D] mb-2">
                  Choose Avatar Mascot
                </label>
                <div className="grid grid-cols-6 gap-2">
                  {AVATAR_CHOICES.map((emo) => (
                    <button
                      key={emo}
                      onClick={() => {
                        soundEngine.playTap(500);
                        onUpdateCosmetics?.({ avatarEmoji: emo });
                      }}
                      className={`h-11 rounded-xl text-2xl flex items-center justify-center border-2 transition ${
                        player.avatarEmoji === emo
                          ? "bg-lime-100 border-[#58CC02] scale-105"
                          : "bg-white border-[#E5E0D5] hover:bg-[#F3F0E6]"
                      }`}
                    >
                      {emo}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#6C757D] mb-2">
                  Equip Avatar Frame
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {COSMETIC_SHOP_ITEMS.filter((i) => i.category === "frame").map(
                    (item) => {
                      const isOwned = owned.includes(item.id) || item.priceCoins === 0;
                      const isEquipped = player.frameId === item.id;
                      return (
                        <button
                          key={item.id}
                          disabled={!isOwned}
                          onClick={() => {
                            soundEngine.playTap(550);
                            onUpdateCosmetics?.({ frameId: item.id });
                          }}
                          className={`p-3 rounded-2xl border-2 text-left flex items-center gap-2.5 transition ${
                            isEquipped
                              ? "bg-lime-50 border-[#58CC02]"
                              : isOwned
                              ? "bg-white border-[#E5E0D5] hover:border-[#1CB0F6]"
                              : "bg-[#F3F0E6] border-[#E5E0D5] opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <span className="text-2xl">{item.icon}</span>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-extrabold text-[#2B2D42] truncate">
                              {item.name}
                            </div>
                            <div className="text-[10px] font-bold text-[#6C757D]">
                              {isEquipped
                                ? "Equipped ✓"
                                : isOwned
                                ? "Tap to equip"
                                : "Unlock in Shop/Pass"}
                            </div>
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#6C757D] mb-2">
                  Equip Board Theme & Victory Effect
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {COSMETIC_SHOP_ITEMS.filter((i) =>
                    ["theme", "effect"].includes(i.category)
                  ).map((item) => {
                    const isOwned = owned.includes(item.id) || item.priceCoins === 0;
                    const isEquipped =
                      player.themeId === item.id || player.effectId === item.id;
                    return (
                      <button
                        key={item.id}
                        disabled={!isOwned}
                        onClick={() => {
                          soundEngine.playTap(550);
                          if (item.category === "theme") {
                            onUpdateCosmetics?.({ themeId: item.id });
                          } else {
                            onUpdateCosmetics?.({ effectId: item.id });
                          }
                        }}
                        className={`p-3 rounded-2xl border-2 text-left flex items-center gap-2.5 transition ${
                          isEquipped
                            ? "bg-sky-50 border-[#1CB0F6]"
                            : isOwned
                            ? "bg-white border-[#E5E0D5]"
                            : "bg-[#F3F0E6] border-[#E5E0D5] opacity-50 cursor-not-allowed"
                        }`}
                      >
                        <span className="text-2xl">{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-extrabold text-[#2B2D42] truncate">
                            {item.name}
                          </div>
                          <div className="text-[10px] font-bold text-[#6C757D]">
                            {isEquipped ? (
                              <span className="text-[#1CB0F6] flex items-center gap-0.5">
                                <Check className="w-3 h-3" /> Active
                              </span>
                            ) : isOwned ? (
                              "Tap to use"
                            ) : (
                              "Locked"
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "account" && isSelf && (
            <div className="space-y-4">
              <div className="bg-[#F3F0E6] p-3.5 rounded-2xl border-2 border-[#E5E0D5] flex items-center justify-between">
                <div>
                  <div className="text-xs font-extrabold text-[#6C757D] uppercase">
                    Signed in as
                  </div>
                  <div className="text-base font-display font-bold text-[#2B2D42]">
                    {player.username}{" "}
                    <span className="text-xs font-bold text-[#58CC02]">
                      ({player.authProvider.toUpperCase()})
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    soundEngine.playTap(440);
                    onAuthAction?.({ mode: "guest" });
                  }}
                  className="px-3 py-2 rounded-xl bg-white border-2 border-[#E5E0D5] border-b-4 text-xs font-extrabold text-[#2B2D42] btn-tactile"
                >
                  New Guest
                </button>
              </div>

              {/* Continue with Google Button */}
              <button
                type="button"
                onClick={async () => {
                  setAuthError("");
                  if (!usernameInput.trim()) {
                    setAuthError("Enter your desired username below first, then tap Continue with Google.");
                    return;
                  }
                  soundEngine.playReward();
                  try {
                    await onAuthAction?.({
                      mode: "google",
                      username: usernameInput.trim(),
                      avatarEmoji: selectedEmoji,
                    });
                  } catch (err: unknown) {
                    setAuthError(err instanceof Error ? err.message : "Google sign-in failed");
                  }
                }}
                className="w-full py-3.5 px-4 rounded-2xl bg-white border-2 border-[#E5E0D5] border-b-4 hover:bg-slate-50 font-display font-bold text-sm text-[#2B2D42] btn-tactile flex items-center justify-center gap-2.5 shadow-xs"
              >
                <span className="text-lg">🌐</span>
                <span>Continue with Google</span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="grow border-t border-[#E5E0D5]"></div>
                <span className="shrink mx-3 text-xs font-extrabold text-[#6C757D] uppercase">
                  Or Username + Password
                </span>
                <div className="grow border-t border-[#E5E0D5]"></div>
              </div>

              <form onSubmit={handleAuthSubmit} className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode("register")}
                    className={`flex-1 py-2 rounded-xl text-xs font-extrabold uppercase ${
                      authMode === "register"
                        ? "bg-[#58CC02] text-white"
                        : "bg-[#F3F0E6] text-[#6C757D]"
                    }`}
                  >
                    Create Account
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`flex-1 py-2 rounded-xl text-xs font-extrabold uppercase ${
                      authMode === "login"
                        ? "bg-[#1CB0F6] text-white"
                        : "bg-[#F3F0E6] text-[#6C757D]"
                    }`}
                  >
                    Switch Account
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-[#6C757D] uppercase mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="e.g. CipherLegend99"
                    className="w-full px-4 py-2.5 rounded-xl bg-white border-2 border-[#E5E0D5] font-bold text-sm focus:outline-none focus:border-[#1CB0F6]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-[#6C757D] uppercase mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-2.5 rounded-xl bg-white border-2 border-[#E5E0D5] font-bold text-sm focus:outline-none focus:border-[#1CB0F6]"
                  />
                </div>

                {authError && (
                  <p className="text-xs font-extrabold text-[#FF4B4B]">
                    {authError}
                  </p>
                )}

                <button
                  type="submit"
                  className="w-full py-3.5 rounded-2xl bg-[#58CC02] text-white font-display font-bold text-sm border-b-4 border-[#46A302] btn-tactile flex items-center justify-center gap-2"
                >
                  <LogIn className="w-4 h-4" />
                  <span>
                    {authMode === "register"
                      ? "Save & Play as New Challenger"
                      : "Sign In to Profile"}
                  </span>
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
