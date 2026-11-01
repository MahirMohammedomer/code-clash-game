"use client";

/**
 * Sudoku Master — original from-scratch sudoku.
 * Every puzzle is generated fresh with a guaranteed unique solution.
 * Three difficulties, pencil notes, hints, mistake tracking, a timer and
 * per-difficulty best times. Fully touch-first.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Lightbulb, Pencil } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type Diff = "easy" | "medium" | "hard";
const GIVENS: Record<Diff, number> = { easy: 40, medium: 32, hard: 26 };

/* ---------------- generator + solver ---------------- */

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function peersOf(idx: number): number[] {
  const r = Math.floor(idx / 9);
  const c = idx % 9;
  const set = new Set<number>();
  for (let k = 0; k < 9; k++) {
    set.add(r * 9 + k);
    set.add(k * 9 + c);
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) set.add((br + dr) * 9 + (bc + dc));
  set.delete(idx);
  return [...set];
}
const PEERS: number[][] = Array.from({ length: 81 }, (_, i) => peersOf(i));

function candidates(grid: number[], idx: number): number[] {
  const used = new Set(PEERS[idx].map((p) => grid[p]));
  const out: number[] = [];
  for (let n = 1; n <= 9; n++) if (!used.has(n)) out.push(n);
  return out;
}

function fillGrid(grid: number[]): boolean {
  const idx = grid.indexOf(0);
  if (idx === -1) return true;
  for (const n of shuffled(candidates(grid, idx))) {
    grid[idx] = n;
    if (fillGrid(grid)) return true;
    grid[idx] = 0;
  }
  return false;
}

/** Count solutions, stopping early at `limit`. */
function countSolutions(grid: number[], limit = 2): number {
  // pick the empty cell with fewest candidates (MRV) for speed
  let bestIdx = -1;
  let bestOpts: number[] | null = null;
  for (let i = 0; i < 81; i++) {
    if (grid[i] !== 0) continue;
    const opts = candidates(grid, i);
    if (opts.length === 0) return 0;
    if (!bestOpts || opts.length < bestOpts.length) {
      bestIdx = i;
      bestOpts = opts;
      if (opts.length === 1) break;
    }
  }
  if (bestIdx === -1) return 1;
  let total = 0;
  for (const n of bestOpts!) {
    grid[bestIdx] = n;
    total += countSolutions(grid, limit - total);
    grid[bestIdx] = 0;
    if (total >= limit) break;
  }
  return total;
}

function generate(diff: Diff): { puzzle: number[]; solution: number[] } {
  const solution = Array(81).fill(0);
  fillGrid(solution);
  const puzzle = [...solution];
  const target = 81 - GIVENS[diff];
  let removed = 0;
  for (const idx of shuffled(Array.from({ length: 81 }, (_, i) => i))) {
    if (removed >= target) break;
    const backup = puzzle[idx];
    puzzle[idx] = 0;
    const copy = [...puzzle];
    if (countSolutions(copy, 2) !== 1) {
      puzzle[idx] = backup;
    } else {
      removed++;
    }
  }
  return { puzzle, solution };
}

/* ---------------- storage helpers ---------------- */

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function timeKey(diff: Diff) { return `arcade_besttime_sudoku_${diff}`; }
function loadBestTime(diff: Diff): number {
  try { return Number(localStorage.getItem(timeKey(diff)) ?? 0) || 0; } catch { return 0; }
}
function loadWins(): number {
  try { return Number(localStorage.getItem("arcade_sudoku_wins") ?? 0) || 0; } catch { return 0; }
}

/* ---------------- component ---------------- */

export default function SudokuMaster({ onBack }: { onBack: () => void }) {
  const [diff, setDiff] = useState<Diff>("easy");
  const [puzzle, setPuzzle] = useState<number[] | null>(null);
  const [solution, setSolution] = useState<number[] | null>(null);
  const [values, setValues] = useState<number[]>(Array(81).fill(0));
  const [notes, setNotes] = useState<number[]>(Array(81).fill(0)); // 9-bit masks
  const [selected, setSelected] = useState(-1);
  const [notesMode, setNotesMode] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hintsLeft, setHintsLeft] = useState(3);
  const [status, setStatus] = useState<"idle" | "playing" | "won">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [bestTime, setBestTime] = useState(() => loadBestTime("easy"));
  const [wins, setWins] = useState(() => Math.max(loadWins(), getBest("sudoku")));
  const [generating, setGenerating] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);

  const startAtRef = useRef(0);
  const valuesRef = useRef(values);
  const solutionRef = useRef<number[] | null>(null);
  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { solutionRef.current = solution; }, [solution]);

  useEffect(() => { bumpPlays("sudoku"); }, []);

  const newGame = useCallback((d: Diff) => {
    setDiff(d);
    setBestTime(loadBestTime(d));
    setGenerating(true);
    setShowCard(false);
    // let the spinner paint before the (fast but synchronous) generation
    setTimeout(() => {
      const { puzzle: p, solution: sol } = generate(d);
      setPuzzle(p);
      setSolution(sol);
      solutionRef.current = sol;
      setValues([...p]);
      valuesRef.current = [...p];
      setNotes(Array(81).fill(0));
      setSelected(-1);
      setMistakes(0);
      setHintsLeft(3);
      setElapsed(0);
      startAtRef.current = Date.now();
      setStatus("playing");
      setGenerating(false);
      sfx.click();
    }, 30);
  }, []);

  const restart = useCallback(() => {
    if (status === "idle") newGame(diff);
    else if (puzzle) {
      setValues([...puzzle]);
      valuesRef.current = [...puzzle];
      setNotes(Array(81).fill(0));
      setMistakes(0);
      setHintsLeft(3);
      setElapsed(0);
      startAtRef.current = Date.now();
      setStatus("playing");
      setShowCard(false);
    }
  }, [status, puzzle, diff, newGame]);

  // timer
  useEffect(() => {
    if (status !== "playing") return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startAtRef.current) / 1000)), 400);
    return () => clearInterval(iv);
  }, [status]);

  const finishWin = useCallback(() => {
    const finalElapsed = Math.floor((Date.now() - startAtRef.current) / 1000);
    setElapsed(finalElapsed);
    setStatus("won");
    sfx.win();
    const newWins = loadWins() + 1;
    try { localStorage.setItem("arcade_sudoku_wins", String(newWins)); } catch {}
    setWins(newWins);
    submitScore("sudoku", newWins);
    const prevBest = loadBestTime(diff);
    const isNew = prevBest === 0 || finalElapsed < prevBest;
    if (isNew) {
      try { localStorage.setItem(timeKey(diff), String(finalElapsed)); } catch {}
      setBestTime(finalElapsed);
    }
    setIsNewBest(isNew);
    setTimeout(() => setShowCard(true), 650);
  }, [diff]);

  const placeNumber = useCallback((n: number) => {
    if (status !== "playing" || selected < 0 || !puzzle || !solution) return;
    if (puzzle[selected] !== 0) return; // given
    if (notesMode) {
      if (values[selected] !== 0) return;
      const next = [...notes];
      next[selected] ^= 1 << (n - 1);
      setNotes(next);
      sfx.click();
      return;
    }
    const nextValues = [...values];
    nextValues[selected] = n;
    setValues(nextValues);
    valuesRef.current = nextValues;
    sfx.pop(0.9 + n * 0.04);

    if (n !== solution[selected]) {
      setMistakes((m) => m + 1);
      sfx.badSwap();
      return;
    }
    // clear this digit from peers' pencil notes
    setNotes((prev) => {
      const next = [...prev];
      next[selected] = 0;
      for (const p of PEERS[selected]) next[p] &= ~(1 << (n - 1));
      return next;
    });
    if (nextValues.every((v, i) => v === solution[i])) finishWin();
  }, [status, selected, puzzle, solution, notesMode, values, notes, finishWin]);

  const erase = useCallback(() => {
    if (status !== "playing" || selected < 0 || !puzzle) return;
    if (puzzle[selected] !== 0) return;
    const nextValues = [...values];
    nextValues[selected] = 0;
    setValues(nextValues);
    valuesRef.current = nextValues;
    const nextNotes = [...notes];
    nextNotes[selected] = 0;
    setNotes(nextNotes);
    sfx.click();
  }, [status, selected, puzzle, values, notes]);

  const hint = useCallback(() => {
    if (status !== "playing" || !puzzle || !solution || hintsLeft <= 0) return;
    let target = selected;
    if (target < 0 || puzzle[target] !== 0 || values[target] === solution[target]) {
      const empties = values.map((v, i) => (v !== solution[i] ? i : -1)).filter((i) => i >= 0);
      if (!empties.length) return;
      target = empties[Math.floor(Math.random() * empties.length)];
    }
    const nextValues = [...values];
    nextValues[target] = solution[target];
    setValues(nextValues);
    valuesRef.current = nextValues;
    setSelected(target);
    setHintsLeft((h) => h - 1);
    setNotes((prev) => {
      const next = [...prev];
      next[target] = 0;
      for (const p of PEERS[target]) next[p] &= ~(1 << (solution[target] - 1));
      return next;
    });
    sfx.power();
    if (nextValues.every((v, i) => v === solution[i])) finishWin();
  }, [status, puzzle, solution, hintsLeft, selected, values, finishWin]);

  // physical keyboard 1-9 / delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "9") placeNumber(Number(e.key));
      else if (e.key === "Backspace" || e.key === "Delete") erase();
      else if (e.key === "n" || e.key === "N") setNotesMode((m) => !m);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [placeNumber, erase]);

  const digitCounts = Array(10).fill(0) as number[];
  for (const v of values) if (v) digitCounts[v]++;
  const selectedValue = selected >= 0 ? values[selected] : 0;

  const boardW = "min(94vw, 470px, calc(100dvh - 395px))";

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#4C6FFF,#1CB0F6)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  return (
    <ArcadeShell
      title="Sudoku Master"
      emoji="🧮"
      color="linear-gradient(135deg,#4C6FFF,#1CB0F6)"
      score={elapsed}
      scoreLabel="Time"
      scoreDisplay={fmtTime(elapsed)}
      best={bestTime}
      bestOverride={bestTime > 0 ? fmtTime(bestTime) : "—"}
      onBack={onBack}
      onRestart={restart}
    >
      <div className="w-full px-3 flex flex-col items-center my-auto w-full">
        {/* difficulty + status */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center pt-3 pb-2">
          {(["easy", "medium", "hard"] as Diff[]).map((d) => (
            <button key={d} onClick={() => newGame(d)} className="btn-game px-3 py-1.5 text-xs capitalize" style={chipStyle(diff === d && status !== "idle")}>
              {d === "easy" ? "😊 Easy" : d === "medium" ? "😐 Medium" : "😈 Hard"}
            </button>
          ))}
          <span className="chip px-2.5 py-1.5 text-[11px] font-black" style={{ background: "rgba(0,0,0,0.35)", color: mistakes > 0 ? "#FF9D9D" : "#fff", border: "1.5px solid rgba(255,255,255,0.2)" }}>
            ✖ {mistakes}
          </span>
          <span className="chip px-2.5 py-1.5 text-[11px] font-black" style={{ background: "rgba(0,0,0,0.35)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.2)" }}>
            🏆 {wins}
          </span>
        </div>

        {/* board */}
        <div
          className="relative rounded-2xl p-1.5"
          style={{
            width: boardW,
            minWidth: 270,
            background: "linear-gradient(160deg,#23284D,#141733)",
            border: "2px solid rgba(255,255,255,0.16)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
          }}
        >
          {status === "idle" || generating ? (
            <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ aspectRatio: "1" }}>
              <span className="text-6xl animate-bounce" aria-hidden>🧮</span>
              <span className="font-display font-bold text-2xl text-white">Sudoku Master</span>
              <span className="text-xs font-black px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.92)", color: "#26283B" }}>
                Every row, column & box: 1–9
              </span>
              <button onClick={() => newGame(diff)} className="btn-game btn-green px-6 py-3 mt-1" disabled={generating}>
                {generating ? "Generating…" : "▶ New puzzle"}
              </button>
            </div>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: "repeat(9,1fr)" }}>
              {values.map((v, i) => {
                const given = puzzle ? puzzle[i] !== 0 : false;
                const wrong = !given && v !== 0 && solution ? v !== solution[i] : false;
                const r = Math.floor(i / 9);
                const c = i % 9;
                const isSelected = i === selected;
                const isPeer = selected >= 0 && PEERS[selected].includes(i);
                const sameNumber = selectedValue !== 0 && v === selectedValue;
                const bg = isSelected
                  ? "rgba(76,111,255,0.55)"
                  : sameNumber
                    ? "rgba(76,111,255,0.34)"
                    : isPeer
                      ? "rgba(255,255,255,0.09)"
                      : (Math.floor(r / 3) + Math.floor(c / 3)) % 2 === 0
                        ? "rgba(255,255,255,0.045)"
                        : "rgba(255,255,255,0.015)";
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setSelected(i); sfx.click(); }}
                    className="relative flex items-center justify-center touch-none select-none"
                    style={{
                      aspectRatio: "1",
                      background: bg,
                      borderRight: c === 8 ? "none" : c % 3 === 2 ? "2px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
                      borderBottom: r === 8 ? "none" : r % 3 === 2 ? "2px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.10)",
                      fontSize: "clamp(16px,4.6vw,26px)",
                      fontWeight: given ? 800 : 700,
                      color: wrong ? "#FF6B6B" : given ? "#FFFFFF" : "#7DD3FC",
                      fontFamily: "'Fredoka',system-ui,sans-serif",
                    }}
                    aria-label={`Cell row ${r + 1} column ${c + 1}`}
                  >
                    {v !== 0 ? (
                      v
                    ) : notes[i] !== 0 ? (
                      <span className="grid grid-cols-3 w-full h-full p-[2px]" aria-hidden>
                        {Array.from({ length: 9 }).map((_, k) => (
                          <span key={k} className="flex items-center justify-center" style={{ fontSize: "clamp(7px,1.9vw,10px)", color: "rgba(255,255,255,0.6)", lineHeight: 1 }}>
                            {notes[i] & (1 << k) ? k + 1 : ""}
                          </span>
                        ))}
                      </span>
                    ) : (
                      ""
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* number pad + tools */}
        {status === "playing" && (
          <div className="pt-3 pb-1 flex flex-col items-center gap-2" style={{ width: boardW, minWidth: 270 }}>
            <div className="grid grid-cols-9 gap-1 w-full">
              {Array.from({ length: 9 }).map((_, k) => {
                const n = k + 1;
                const remaining = 9 - digitCounts[n];
                return (
                  <button
                    key={n}
                    onClick={() => placeNumber(n)}
                    disabled={remaining <= 0 && !notesMode}
                    className="rounded-xl font-display font-bold flex flex-col items-center justify-center active:scale-95 transition-transform touch-none disabled:opacity-30"
                    style={{
                      height: 54,
                      background: notesMode ? "rgba(255,200,0,0.16)" : "rgba(76,111,255,0.22)",
                      color: notesMode ? "#FFE27A" : "#BFDBFE",
                      border: "1.5px solid rgba(255,255,255,0.22)",
                      fontSize: 22,
                      lineHeight: 1,
                    }}
                  >
                    {n}
                    <span style={{ fontSize: 8, opacity: 0.65, fontWeight: 800 }}>{remaining} left</span>
                  </button>
                );
              })}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => { setNotesMode((m) => !m); sfx.click(); }}
                className="btn-game px-3.5 py-2 text-xs flex items-center gap-1.5"
                style={notesMode ? { background: "linear-gradient(120deg,#FFC800,#FF7A18)", color: "#3A2A00", border: "2px solid rgba(255,255,255,0.4)" } : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" }}
              >
                <Pencil size={14} /> Notes {notesMode ? "ON" : "OFF"}
              </button>
              <button onClick={erase} className="btn-game px-3.5 py-2 text-xs flex items-center gap-1.5" style={{ background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" }}>
                <Eraser size={14} /> Erase
              </button>
              <button
                onClick={hint}
                disabled={hintsLeft <= 0}
                className="btn-game px-3.5 py-2 text-xs flex items-center gap-1.5 disabled:opacity-40"
                style={{ background: "rgba(255,200,0,0.18)", color: "#FFE27A", border: "2px solid rgba(255,200,0,0.4)" }}
              >
                <Lightbulb size={14} /> Hint ({hintsLeft})
              </button>
            </div>
          </div>
        )}
      </div>

      {showCard && status === "won" && (
        <GameOverCard
          title="🎉 Sudoku solved!"
          score={elapsed}
          scoreLabel="Time"
          scoreDisplay={fmtTime(elapsed)}
          best={bestTime || elapsed}
          bestDisplay={fmtTime(bestTime || elapsed)}
          isNewBest={isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              {diff === "easy" ? "😊 Easy" : diff === "medium" ? "😐 Medium" : "😈 Hard"} cleared with {mistakes} {mistakes === 1 ? "mistake" : "mistakes"} · 🏆 {wins} total wins
            </p>
          }
          onRestart={() => newGame(diff)}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
