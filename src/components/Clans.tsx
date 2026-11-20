"use client";

/**
 * Clans (Guilds) — create or join a clan of up to 30 players, see the roster
 * with a shared weekly trophy goal, and chat in the private clan channel.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Loader2, LogOut, Send, Swords, Users } from "lucide-react";
import { CharacterAvatar } from "./Character";
import { soundEngine } from "@/lib/sound-effects";
import { fetchT } from "@/lib/fetch-t";
import type { Player } from "@/lib/types";
import type { AvatarConfig } from "@/lib/avatar";

interface ClubInfo {
  id: number;
  name: string;
  tag: string;
  badgeEmoji: string;
  description: string;
  memberCount: number;
  totalTrophies: number;
  weeklyGoal: number;
}

interface ClanMsg {
  id: number;
  senderId: number;
  senderName: string;
  senderAvatar: AvatarConfig;
  content: string;
  createdAt: string;
}

interface RosterRow {
  id: number;
  username: string;
  trophies: number;
  division: string;
  avatarConfig: AvatarConfig;
  frameId: string;
  isOnline: boolean;
}

const BADGES = ["🛡️", "⚔️", "🦉", "🔥", "💎", "🐍", "⭐", "👑"];

export default function Clans({ me, token, showToast, onOpenPlayer }: {
  me: Player;
  token: string | null;
  showToast: (m: string, k?: "ok" | "err") => void;
  onOpenPlayer: (id: number) => void;
}) {
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [messages, setMessages] = useState<ClanMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [joinTag, setJoinTag] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [badge, setBadge] = useState(BADGES[0]);
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState("");
  const [draft, setDraft] = useState("");
  const cursor = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetchT("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clan_info", token }),
      });
      const data = await res.json();
      setClub(data.club || null);
      setRoster(data.roster || []);
      if (Array.isArray(data.messages) && data.messages.length) {
        const msgs: ClanMsg[] = data.messages;
        cursor.current = Math.max(...msgs.map((m) => m.id));
        setMessages(msgs);
      }
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial clan load
    void load();
  }, [load]);

  // clan chat polling
  useEffect(() => {
    if (!club || !token) return;
    const t = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetchT(`/api/chat?scope=clan&token=${token}&since=${cursor.current}`);
        const data = await res.json();
        const msgs: ClanMsg[] = data.messages || [];
        if (msgs.length) {
          cursor.current = Math.max(cursor.current, ...msgs.map((m) => m.id));
          setMessages((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...msgs.filter((m) => !seen.has(m.id))].slice(-100);
          });
          requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
        }
      } catch {}
    }, 3500);
    return () => clearInterval(t);
  }, [club, token]);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!token) { showToast("Create a free account to use clans!", "err"); return; }
    setBusy(action);
    try {
      const res = await fetchT("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, token, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      soundEngine.playReward();
      if (action === "clan_create") showToast(`${name || "Clan"} founded! 👑`);
      if (action === "clan_join") showToast(`Welcome to the clan! 🛡️`);
      if (action === "clan_leave") showToast("You left the clan.");
      await load();
      setShowCreate(false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "err");
    }
    setBusy("");
  };

  const send = async () => {
    if (!token || !club || !draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    try {
      const res = await fetchT("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, scope: "clan", content: text }),
      });
      const data = await res.json();
      if (data.message) {
        cursor.current = Math.max(cursor.current, data.message.id);
        setMessages((prev) => [...prev, data.message].slice(-100));
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
      } else if (data.error) showToast(data.error, "err");
    } catch {}
  };

  if (!token) {
    return (
      <div className="card-game p-8 text-center animate-pop">
        <p className="text-4xl mb-2">🛡️</p>
        <p className="font-bold text-sm" style={{ color: "var(--ink-soft)" }}>
          Clans are teams of up to 30 players with a shared weekly trophy goal and a private chat.
          Create a free account to found your own clan!
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-14">
        <Loader2 className="animate-spin" size={28} />
        <p className="font-black text-sm" style={{ color: "var(--ink-soft)" }}>Loading your clan...</p>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="space-y-3 animate-fade">
        <div className="card-game p-6 text-center">
          <p className="text-4xl mb-1">🛡️</p>
          <p className="font-display font-bold text-xl">You&rsquo;re clanless!</p>
          <p className="text-sm font-bold mt-1" style={{ color: "var(--ink-soft)" }}>
            Found a clan or join one with its 2-4 letter tag. Clanmates share a weekly trophy goal and a private chat.
          </p>
        </div>

        {showCreate ? (
          <div className="card-game p-4 space-y-2.5">
            <h3 className="font-display font-bold text-lg">Found your clan 👑</h3>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Clan name (e.g. Code Hunters)"
              className="input-game w-full px-3.5 py-3 font-black" />
            <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
              placeholder="TAG (2-4 letters, e.g. HUNT)" className="input-game w-full px-3.5 py-3 font-display font-bold tracking-[0.2em] text-center uppercase" />
            <div className="flex gap-1.5 flex-wrap justify-center">
              {BADGES.map((b) => (
                <button key={b} onClick={() => { setBadge(b); soundEngine.playTap(600); }}
                  className={`w-11 h-11 rounded-xl text-xl flex items-center justify-center active:scale-90 transition-transform ${badge === b ? "btn-game btn-blue" : "btn-game btn-ghost"}`}>
                  {b}
                </button>
              ))}
            </div>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={120} placeholder="Short description (optional)"
              className="input-game w-full px-3.5 py-3 font-bold text-sm" />
            <button onClick={() => act("clan_create", { name, tag, badgeEmoji: badge, description: desc })}
              disabled={busy === "clan_create" || name.trim().length < 3 || tag.length < 2}
              className="btn-game btn-green w-full py-3.5 flex items-center justify-center gap-2">
              {busy === "clan_create" ? <Loader2 className="animate-spin" size={20} /> : <Crown size={20} strokeWidth={2.7} />} Found clan!
            </button>
            <button onClick={() => setShowCreate(false)} className="btn-game btn-ghost w-full py-2.5 text-sm">Cancel</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setShowCreate(true)} className="btn-game btn-blue py-3.5 flex items-center justify-center gap-2">
              <Crown size={19} strokeWidth={2.7} /> Create clan
            </button>
            <button onClick={() => act("clan_join", { tag: joinTag })} disabled={busy === "clan_join" || joinTag.trim().length < 2}
              className="btn-game btn-green py-3.5 flex items-center justify-center gap-2">
              {busy === "clan_join" ? <Loader2 className="animate-spin" size={19} /> : <Users size={19} strokeWidth={2.7} />} Join with tag
            </button>
          </div>
        )}
        {!showCreate && (
          <input value={joinTag} onChange={(e) => setJoinTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
            placeholder="Enter a clan tag, e.g. HUNT" className="input-game w-full px-3.5 py-3 font-display font-bold tracking-[0.2em] text-center uppercase" />
        )}
      </div>
    );
  }

  const goalPct = Math.min(100, Math.round((club.totalTrophies / Math.max(1, club.weeklyGoal)) * 100));

  return (
    <div className="space-y-3 animate-fade">
      {/* clan card */}
      <div className="card-game p-4" style={{ background: "linear-gradient(135deg, rgba(28,176,246,0.16), rgba(165,96,232,0.12))" }}>
        <div className="flex items-center gap-3">
          <span className="w-14 h-14 rounded-2xl flex items-center justify-center text-[30px] shrink-0" style={{ background: "var(--surface-3)", border: "2px solid var(--border)" }}>
            {club.badgeEmoji}
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-xl leading-tight truncate">{club.name} <span className="text-xs font-black px-1.5 py-0.5 rounded-md text-white align-middle" style={{ background: "var(--blue)" }}>[{club.tag}]</span></p>
            <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>{club.description}</p>
          </div>
          <button onClick={() => act("clan_leave")} disabled={busy === "clan_leave"} title="Leave clan"
            className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center shrink-0">
            <LogOut size={17} strokeWidth={2.6} />
          </button>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] font-black mb-1">
            <span style={{ color: "var(--ink-soft)" }}>CLAN TROPHY GOAL</span>
            <span style={{ color: "var(--ink-soft)" }}>{club.totalTrophies.toLocaleString()} / {club.weeklyGoal.toLocaleString()}</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: "var(--surface-3)", border: "1.5px solid var(--border)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${goalPct}%`, background: "linear-gradient(90deg,#1CB0F6,#7B5CFF)" }} />
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2.5 text-xs font-black" style={{ color: "var(--ink-soft)" }}>
          <span className="flex items-center gap-1"><Users size={13} /> {club.memberCount}/30 members</span>
          <span className="flex items-center gap-1"><Swords size={13} /> Invite friends: share tag [{club.tag}]</span>
        </div>
      </div>

      {/* roster */}
      <div className="card-game p-3.5">
        <h3 className="font-display font-semibold mb-2">Roster</h3>
        <div className="space-y-1.5">
          {roster.map((r, i) => (
            <button key={r.id} onClick={() => r.id !== me.id && onOpenPlayer(r.id)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-xl w-full text-left active:scale-[0.99] transition-transform"
              style={{ background: r.id === me.id ? "rgba(88,204,2,0.14)" : "var(--surface-3)" }}>
              <span className="font-display font-bold w-5 text-center" style={{ color: "var(--ink-soft)" }}>{i + 1}</span>
              <span className="relative">
                <CharacterAvatar config={r.avatarConfig} frameId={r.frameId} size={34} ringWidth={2} />
                {r.isOnline && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white" style={{ background: "#58CC02" }} />}
              </span>
              <span className="font-black text-sm flex-1 truncate">{r.username}{r.id === me.id ? " (you)" : ""}</span>
              <span className="font-black text-xs flex items-center gap-1"><Swords size={12} style={{ color: "#E0A800" }} />{r.trophies}</span>
            </button>
          ))}
        </div>
      </div>

      {/* clan chat */}
      <div className="card-game flex flex-col" style={{ height: "min(48dvh, 430px)" }}>
        <div ref={scrollRef} className="flex-1 overflow-y-auto pretty-scroll p-3 space-y-2.5">
          {messages.length === 0 && (
            <p className="text-center font-bold py-8 text-sm" style={{ color: "var(--ink-faint)" }}>Clan chat is quiet... rally the troops! 🛡️</p>
          )}
          {messages.map((m) => (
            <div key={m.id} className="flex gap-2 items-start">
              <CharacterAvatar config={m.senderAvatar} size={32} ringWidth={2} />
              <div className="min-w-0">
                <p className="text-[11px] font-black" style={{ color: "var(--ink-soft)" }}>{m.senderName}</p>
                <div className="rounded-2xl rounded-tl-md px-3 py-1.5 font-bold text-sm inline-block" style={{ background: "var(--surface-3)" }}>{m.content}</div>
              </div>
            </div>
          ))}
        </div>
        <form className="p-3 flex gap-2 border-t-2" style={{ borderColor: "var(--border)" }}
          onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={220}
            placeholder="Message your clan..." className="input-game flex-1 px-3 py-2.5 font-bold text-sm" />
          <button type="submit" disabled={!draft.trim()} className="btn-game btn-blue px-4 flex items-center"><Send size={16} strokeWidth={2.6} /></button>
        </form>
      </div>
    </div>
  );
}
