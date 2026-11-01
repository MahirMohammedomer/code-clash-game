"use client";

/**
 * Mine Sweeper — original from-scratch remake of the classic logic puzzle.
 * Three difficulties, guaranteed-safe first tap, flag mode + long-press +
 * right-click flagging, number chording, a live timer, per-difficulty best
 * times, and a board that fits itself to any screen.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Flag, Shovel } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type DiffId = "easy" | "medium" | "hard";
const DIFFS: Record<DiffId, { label: string; cols: number; rows: number; mines: number }> = {
  easy: { label: "Easy", cols: 9, rows: 9, mines: 10 },
  medium: { label: "Medium", cols: 12, rows: 12, mines: 26 },
  hard: { label: "Hard", cols: 16, rows: 13, mines: 44 },
};

interface Cell { mine: boolean; revealed: boolean; flag: boolean; count: number }

const NUM_COLORS = ["", "#38BDF8", "#4ADE80", "#F87171", "#C084FC", "#FB923C", "#2DD4BF", "#F472B6", "#E5E7EB"];

function blankBoard(cols: number, rows: number): Cell[] {
  return Array.from({ length: cols * rows }, () => ({ mine: false, revealed: false, flag: false, count: 0 }));
}

function neighbors(idx: number, cols: number, rows: number): number[] {
  const x = idx % cols;
  const y = Math.floor(idx / cols);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) out.push(ny * cols + nx);
    }
  }
  return out;
}

function timeKey(diff: DiffId) { return `arcade_besttime_mines_${diff}`; }
function loadBestTime(diff: DiffId): number {
  try { return Number(localStorage.getItem(timeKey(diff)) ?? 0) || 0; } catch { return 0; }
}
function loadWins(): number {
  try { return Number(localStorage.getItem("arcade_mines_wins") ?? 0) || 0; } catch { return 0; }
}

export default function MineSweeper({ onBack }: { onBack: () => void }) {
  const [diffId, setDiffId] = useState<DiffId>("easy");
  const diff = DIFFS[diffId];
  const [cells, setCells] = useState<Cell[]>(() => blankBoard(9, 9));
  const [status, setStatus] = useState<"ready" | "playing" | "won" | "lost">("ready");
  const [mode, setMode] = useState<"dig" | "flag">("dig");
  const [flagsUsed, setFlagsUsed] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [bestTime, setBestTime] = useState<number>(() => loadBestTime("easy"));
  const [wins, setWins] = useState<number>(() => Math.max(loadWins(), getBest("mines")));
  const [cellPx, setCellPx] = useState(32);
  const [overInfo, setOverInfo] = useState<{ won: boolean; isNewBest: boolean; bestShown: number } | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef(cells);
  useEffect(() => {
    cellsRef.current = cells;
  }, [cells]);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  const plantedRef = useRef(false);
  const startAtRef = useRef(0);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);

  // fit the board to the available stage
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const rect = wrap.getBoundingClientRect();
      const px = Math.floor(Math.min(rect.width / diff.cols, rect.height / diff.rows));
      setCellPx(Math.max(20, Math.min(46, px)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [diff.cols, diff.rows]);

  useEffect(() => { bumpPlays("mines"); }, []);

  const newGame = useCallback((d: DiffId) => {
    plantedRef.current = false;
    setDiffId(d);
    setCells(blankBoard(DIFFS[d].cols, DIFFS[d].rows));
    setStatus("ready");
    setFlagsUsed(0);
    setElapsed(0);
    setOverInfo(null);
    setBestTime(loadBestTime(d));
  }, []);

  const restart = useCallback(() => newGame(diffId), [newGame, diffId]);

  // timer
  useEffect(() => {
    if (status !== "playing") return;
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startAtRef.current) / 1000));
    }, 250);
    return () => clearInterval(iv);
  }, [status]);

  const plantMines = useCallback((board: Cell[], safeIdx: number, d: typeof diff): Cell[] => {
    const safe = new Set([safeIdx, ...neighbors(safeIdx, d.cols, d.rows)]);
    const next = board.map((c) => ({ ...c }));
    let placed = 0;
    while (placed < d.mines) {
      const i = Math.floor(Math.random() * next.length);
      if (safe.has(i) || next[i].mine) continue;
      next[i].mine = true;
      placed++;
    }
    for (let i = 0; i < next.length; i++) {
      next[i].count = neighbors(i, d.cols, d.rows).filter((n) => next[n].mine).length;
    }
    return next;
  }, []);

  const finish = useCallback((won: boolean, finalElapsed: number) => {
    setStatus(won ? "won" : "lost");
    if (won) {
      sfx.win();
      const newWins = loadWins() + 1;
      try { localStorage.setItem("arcade_mines_wins", String(newWins)); } catch {}
      setWins(newWins);
      submitScore("mines", newWins);
      const prevBest = loadBestTime(diffId);
      const isNew = prevBest === 0 || finalElapsed < prevBest;
      if (isNew) {
        try { localStorage.setItem(timeKey(diffId), String(finalElapsed)); } catch {}
        setBestTime(finalElapsed);
      }
      setTimeout(() => setOverInfo({ won: true, isNewBest: isNew, bestShown: isNew ? finalElapsed : prevBest }), 650);
    } else {
      sfx.explosion();
      setTimeout(() => setOverInfo({ won: false, isNewBest: false, bestShown: loadBestTime(diffId) || finalElapsed }), 750);
    }
  }, [diffId]);

  const revealFrom = useCallback((startIdx: number, boardIn: Cell[], d: typeof diff): Cell[] => {
    const next = boardIn.map((c) => ({ ...c }));
    const stack = [startIdx];
    while (stack.length) {
      const i = stack.pop()!;
      const cell = next[i];
      if (cell.revealed || cell.flag) continue;
      cell.revealed = true;
      if (cell.count === 0 && !cell.mine) {
        for (const n of neighbors(i, d.cols, d.rows)) {
          if (!next[n].revealed && !next[n].flag) stack.push(n);
        }
      }
    }
    return next;
  }, []);

  const checkWin = useCallback((board: Cell[], d: typeof diff): boolean => {
    const revealed = board.filter((c) => c.revealed).length;
    return revealed === d.cols * d.rows - d.mines;
  }, []);

  const dig = useCallback((idx: number) => {
    if (statusRef.current === "won" || statusRef.current === "lost") return;
    const d = DIFFS[diffId];
    let board = cellsRef.current;

    // first dig: plant mines away from the tap, start the clock
    if (!plantedRef.current) {
      if (board[idx].flag) return;
      board = plantMines(board, idx, d);
      plantedRef.current = true;
      startAtRef.current = Date.now();
      setStatus("playing");
    }

    const cell = board[idx];

    // chording: tapping a satisfied number reveals its remaining neighbors
    if (cell.revealed && cell.count > 0) {
      const around = neighbors(idx, d.cols, d.rows);
      const flags = around.filter((n) => board[n].flag).length;
      if (flags !== cell.count) return;
      let hitMine = false;
      let next = board;
      for (const n of around) {
        if (!next[n].revealed && !next[n].flag) {
          if (next[n].mine) hitMine = true;
          next = revealFrom(n, next, d);
        }
      }
      if (hitMine) {
        next = next.map((c) => (c.mine ? { ...c, revealed: true } : c));
        setCells(next);
        finish(false, Math.floor((Date.now() - startAtRef.current) / 1000));
        return;
      }
      setCells(next);
      sfx.pop(1.2);
      if (checkWin(next, d)) finish(true, Math.floor((Date.now() - startAtRef.current) / 1000));
      return;
    }

    if (cell.revealed || cell.flag) return;

    if (cell.mine) {
      const next = board.map((c, i) => (c.mine || i === idx ? { ...c, revealed: true } : c));
      setCells(next);
      finish(false, Math.floor((Date.now() - startAtRef.current) / 1000));
      return;
    }

    const next = revealFrom(idx, board, d);
    setCells(next);
    sfx.pop(0.8 + Math.min(0.6, next[idx].count * 0.08));
    if (checkWin(next, d)) finish(true, Math.floor((Date.now() - startAtRef.current) / 1000));
  }, [diffId, plantMines, revealFrom, checkWin, finish]);

  const toggleFlag = useCallback((idx: number) => {
    if (statusRef.current === "won" || statusRef.current === "lost") return;
    const cell = cellsRef.current[idx];
    if (cell.revealed) return;
    const next = cellsRef.current.map((c, i) => (i === idx ? { ...c, flag: !c.flag } : c));
    setCells(next);
    setFlagsUsed(next.filter((c) => c.flag).length);
    sfx.click();
    if (navigator.vibrate) navigator.vibrate(18);
  }, []);

  const onCellPointerDown = (idx: number) => {
    longPressedRef.current = false;
    if (longPressRef.current) clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      longPressedRef.current = true;
      toggleFlag(idx);
    }, 420);
  };
  const onCellPointerUp = (idx: number) => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
    if (longPressedRef.current) return;
    if (mode === "flag") toggleFlag(idx);
    else dig(idx);
  };
  const onCellPointerLeave = () => {
    if (longPressRef.current) clearTimeout(longPressRef.current);
  };

  const minesLeft = diff.mines - flagsUsed;
  const faceEmoji = status === "won" ? "😎" : status === "lost" ? "😵" : status === "playing" ? "🙂" : "😴";

  return (
    <ArcadeShell
      title="Mine Sweeper"
      emoji="💣"
      color="linear-gradient(135deg,#5B8DEF,#8A97AD)"
      score={elapsed}
      scoreLabel="Time (s)"
      best={bestTime}
      bestOverride={bestTime > 0 ? `${bestTime}s` : "—"}
      onBack={onBack}
      onRestart={restart}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Tap to dig · long-press or 🚩 mode to flag · tap a satisfied number to chord · 🏆 {wins} wins
        </p>
      }
    >
      {/* control bar */}
      <div className="shrink-0 pt-3 pb-2 px-3 flex flex-wrap items-center justify-center gap-1.5">
        {(Object.keys(DIFFS) as DiffId[]).map((d) => (
          <button
            key={d}
            onClick={() => { sfx.click(); newGame(d); }}
            className="btn-game px-3 py-1.5 text-xs"
            style={
              d === diffId
                ? { background: "linear-gradient(120deg,#1CB0F6,#7B5CFF)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
                : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" }
            }
          >
            {DIFFS[d].label}
          </button>
        ))}
        <span className="chip px-2.5 py-1.5 text-xs font-black ml-1" style={{ background: "rgba(0,0,0,0.35)", color: minesLeft < 0 ? "#FF8A8A" : "#fff", border: "1.5px solid rgba(255,255,255,0.2)" }}>
          💣 {minesLeft}
        </span>
        <button
          onClick={restart}
          className="btn-game w-9 h-9 !rounded-full flex items-center justify-center text-lg"
          style={{ background: "rgba(255,200,0,0.2)", border: "2px solid rgba(255,200,0,0.45)" }}
          aria-label="New game"
          title="New game"
        >
          {faceEmoji}
        </button>
        <button
          onClick={() => { setMode(mode === "dig" ? "flag" : "dig"); sfx.click(); }}
          className="btn-game px-3.5 py-2 text-xs flex items-center gap-1.5"
          style={
            mode === "flag"
              ? { background: "linear-gradient(120deg,#FF4B6E,#FF7A18)", color: "#fff", border: "2px solid rgba(255,255,255,0.45)" }
              : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" }
          }
          aria-label="Toggle flag mode"
        >
          {mode === "dig" ? <Shovel size={14} strokeWidth={2.7} /> : <Flag size={14} strokeWidth={2.7} />}
          {mode === "dig" ? "Digging" : "Flagging"}
        </button>
      </div>

      {/* board (measured to fit) */}
      <div ref={wrapRef} className="flex-1 min-h-0 w-full flex items-center justify-center relative px-2 pb-2">
        <div
          className="rounded-2xl p-2"
          style={{
            background: "linear-gradient(160deg,#26314D,#171E33)",
            border: "2px solid rgba(255,255,255,0.13)",
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${diff.cols}, ${cellPx}px)`,
              gridTemplateRows: `repeat(${diff.rows}, ${cellPx}px)`,
              gap: 3,
            }}
          >
            {cells.map((cell, i) => {
              const showMine = cell.revealed && cell.mine;
              const wrongFlag = (status === "lost") && cell.flag && !cell.mine;
              return (
                <button
                  key={i}
                  type="button"
                  onPointerDown={() => onCellPointerDown(i)}
                  onPointerUp={() => onCellPointerUp(i)}
                  onPointerLeave={onCellPointerLeave}
                  onContextMenu={(e) => { e.preventDefault(); toggleFlag(i); }}
                  className="flex items-center justify-center font-black select-none touch-none"
                  style={{
                    width: cellPx,
                    height: cellPx,
                    borderRadius: Math.max(4, cellPx * 0.16),
                    fontSize: cellPx * 0.52,
                    lineHeight: 1,
                    color: NUM_COLORS[cell.count],
                    background: cell.revealed
                      ? showMine
                        ? "linear-gradient(150deg,#FF5A5A,#C22424)"
                        : "rgba(10,14,28,0.85)"
                      : "linear-gradient(150deg,#3E5F8A,#2C4A73)",
                    border: cell.revealed ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(255,255,255,0.22)",
                    boxShadow: cell.revealed ? "inset 0 2px 5px rgba(0,0,0,0.55)" : "0 2px 0 rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                    cursor: cell.revealed ? "default" : "pointer",
                  }}
                  aria-label={`Cell ${i + 1}`}
                >
                  {cell.flag && !cell.revealed ? "🚩" : wrongFlag ? "✖️" : showMine ? "💣" : cell.revealed && cell.count > 0 ? cell.count : ""}
                </button>
              );
            })}
          </div>
        </div>

        {status === "ready" && (
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs font-black px-3 py-1.5 rounded-full whitespace-nowrap" style={{ background: "rgba(255,255,255,0.92)", color: "#26283B" }}>
              First tap is always safe — good luck! 🍀
          </p>
        )}
      </div>

      {overInfo && (
        <GameOverCard
          title={overInfo.won ? "🎉 Field cleared!" : "💥 Boom!"}
          score={elapsed}
          scoreLabel="Time (s)"
          best={overInfo.bestShown}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              {overInfo.won
                ? `${diff.label} solved in ${elapsed}s · 🏆 ${wins} total wins`
                : "The mines win this round — sweep again, soldier!"}
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
