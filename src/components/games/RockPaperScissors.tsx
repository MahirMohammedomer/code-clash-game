"use client";

/**
 * Rock Paper Scissors — original from-scratch take on the timeless duel.
 * First to 5 round-wins takes the match. The Clever CPU studies your
 * throw history and adapts — can you stay unpredictable?
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type ThrowT = "rock" | "paper" | "scissors";
type Diff = "chill" | "clever";
type RoundPhase = "pick" | "shake" | "reveal";

const THROWS: ThrowT[] = ["rock", "paper", "scissors"];
const EMOJI: Record<ThrowT, string> = { rock: "✊", paper: "✋", scissors: "✌️" };
const LABEL: Record<ThrowT, string> = { rock: "Rock", paper: "Paper", scissors: "Scissors" };
const BEATS: Record<ThrowT, ThrowT> = { rock: "scissors", paper: "rock", scissors: "paper" };
const LOSES_TO: Record<ThrowT, ThrowT> = { rock: "paper", paper: "scissors", scissors: "rock" };
const MATCH_TARGET = 5;

function judge(a: ThrowT, b: ThrowT): "win" | "lose" | "draw" {
  if (a === b) return "draw";
  return BEATS[a] === b ? "win" : "lose";
}

/** Pick a CPU throw. Clever mode predicts the player's next throw from
 *  frequency + last-throw transition tendencies, then counters it. */
function cpuPick(history: ThrowT[], diff: Diff): ThrowT {
  if (diff === "chill" || history.length < 3) {
    return THROWS[Math.floor(Math.random() * 3)];
  }
  const last = history[history.length - 1];
  const scores: Record<ThrowT, number> = { rock: 0, paper: 0, scissors: 0 };
  // overall frequency
  for (const h of history) scores[h] += 1;
  // what did the player throw right after `last` in the past?
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i] === last) scores[history[i + 1]] += 2.2;
  }
  // players rarely throw the same thing 3+ times — slight repeat discount
  scores[last] *= 0.92;
  const predicted = THROWS.reduce((best, t) => (scores[t] > scores[best] ? t : best), "rock" as ThrowT);
  // mostly counter the prediction, sometimes mix it up to stay human
  return Math.random() < 0.78 ? LOSES_TO[predicted] : THROWS[Math.floor(Math.random() * 3)];
}

export default function RockPaperScissors({ onBack }: { onBack: () => void }) {
  const [diff, setDiff] = useState<Diff>("clever");
  const [phase, setPhase] = useState<RoundPhase>("pick");
  const [playerThrow, setPlayerThrow] = useState<ThrowT | null>(null);
  const [cpuThrow, setCpuThrow] = useState<ThrowT | null>(null);
  const [result, setResult] = useState<"win" | "lose" | "draw" | null>(null);
  const [wins, setWins] = useState(0);
  const [losses, setLosses] = useState(0);
  const [roundStreak, setRoundStreak] = useState(0);
  const [matchStreak, setMatchStreak] = useState(0);
  const [best, setBest] = useState(() => getBest("rps"));
  const [showCard, setShowCard] = useState(false);
  const [matchWon, setMatchWon] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [matchesPlayed, setMatchesPlayed] = useState(0);

  const historyRef = useRef<ThrowT[]>([]);
  const busyRef = useRef(false);
  const winsRef = useRef(0);
  const lossesRef = useRef(0);
  const streakRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    bumpPlays("rps");
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const newMatch = useCallback(() => {
    winsRef.current = 0;
    lossesRef.current = 0;
    setWins(0);
    setLosses(0);
    setRoundStreak(0);
    setPlayerThrow(null);
    setCpuThrow(null);
    setResult(null);
    setPhase("pick");
    setShowCard(false);
    busyRef.current = false;
  }, []);

  const restart = useCallback(() => {
    historyRef.current = [];
    streakRef.current = 0;
    setMatchStreak(0);
    newMatch();
  }, [newMatch]);

  const finishMatch = useCallback((won: boolean) => {
    setMatchesPlayed((m) => m + 1);
    setMatchWon(won);
    if (won) {
      streakRef.current++;
      setMatchStreak(streakRef.current);
      const res = submitScore("rps", streakRef.current);
      setBest(res.best);
      setIsNewBest(res.isNewBest && streakRef.current > 1);
      sfx.win();
    } else {
      streakRef.current = 0;
      setMatchStreak(0);
      setIsNewBest(false);
      sfx.gameover();
    }
    setTimeout(() => mountedRef.current && setShowCard(true), 900);
  }, []);

  const play = useCallback((t: ThrowT) => {
    if (busyRef.current || phase !== "pick") return;
    busyRef.current = true;
    const cpu = cpuPick(historyRef.current, diff);
    historyRef.current = [...historyRef.current.slice(-29), t];
    setPlayerThrow(t);
    setCpuThrow(null);
    setResult(null);
    setPhase("shake");
    sfx.pop(0.9);

    setTimeout(() => {
      if (!mountedRef.current) return;
      setCpuThrow(cpu);
      const res = judge(t, cpu);
      setResult(res);
      setPhase("reveal");
      if (res === "win") {
        winsRef.current++;
        setWins(winsRef.current);
        setRoundStreak((s) => s + 1);
        sfx.score();
      } else if (res === "lose") {
        lossesRef.current++;
        setLosses(lossesRef.current);
        setRoundStreak(0);
        sfx.hit();
      } else {
        sfx.click();
      }

      setTimeout(() => {
        if (!mountedRef.current) return;
        busyRef.current = false;
        if (winsRef.current >= MATCH_TARGET) finishMatch(true);
        else if (lossesRef.current >= MATCH_TARGET) finishMatch(false);
        else {
          setPhase("pick");
          setPlayerThrow(null);
          setCpuThrow(null);
          setResult(null);
        }
      }, 1050);
    }, 620);
  }, [phase, diff, finishMatch]);

  const pips = (count: number, color: string) => (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: MATCH_TARGET }).map((_, i) => (
        <span
          key={i}
          className="block w-3.5 h-3.5 rounded-full"
          style={{
            background: i < count ? color : "rgba(255,255,255,0.14)",
            border: "1.5px solid rgba(255,255,255,0.3)",
            transition: "background 200ms",
          }}
        />
      ))}
    </span>
  );

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#FF9600,#FF4B6E)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  const banner =
    phase === "pick"
      ? "Choose your throw!"
      : phase === "shake"
        ? "Rock… paper… scissors…"
        : result === "win"
          ? "You win the round! 🎉"
          : result === "lose"
            ? "CPU takes the round 😤"
            : "It's a tie! 🤝";

  return (
    <ArcadeShell
      title="Rock Paper Scissors"
      emoji="✊"
      color="linear-gradient(135deg,#FF9600,#FF4B6E)"
      score={matchStreak}
      scoreLabel="Match streak"
      best={best}
      onBack={onBack}
      onRestart={restart}
    >
      <div className="w-full max-w-lg mx-auto px-3 flex flex-col items-center my-auto w-full">
        {/* difficulty */}
        <div className="flex items-center gap-1.5 pt-3">
          <button onClick={() => { setDiff("chill"); sfx.click(); restart(); }} className="btn-game px-3 py-1.5 text-xs" style={chipStyle(diff === "chill")}>
            😎 Chill CPU
          </button>
          <button onClick={() => { setDiff("clever"); sfx.click(); restart(); }} className="btn-game px-3 py-1.5 text-xs" style={chipStyle(diff === "clever")}>
            🧠 Clever CPU
          </button>
        </div>

        {/* arena */}
        <div
          className="w-full rounded-3xl mt-3 px-4 py-5 relative overflow-hidden"
          style={{
            background: "radial-gradient(ellipse at 50% 35%, #2E2A55 0%, #1B1B3A 70%)",
            border: "2px solid rgba(255,255,255,0.14)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#7DD3FC" }}>You</span>
              {pips(wins, "#38BDF8")}
            </div>
            <p key={banner} className="banner-pop font-display font-bold text-white text-center text-base sm:text-lg px-3 py-1 rounded-full shrink-0" style={{ background: "rgba(0,0,0,0.35)" }}>
              {banner}
            </p>
            <div className="flex flex-col items-center gap-1 flex-1">
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#FDA4AF" }}>CPU</span>
              {pips(losses, "#FB7185")}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 sm:gap-8 py-6">
            <div className="flex flex-col items-center gap-1 w-32">
              <span
                className={`block leading-none ${phase === "shake" ? "rps-shake" : ""} ${phase === "reveal" ? "tile-pop-in" : ""}`}
                style={{
                  fontSize: "clamp(64px,17vw,104px)",
                  transform: "scaleX(-1)",
                  filter: result === "win" && phase === "reveal" ? "drop-shadow(0 0 18px rgba(88,204,2,0.9))" : "drop-shadow(0 6px 10px rgba(0,0,0,0.5))",
                }}
                aria-hidden
              >
                {phase === "reveal" && playerThrow ? EMOJI[playerThrow] : "✊"}
              </span>
              <span className="font-display font-semibold text-white text-sm h-5">
                {phase === "reveal" && playerThrow ? LABEL[playerThrow] : ""}
              </span>
            </div>

            <span className="font-display font-bold text-2xl sm:text-3xl" style={{ color: "rgba(255,255,255,0.45)" }}>VS</span>

            <div className="flex flex-col items-center gap-1 w-32">
              <span
                className={`block leading-none ${phase === "shake" ? "rps-shake" : ""} ${phase === "reveal" ? "tile-pop-in" : ""}`}
                style={{
                  fontSize: "clamp(64px,17vw,104px)",
                  filter: result === "lose" && phase === "reveal" ? "drop-shadow(0 0 18px rgba(255,75,110,0.9))" : "drop-shadow(0 6px 10px rgba(0,0,0,0.5))",
                }}
                aria-hidden
              >
                {phase === "reveal" && cpuThrow ? EMOJI[cpuThrow] : "✊"}
              </span>
              <span className="font-display font-semibold text-white text-sm h-5">
                {phase === "reveal" && cpuThrow ? LABEL[cpuThrow] : ""}
              </span>
            </div>
          </div>

          <p className="text-center text-[11px] font-bold h-4" style={{ color: "rgba(255,255,255,0.55)" }}>
            {phase === "reveal" && playerThrow && cpuThrow && result !== "draw"
              ? `${LABEL[result === "win" ? playerThrow : cpuThrow]} beats ${LABEL[result === "win" ? cpuThrow : playerThrow]}`
              : roundStreak >= 2 && phase === "pick"
                ? `🔥 ${roundStreak} round streak — keep it rolling!`
                : diff === "clever" && phase === "pick"
                  ? "🧠 The Clever CPU is studying your patterns…"
                  : ""}
          </p>
        </div>

        {/* throw buttons */}
        <div className="flex gap-2.5 mt-4">
          {THROWS.map((t) => (
            <button
              key={t}
              onClick={() => play(t)}
              disabled={phase !== "pick"}
              className="btn-game flex flex-col items-center justify-center gap-0.5 rounded-3xl active:scale-95 transition-transform disabled:opacity-50"
              style={{
                width: "clamp(86px,26vw,118px)",
                height: "clamp(86px,26vw,118px)",
                background:
                  t === "rock"
                    ? "linear-gradient(155deg,#64748B,#334155)"
                    : t === "paper"
                      ? "linear-gradient(155deg,#F8FAFC,#CBD5E1)"
                      : "linear-gradient(155deg,#FB923C,#EA580C)",
                border: "2.5px solid rgba(255,255,255,0.4)",
                boxShadow: "0 6px 0 rgba(0,0,0,0.4)",
              }}
              aria-label={`Throw ${LABEL[t]}`}
            >
              <span style={{ fontSize: "clamp(38px,10vw,52px)", lineHeight: 1 }} aria-hidden>{EMOJI[t]}</span>
              <span className="font-black text-xs uppercase tracking-wide" style={{ color: t === "paper" ? "#334155" : "#fff" }}>
                {LABEL[t]}
              </span>
            </button>
          ))}
        </div>

        <p className="text-[11px] font-bold mt-3" style={{ color: "rgba(255,255,255,0.5)" }}>
          First to {MATCH_TARGET} round-wins takes the match · {matchesPlayed} matches played this visit
        </p>
      </div>

      {showCard && (
        <GameOverCard
          title={matchWon ? "🏆 Match won!" : "🤖 CPU wins the match"}
          score={matchStreak}
          scoreLabel="Match streak"
          best={Math.max(best, matchStreak)}
          isNewBest={isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Final: you {wins} — CPU {losses} {matchWon ? "· run it back? ✊" : "· rematch?"}
            </p>
          }
          onRestart={newMatch}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
