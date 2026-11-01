"use client";

/**
 * Slide Puzzle — original from-scratch sliding-tiles puzzle.
 * 3×3, 4×4 and 5×5 boards in Number or Picture mode. Puzzles are shuffled
 * by random walks from the solved state, so they're always solvable.
 * Tap any tile in the blank's row/column to slide the whole segment.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Hash, Image as ImageIcon } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type Size = 3 | 4 | 5;
type Mode = "numbers" | "picture";

function shuffleSolvable(size: Size): number[] {
  const n = size * size;
  const tiles = Array.from({ length: n }, (_, i) => i); // 0 = blank, solved at end → we keep blank value 0 anywhere
  // start solved: [1..n-1, 0]
  const solved = [...Array.from({ length: n - 1 }, (_, i) => i + 1), 0];
  const board = [...solved];
  let blank = n - 1;
  let prevBlank = -1;
  const walks = size === 3 ? 90 : size === 4 ? 170 : 260;
  for (let w = 0; w < walks; w++) {
    const r = Math.floor(blank / size);
    const c = blank % size;
    const options: number[] = [];
    if (r > 0) options.push(blank - size);
    if (r < size - 1) options.push(blank + size);
    if (c > 0) options.push(blank - 1);
    if (c < size - 1) options.push(blank + 1);
    const filtered = options.filter((o) => o !== prevBlank);
    const pick = filtered[Math.floor(Math.random() * filtered.length)] ?? options[0];
    board[blank] = board[pick];
    board[pick] = 0;
    prevBlank = blank;
    blank = pick;
  }
  // avoid an accidentally-solved board
  if (board.every((v, i) => v === solved[i])) return shuffleSolvable(size);
  void tiles;
  return board;
}

function isSolved(board: number[]): boolean {
  for (let i = 0; i < board.length - 1; i++) if (board[i] !== i + 1) return false;
  return board[board.length - 1] === 0;
}

function bestKey(size: Size, mode: Mode) { return `arcade_bestmoves_slide_${size}_${mode}`; }
function loadBestMoves(size: Size, mode: Mode): number {
  try { return Number(localStorage.getItem(bestKey(size, mode)) ?? 0) || 0; } catch { return 0; }
}
function loadWins(): number {
  try { return Number(localStorage.getItem("arcade_slide_wins") ?? 0) || 0; } catch { return 0; }
}

export default function SlidePuzzle({ onBack }: { onBack: () => void }) {
  const [size, setSize] = useState<Size>(3);
  const [mode, setMode] = useState<Mode>("picture");
  const [board, setBoard] = useState<number[]>(() => shuffleSolvable(3));
  const [moves, setMoves] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<"playing" | "won">("playing");
  const [peek, setPeek] = useState(false);
  const [bestMoves, setBestMoves] = useState(() => loadBestMoves(3, "picture"));
  const [wins, setWins] = useState(() => Math.max(loadWins(), getBest("slide")));
  const [showCard, setShowCard] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [burst, setBurst] = useState(0);

  const startAtRef = useRef(0);
  const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { bumpPlays("slide"); startAtRef.current = Date.now(); }, []);

  useEffect(() => {
    if (status !== "playing") return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startAtRef.current) / 1000)), 500);
    return () => clearInterval(iv);
  }, [status]);

  const newGame = useCallback((s: Size, m: Mode) => {
    setSize(s);
    setMode(m);
    setBoard(shuffleSolvable(s));
    setMoves(0);
    setElapsed(0);
    startAtRef.current = Date.now();
    setStatus("playing");
    setShowCard(false);
    setBestMoves(loadBestMoves(s, m));
    sfx.click();
  }, []);

  const restart = useCallback(() => newGame(size, mode), [newGame, size, mode]);

  const finishWin = useCallback((finalMoves: number) => {
    setStatus("won");
    setBurst((b) => b + 1);
    sfx.win();
    const newWins = loadWins() + 1;
    try { localStorage.setItem("arcade_slide_wins", String(newWins)); } catch {}
    setWins(newWins);
    submitScore("slide", newWins);
    const prevBest = loadBestMoves(size, mode);
    const isNew = prevBest === 0 || finalMoves < prevBest;
    if (isNew) {
      try { localStorage.setItem(bestKey(size, mode), String(finalMoves)); } catch {}
      setBestMoves(finalMoves);
    }
    setIsNewBest(isNew);
    setTimeout(() => setShowCard(true), 800);
  }, [size, mode]);

  const tapTile = useCallback((idx: number) => {
    if (status !== "playing") return;
    const b = boardRef.current;
    const blank = b.indexOf(0);
    if (idx === blank) return;
    const br = Math.floor(blank / size);
    const bc = blank % size;
    const tr = Math.floor(idx / size);
    const tc = idx % size;
    if (br !== tr && bc !== tc) {
      sfx.badSwap();
      return;
    }
    const next = [...b];
    let moved = 0;
    if (br === tr) {
      const step = tc < bc ? -1 : 1;
      for (let c = bc; c !== tc; c += step) {
        next[br * size + c] = next[br * size + c + step];
        moved++;
      }
      next[idx] = 0;
    } else {
      const step = tr < br ? -size : size;
      for (let p = blank; p !== idx; p += step) {
        next[p] = next[p + step];
        moved++;
      }
      next[idx] = 0;
    }
    const totalMoves = moves + moved;
    setBoard(next);
    boardRef.current = next;
    setMoves(totalMoves);
    sfx.pop(1.05);
    if (isSolved(next)) finishWin(totalMoves);
  }, [status, size, moves, finishWin]);

  const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const boardW = "min(94vw, 480px, calc(100dvh - 330px))";

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#F59E0B,#EF4444)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  return (
    <ArcadeShell
      title="Slide Puzzle"
      emoji="🧩"
      color="linear-gradient(135deg,#F59E0B,#EF4444)"
      score={moves}
      scoreLabel="Moves"
      best={bestMoves}
      bestOverride={bestMoves > 0 ? `${bestMoves}` : "—"}
      onBack={onBack}
      onRestart={restart}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Tap a tile in the empty slot&apos;s row or column to slide · ⏱️ {fmtTime(elapsed)} · 🏆 {wins} solved
        </p>
      }
    >
      <div className="w-full px-3 flex flex-col items-center my-auto w-full">
        {/* controls */}
        <div className="flex items-center gap-1.5 flex-wrap justify-center pt-3 pb-2">
          {([3, 4, 5] as Size[]).map((s) => (
            <button key={s} onClick={() => newGame(s, mode)} className="btn-game px-3 py-1.5 text-xs" style={chipStyle(size === s)}>
              {s}×{s}
            </button>
          ))}
          <button onClick={() => newGame(size, "picture")} className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5" style={chipStyle(mode === "picture")}>
            <ImageIcon size={13} /> Picture
          </button>
          <button onClick={() => newGame(size, "numbers")} className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5" style={chipStyle(mode === "numbers")}>
            <Hash size={13} /> Numbers
          </button>
          {mode === "picture" && (
            <button
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5 touch-none"
              style={{ background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" }}
            >
              {peek ? <EyeOff size={13} /> : <Eye size={13} />} Hold to peek
            </button>
          )}
        </div>

        {/* board */}
        <div
          className="relative rounded-3xl"
          style={{
            width: boardW,
            minWidth: 270,
            aspectRatio: "1",
            background: "linear-gradient(160deg,#3B2A1A,#241A10)",
            border: "3px solid rgba(255,255,255,0.18)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
            padding: 8,
          }}
        >
          <div className="relative w-full h-full">
            {board.map((tile, idx) => {
              if (tile === 0) return null;
              const r = Math.floor(idx / size);
              const c = idx % size;
              const homeR = Math.floor((tile - 1) / size);
              const homeC = (tile - 1) % size;
              const cellPct = 100 / size;
              const correct = tile - 1 === idx;
              return (
                <button
                  key={tile}
                  type="button"
                  onClick={() => tapTile(idx)}
                  className="absolute flex items-center justify-center font-display font-bold touch-none select-none"
                  style={{
                    width: `${cellPct}%`,
                    height: `${cellPct}%`,
                    left: 0,
                    top: 0,
                    transform: `translate(${c * 100}%, ${r * 100}%)`,
                    transition: "transform 160ms ease",
                    padding: 2.5,
                    background: "transparent",
                    border: "none",
                  }}
                  aria-label={`Tile ${tile}`}
                >
                  <span
                    className="w-full h-full rounded-xl flex items-center justify-center overflow-hidden relative"
                    style={
                      mode === "picture"
                        ? {
                            backgroundImage: "url(/arcade/slide.jpg)",
                            backgroundSize: `${size * 100}% ${size * 100}%`,
                            backgroundPosition: `${(homeC / (size - 1)) * 100}% ${(homeR / (size - 1)) * 100}%`,
                            border: correct ? "2.5px solid rgba(88,204,2,0.85)" : "2px solid rgba(255,255,255,0.35)",
                            boxShadow: "0 3px 0 rgba(0,0,0,0.4)",
                          }
                        : {
                            background: correct
                              ? "linear-gradient(150deg,#FFB020,#FF7A18)"
                              : "linear-gradient(150deg,#2DD4BF,#0D9488)",
                            color: "#fff",
                            fontSize: size === 5 ? "clamp(16px,4.5vw,24px)" : "clamp(22px,6.5vw,34px)",
                            textShadow: "0 2px 3px rgba(0,0,0,0.4)",
                            border: "2px solid rgba(255,255,255,0.4)",
                            boxShadow: "0 3px 0 rgba(0,0,0,0.4), inset 0 2px 0 rgba(255,255,255,0.35)",
                          }
                    }
                  >
                    {mode === "numbers" ? tile : (
                      <span
                        className="absolute bottom-1 right-1 text-[9px] font-black px-1 rounded"
                        style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
                      >
                        {tile}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}

            {/* peek overlay: the finished picture */}
            {peek && mode === "picture" && (
              // eslint-disable-next-line @next/next/no-img-element -- our own generated artwork
              <img src="/arcade/slide.jpg" alt="Completed puzzle preview" className="absolute inset-0 w-full h-full object-cover rounded-xl pointer-events-none" style={{ zIndex: 5 }} />
            )}

            {/* win burst */}
            {status === "won" && (
              <div key={burst} className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 6 }}>
                <span className="text-6xl animate-bounce">🎉</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showCard && status === "won" && (
        <GameOverCard
          title="🧩 Puzzle complete!"
          score={moves}
          scoreLabel="Moves"
          best={bestMoves || moves}
          isNewBest={isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              {size}×{size} {mode} solved in {fmtTime(elapsed)} · 🏆 {wins} total solved
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
