"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Eye, Loader2, Search, Swords, Trophy, UserPlus, Users } from "lucide-react";
import { CharacterAvatar } from "./Character";
import { getDivisionForTrophies } from "@/lib/game-engine";
import { soundEngine } from "@/lib/sound-effects";
import type { LeaderboardRow, Player, RoomSession, SocialPlayer } from "@/lib/types";

type Tab = "online" | "friends" | "followers" | "find";

export default function Friends({
  me,
  token,
  leaderboard,
  onBack,
  showToast,
  onOpenPlayer,
  onSpectate,
  onEnterRoom,
}: {
  me: Player;
  token: string | null;
  leaderboard: LeaderboardRow[];
  onBack: () => void;
  showToast: (m: string, k?: "ok" | "err") => void;
  onOpenPlayer: (id: number) => void;
  onSpectate: (roomCode: string) => void;
  onEnterRoom: (room: RoomSession & { timerSeconds?: number }) => void;
}) {
  const [tab, setTab] = useState<Tab>("online");
  const [online, setOnline] = useState<SocialPlayer[]>([]);
  const [friends, setFriends] = useState<SocialPlayer[]>([]);
  const [followers, setFollowers] = useState<SocialPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [sentTo, setSentTo] = useState<Set<number>>(new Set());
  const aliveRef = useRef(true);

  const load = useCallback(async () => {
    try {
      const qs = token ? `?token=${token}` : "";
      const res = await fetch(`/api/social${qs}`);
      if (!res.ok || !aliveRef.current) return;
      const data = await res.json();
      if (data.onlineNow) setOnline(data.onlineNow);
      if (data.following) setFriends(data.following);
      if (data.followers) setFollowers(data.followers);
      // Outgoing challenge accepted while browsing here → jump in!
      const accepted = (data.invitesOut || []).find(
        (i: { status: string; roomCode: string | null; myToken?: string; timerSeconds: number }) =>
          i.status === "accepted" && i.roomCode && i.myToken
      );
      if (accepted && aliveRef.current) {
        showToast("⚔️ Challenge accepted — good luck!");
        onEnterRoom({ roomCode: accepted.roomCode, slot: 1, token: accepted.myToken, savedAt: Date.now(), timerSeconds: accepted.timerSeconds });
      }
    } catch {}
    if (aliveRef.current) setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    aliveRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load + presence polling
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 8000);
    return () => { aliveRef.current = false; clearInterval(t); };
  }, [load]);

  const quickChallenge = async (p: SocialPlayer) => {
    if (!token) { showToast("Create a free account to challenge players!", "err"); return; }
    setBusyId(p.id);
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "challenge", token, targetId: p.id, timerSeconds: 45 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Challenge failed");
      if (data.accepted && data.roomCode && data.token) {
        onEnterRoom({ roomCode: data.roomCode, slot: (data.slot || 2) as 1 | 2, token: data.token, savedAt: Date.now(), timerSeconds: 45 });
        return;
      }
      setSentTo((s) => new Set(s).add(p.id));
      soundEngine.playJoin();
      showToast(`⚔️ Challenge sent to ${p.username}!`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Challenge failed", "err");
    }
    setBusyId(null);
  };

  const quickFollow = async (id: number, name: string) => {
    if (!token) { showToast("Create a free account to follow players!", "err"); return; }
    setBusyId(id);
    try {
      const res = await fetch("/api/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "follow", token, targetId: id }),
      });
      if (!res.ok) throw new Error("follow failed");
      soundEngine.playTap(760);
      showToast(`Following ${name}! 👥`);
      load();
    } catch {
      showToast("Could not follow — try again", "err");
    }
    setBusyId(null);
  };

  const findResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = leaderboard.filter((r) => r.id !== me.id);
    if (!q) return base.slice(0, 20);
    return base.filter((r) => r.username.toLowerCase().includes(q)).slice(0, 20);
  }, [query, leaderboard, me.id]);

  const Row = ({ p }: { p: SocialPlayer }) => {
    const div = getDivisionForTrophies(p.trophies);
    return (
      <div className="card-game px-3 py-2 flex items-center gap-2.5 animate-rise">
        <button onClick={() => { soundEngine.playTap(520); onOpenPlayer(p.id); }} className="relative shrink-0 active:scale-95 transition-transform" title={`View ${p.username}`}>
          <CharacterAvatar config={p.avatarConfig} frameId={p.frameId} size={46} ringWidth={3} />
          {p.isOnline && <span className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white" style={{ background: "#58CC02" }} />}
        </button>
        <button onClick={() => onOpenPlayer(p.id)} className="flex-1 min-w-0 text-left">
          <span className="font-black text-sm block truncate">{p.username}</span>
          <span className="text-[11px] font-bold block" style={{ color: "var(--ink-faint)" }}>
            {p.inMatchRoom ? "⚔️ In a match now" : p.isOnline ? "🟢 Online" : "Offline"} · {p.title}
          </span>
        </button>
        <span className="font-black text-xs flex items-center gap-1 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: div.gradient }} />
          <Trophy size={13} style={{ color: "#E0A800" }} />{p.trophies}
        </span>
        {p.inMatchRoom ? (
          <button onClick={() => onSpectate(p.inMatchRoom as string)} className="btn-game btn-purple px-3 py-2 text-xs flex items-center gap-1 shrink-0">
            <Eye size={14} strokeWidth={2.7} /> Watch
          </button>
        ) : p.isOnline ? (
          <button onClick={() => quickChallenge(p)} disabled={busyId === p.id || sentTo.has(p.id)}
            className="btn-game btn-green px-3 py-2 text-xs flex items-center gap-1 shrink-0">
            {busyId === p.id ? <Loader2 className="animate-spin" size={14} /> : <Swords size={14} strokeWidth={2.7} />}
            {sentTo.has(p.id) ? "Sent ⏳" : "Duel"}
          </button>
        ) : null}
      </div>
    );
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "online", label: `🟢 Online`, count: online.length },
    { id: "friends", label: "👥 Friends", count: friends.length },
    { id: "followers", label: "💚 Followers", count: followers.length },
    { id: "find", label: "🔍 Find" },
  ];

  const onlineFriends = friends.filter((f) => f.isOnline).length;

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 pb-16 animate-fade">
      <div className="flex items-center gap-2 py-3 sticky top-0 z-20" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)" }}>
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <h2 className="font-display font-bold text-2xl flex-1">Friends 👥</h2>
        <span className="chip px-2.5 py-1.5 text-[11px] font-black">🟢 {onlineFriends} friends online</span>
      </div>

      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3 -mx-1 px-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); soundEngine.playTap(500); }}
            className={`btn-game px-3.5 py-2.5 whitespace-nowrap text-sm ${tab === t.id ? "btn-purple" : "btn-ghost"}`}>
            {t.label}{typeof t.count === "number" ? ` (${t.count})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-14">
          <Loader2 className="animate-spin" size={28} />
          <p className="font-black text-sm" style={{ color: "var(--ink-soft)" }}>Finding players...</p>
        </div>
      ) : tab === "online" ? (
        online.length === 0 ? (
          <EmptyState emoji="🌙" text="Nobody else is online right now. Invite a friend with a room code!" />
        ) : (
          <div className="space-y-1.5">{online.map((p) => <Row key={p.id} p={p} />)}</div>
        )
      ) : tab === "friends" ? (
        !token ? (
          <EmptyState emoji="🔒" text="Guests can't have friends lists — create a free account to follow players and get pinged when they're online!" />
        ) : friends.length === 0 ? (
          <EmptyState emoji="👀" text="You don't follow anyone yet. Find players in the 🔍 tab and tap Follow!" />
        ) : (
          <div className="space-y-1.5">{friends.map((p) => <Row key={p.id} p={p} />)}</div>
        )
      ) : tab === "followers" ? (
        !token ? (
          <EmptyState emoji="🔒" text="Create a free account so other players can follow you!" />
        ) : followers.length === 0 ? (
          <EmptyState emoji="🌱" text="No followers yet — win some duels and climb the leaderboard!" />
        ) : (
          <div className="space-y-1.5">{followers.map((p) => <Row key={p.id} p={p} />)}</div>
        )
      ) : (
        <div>
          <div className="relative mb-3">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-faint)" }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search players..."
              className="input-game w-full pl-10 pr-3.5 py-3 font-black" maxLength={24} />
          </div>
          {findResults.length === 0 ? (
            <EmptyState emoji="🔍" text="No players match that name yet." />
          ) : (
            <div className="space-y-1.5">
              {findResults.map((r) => {
                const liveInfo = online.find((o) => o.id === r.id) || friends.find((o) => o.id === r.id);
                const asSocial: SocialPlayer = {
                  id: r.id, username: r.username, avatarConfig: r.avatarConfig, frameId: r.frameId,
                  title: r.title, division: r.division, trophies: r.trophies, level: r.level,
                  isOnline: r.isOnline, inMatchRoom: liveInfo?.inMatchRoom ?? null,
                  following: friends.some((f) => f.id === r.id),
                };
                return (
                  <div key={r.id} className="flex items-center gap-1.5">
                    <div className="flex-1 min-w-0"><Row p={asSocial} /></div>
                    {!asSocial.following && (
                      <button onClick={() => quickFollow(r.id, r.username)} disabled={busyId === r.id}
                        className="btn-game btn-blue w-10 h-10 !rounded-xl flex items-center justify-center shrink-0" title={`Follow ${r.username}`}>
                        <UserPlus size={17} strokeWidth={2.7} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-center text-[11px] font-bold mt-4 flex items-center justify-center gap-1.5" style={{ color: "var(--ink-faint)" }}>
            <Users size={13} /> Tap any player to see their profile, follow them, or challenge them to a duel!
          </p>
        </div>
      )}
    </div>
  );
}

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="card-game p-8 text-center animate-pop">
      <p className="text-4xl mb-2">{emoji}</p>
      <p className="font-bold text-sm" style={{ color: "var(--ink-soft)" }}>{text}</p>
    </div>
  );
}
