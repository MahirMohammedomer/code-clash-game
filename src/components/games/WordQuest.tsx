"use client";

/**
 * Word Quest — original from-scratch word-guessing game.
 * Six tries to find the secret 5-letter word. Green = right spot,
 * gold = wrong spot, grey = not in the word. Daily word + endless mode,
 * on-screen keyboard, streaks and guess-distribution stats.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { WORDS, WORD_SET } from "@/lib/words5";
import { sfx } from "@/lib/arcade-sound";

type Mark = "correct" | "present" | "absent";
type Phase = "playing" | "won" | "lost";
type Mode = "daily" | "endless";

const ROWS = 6;
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
const STREAK_KEY = "arcade_wordle_streak";
const STATS_KEY = "arcade_wordle_stats";
const DAILY_KEY = "arcade_wordle_daily";

function evaluate(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array(5).fill("absent");
  const pool: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) marks[i] = "correct";
    else pool[answer[i]] = (pool[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (marks[i] === "correct") continue;
    if ((pool[guess[i]] ?? 0) > 0) {
      marks[i] = "present";
      pool[guess[i]]--;
    }
  }
  return marks;
}

function dailyAnswer(): { word: string; dayId: string } {
  const now = new Date();
  const dayId = now.toLocaleDateString("en-CA"); // YYYY-MM-DD
  let hash = 2166136261;
  for (let i = 0; i < dayId.length; i++) {
    hash ^= dayId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return { word: WORDS[Math.abs(hash) % WORDS.length], dayId };
}

function loadStreak(): number {
  try { return Number(localStorage.getItem(STREAK_KEY) ?? 0) || 0; } catch { return 0; }
}
interface Stats { played: number; won: number; dist: number[] }
function loadStats(): Stats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? "null");
    if (raw && typeof raw.played === "number") return raw as Stats;
  } catch {}
  return { played: 0, won: 0, dist: [0, 0, 0, 0, 0, 0] };
}

export default function WordQuest({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<Mode>("endless");
  const [answer, setAnswer] = useState<string>(() => WORDS[Math.floor(Math.random() * WORDS.length)]);
  const [dayId, setDayId] = useState<string>("");
  const [guesses, setGuesses] = useState<string[]>([]);
  const [marks, setMarks] = useState<Mark[][]>([]);
  const [current, setCurrent] = useState("");
  const [phase, setPhase] = useState<Phase>("playing");
  const [shakeRow, setShakeRow] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [streak, setStreak] = useState<number>(() => loadStreak());
  const [stats, setStats] = useState<Stats>(() => loadStats());
  const [best, setBest] = useState(() => getBest("wordle"));
  const [showCard, setShowCard] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [revealRow, setRevealRow] = useState(-1);

  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const currentRef = useRef(current);
  useEffect(() => { currentRef.current = current; }, [current]);
  const guessesRef = useRef(guesses);
  useEffect(() => { guessesRef.current = guesses; }, [guesses]);
  const answerRef = useRef(answer);
  useEffect(() => { answerRef.current = answer; }, [answer]);
  const lockedRef = useRef(false);

  useEffect(() => { bumpPlays("wordle"); }, []);

  const flash = useCallback((msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 1400);
  }, []);

  const recordResult = useCallback((won: boolean, tries: number) => {
    const st: Stats = { played: stats.played + 1, won: stats.won + (won ? 1 : 0), dist: [...stats.dist] };
    if (won) st.dist[tries - 1]++;
    setStats(st);
    try { localStorage.setItem(STATS_KEY, JSON.stringify(st)); } catch {}

    const newStreak = won ? loadStreak() + 1 : 0;
    try { localStorage.setItem(STREAK_KEY, String(newStreak)); } catch {}
    setStreak(newStreak);
    if (won) {
      const res = submitScore("wordle", newStreak);
      setBest(res.best);
      setIsNewBest(res.isNewBest && newStreak > 1);
    } else {
      setIsNewBest(false);
    }
    // persist daily completion
    if (mode === "daily" && dayId) {
      try { localStorage.setItem(DAILY_KEY, JSON.stringify({ dayId, won, tries })); } catch {}
    }
  }, [stats, mode, dayId]);

  const startGame = useCallback((m: Mode) => {
    lockedRef.current = false;
    setGuesses([]);
    setMarks([]);
    setCurrent("");
    setPhase("playing");
    setShowCard(false);
    setRevealRow(-1);
    setMode(m);
    if (m === "daily") {
      const d = dailyAnswer();
      setAnswer(d.word);
      answerRef.current = d.word;
      setDayId(d.dayId);
    } else {
      const w = WORDS[Math.floor(Math.random() * WORDS.length)];
      setAnswer(w);
      answerRef.current = w;
      setDayId("");
    }
  }, []);

  const restart = useCallback(() => startGame(mode), [startGame, mode]);

  const submitGuess = useCallback(() => {
    if (lockedRef.current || phaseRef.current !== "playing") return;
    const guess = currentRef.current;
    if (guess.length < 5) {
      flash("Too short!");
      setShakeRow(true);
      sfx.badSwap();
      setTimeout(() => setShakeRow(false), 400);
      return;
    }
    if (!WORD_SET.has(guess)) {
      flash("Not in the word list");
      setShakeRow(true);
      sfx.badSwap();
      setTimeout(() => setShakeRow(false), 400);
      return;
    }
    lockedRef.current = true;
    const ans = answerRef.current;
    const m = evaluate(guess, ans);
    const rowIndex = guessesRef.current.length;
    const nextGuesses = [...guessesRef.current, guess];
    const nextMarks = [...marks, m];
    setGuesses(nextGuesses);
    setMarks(nextMarks);
    setRevealRow(rowIndex);
    setCurrent("");
    sfx.pop(1.1);

    const won = guess === ans;
    const lost = !won && nextGuesses.length >= ROWS;

    setTimeout(() => {
      lockedRef.current = false;
      setRevealRow(-1);
      if (won) {
        setPhase("won");
        recordResult(true, nextGuesses.length);
        sfx.win();
        setTimeout(() => setShowCard(true), 700);
      } else if (lost) {
        setPhase("lost");
        recordResult(false, nextGuesses.length);
        sfx.gameover();
        setTimeout(() => setShowCard(true), 700);
      }
    }, 5 * 110 + 320);
  }, [flash, marks, recordResult]);

  const onKey = useCallback((key: string) => {
    if (lockedRef.current || phaseRef.current !== "playing") return;
    if (key === "ENTER") { submitGuess(); return; }
    if (key === "DEL") {
      setCurrent((c) => c.slice(0, -1));
      sfx.click();
      return;
    }
    if (/^[A-Z]$/.test(key)) {
      setCurrent((c) => (c.length < 5 ? c + key : c));
      sfx.click();
    }
  }, [submitGuess]);

  // physical keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") onKey("ENTER");
      else if (e.key === "Backspace") onKey("DEL");
      else if (/^[a-zA-Z]$/.test(e.key)) onKey(e.key.toUpperCase());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onKey]);

  // letter knowledge for the keyboard colors
  const keyMarks: Record<string, Mark> = {};
  for (let r = 0; r < guesses.length; r++) {
    for (let i = 0; i < 5; i++) {
      const ch = guesses[r][i];
      const m = marks[r]?.[i];
      if (!m) continue;
      const prev = keyMarks[ch];
      if (m === "correct" || (m === "present" && prev !== "correct") || !prev) keyMarks[ch] = m;
    }
  }

  const MARK_STYLE: Record<Mark, React.CSSProperties> = {
    correct: { background: "linear-gradient(150deg,#58CC02,#46A302)", borderColor: "#58CC02", color: "#fff" },
    present: { background: "linear-gradient(150deg,#FFC800,#E0A800)", borderColor: "#FFC800", color: "#3A2A00" },
    absent: { background: "#3A3E52", borderColor: "#3A3E52", color: "rgba(255,255,255,0.75)" },
  };
  const KEY_STYLE = (ch: string): React.CSSProperties => {
    const m = keyMarks[ch];
    if (m === "correct") return { background: "#46A302", color: "#fff", border: "1.5px solid rgba(255,255,255,0.3)" };
    if (m === "present") return { background: "#E0A800", color: "#3A2A00", border: "1.5px solid rgba(255,255,255,0.3)" };
    if (m === "absent") return { background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)", border: "1.5px solid rgba(255,255,255,0.08)" };
    return { background: "rgba(255,255,255,0.16)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.2)" };
  };

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#58CC02,#1F9D55)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  const cellSize = "min(12.5vw, 58px, calc((100dvh - 470px) / 6))";

  return (
    <ArcadeShell
      title="Word Quest"
      emoji="🟩"
      color="linear-gradient(135deg,#58CC02,#B8A11A)"
      score={streak}
      scoreLabel="Win streak 🔥"
      best={best}
      onBack={onBack}
      onRestart={restart}
    >
      <div className="w-full max-w-md mx-auto px-3 flex flex-col items-center my-auto w-full">
        {/* mode toggle */}
        <div className="flex items-center gap-1.5 pt-3 pb-2">
          <button onClick={() => { sfx.click(); startGame("daily"); }} className="btn-game px-3.5 py-2 text-xs" style={chipStyle(mode === "daily")}>
            📅 Daily word
          </button>
          <button onClick={() => { sfx.click(); startGame("endless"); }} className="btn-game px-3.5 py-2 text-xs" style={chipStyle(mode === "endless")}>
            ∞ Endless
          </button>
          <span className="text-[11px] font-bold ml-1" style={{ color: "rgba(255,255,255,0.55)" }}>
            {stats.played > 0 ? `${Math.round((stats.won / stats.played) * 100)}% won · ${stats.played} played` : "6 tries — good luck!"}
          </span>
        </div>

        {/* message toast */}
        <div className="h-7 flex items-center">
          {message && (
            <span className="banner-pop text-xs font-black px-3 py-1 rounded-full" style={{ background: "#fff", color: "#26283B" }}>
              {message}
            </span>
          )}
          {!message && mode === "daily" && dayId && (
            <span className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
              📅 {dayId} — everyone gets this same word today
            </span>
          )}
        </div>

        {/* board */}
        <div className="flex flex-col gap-1.5 py-1">
          {Array.from({ length: ROWS }).map((_, r) => {
            const submitted = r < guesses.length;
            const isCurrent = r === guesses.length && phase === "playing";
            const word = submitted ? guesses[r] : isCurrent ? current : "";
            return (
              <div key={r} className={`flex gap-1.5 ${isCurrent && shakeRow ? "shake-x" : ""}`}>
                {Array.from({ length: 5 }).map((_, i) => {
                  const ch = word[i] ?? "";
                  const mark = submitted ? marks[r]?.[i] : undefined;
                  const flipping = revealRow === r;
                  const bounce = phase === "won" && r === guesses.length - 1;
                  return (
                    <span
                      key={i}
                      className={`flex items-center justify-center font-display font-bold rounded-xl select-none ${flipping ? "tile-flip" : ""} ${bounce ? "tile-bounce" : ""} ${isCurrent && ch ? "tile-pop-in" : ""}`}
                      style={{
                        width: cellSize,
                        height: cellSize,
                        minWidth: 40,
                        minHeight: 40,
                        fontSize: "clamp(20px,5.5vw,30px)",
                        border: `2.5px solid ${mark ? "transparent" : ch ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.22)"}`,
                        background: "rgba(255,255,255,0.05)",
                        color: "#fff",
                        ...(mark ? MARK_STYLE[mark] : {}),
                        animationDelay: flipping || bounce ? `${i * 110}ms` : undefined,
                      }}
                    >
                      {ch}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* keyboard */}
        <div className="w-full flex flex-col items-center gap-1.5 pt-3 pb-2">
          {KEY_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1 justify-center w-full max-w-[500px]">
              {ri === 2 && (
                <button
                  onClick={() => onKey("ENTER")}
                  className="rounded-lg font-black text-[11px] flex items-center justify-center active:scale-95 transition-transform touch-none"
                  style={{ flex: "1.6", height: 52, background: "linear-gradient(120deg,#58CC02,#1F9D55)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.35)" }}
                >
                  ENTER
                </button>
              )}
              {row.split("").map((ch) => (
                <button
                  key={ch}
                  onClick={() => onKey(ch)}
                  className="rounded-lg font-black text-sm flex items-center justify-center active:scale-95 transition-transform touch-none"
                  style={{ flex: "1", height: 52, maxWidth: 44, ...KEY_STYLE(ch) }}
                >
                  {ch}
                </button>
              ))}
              {ri === 2 && (
                <button
                  onClick={() => onKey("DEL")}
                  className="rounded-lg font-black flex items-center justify-center active:scale-95 transition-transform touch-none"
                  style={{ flex: "1.6", height: 52, background: "rgba(255,255,255,0.14)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.2)" }}
                  aria-label="Delete letter"
                >
                  <Delete size={20} />
                </button>
              )}
            </div>
          ))}
        </div>

        <p className="text-[11px] font-bold pb-1" style={{ color: "rgba(255,255,255,0.5)" }}>
          🟩 right letter, right spot · 🟨 right letter, wrong spot · ⬛ not in the word
        </p>
      </div>

      {showCard && phase !== "playing" && (
        <GameOverCard
          title={phase === "won" ? ["🤯 Genius!", "🌟 Magnificent!", "🎉 Impressive!", "👏 Splendid!", "😅 Phew!", "😅 Phew!"][guesses.length - 1] : `😔 The word was ${answer}`}
          score={streak}
          scoreLabel="Win streak 🔥"
          best={Math.max(best, streak)}
          isNewBest={isNewBest}
          extra={
            <div>
              <p className="text-xs font-bold mb-1.5" style={{ color: "rgba(255,255,255,0.65)" }}>
                Solved in... {phase === "won" ? `${guesses.length} ${guesses.length === 1 ? "try" : "tries"}` : "— better luck next word!"}
              </p>
              <div className="flex items-end justify-center gap-1 h-12" aria-hidden>
                {stats.dist.map((n, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span
                      className="block w-5 rounded-t"
                      style={{
                        height: `${Math.max(8, (n / Math.max(1, ...stats.dist)) * 34)}px`,
                        background: phase === "won" && guesses.length - 1 === i ? "#58CC02" : "rgba(255,255,255,0.3)",
                      }}
                    />
                    <span className="text-[9px] font-black" style={{ color: "rgba(255,255,255,0.6)" }}>{i + 1}</span>
                  </div>
                ))}
              </div>
            </div>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
