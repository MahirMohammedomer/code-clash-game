"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ThumbsUp, Flame, Laugh, Ghost, Rocket, Target, Heart, Star, Send, X, MessageCircle } from "lucide-react";
import { QUICK_PHRASES } from "@/lib/game-engine";
import type { MatchChatMessage, MatchReaction } from "@/lib/types";
import { soundEngine } from "@/lib/sound-effects";

export const REACTION_META: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  thumbs_up: { icon: ThumbsUp, color: "#1CB0F6", label: "Nice" },
  fire: { icon: Flame, color: "#FF7A18", label: "Fire" },
  laugh: { icon: Laugh, color: "#E0A800", label: "Haha" },
  wow: { icon: Ghost, color: "#A560E8", label: "Wow" },
  rocket: { icon: Rocket, color: "#FF4B4B", label: "Boost" },
  target: { icon: Target, color: "#58CC02", label: "Bullseye" },
  heart: { icon: Heart, color: "#FF4B6E", label: "Love" },
  star: { icon: Star, color: "#FFC800", label: "Star" },
};

export interface Floater {
  key: string;
  reaction: string;
  fromOpponent: boolean;
}

export function useMatchSocial(roomCode: string | null, token: string | null, mySlot: 1 | 2) {
  const [messages, setMessages] = useState<MatchChatMessage[]>([]);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [unread, setUnread] = useState(0);
  const chatCursor = useRef(0);
  const reactCursor = useRef(0);
  const panelOpenRef = useRef(false);
  const firstLoad = useRef(true);

  const pushFloater = useCallback((reaction: string, fromOpponent: boolean, idSeed: string | number) => {
    const key = `${idSeed}-${Date.now()}`;
    setFloaters((f) => [...f.slice(-5), { key, reaction, fromOpponent }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 2300);
  }, []);

  useEffect(() => {
    if (!roomCode || !token) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(
          `/api/match-chat?roomCode=${roomCode}&sinceChat=${chatCursor.current}&sinceReact=${reactCursor.current}`
        );
        if (!res.ok || !alive) return;
        const data = await res.json();
        const msgs: MatchChatMessage[] = data.messages || [];
        const reacts: MatchReaction[] = data.reactions || [];
        if (msgs.length) {
          chatCursor.current = Math.max(...msgs.map((m) => m.id));
          setMessages((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...msgs.filter((m) => !seen.has(m.id))].slice(-120);
          });
          const fromOpp = msgs.filter((m) => m.senderSlot !== mySlot).length;
          if (fromOpp > 0 && !firstLoad.current) {
            if (!panelOpenRef.current) setUnread((u) => u + fromOpp);
            soundEngine.playTap(980);
          }
        }
        if (reacts.length) {
          reactCursor.current = Math.max(...reacts.map((r) => r.id));
          if (!firstLoad.current) {
            for (const r of reacts) pushFloater(r.reaction, r.senderSlot !== mySlot, r.id);
          }
        }
        firstLoad.current = false;
      } catch {}
    };
    load();
    const t = setInterval(load, 1600);
    return () => { alive = false; clearInterval(t); };
  }, [roomCode, token, mySlot, pushFloater]);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    if (!roomCode || !token) return;
    try {
      await fetch("/api/match-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, token, ...payload }),
      });
    } catch {}
  }, [roomCode, token]);

  const sendMessage = useCallback(async (content: string) => {
    const text = content.trim();
    if (!text) return;
    // optimistic
    setMessages((prev) => [...prev, { id: -Date.now(), senderSlot: mySlot, senderName: "You", content: text, createdAt: new Date().toISOString() }]);
    soundEngine.playTap(720);
    await post({ action: "message", content: text });
  }, [post, mySlot]);

  const sendPhrase = useCallback(async (phrase: string) => {
    setMessages((prev) => [...prev, { id: -Date.now(), senderSlot: mySlot, senderName: "You", content: phrase, createdAt: new Date().toISOString() }]);
    soundEngine.playTap(720);
    await post({ action: "phrase", phrase });
  }, [post, mySlot]);

  const sendReaction = useCallback(async (reaction: string) => {
    pushFloater(reaction, false, `me-${Math.random()}`);
    soundEngine.playTap(840);
    await post({ action: "reaction", reaction });
  }, [post, pushFloater]);

  const markRead = useCallback((open: boolean) => {
    panelOpenRef.current = open;
    if (open) setUnread(0);
  }, []);

  return { messages, floaters, unread, sendMessage, sendPhrase, sendReaction, markRead, pushFloater };
}

/* ------------------------------- chat panel ------------------------------ */

export function MatchChatPanel({
  open,
  onClose,
  opponentName,
  mySlot,
  messages,
  onSend,
  onPhrase,
}: {
  open: boolean;
  onClose: () => void;
  opponentName: string;
  mySlot: 1 | 2;
  messages: MatchChatMessage[];
  onSend: (text: string) => void;
  onPhrase: (phrase: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }, [open, messages.length]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <div className="relative w-full sm:max-w-md card-game rounded-b-none sm:rounded-b-[1.4rem] flex flex-col animate-slide-up max-h-[82dvh] sm:max-h-[76dvh]">
        <div className="flex items-center gap-2 px-4 py-3 border-b-2" style={{ borderColor: "var(--border)" }}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: "var(--blue)" }}>
            <MessageCircle size={19} strokeWidth={2.6} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="font-display font-semibold leading-none truncate">Chat with {opponentName}</p>
            <p className="text-[11px] font-bold" style={{ color: "var(--ink-faint)" }}>Private — only you two can see this</p>
          </div>
          <button onClick={onClose} className="btn-game btn-ghost w-9 h-9 !rounded-xl flex items-center justify-center" aria-label="Close chat">
            <X size={18} strokeWidth={2.8} />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto pretty-scroll px-3 py-3 space-y-2 min-h-[180px]">
          {messages.length === 0 && (
            <p className="text-center text-sm font-bold py-8" style={{ color: "var(--ink-faint)" }}>
              No messages yet. Say hi or send a quick phrase!
            </p>
          )}
          {messages.map((m) => {
            const mine = m.senderSlot === mySlot;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[78%] px-3 py-2 rounded-2xl text-sm font-bold leading-snug animate-pop"
                  style={
                    mine
                      ? { background: "var(--brand)", color: "#fff", borderBottomRightRadius: 6 }
                      : { background: "var(--surface-3)", color: "var(--ink)", borderBottomLeftRadius: 6 }
                  }
                >
                  {m.content}
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-3 pb-1 flex gap-1.5 overflow-x-auto no-scrollbar">
          {QUICK_PHRASES.map((p) => (
            <button
              key={p}
              onClick={() => onPhrase(p)}
              className="chip whitespace-nowrap px-2.5 py-1.5 text-[11px] font-extrabold active:scale-95 transition"
            >
              {p}
            </button>
          ))}
        </div>

        <form
          className="p-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSend(draft);
            setDraft("");
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={220}
            placeholder="Type a message..."
            className="input-game flex-1 px-3 py-2.5 font-bold text-sm"
          />
          <button type="submit" className="btn-game btn-blue px-4 flex items-center gap-1.5" aria-label="Send message">
            <Send size={17} strokeWidth={2.6} />
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---------------------------- reactions bar ------------------------------ */

export function ReactionsBar({ onReact, compact = false }: { onReact: (id: string) => void; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {Object.entries(REACTION_META).map(([id, meta]) => {
        const Icon = meta.icon;
        return (
          <button
            key={id}
            onClick={() => onReact(id)}
            title={meta.label}
            aria-label={`Send ${meta.label} reaction`}
            className={`rounded-full flex items-center justify-center border-2 active:scale-90 transition-transform ${compact ? "w-8 h-8" : "w-9 h-9"}`}
            style={{ background: "var(--board-key, var(--surface))", borderColor: "var(--board-border, var(--border))", color: meta.color }}
          >
            <Icon size={compact ? 15 : 17} strokeWidth={2.6} fill={id === "heart" || id === "star" ? meta.color : "none"} />
          </button>
        );
      })}
    </div>
  );
}

export function ReactionFloaters({ floaters, side }: { floaters: Floater[]; side: "mine" | "opp" }) {
  const list = floaters.filter((f) => (side === "opp" ? f.fromOpponent : !f.fromOpponent));
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-2 flex justify-center gap-2 z-20">
      {list.map((f) => {
        const meta = REACTION_META[f.reaction];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <span
            key={f.key}
            className="animate-reaction w-10 h-10 rounded-full flex items-center justify-center bg-white shadow-lg border-2"
            style={{ color: meta.color, borderColor: meta.color }}
          >
            <Icon size={20} strokeWidth={2.6} fill={f.reaction === "heart" || f.reaction === "star" ? meta.color : "none"} />
          </span>
        );
      })}
    </div>
  );
}
