"use client";

import { useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: number;
  senderId: number;
  senderName: string;
  senderAvatar: string;
  receiverId: number | null;
  content: string;
  createdAt: string;
}

interface ChatPanelProps {
  playerId: number | null;
  playerName?: string;
}

export default function ChatPanel({ playerId }: ChatPanelProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadMessages = async () => {
    try {
      const res = await fetch(`/api/chat?limit=40${playerId ? `&playerId=${playerId}` : ""}`);
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (!open) return;
    loadMessages();
    const interval = setInterval(loadMessages, 4000);
    return () => clearInterval(interval);
  }, [open, playerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    if (!playerId || !text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, content: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send");
        return;
      }
      setText("");
      await loadMessages();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-2xl shadow-lg transition hover:scale-105 hover:bg-emerald-400"
        title="Chat"
      >
        💬
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-36 right-4 z-50 flex h-96 w-80 flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-slate-900/95 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between bg-emerald-600/90 px-4 py-3">
            <span className="font-bold text-white">Global Chat</span>
            <button
              onClick={() => setOpen(false)}
              className="text-white/80 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {messages.length === 0 && (
              <p className="text-center text-sm text-slate-400">
                No messages yet. Say hi! 👋
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex gap-2 ${
                  m.senderId === playerId ? "flex-row-reverse" : ""
                }`}
              >
                <span className="text-xl">{m.senderAvatar}</span>
                <div
                  className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                    m.senderId === playerId
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-700 text-slate-100"
                  }`}
                >
                  <div className="mb-0.5 text-xs opacity-70">{m.senderName}</div>
                  <div>{m.content}</div>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {error && (
            <div className="px-3 text-xs text-red-400">{error}</div>
          )}

          <div className="flex gap-2 border-t border-slate-700 p-3">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={playerId ? "Type a message..." : "Login to chat"}
              disabled={!playerId || loading}
              maxLength={300}
              className="flex-1 rounded-xl bg-slate-800 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500"
            />
            <button
              onClick={send}
              disabled={!playerId || loading || !text.trim()}
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}
