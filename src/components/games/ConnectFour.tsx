"use client";

/**
 * Connect Four — original from-scratch remake of the classic disc-drop duel.
 * Play a minimax AI (three difficulties) or pass-and-play with a friend.
 * Bouncy disc drops, glowing win lines, alternating starters, win streaks.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Users } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

const COLS = 7;
const ROWS = 6;
type Player = 1 | 2;
type Mode = "ai" | "2p";
type Diff = "easy" | "medium" | "hard";

type Board = number[][]; // [row][col], 0 empty, 1 red, 2 yellow

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function dropRow(board: Board, col: number): number {
  for (let r = ROWS - 1; r >= 0; r--) if (board[r][col] === 0) return r;
  return -1;
}

function findWin(board: Board): { player: Player; cells: [number, number][] } | null {
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (!v) continue;
      for (const [dr, dc] of dirs) {
        const cells: [number, number][] = [[r, c]];
        for (let k = 1; k < 4; k++) {
          const nr = r + dr * k, nc = c + dc * k;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== v) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return { player: v as Player, cells };
      }
    }
  }
  return null;
}

function scoreWindow(window: number[], ai: Player): number {
  const opp = (ai === 1 ? 2 : 1) as Player;
  const mine = window.filter((v) => v === ai).length;
  const theirs = window.filter((v) => v === opp).length;
  const empty = window.filter((v) => v === 0).length;
  if (mine === 4) return 100000;
  if (mine === 3 && empty === 1) return 140;
  if (mine === 2 && empty === 2) return 14;
  if (theirs === 3 && empty === 1) return -170;
  if (theirs === 2 && empty === 2) return -10;
  if (theirs === 4) return -100000;
  return 0;
}

function evaluate(board: Board, ai: Player): number {
  let score = 0;
  // center column preference
  for (let r = 0; r < ROWS; r++) if (board[r][3] === ai) score += 9;
  const dirs: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const end_r = r + dr * 3, end_c = c + dc * 3;
        if (end_r < 0 || end_r >= ROWS || end_c < 0 || end_c >= COLS) continue;
        score += scoreWindow([0, 1, 2, 3].map((k) => board[r + dr * k][c + dc * k]), ai);
      }
    }
  }
  return score;
}

function minimax(board: Board, depth: number, alpha: number, beta: number, maximizing: boolean, ai: Player): [number, number] {
  const win = findWin(board);
  const valid: number[] = [];
  for (let c = 0; c < COLS; c++) if (dropRow(board, c) >= 0) valid.push(c);
  if (win) return [-1, win.player === ai ? 1000000 + depth : -1000000 - depth];
  if (valid.length === 0) return [-1, 0];
  if (depth === 0) return [-1, evaluate(board, ai)];

  // center-first ordering improves alpha-beta pruning
  valid.sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b));
  const human = (ai === 1 ? 2 : 1) as Player;

  if (maximizing) {
    let best = -Infinity;
    let bestCol = valid[0];
    for (const c of valid) {
      const r = dropRow(board, c);
      board[r][c] = ai;
      const [, val] = minimax(board, depth - 1, alpha, beta, false, ai);
      board[r][c] = 0;
      if (val > best) { best = val; bestCol = c; }
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return [bestCol, best];
  }
  let best = Infinity;
  let bestCol = valid[0];
  for (const c of valid) {
    const r = dropRow(board, c);
    board[r][c] = human;
    const [, val] = minimax(board, depth - 1, alpha, beta, true, ai);
    board[r][c] = 0;
    if (val < best) { best = val; bestCol = c; }
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return [bestCol, best];
}

function chooseAiMove(board: Board, ai: Player, diff: Diff): number {
  const valid: number[] = [];
  for (let c = 0; c < COLS; c++) if (dropRow(board, c) >= 0) valid.push(c);
  if (diff === "easy" && Math.random() < 0.38) {
    return valid[Math.floor(Math.random() * valid.length)];
  }
  const depth = diff === "easy" ? 2 : diff === "medium" ? 4 : 6;
  const copy = board.map((row) => [...row]);
  const [col] = minimax(copy, depth, -Infinity, Infinity, true, ai);
  return col >= 0 ? col : valid[0];
}

const DISC: Record<Player, { bg: string; ring: string; name: string }> = {
  1: { bg: "radial-gradient(circle at 34% 30%, #FF9D9D, #F5303C 55%, #B91C1C)", ring: "rgba(255,255,255,0.5)", name: "Red" },
  2: { bg: "radial-gradient(circle at 34% 30%, #FFF3B0, #FFC800 55%, #D97706)", ring: "rgba(255,255,255,0.55)", name: "Yellow" },
};

export default function ConnectFour({ onBack }: { onBack: () => void }) {
  const [board, setBoard] = useState<Board>(() => emptyBoard());
  const [turn, setTurn] = useState<Player>(1);
  const [starter, setStarter] = useState<Player>(1);
  const [mode, setMode] = useState<Mode>("ai");
  const [diff, setDiff] = useState<Diff>("medium");
  const [win, setWin] = useState<{ player: Player; cells: [number, number][] } | null>(null);
  const [draw, setDraw] = useState(false);
  const [lastDrop, setLastDrop] = useState<{ r: number; c: number; key: number } | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [tally, setTally] = useState<{ p1: number; p2: number; draws: number }>({ p1: 0, p2: 0, draws: 0 });
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => getBest("connect4"));
  const [showCard, setShowCard] = useState(false);
  const [cardInfo, setCardInfo] = useState<{ isNewBest: boolean } | null>(null);

  const boardRef = useRef(board);
  useEffect(() => {
    boardRef.current = board;
  }, [board]);
  const turnRef = useRef(turn);
  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);
  const busyRef = useRef(false);
  const dropKeyRef = useRef(0);
  const streakRef = useRef(0);

  useEffect(() => { bumpPlays("connect4"); }, []);

  const newRound = useCallback((nextStarter?: Player) => {
    const st = nextStarter ?? ((starter === 1 ? 2 : 1) as Player);
    setStarter(st);
    setBoard(emptyBoard());
    setTurn(st);
    setWin(null);
    setDraw(false);
    setLastDrop(null);
    setShowCard(false);
    setCardInfo(null);
    busyRef.current = false;
  }, [starter]);

  const resetMatch = useCallback(() => {
    setTally({ p1: 0, p2: 0, draws: 0 });
    streakRef.current = 0;
    setStreak(0);
    setStarter(1);
    setBoard(emptyBoard());
    setTurn(1);
    setWin(null);
    setDraw(false);
    setLastDrop(null);
    setShowCard(false);
    setCardInfo(null);
    busyRef.current = false;
  }, []);

  const placeDisc = useCallback((col: number) => {
    if (busyRef.current) return;
    const current = boardRef.current;
    if (findWin(current)) return;
    const row = dropRow(current, col);
    if (row < 0) {
      sfx.badSwap();
      return;
    }
    const player = turnRef.current;
    const next = current.map((r) => [...r]);
    next[row][col] = player;
    boardRef.current = next;
    setBoard(next);
    setLastDrop({ r: row, c: col, key: ++dropKeyRef.current });
    sfx.paddle();
    setTimeout(() => sfx.pop(0.7 + (ROWS - row) * 0.06), 260);
    busyRef.current = true;

    setTimeout(() => {
      busyRef.current = false;
      const w = findWin(next);
      const full = next[0].every((v) => v !== 0);
      if (w) {
        setWin(w);
        setTally((t) => ({ ...t, [w.player === 1 ? "p1" : "p2"]: t[w.player === 1 ? "p1" : "p2"] + 1 }));
        if (mode === "ai") {
          if (w.player === 1) {
            streakRef.current++;
            setStreak(streakRef.current);
            const res = submitScore("connect4", streakRef.current);
            setBest(res.best);
            setCardInfo({ isNewBest: res.isNewBest && streakRef.current > 1 });
            sfx.win();
          } else {
            streakRef.current = 0;
            setStreak(0);
            setCardInfo({ isNewBest: false });
            sfx.gameover();
          }
        } else {
          setCardInfo({ isNewBest: false });
          sfx.win();
        }
        setTimeout(() => setShowCard(true), 900);
      } else if (full) {
        setDraw(true);
        setTally((t) => ({ ...t, draws: t.draws + 1 }));
        setCardInfo({ isNewBest: false });
        sfx.gameover();
        setTimeout(() => setShowCard(true), 700);
      } else {
        const nt = (player === 1 ? 2 : 1) as Player;
        turnRef.current = nt;
        setTurn(nt);
      }
    }, 430);
  }, [mode]);

  // AI turn
  useEffect(() => {
    if (mode !== "ai" || turn !== 2 || win || draw) return;
    const timer = setTimeout(() => {
      const col = chooseAiMove(boardRef.current, 2, diff);
      if (col >= 0) placeDisc(col);
    }, 520);
    return () => clearTimeout(timer);
  }, [mode, turn, win, draw, diff, placeDisc]);

  const winSet = new Set(win ? win.cells.map(([r, c]) => `${r},${c}`) : []);
  const humanTurn = mode === "2p" || turn === 1;
  const boardW = "min(94vw, 520px, calc((100dvh - 330px) * 1.15))";

  const resultTitle = draw
    ? "🤝 It's a draw!"
    : win
      ? mode === "ai"
        ? win.player === 1 ? "🎉 You win!" : "🤖 CPU wins"
        : win.player === 1 ? "🔴 Red wins!" : "🟡 Yellow wins!"
      : "Game Over";

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#1CB0F6,#7B5CFF)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  return (
    <ArcadeShell
      title="Connect Four"
      emoji="🔴"
      color="linear-gradient(135deg,#FF4B4B,#1CB0F6)"
      score={mode === "ai" ? streak : tally.p1}
      scoreLabel={mode === "ai" ? "Win streak" : "Red wins"}
      best={best}
      bestOverride={mode === "ai" ? undefined : `${tally.p2} 🟡`}
      onBack={onBack}
      onRestart={resetMatch}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Tap a column to drop · first to connect 4 in a row wins!
        </p>
      }
    >
      {/* mode + difficulty + turn */}
      <div className="shrink-0 pt-3 pb-1 px-3 flex flex-wrap items-center justify-center gap-1.5">
        <button
          onClick={() => { sfx.click(); setMode("ai"); resetMatch(); }}
          className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5"
          style={chipStyle(mode === "ai")}
        >
          <Bot size={14} /> vs CPU
        </button>
        <button
          onClick={() => { sfx.click(); setMode("2p"); resetMatch(); }}
          className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5"
          style={chipStyle(mode === "2p")}
        >
          <Users size={14} /> 2 Players
        </button>
        {mode === "ai" && (["easy", "medium", "hard"] as Diff[]).map((d) => (
          <button
            key={d}
            onClick={() => { sfx.click(); setDiff(d); resetMatch(); }}
            className="btn-game px-2.5 py-1.5 text-xs capitalize"
            style={chipStyle(diff === d)}
          >
            {d === "easy" ? "😊 Easy" : d === "medium" ? "😐 Med" : "😈 Hard"}
          </button>
        ))}
      </div>

      <div className="shrink-0 flex items-center justify-center gap-2 pb-1">
        <span className="chip px-2.5 py-1 text-xs font-black" style={{ background: "rgba(245,48,60,0.2)", color: "#FFB3B3", border: "1.5px solid rgba(245,48,60,0.45)" }}>
          🔴 {mode === "ai" ? "You" : "Red"} · {tally.p1}
        </span>
        <span
          className="font-display font-semibold text-sm px-3 py-1 rounded-full"
          style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.22)" }}
        >
          {win || draw ? resultTitle : turn === 1 ? "🔴 Red to drop" : mode === "ai" ? "🤖 CPU thinking…" : "🟡 Yellow to drop"}
        </span>
        <span className="chip px-2.5 py-1 text-xs font-black" style={{ background: "rgba(255,200,0,0.18)", color: "#FFE27A", border: "1.5px solid rgba(255,200,0,0.45)" }}>
          🟡 {mode === "ai" ? "CPU" : "Yellow"} · {tally.p2}
        </span>
      </div>

      {/* board */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center px-2 pb-2">
        <div style={{ width: boardW }}>
          {/* hover ghost row */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS},1fr)` }} aria-hidden>
            {Array.from({ length: COLS }).map((_, c) => (
              <div key={c} className="flex justify-center pb-1">
                <span
                  className="block rounded-full transition-opacity duration-100"
                  style={{
                    width: "62%",
                    aspectRatio: "1",
                    background: DISC[turn].bg,
                    opacity: humanTurn && !win && hoverCol === c && dropRow(board, c) >= 0 ? 0.55 : 0,
                  }}
                />
              </div>
            ))}
          </div>

          <div
            className="relative rounded-3xl p-2.5"
            style={{
              background: "linear-gradient(165deg,#2563EB,#1E3A8A)",
              border: "2px solid rgba(255,255,255,0.25)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.5), inset 0 2px 0 rgba(255,255,255,0.25)",
            }}
          >
            <div className="grid gap-[5px]" style={{ gridTemplateColumns: `repeat(${COLS},1fr)` }}>
              {board.map((rowArr, r) =>
                rowArr.map((v, c) => {
                  const isWinDisc = winSet.has(`${r},${c}`);
                  const isDropping = lastDrop && lastDrop.r === r && lastDrop.c === c;
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      onClick={() => humanTurn && placeDisc(c)}
                      onMouseEnter={() => setHoverCol(c)}
                      onMouseLeave={() => setHoverCol(null)}
                      className="relative rounded-full touch-none"
                      style={{
                        aspectRatio: "1",
                        background: "radial-gradient(circle at 50% 42%, #0D1330 58%, #131A42 100%)",
                        boxShadow: "inset 0 3px 7px rgba(0,0,0,0.75), inset 0 -1px 2px rgba(255,255,255,0.12)",
                        cursor: humanTurn && !win ? "pointer" : "default",
                        border: "none",
                        padding: 0,
                      }}
                      aria-label={`Column ${c + 1}`}
                    >
                      {v !== 0 && (
                        <span
                          key={isDropping ? lastDrop.key : "static"}
                          className={`absolute rounded-full block ${isDropping ? "disc-drop" : ""} ${isWinDisc ? "win-pulse" : ""}`}
                          style={{
                            inset: "5%",
                            background: DISC[v as Player].bg,
                            border: `2px solid ${DISC[v as Player].ring}`,
                            boxShadow: "inset 0 -4px 7px rgba(0,0,0,0.3), 0 2px 3px rgba(0,0,0,0.4)",
                            ["--drop" as string]: `${-(r + 1) * 108}%`,
                          }}
                        >
                          <span className="absolute rounded-full block" style={{ inset: "24%", border: "2.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.13)" }} />
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
            {/* stand */}
            <div className="flex justify-between px-6 pt-1.5" aria-hidden>
              <span className="block w-3 h-4 rounded-b" style={{ background: "#16266B" }} />
              <span className="block w-3 h-4 rounded-b" style={{ background: "#16266B" }} />
            </div>
          </div>
        </div>
      </div>

      {showCard && (win || draw) && (
        <GameOverCard
          title={resultTitle}
          score={mode === "ai" ? streak : tally.p1}
          scoreLabel={mode === "ai" ? "Win streak" : "Red wins"}
          best={Math.max(best, streak)}
          isNewBest={!!cardInfo?.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Match score — 🔴 {tally.p1} · 🟡 {tally.p2} · 🤝 {tally.draws}
              {mode === "ai" && streak >= 2 ? ` · 🔥 ${streak} in a row!` : ""}
            </p>
          }
          onRestart={() => newRound()}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
