"use client";

import React, { useEffect, useState } from "react";
import { Eye, Flame, Loader2, Swords, Trophy, UserCheck, UserPlus, X } from "lucide-react";
import { CharacterAvatar } from "./Character";
import { ACHIEVEMENTS, getDivisionForTrophies } from "@/lib/game-engine";
import { soundEngine } from "@/lib/sound-effects";
import type { PublicProfile, RoomSession } from "@/lib/types";

/**
 * Public profile card — opened from leaderboard, friends, chat, anywhere.
 * Follow, challenge to a duel, or spectate their live match.
 */
export default function PlayerCard({
  playerId,
  token,
  meId,
  onClose,
  showToast,
  onEnterRoom,
  onSpectate,
  onChallengeSent,
}: {
  playerId: number;
  token: string | null;
  meId: number | null;
  onClose: () => void;
  showToast: (m: string, k?: "ok" | "err") => void;
  onEnterRoom?: (room: RoomSession & { timerSeconds?: number }) => void;
  onSpectate?: (roomCode: string) => void;
  onChallengeSent?: () => void;
}) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [timer, setTimer] = useState(45);
  const [challengeSent, setChallengeSent] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_public_profile", token: token || undefined, targetId: playerId }),
        });
        const data = await res.json();
        if (alive && data.profile) setProfile(data.profile);
      } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [playerId, token]);

  const isMe = meId !== null && meId === playerId;

  const toggleFollow = async () => {
    if (!token || !profile) { showToast("Create a free account to follow players!", "err"); return; }
    const nowFollowing = !profile.isFollowing;
    setProfile({ ...profile, isFollowing: nowFollowing, followers: profile.followers + (nowFollowing ? 1 : -1) });
    soundEngine.playTap(nowFollowing ? 760 : 500);
    setBusy("follow");
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nowFollowing ? "follow" : "unfollow", token, targetId: playerId }),
      });
      if (!res.ok) throw new Error("follow failed");
      showToast(nowFollowing ? `Following ${profile.username}! 👥` : `Unfollowed ${profile.username}`);
    } catch {
      setProfile(profile);
      showToast("Could not update follow — try again", "err");
    }
    setBusy("");
  };

  const challenge = async () => {
    if (!token || !profile) { showToast("Create a free account to challenge players!", "err"); return; }
    setBusy("challenge");
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "challenge", token, targetId: playerId, timerSeconds: timer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Challenge failed");
      if (data.accepted && data.roomCode && data.token && onEnterRoom) {
        onEnterRoom({ roomCode: data.roomCode, slot: (data.slot || 2) as 1 | 2, token: data.token, savedAt: Date.now(), timerSeconds: timer });
        onClose();
        return;
      }
      setChallengeSent(true);
      soundEngine.playJoin();
      showToast(`⚔️ Challenge sent to ${profile.username}! They have 75s to accept.`);
      onChallengeSent?.();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Challenge failed", "err");
    }
    setBusy("");
  };

  const div = profile ? getDivisionForTrophies(profile.trophies) : null;
  const winRate = profile && profile.totalGames ? Math.round((profile.wins / profile.totalGames) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 animate-fade" onClick={onClose} />
      <div className="relative card-game w-full sm:max-w-md max-h-[92dvh] overflow-y-auto pretty-scroll rounded-b-none sm:rounded-b-[1.4rem] animate-slide-up">
        {loading || !profile ? (
          <div className="p-10 flex flex-col items-center gap-3">
            <Loader2 className="animate-spin" size={28} />
            <p className="font-black text-sm" style={{ color: "var(--ink-soft)" }}>Loading profile...</p>
          </div>
        ) : (
          <>
            <div className="board-theme p-5 pb-4 rounded-t-[1.4rem]" data-board={profile.themeId}>
              <button onClick={onClose} className="btn-game w-9 h-9 !rounded-xl flex items-center justify-center float-right"
                style={{ background: "var(--board-key)", color: "var(--board-ink)", border: "2px solid var(--board-border)", boxShadow: "0 3px 0 var(--board-border)" }} aria-label="Close profile">
                <X size={17} strokeWidth={2.8} />
              </button>
              <div className="flex flex-col items-center text-center clear-both">
                <span className="relative">
                  <CharacterAvatar config={profile.avatarConfig} frameId={profile.frameId} size={118} ringWidth={5} mood="happy" />
                  {profile.isOnline && (
                    <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full border-[3px] border-white" style={{ background: "#58CC02" }} title="Online now" />
                  )}
                </span>
                <h3 className="font-display font-bold text-2xl mt-1" style={{ color: "var(--board-ink)" }}>{profile.username}</h3>
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--board-soft)" }}>
                  {profile.title} · {profile.isOnline ? "🟢 Online now" : "Offline"}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                  <span className="inline-flex items-center gap-1 font-black text-white rounded-lg text-xs px-2 py-1" style={{ background: div?.gradient, textShadow: "0 1px 2px rgba(0,0,0,.35)" }}>
                    <Trophy size={13} strokeWidth={2.8} /> {div?.name} · {profile.trophies}
                  </span>
                  <span className="chip px-2 py-1 text-[11px] font-black flex items-center gap-1">
                    <Flame size={12} style={{ color: "#FF7A18" }} fill="#FF7A18" /> {profile.streakDays} day streak
                  </span>
                  <span className="chip px-2 py-1 text-[11px] font-black">Level {profile.level}</span>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { v: profile.wins, l: "Wins 🏆" },
                  { v: `${winRate}%`, l: "Win rate" },
                  { v: profile.totalGames, l: "Games" },
                  { v: profile.fastestWinTurns ?? "—", l: "Fastest ⚡" },
                  { v: profile.followers, l: "Followers" },
                  { v: profile.following, l: "Following" },
                  { v: profile.achievements.length, l: `of ${ACHIEVEMENTS.length} 🏅` },
                  { v: new Date(profile.createdAt).toLocaleDateString("en-GB", { month: "short", year: "2-digit" }), l: "Joined" },
                ].map((s) => (
                  <div key={s.l} className="rounded-2xl py-2.5 px-1" style={{ background: "var(--surface-3)", border: "2px solid var(--border)" }}>
                    <p className="font-display font-bold text-lg leading-none">{s.v}</p>
                    <p className="text-[9px] font-black uppercase tracking-wide mt-1" style={{ color: "var(--ink-faint)" }}>{s.l}</p>
                  </div>
                ))}
              </div>

              {profile.h2h && (
                <div className="rounded-2xl px-3.5 py-2.5 flex items-center gap-2" style={{ background: "rgba(165,96,232,0.12)", border: "2px solid rgba(165,96,232,0.45)" }}>
                  <Swords size={18} style={{ color: "#A560E8" }} />
                  <p className="font-black text-sm flex-1">
                    Head-to-head vs you: <span style={{ color: "#58CC02" }}>{profile.h2h.wins}W</span> – <span style={{ color: "#FF4B4B" }}>{profile.h2h.losses}L</span>
                  </p>
                  <span className="text-lg">{profile.h2h.wins > profile.h2h.losses ? "😎" : profile.h2h.wins < profile.h2h.losses ? "😤" : "🤝"}</span>
                </div>
              )}

              {!isMe && (
                <>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-black" style={{ color: "var(--ink-faint)" }}>⏱ PER TURN:</span>
                    {[30, 45, 60, 90].map((o) => (
                      <button key={o} onClick={() => { setTimer(o); soundEngine.playTap(500); }}
                        className={`btn-game px-3 py-1.5 text-xs ${timer === o ? "btn-blue" : "btn-ghost"}`}>{o}s</button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={toggleFollow} disabled={busy === "follow"}
                      className={`btn-game py-3 flex items-center justify-center gap-2 ${profile.isFollowing ? "btn-ghost" : "btn-blue"}`}>
                      {profile.isFollowing ? <UserCheck size={17} strokeWidth={2.7} /> : <UserPlus size={17} strokeWidth={2.7} />}
                      {profile.isFollowing ? "Following" : "Follow"}
                    </button>
                    <button onClick={challenge} disabled={busy === "challenge" || challengeSent}
                      className="btn-game btn-green py-3 flex items-center justify-center gap-2">
                      {busy === "challenge" ? <Loader2 className="animate-spin" size={17} /> : <Swords size={17} strokeWidth={2.7} />}
                      {challengeSent ? "Sent! ⏳" : "Challenge"}
                    </button>
                  </div>
                  {profile.inMatchRoom && onSpectate && (
                    <button onClick={() => { onSpectate(profile.inMatchRoom as string); onClose(); }}
                      className="btn-game btn-purple w-full py-3 flex items-center justify-center gap-2 animate-pop">
                      <Eye size={18} strokeWidth={2.6} /> Watch their live match! 👁
                    </button>
                  )}
                  {profile.followsMe && !profile.isFollowing && (
                    <p className="text-center text-[11px] font-black" style={{ color: "var(--ink-faint)" }}>{profile.username} follows you — follow back? 👋</p>
                  )}
                </>
              )}
              {isMe && <p className="text-center font-black text-sm" style={{ color: "var(--ink-soft)" }}>That&rsquo;s you! Looking sharp 😎</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
