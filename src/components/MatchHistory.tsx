"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Play } from "lucide-react";
import { CharacterAvatar } from "./Character";
import Replay from "./Replay";
import { loadLocalHistory } from "@/lib/history";
import type { HistoryEntry, Player } from "@/lib/types";

const MODE_LABELS: Record<string, string> = {
  ai: "🤖 Vs Bot",
  online_1v1: "🌐 Online duel",
  online_race: "🏁 Online race",
  race: "🏁 Bot race",
  hotseat: "👥 2 Players",
  peer: "📶 Local WiFi",
  daily_code: "🧩 Daily Code",
  tournament: "🏆 Tournament",
};

export default function MatchHistory({
  me,
  token,
  onBack,
}: {
  me: Player;
  token: string | null;
  onBack: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>(() => loadLocalHistory());
  const [loading, setLoading] = useState(Boolean(token));
  const [selected, setSelected] = useState<HistoryEntry | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list_history", token }),
        });
        const data = await res.json();
        if (!alive) return;
        const server: HistoryEntry[] = Array.isArray(data.history) ? data.history : [];
        const local = loadLocalHistory();
        const seen = new Set(server.map((e) => e.historyId));
        const merged = [...server, ...local.filter((e) => !seen.has(e.historyId))]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 30);
        setEntries(merged);
      } catch {}
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]);

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 pb-16 animate-fade">
      <div className="flex items-center gap-2 py-3 sticky top-0 z-20" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)" }}>
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <h2 className="font-display font-bold text-2xl flex-1">Match Replays ▶️</h2>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-14">
          <Loader2 className="animate-spin" size={28} />
          <p className="font-black text-sm" style={{ color: "var(--ink-soft)" }}>Loading your matches...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="card-game p-8 text-center animate-pop">
          <p className="text-4xl mb-2">🎬</p>
          <p className="font-bold text-sm" style={{ color: "var(--ink-soft)" }}>
            No replays yet — finish a match and it will appear here, ready to re-watch with coach tips!
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e) => (
            <div key={e.historyId} className="card-game px-3 py-2 flex items-center gap-2.5 animate-rise">
              <span className="text-2xl leading-none w-8 text-center">{e.result === "win" ? "🏆" : e.result === "draw" ? "🤝" : "💀"}</span>
              <CharacterAvatar config={e.oppAvatar} frameId="frame_emerald" size={42} ringWidth={3} />
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm truncate">vs {e.oppName}</p>
                <p className="text-[11px] font-bold" style={{ color: "var(--ink-faint)" }}>
                  {MODE_LABELS[e.mode] || e.mode} · {e.turnsTaken} turns · {new Date(e.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(e.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <button onClick={() => setSelected(e)} className="btn-game btn-blue px-3 py-2 text-xs flex items-center gap-1 shrink-0">
                <Play size={14} strokeWidth={2.8} /> Watch
              </button>
            </div>
          ))}
        </div>
      )}

      {selected && <Replay entry={selected} me={me} onClose={() => setSelected(null)} />}
    </div>
  );
}
