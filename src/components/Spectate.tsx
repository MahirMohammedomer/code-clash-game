"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Crown, Eye } from "lucide-react";
import { CharacterAvatar } from "./Character";
import { GuessRow, HeaderBar, Stage } from "./GameBoard";
import { ReactionsBar, type Floater } from "./MatchChat";
import type { BotMood } from "@/lib/game-engine";
import type { MatchView, Player } from "@/lib/types";

/**
 * Spectator mode — watch a live online match (secrets stay hidden until the
 * end) and throw crowd reactions that both players see floating in.
 */
export default function Spectate({
  roomCode,
  me,
  onExit,
  showToast,
}: {
  roomCode: string;
  me: Player;
  onExit: () => void;
  showToast: (m: string, k?: "ok" | "err") => void;
}) {
  const [match, setMatch] = useState<MatchView | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [gone, setGone] = useState(false);
  const reactCursor = useRef(0);
  const versionRef = useRef(0);
  const firstReactLoad = useRef(true);

  const pushFloater = useCallback((reaction: string, fromOpponent: boolean) => {
    const key = `${Date.now()}-${Math.random()}`;
    setFloaters((f) => [...f.slice(-5), { key, reaction, fromOpponent }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 2300);
  }, []);

  /* match polling */
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/matches?roomCode=${roomCode}&v=${versionRef.current}`);
        if (!alive) return;
        const data = await res.json().catch(() => ({}));
        if (data.match && !data.match.unchanged && data.match.guesses) {
          versionRef.current = data.match.version;
          setMatch(data.match);
        } else if (!data.match) {
          setGone(true);
        }
      } catch {}
      if (alive) timer = setTimeout(poll, 1200);
    };
    poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [roomCode]);

  /* reactions feed (spectators see reactions, not private chat) */
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/match-chat?roomCode=${roomCode}&sinceReact=${reactCursor.current}`);
        if (!res.ok || !alive) return;
        const data = await res.json();
        const reacts = (data.reactions || []) as { id: number; senderSlot: number; reaction: string }[];
        if (reacts.length) {
          reactCursor.current = Math.max(...reacts.map((r) => r.id));
          if (!firstReactLoad.current) {
            for (const r of reacts) pushFloater(r.reaction, r.senderSlot !== 1);
          }
        }
        firstReactLoad.current = false;
      } catch {}
    };
    load();
    const t = setInterval(load, 1600);
    return () => { alive = false; clearInterval(t); };
  }, [roomCode, pushFloater]);

  const sendReaction = async (reaction: string) => {
    pushFloater(reaction, Math.random() < 0.5);
    try {
      await fetch("/api/match-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomCode, action: "reaction", reaction, spectator: true, name: me.username }),
      });
    } catch {}
  };

  const g1 = match?.guesses.filter((g) => g.playerSlot === 1) || [];
  const g2 = match?.guesses.filter((g) => g.playerSlot === 2) || [];
  const finished = match?.status === "finished";
  const isRace = match?.mode === "online_race";
  const best = (list: typeof g1) => list.reduce((mx, g) => Math.max(mx, g.orders), 0);
  const moodFor = (slot: 1 | 2): BotMood => {
    if (!match) return "idle";
    if (finished) return match.winnerSlot === slot ? "win" : match.winnerSlot == null ? "happy" : "lose";
    return match.currentTurn === slot && !isRace ? "think" : "idle";
  };

  return (
    <div className="board-theme min-h-[100dvh] flex flex-col" data-board={me.themeId}>
      <HeaderBar
        onBack={onExit}
        backTitle="Stop watching"
        left={
          <Stage name={match?.player1Name || "Player 1"} title={match?.player1Division || ""} config={match?.player1Avatar || me.avatarConfig}
            frameId={match?.player1Frame || "frame_emerald"} mood={moodFor(1)}
            isTurn={Boolean(match && !finished && match.currentTurn === 1 && !isRace)}
            scoreLabel={`${g1.length} guesses · best ${best(g1)}/4`} floaters={floaters} align="left" />
        }
        center={
          <div className="w-[68px] h-[68px] rounded-full flex flex-col items-center justify-center border-[3px]"
            style={{ background: "var(--board-panel)", borderColor: "var(--board-border)", color: "var(--board-ink)" }}>
            <Eye size={20} />
            <span className="text-[8px] font-black tracking-widest mt-0.5">WATCHING</span>
          </div>
        }
        right={
          <Stage name={match?.player2Name || "Player 2"} title={match?.player2Division || ""} config={match?.player2Avatar || me.avatarConfig}
            frameId={match?.player2Frame || "frame_emerald"} mood={moodFor(2)}
            isTurn={Boolean(match && !finished && match.currentTurn === 2 && !isRace)}
            scoreLabel={`${g2.length} guesses · best ${best(g2)}/4`} floaters={floaters} align="right" />
        }
      />

      <div className="max-w-5xl w-full mx-auto px-3 sm:px-5 mt-2">
        <div className="rounded-2xl px-4 py-2 text-center font-display font-semibold text-sm sm:text-base"
          style={{ background: "var(--board-panel)", color: "var(--board-ink)", border: "2px solid var(--board-border)" }}>
          {gone && "This match is no longer available."}
          {!gone && !match && "Connecting to the match..."}
          {!gone && match && match.status === "waiting" && "Waiting for the rival to join..."}
          {!gone && match && match.status === "setup" && "Both players are hiding their codes..."}
          {!gone && match && match.status === "playing" && (isRace ? "🏁 Race in progress — first to crack it wins!" : `${match.currentTurn === 1 ? match.player1Name : match.player2Name} is guessing...`)}
          {!gone && finished && (match?.winnerSlot ? `🏆 ${match.winnerName} wins!` : "🤝 It's a draw!")}
          {!gone && match?.status === "abandoned" && "This match was closed."}
        </div>
      </div>

      <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-5 py-3 grid sm:grid-cols-2 gap-3 content-start overflow-y-auto pretty-scroll">
        <div className="rounded-2xl p-3" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
          <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--board-soft)" }}>
            {match?.player1Name || "Player 1"}&rsquo;s guesses
          </p>
          <div className="space-y-1.5">
            {g1.length === 0 && <p className="text-sm font-bold py-3 text-center" style={{ color: "var(--board-soft)" }}>No guesses yet</p>}
            {g1.map((g, i) => <GuessRow key={g.id} g={g} highlight={i === g1.length - 1} />)}
          </div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
          <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--board-soft)" }}>
            {match?.player2Name || "Player 2"}&rsquo;s guesses
          </p>
          <div className="space-y-1.5">
            {g2.length === 0 && <p className="text-sm font-bold py-3 text-center" style={{ color: "var(--board-soft)" }}>No guesses yet</p>}
            {g2.map((g, i) => <GuessRow key={g.id} g={g} highlight={i === g2.length - 1} />)}
          </div>
        </div>

        {finished && match && (
          <div className="sm:col-span-2 card-game p-4 flex flex-col sm:flex-row items-center gap-3 animate-pop">
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: "var(--gold)", color: "#5c4200" }}>
              <Crown size={24} strokeWidth={2.5} />
            </span>
            <div className="flex-1 text-center sm:text-left">
              <p className="font-display font-semibold">
                {match.winnerSlot ? `${match.winnerName} takes the crown!` : "A perfect tie!"}
              </p>
              <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>
                {isRace
                  ? `The race code was ${match.raceCode || "????"}`
                  : `${match.player1Name}'s code: ${match.secret1 || "????"} · ${match.player2Name}'s code: ${match.secret2 || "????"}`}
              </p>
            </div>
            <CharacterAvatar
              config={match.winnerSlot === 2 ? match.player2Avatar : match.player1Avatar}
              frameId={match.winnerSlot === 2 ? match.player2Frame || "frame_emerald" : match.player1Frame || "frame_emerald"}
              mood="win" size={64} ringWidth={4}
            />
          </div>
        )}
      </div>

      <div className="sticky bottom-0 z-30 px-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
        style={{ background: "color-mix(in srgb, var(--board-panel) 92%, transparent)", backdropFilter: "blur(10px)", borderTop: "2px solid var(--board-border)" }}>
        <div className="max-w-xl mx-auto flex flex-col items-center gap-1.5">
          <ReactionsBar onReact={sendReaction} compact />
          <p className="text-[11px] font-bold" style={{ color: "var(--board-soft)" }}>
            👁 You&rsquo;re spectating as {me.username} — your reactions appear for both players! Secrets stay hidden until the end.
          </p>
        </div>
      </div>
    </div>
  );
}
