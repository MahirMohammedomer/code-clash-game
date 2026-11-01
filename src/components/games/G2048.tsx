"use client";

/**
 * 2048 Merge — original from-scratch remake of the classic sliding-tile
 * number merger. Buttery slide animations, merge pops, floating score
 * popups, undo, swipe + keyboard controls, win/keep-going, best score.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Undo2 } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type Tile = {
  id: number;
  v: number;
  r: number;
  c: number;
  dead?: boolean;
  isNew?: boolean;
  merged?: boolean;
};
type Dir = "left" | "right" | "up" | "down";
type Floater = { id: number; text: string; left: number; top: number };

const SIZE = 4;
let nextId = 1;
let floaterId = 1;

const TILE_COLORS: Record<number, { bg: string; fg: string; glow?: boolean }> = {
  2: { bg: "linear-gradient(145deg,#FFF1DC,#FFE3C2)", fg: "#8A5A2B" },
  4: { bg: "linear-gradient(145deg,#FFDFA8,#FFC46B)", fg: "#7A4A12" },
  8: { bg: "linear-gradient(145deg,#FFB25E,#FF8F3D)", fg: "#fff" },
  16: { bg: "linear-gradient(145deg,#FF8A3D,#FF6B2C)", fg: "#fff" },
  32: { bg: "linear-gradient(145deg,#FF7A59,#F6502F)", fg: "#fff" },
  64: { bg: "linear-gradient(145deg,#F6502F,#D92B1F)", fg: "#fff" },
  128: { bg: "linear-gradient(145deg,#F7D154,#EEB820)", fg: "#fff", glow: true },
  256: { bg: "linear-gradient(145deg,#F2C230,#DFA90C)", fg: "#fff", glow: true },
  512: { bg: "linear-gradient(145deg,#7ED957,#43B02A)", fg: "#fff", glow: true },
  1024: { bg: "linear-gradient(145deg,#35C26B,#1F9D55)", fg: "#fff", glow: true },
  2048: { bg: "linear-gradient(145deg,#FFC800,#FF9D00)", fg: "#fff", glow: true },
};

function tileColor(v: number) {
  if (v > 2048) return { bg: "linear-gradient(145deg,#7B5CFF,#4B2FBF)", fg: "#fff", glow: true };
  return TILE_COLORS[v] ?? TILE_COLORS[2];
}

function spawnTile(tiles: Tile[]): Tile[] {
  const used = new Set(tiles.filter((t) => !t.dead).map((t) => `${t.r},${t.c}`));
  const empty: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!used.has(`${r},${c}`)) empty.push([r, c]);
  if (empty.length === 0) return tiles;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  return [...tiles, { id: nextId++, v: Math.random() < 0.9 ? 2 : 4, r, c, isNew: true }];
}

function initialTiles(): Tile[] {
  return spawnTile(spawnTile([]));
}

function computeMove(tiles: Tile[], dir: Dir): { tiles: Tile[]; gained: number; moved: boolean; maxMerged: number } {
  const grid: (Tile | null)[][] = Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));
  tiles.filter((t) => !t.dead).forEach((t) => (grid[t.r][t.c] = t));

  const result: Tile[] = [];
  let gained = 0;
  let moved = false;
  let maxMerged = 0;

  for (let i = 0; i < SIZE; i++) {
    const line: [number, number][] =
      dir === "left"
        ? [[i, 0], [i, 1], [i, 2], [i, 3]]
        : dir === "right"
          ? [[i, 3], [i, 2], [i, 1], [i, 0]]
          : dir === "up"
            ? [[0, i], [1, i], [2, i], [3, i]]
            : [[3, i], [2, i], [1, i], [0, i]];
    const lineTiles = line.map(([r, c]) => grid[r][c]).filter(Boolean) as Tile[];

    let slot = 0;
    let k = 0;
    while (k < lineTiles.length) {
      const [tr, tc] = line[slot];
      const t = lineTiles[k];
      const next = lineTiles[k + 1];
      if (next && next.v === t.v) {
        result.push({ ...t, r: tr, c: tc, isNew: false, merged: true, dead: false });
        result.push({ ...next, r: tr, c: tc, isNew: false, merged: false, dead: true });
        gained += t.v * 2;
        maxMerged = Math.max(maxMerged, t.v * 2);
        moved = true;
        k += 2;
      } else {
        result.push({ ...t, r: tr, c: tc, isNew: false, merged: false, dead: false });
        if (t.r !== tr || t.c !== tc) moved = true;
        k += 1;
      }
      slot++;
    }
  }
  return { tiles: result, gained, moved, maxMerged };
}

function isGameOver(tiles: Tile[]): boolean {
  const grid: (number | null)[][] = Array.from({ length: SIZE }, () => Array<number | null>(SIZE).fill(null));
  tiles.filter((t) => !t.dead).forEach((t) => (grid[t.r][t.c] = t.v));
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === null) return false;
      if (c + 1 < SIZE && grid[r][c] === grid[r][c + 1]) return false;
      if (r + 1 < SIZE && grid[r][c] === grid[r + 1][c]) return false;
    }
  }
  return true;
}

export default function G2048({ onBack }: { onBack: () => void }) {
  const [tiles, setTiles] = useState<Tile[]>(() => initialTiles());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("g2048"));
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [over, setOver] = useState<{ best: number; isNewBest: boolean } | null>(null);
  const [won, setWon] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const lockRef = useRef(false);
  const tilesRef = useRef(tiles);
  const scoreRef = useRef(0);
  const undoRef = useRef<{ tiles: Tile[]; score: number } | null>(null);
  const wonRef = useRef(false);
  const overRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    bumpPlays("g2048");
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const newGame = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    lockRef.current = false;
    overRef.current = false;
    wonRef.current = false;
    undoRef.current = null;
    const t = initialTiles();
    tilesRef.current = t;
    scoreRef.current = 0;
    setTiles(t);
    setScore(0);
    setOver(null);
    setWon(false);
    setCanUndo(false);
    setFloaters([]);
  }, []);

  const move = useCallback((dir: Dir) => {
    if (lockRef.current || overRef.current) return;
    const current = tilesRef.current;
    const { tiles: slid, gained, moved, maxMerged } = computeMove(current, dir);
    if (!moved) return;

    undoRef.current = {
      tiles: current.filter((t) => !t.dead).map((t) => ({ ...t, isNew: false, merged: false })),
      score: scoreRef.current,
    };
    setCanUndo(true);

    // phase 1: slide
    lockRef.current = true;
    tilesRef.current = slid;
    setTiles(slid);
    if (gained > 0) sfx.merge(1 + Math.log2(Math.max(2, maxMerged)) / 14);
    else sfx.slide();

    // phase 2: resolve merges, spawn, check end
    timeoutRef.current = setTimeout(() => {
      let resolved = slid
        .filter((t) => !t.dead)
        .map((t) => (t.merged ? { ...t, v: t.v * 2 } : t));

      const newFloaters: Floater[] = resolved
        .filter((t) => t.merged)
        .map((t) => ({ id: floaterId++, text: `+${t.v}`, left: t.c * 25 + 12.5, top: t.r * 25 + 6 }));
      if (newFloaters.length > 0) {
        setFloaters((f) => [...f, ...newFloaters]);
        const ids = new Set(newFloaters.map((f) => f.id));
        setTimeout(() => setFloaters((f) => f.filter((x) => !ids.has(x.id))), 900);
      }

      resolved = spawnTile(resolved);
      tilesRef.current = resolved;
      setTiles(resolved);

      const newScore = scoreRef.current + gained;
      scoreRef.current = newScore;
      setScore(newScore);

      if (!wonRef.current && resolved.some((t) => t.v >= 2048)) {
        wonRef.current = true;
        setWon(true);
        sfx.win();
      }

      if (isGameOver(resolved)) {
        overRef.current = true;
        const res = submitScore("g2048", newScore);
        setBest(res.best);
        sfx.gameover();
        setTimeout(() => setOver(res), 350);
      }
      lockRef.current = false;
    }, 130);
  }, []);

  const undo = useCallback(() => {
    const snap = undoRef.current;
    if (!snap || lockRef.current) return;
    undoRef.current = null;
    overRef.current = false;
    tilesRef.current = snap.tiles;
    scoreRef.current = snap.score;
    setTiles(snap.tiles);
    setScore(snap.score);
    setOver(null);
    setCanUndo(false);
    sfx.swap();
  }, []);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const map: Record<string, Dir> = {
        ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
        a: "left", d: "right", w: "up", s: "down",
        A: "left", D: "right", W: "up", S: "down",
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        move(dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  const onPointerDown = (e: React.PointerEvent) => {
    touchRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };

  const back = () => {
    submitScore("g2048", scoreRef.current);
    onBack();
  };

  return (
    <ArcadeShell
      title="2048 Merge"
      emoji="🔢"
      color="linear-gradient(135deg,#FFC800,#FF7A18)"
      score={score}
      best={best}
      onBack={back}
      onRestart={newGame}
      footer={
        <div className="max-w-[620px] mx-auto flex items-center gap-2">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="btn-game px-4 py-2.5 flex items-center gap-1.5 disabled:opacity-40"
            style={{ background: "rgba(255,255,255,0.10)", color: "#fff", border: "2px solid rgba(255,255,255,0.25)", boxShadow: "0 3px 0 rgba(0,0,0,0.35)" }}
          >
            <Undo2 size={16} strokeWidth={2.7} /> Undo
          </button>
          <p className="flex-1 text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
            Swipe or use arrow keys — merge to 2048!
          </p>
          <button onClick={newGame} className="btn-game btn-orange px-4 py-2.5">
            New game
          </button>
        </div>
      }
    >
      <div
        className="relative rounded-3xl touch-none"
        style={{
          width: "min(94vw, 620px, calc(100dvh - 235px))",
          aspectRatio: "1",
          background: "linear-gradient(160deg,#3A3B5C,#26283B)",
          border: "2px solid rgba(255,255,255,0.14)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {/* empty cells */}
        <div className="absolute inset-0 grid grid-cols-4 grid-rows-4">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="p-[5px]">
              <div className="w-full h-full rounded-xl" style={{ background: "rgba(255,255,255,0.07)" }} />
            </div>
          ))}
        </div>

        {/* tiles */}
        {tiles.map((t) => {
          const col = tileColor(t.v);
          const digits = String(t.v).length;
          return (
            <div
              key={t.id}
              className="absolute left-0 top-0 w-1/4 h-1/4 p-[5px]"
              style={{
                transform: `translate(${t.c * 100}%, ${t.r * 100}%)`,
                transition: "transform 125ms ease-in-out",
                zIndex: t.dead ? 1 : t.merged ? 3 : 2,
              }}
            >
              <div
                className={`w-full h-full rounded-xl flex items-center justify-center font-display font-bold ${t.merged ? "tile-pop" : ""} ${t.isNew ? "tile-spawn" : ""}`}
                style={{
                  background: col.bg,
                  color: col.fg,
                  fontSize: digits <= 2 ? "clamp(26px,8vw,58px)" : digits === 3 ? "clamp(21px,6.5vw,46px)" : "clamp(17px,5.2vw,37px)",
                  boxShadow: col.glow ? "0 4px 14px rgba(255,190,0,0.45), 0 3px 0 rgba(0,0,0,0.25)" : "0 3px 0 rgba(0,0,0,0.22)",
                  textShadow: col.fg === "#fff" ? "0 1px 2px rgba(0,0,0,0.25)" : "none",
                }}
              >
                {t.v}
              </div>
            </div>
          );
        })}

        {/* floating score popups */}
        {floaters.map((f) => (
          <span
            key={f.id}
            className="float-up absolute font-display font-bold text-xl pointer-events-none z-10"
            style={{ left: `${f.left}%`, top: `${f.top}%`, color: "#FFE27A", textShadow: "0 2px 6px rgba(0,0,0,0.7)" }}
          >
            {f.text}
          </span>
        ))}

        {won && !over && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 rounded-3xl" style={{ background: "rgba(255,190,0,0.28)", backdropFilter: "blur(2px)" }}>
            <div className="card-game w-full max-w-[260px] p-5 text-center animate-pop" style={{ background: "#23243F", borderColor: "rgba(255,200,0,0.5)", color: "#fff" }}>
              <p className="text-4xl mb-1" aria-hidden>🎉</p>
              <h3 className="font-display font-bold text-2xl">You made 2048!</h3>
              <p className="text-xs font-bold mt-1" style={{ color: "rgba(255,255,255,0.7)" }}>Legendary! Keep going for 4096?</p>
              <button onClick={() => setWon(false)} className="btn-game btn-green w-full py-3 mt-3">Keep going →</button>
              <button onClick={newGame} className="btn-game w-full py-2.5 mt-2" style={{ background: "rgba(255,255,255,0.10)", color: "#fff", border: "2px solid rgba(255,255,255,0.25)" }}>
                New game
              </button>
            </div>
          </div>
        )}
      </div>

      {over && (
        <GameOverCard
          score={score}
          best={over.best}
          isNewBest={over.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Biggest tile: {Math.max(0, ...tiles.filter((t) => !t.dead).map((t) => t.v))}
            </p>
          }
          onRestart={newGame}
          onBack={back}
        />
      )}
    </ArcadeShell>
  );
}
