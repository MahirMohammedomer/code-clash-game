"use client";

import { useEffect, useRef, useState } from "react";

const REACTIONS = ["👍", "🔥", "😱", "😂", "💪", "🎯", "😤", "👀"];

interface Msg {
  id: number;
  senderId: number;
  senderName: string;
  senderAvatar: string;
  content: string;
  createdAt: string;
}

interface Reaction {
  id: number;
  senderName: string;
  emoji: string;
  createdAt: string;
}

interface Props {
  roomCode: string;
  playerId: number | null;
  playerName: string;
  opponentId: number | null;
  opponentName: string;
}

export default function MatchSideChat({
  roomCode,
  playerId,
  playerName,
  opponentId,
  opponentName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [text, setText] = useState("");
  const [flying, setFlying] = useState<{ id: number; emoji: string }[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!roomCode) return;
    try {
      const q = new URLSearchParams({
        roomCode,
        playerId: String(playerId || ""),
        opponentId: String(opponentId || ""),
      });
      const res = await fetch(`/api/match-chat?${q}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
      setReactions(data.reactions || []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [roomCode, playerId, opponentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMsg = async () => {
    if (!text.trim() || !playerId) return;
    const body = {
      action: "message",
      roomCode,
      playerId,
      playerName,
      opponentId,
      content: text,
    };
    setText("");
    await fetch("/api/match-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    load();
  };

  const sendReaction = async (emoji: string) => {
    const tempId = Date.now();
    setFlying((f) => [...f, { id: tempId, emoji }]);
    setTimeout(() => {
      setFlying((f) => f.filter((x) => x.id !== tempId));
    }, 1200);

    await fetch("/api/match-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "react",
        roomCode,
        playerId,
        playerName,
        emoji,
      }),
    });
    load();
  };

  return (
    <>
      {/* Flying reactions overlay */}
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        {flying.map((f) => (
          <div
            key={f.id}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 animate-bounce text-4xl"
            style={{ animationDuration: "1s" }}
          >
            {f.emoji}
          </div>
        ))}
      </div>

      {/* Reaction bar — always visible during match */}
      <div className="flex flex-wrap justify-center gap-1.5 px-2 py-1">
        {REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => sendReaction(e)}
            className="rounded-full bg-slate-800/80 px-2.5 py-1 text-lg transition hover:scale-125 hover:bg-slate-700 active:scale-95"
            title="React"
          >
            {e}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-full bg-emerald-600/90 px-3 py-1 text-sm font-semibold text-white"
        >
          💬 Chat
        </button>
      </div>

      {open && (
        <div className="mx-auto mb-2 flex h-56 w-full max-w-md flex-col overflow-hidden rounded-2xl border border-emerald-500/20 bg-slate-900/95 shadow-xl">
          <div className="flex items-center justify-between bg-emerald-700/80 px-3 py-2 text-sm font-bold text-white">
            <span>vs {opponentName || "Opponent"}</span>
            <button type="button" onClick={() => setOpen(false)} className="opacity-80">
              ✕
            </button>
          </div>
          <div className="flex-1 space-y-1.5 overflow-y-auto p-2 text-sm">
            {messages.length === 0 && (
              <p className="py-4 text-center text-xs text-slate-500">
                Say something sportsmanlike 👋
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-1.5 ${m.senderId === playerId ? "flex-row-reverse" : ""}`}
              >
                <span>{m.senderAvatar}</span>
                <div
                  className={`max-w-[75%] rounded-2xl px-2.5 py-1 ${
                    m.senderId === playerId
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-700 text-slate-100"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
          <div className="flex gap-1 border-t border-slate-700 p-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMsg()}
              placeholder={playerId ? "Message..." : "Login to chat"}
              disabled={!playerId}
              maxLength={200}
              className="min-w-0 flex-1 rounded-xl bg-slate-800 px-3 py-1.5 text-sm text-white outline-none"
            />
            <button
              type="button"
              onClick={sendMsg}
              disabled={!playerId || !text.trim()}
              className="rounded-xl bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
