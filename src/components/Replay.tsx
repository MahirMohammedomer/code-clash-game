"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Pause, Play, RotateCcw, X } from "lucide-react";
import { CharacterAvatar, SpeechBubble } from "./Character";
import { GuessRow } from "./GameBoard";
import { AI_BOTS, analyzeGuesses } from "@/lib/game-engine";
import { soundEngine } from "@/lib/sound-effects";
import type { HistoryEntry, Player } from "@/lib/types";

/**
 * Match replay — step through every guess of a finished match while
 * Professor Hoot gives coach notes on YOUR play.
 */
export default function Replay({ entry, me, onClose }: { entry: HistoryEntry; me: Player; onClose: () => void }) {
  const total = entry.guesses.length;
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [showSecrets, setShowSecrets] = useState(false);

  const mySlot: 1 | 2 = useMemo(() => {
    const first = entry.guesses.find((g) => g.playerName === entry.myName);
    return first ? (first.playerSlot as 1 | 2) : 1;
  }, [entry]);

  const isRace = entry.mode === "race" || entry.mode === "online_race";
  const shown = entry.guesses.slice(0, step);
  const mineShown = shown.filter((g) => g.playerSlot === mySlot);
  const oppShown = shown.filter((g) => g.playerSlot !== mySlot);
  const atEnd = step >= total;

  const coach = useMemo(
    () =>
      analyzeGuesses(
        entry.guesses
          .filter((g) => g.playerSlot === mySlot && !g.isTimeout)
          .map((g) => ({ guess: g.guess, points: g.points, orders: g.orders }))
      ),
    [entry, mySlot]
  );
  const currentNote = useMemo(() => {
    const myCount = entry.guesses.slice(0, step).filter((g) => g.playerSlot === mySlot && !g.isTimeout).length;
    const visible = coach.notes.filter((n) => n.guessIndex < myCount);
    return visible.length ? visible[visible.length - 1] : null;
  }, [coach, entry, step, mySlot]);

  useEffect(() => {
    if (!playing) return;
    if (step >= total) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => {
      setStep((s) => Math.min(total, s + 1));
      soundEngine.playTap(320);
    }, 1150);
    return () => clearTimeout(t);
  }, [playing, step, total]);

  const moodFor = (isMine: boolean) => {
    if (!atEnd) return "idle" as const;
    if (entry.result === "draw") return "happy" as const;
    const iWon = entry.result === "win";
    return isMine ? (iWon ? ("win" as const) : ("lose" as const)) : iWon ? ("lose" as const) : ("win" as const);
  };

  const resultLabel = entry.result === "win" ? "🏆 Victory" : entry.result === "draw" ? "🤝 Draw" : "💀 Defeat";

  return (
    <div className="fixed inset-0 z-[72] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/55 animate-fade" onClick={onClose} />
      <div className="relative card-game w-full sm:max-w-2xl max-h-[94dvh] overflow-y-auto pretty-scroll rounded-b-none sm:rounded-b-[1.4rem] animate-slide-up">
        {/* header */}
        <div className="board-theme p-4 rounded-t-[1.4rem]" data-board={me.themeId}>
          <button onClick={onClose} className="btn-game w-9 h-9 !rounded-xl flex items-center justify-center float-right"
            style={{ background: "var(--board-key)", color: "var(--board-ink)", border: "2px solid var(--board-border)", boxShadow: "0 3px 0 var(--board-border)" }} aria-label="Close replay">
            <X size={17} strokeWidth={2.8} />
          </button>
          <div className="flex items-center gap-3 clear-both">
            <CharacterAvatar config={entry.myAvatar} frameId={me.frameId} size={58} ringWidth={3} mood={moodFor(true)} />
            <div className="flex-1 min-w-0" style={{ color: "var(--board-ink)" }}>
              <p className="font-display font-bold leading-tight truncate">{resultLabel} vs {entry.oppName}</p>
              <p className="text-[11px] font-black" style={{ color: "var(--board-soft)" }}>
                {new Date(entry.createdAt).toLocaleString()} · {total} guesses total
              </p>
            </div>
            <CharacterAvatar config={entry.oppAvatar} frameId="frame_neon" size={58} ringWidth={3} mood={moodFor(false)} />
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* coach */}
          <div className="flex items-start gap-3">
            <CharacterAvatar config={AI_BOTS.Mastermind.avatar} frameId={AI_BOTS.Mastermind.frameId} size={56} ringWidth={3} mood={currentNote ? "think" : "idle"} />
            <div className="flex-1 min-w-0">
              {currentNote ? (
                <SpeechBubble text={currentNote.text} side="right" />
              ) : atEnd ? (
                <SpeechBubble text={`Full report: ${coach.grade}`} side="right" />
              ) : (
                <SpeechBubble text="Let us review your detective work, step by step... 🦉" side="right" />
              )}
              <p className="text-[10px] font-black mt-1" style={{ color: "var(--ink-faint)" }}>PROFESSOR Hoot · COACH MODE</p>
            </div>
          </div>

          {/* boards */}
          <div className="board-theme rounded-2xl border-2 p-3 grid sm:grid-cols-2 gap-3" data-board={me.themeId} style={{ borderColor: "var(--board-border)" }}>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--board-soft)" }}>Your guesses</p>
              <div className="space-y-1.5">
                {mineShown.length === 0 && <p className="text-sm font-bold py-2 text-center" style={{ color: "var(--board-soft)" }}>—</p>}
                {mineShown.map((g, i) => <GuessRow key={g.id} g={g} highlight={i === mineShown.length - 1 && !atEnd} />)}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--board-soft)" }}>
                {entry.oppName}&rsquo;s guesses {isRace && !atEnd ? "(hidden in race)" : ""}
              </p>
              <div className="space-y-1.5">
                {oppShown.length === 0 && <p className="text-sm font-bold py-2 text-center" style={{ color: "var(--board-soft)" }}>—</p>}
                {oppShown.map((g, i) => (
                  <GuessRow key={g.id} g={isRace && !atEnd ? { ...g, guess: "????" } : g} highlight={i === oppShown.length - 1 && !atEnd} />
                ))}
              </div>
            </div>
          </div>

          {/* controls */}
          <div className="flex items-center gap-2">
            <button onClick={() => { setStep(0); setPlaying(false); }} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Restart replay">
              <RotateCcw size={17} strokeWidth={2.7} />
            </button>
            <button onClick={() => { setPlaying(false); setStep((s) => Math.max(0, s - 1)); }} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Previous guess">
              <ChevronLeft size={19} strokeWidth={2.8} />
            </button>
            <button onClick={() => { if (atEnd) setStep(0); setPlaying((p) => !p); }} className="btn-game btn-green flex-1 py-2.5 flex items-center justify-center gap-2">
              {playing ? <Pause size={18} strokeWidth={2.8} /> : <Play size={18} strokeWidth={2.8} />}
              {playing ? "Pause" : atEnd ? "Replay" : "Play"}
            </button>
            <button onClick={() => { setPlaying(false); setStep((s) => Math.min(total, s + 1)); }} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Next guess">
              <ChevronRight size={19} strokeWidth={2.8} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input type="range" min={0} max={total} value={step}
              onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
              className="flex-1 accent-[#58CC02]" aria-label="Replay position" />
            <span className="text-[11px] font-black whitespace-nowrap" style={{ color: "var(--ink-faint)" }}>Guess {step}/{total}</span>
          </div>

          {/* secrets */}
          <button onClick={() => setShowSecrets((v) => !v)} className="btn-game btn-ghost w-full py-2.5 flex items-center justify-center gap-2 text-sm">
            {showSecrets || atEnd ? <EyeOff size={16} /> : <Eye size={16} />}
            {showSecrets || atEnd ? "Hide the codes" : "Reveal the codes"}
          </button>
          {(showSecrets || atEnd) && (
            <div className="grid grid-cols-2 gap-2 animate-pop">
              <div className="rounded-2xl p-3 text-center" style={{ background: "var(--surface-3)", border: "2px solid var(--border)" }}>
                <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>Your code</p>
                <p className="font-display font-bold text-2xl tracking-[0.25em]">{entry.mySecret || "????"}</p>
              </div>
              <div className="rounded-2xl p-3 text-center" style={{ background: "var(--surface-3)", border: "2px solid var(--border)" }}>
                <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "var(--ink-faint)" }}>{entry.oppName}&rsquo;s code</p>
                <p className="font-display font-bold text-2xl tracking-[0.25em]">{entry.oppSecret || "????"}</p>
              </div>
            </div>
          )}

          {/* final coach report */}
          {atEnd && (
            <div className="rounded-2xl p-3.5 animate-rise" style={{ background: "rgba(165,96,232,0.10)", border: "2px solid rgba(165,96,232,0.45)" }}>
              <p className="font-display font-semibold">🦉 Coach report</p>
              <p className="font-black text-sm mt-0.5">{coach.grade}</p>
              {coach.notes.length === 0 ? (
                <p className="text-xs font-bold mt-1" style={{ color: "var(--ink-soft)" }}>No mistakes spotted — every guess used your clues well. Textbook play! 📚</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {coach.notes.map((n, i) => (
                    <li key={i} className="text-xs font-bold flex gap-1.5" style={{ color: "var(--ink-soft)" }}>
                      <span>{n.kind === "great" ? "⭐" : n.kind === "missedWin" ? "🎯" : n.kind === "wasted" ? "⚠️" : "💡"}</span>
                      <span>{n.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
