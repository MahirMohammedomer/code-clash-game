"use client";

/**
 * Jigsaw Joy — original from-scratch jigsaw puzzle.
 * Drag the scattered pieces onto the board; they snap home with a sparkle
 * when close. 12, 24 or 48 pieces, a ghost guide under the board, a peek
 * button, and best-time records per size. The picture is our own
 * illustrated artwork.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Eye, Shuffle } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

const IMG = "/arcade/jigsaw.jpg";

type SizeId = "easy" | "medium" | "hard";
const SIZES: Record<SizeId, { label: string; cols: number; rows: number }> = {
  easy: { label: "12 pieces", cols: 4, rows: 3 },
  medium: { label: "24 pieces", cols: 6, rows: 4 },
  hard: { label: "48 pieces", cols: 8, rows: 6 },
};

interface Piece {
  idx: number; // home index (row-major)
  fx: number; // top-left position as fraction of play area
  fy: number;
  locked: boolean;
  z: number;
}

function timeKey(size: SizeId) { return `arcade_besttime_jigsaw_${size}`; }
function loadBestTime(size: SizeId): number {
  try { return Number(localStorage.getItem(timeKey(size)) ?? 0) || 0; } catch { return 0; }
}
function loadWins(): number {
  try { return Number(localStorage.getItem("arcade_jigsaw_wins") ?? 0) || 0; } catch { return 0; }
}
function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export default function JigsawJoy({ onBack }: { onBack: () => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [wrapSize, setWrapSize] = useState({ w: 360, h: 480 });
  const [aspect, setAspect] = useState(4 / 3);
  const [sizeId, setSizeId] = useState<SizeId>("easy");
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<"playing" | "won">("playing");
  const [peek, setPeek] = useState(false);
  const [bestTime, setBestTime] = useState(() => loadBestTime("easy"));
  const [wins, setWins] = useState(() => Math.max(loadWins(), getBest("jigsaw")));
  const [showCard, setShowCard] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const [sparkle, setSparkle] = useState(-1);

  const startAtRef = useRef(0);
  const zTopRef = useRef(10);
  const dragRef = useRef<{ idx: number; dx: number; dy: number } | null>(null);
  const piecesRef = useRef<Piece[]>([]);
  useEffect(() => { piecesRef.current = pieces; }, [pieces]);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);

  // measure play area + image aspect
  useEffect(() => {
    bumpPlays("jigsaw");
    const img = new Image();
    img.onload = () => setAspect(img.naturalWidth / Math.max(1, img.naturalHeight));
    img.src = IMG;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const r = wrap.getBoundingClientRect();
      setWrapSize({ w: Math.max(260, r.width), h: Math.max(300, r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const { cols, rows } = SIZES[sizeId];
  const board = (() => {
    const availW = wrapSize.w * 0.94;
    const availH = wrapSize.h * 0.56;
    const bw = Math.min(availW, availH * aspect);
    const bh = bw / aspect;
    return { x: (wrapSize.w - bw) / 2, y: 10, w: bw, h: bh, cw: bw / cols, ch: bh / rows };
  })();

  const scatter = useCallback((all: Piece[], bw: number, trayTop: number, areaW: number, areaH: number, cw: number, ch: number) => {
    // loose shuffled rows in the tray zone under the board
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    const trayH = Math.max(ch + 8, areaH - trayTop - ch - 6);
    const perRow = Math.max(3, Math.floor((areaW - cw) / (cw * 0.82)));
    shuffled.forEach((p, i) => {
      if (p.locked) return;
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const rowCount = Math.ceil(shuffled.length / perRow);
      const xPx = 6 + col * cw * 0.82 + Math.random() * 8;
      const yPx = trayTop + (rowCount > 1 ? (row / (rowCount - 1)) * Math.max(0, trayH - ch) : 0) + Math.random() * 6;
      p.fx = Math.min(0.98, xPx / areaW);
      p.fy = Math.min(0.98, yPx / areaH);
      p.z = 5 + i;
    });
    void bw;
    return shuffled;
  }, []);

  const newGame = useCallback((s: SizeId) => {
    setSizeId(s);
    const { cols: c, rows: r } = SIZES[s];
    // compute board with the new grid for the initial scatter
    const availW = wrapSize.w * 0.94;
    const availH = wrapSize.h * 0.56;
    const bw = Math.min(availW, availH * aspect);
    const bh = bw / aspect;
    const all: Piece[] = Array.from({ length: c * r }, (_, i) => ({ idx: i, fx: 0, fy: 0, locked: false, z: 1 }));
    const scattered = scatter(all, bw, 10 + bh + 12, wrapSize.w, wrapSize.h, bw / c, bh / r);
    zTopRef.current = 10 + scattered.length;
    setPieces(scattered);
    setElapsed(0);
    startAtRef.current = Date.now();
    setStatus("playing");
    setShowCard(false);
    setBestTime(loadBestTime(s));
    setSparkle(-1);
    sfx.click();
  }, [wrapSize, aspect, scatter]);

  // first deal once measured
  const dealtRef = useRef(false);
  useEffect(() => {
    if (dealtRef.current || wrapSize.w <= 260) return;
    dealtRef.current = true;
    newGame("easy");
  }, [wrapSize, newGame]);

  // timer
  useEffect(() => {
    if (status !== "playing") return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startAtRef.current) / 1000)), 500);
    return () => clearInterval(iv);
  }, [status]);

  const reshuffleTray = useCallback(() => {
    setPieces((prev) => {
      const next = prev.map((p) => ({ ...p }));
      return scatter(next, board.w, board.y + board.h + 12, wrapSize.w, wrapSize.h, board.cw, board.ch);
    });
    sfx.click();
  }, [board.w, board.y, board.h, board.cw, board.ch, wrapSize, scatter]);

  const finishWin = useCallback(() => {
    const finalElapsed = Math.floor((Date.now() - startAtRef.current) / 1000);
    setElapsed(finalElapsed);
    setStatus("won");
    sfx.win();
    const newWins = loadWins() + 1;
    try { localStorage.setItem("arcade_jigsaw_wins", String(newWins)); } catch {}
    setWins(newWins);
    submitScore("jigsaw", newWins);
    const prevBest = loadBestTime(sizeId);
    const isNew = prevBest === 0 || finalElapsed < prevBest;
    if (isNew) {
      try { localStorage.setItem(timeKey(sizeId), String(finalElapsed)); } catch {}
      setBestTime(finalElapsed);
    }
    setIsNewBest(isNew);
    setTimeout(() => setShowCard(true), 700);
  }, [sizeId]);

  const onPieceDown = (idx: number) => (e: React.PointerEvent) => {
    const p = piecesRef.current.find((x) => x.idx === idx);
    if (!p || p.locked || statusRef.current !== "playing") return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    dragRef.current = { idx, dx: px - p.fx * wrapSize.w, dy: py - p.fy * wrapSize.h };
    zTopRef.current++;
    const z = zTopRef.current;
    setPieces((prev) => prev.map((x) => (x.idx === idx ? { ...x, z } : x)));
    sfx.click();
  };

  const onPieceMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = e.clientX - rect.left - drag.dx;
    const py = e.clientY - rect.top - drag.dy;
    setPieces((prev) =>
      prev.map((x) =>
        x.idx === drag.idx
          ? { ...x, fx: Math.max(0, Math.min(0.99, px / wrapSize.w)), fy: Math.max(0, Math.min(0.99, py / wrapSize.h)) }
          : x
      )
    );
  };

  const onPieceUp = (idx: number) => () => {
    const drag = dragRef.current;
    if (!drag || drag.idx !== idx) return;
    dragRef.current = null;
    const p = piecesRef.current.find((x) => x.idx === idx);
    if (!p) return;
    const homeCol = idx % cols;
    const homeRow = Math.floor(idx / cols);
    const targetX = board.x + homeCol * board.cw;
    const targetY = board.y + homeRow * board.ch;
    const curX = p.fx * wrapSize.w;
    const curY = p.fy * wrapSize.h;
    const snapDist = Math.min(board.cw, board.ch) * 0.42;
    if (Math.hypot(curX - targetX, curY - targetY) < snapDist) {
      const next = piecesRef.current.map((x) =>
        x.idx === idx ? { ...x, locked: true, fx: targetX / wrapSize.w, fy: targetY / wrapSize.h, z: 2 } : x
      );
      setPieces(next);
      piecesRef.current = next;
      setSparkle(idx);
      sfx.merge(1.3);
      setTimeout(() => setSparkle(-1), 350);
      if (next.every((x) => x.locked)) finishWin();
    } else {
      sfx.pop(0.7);
    }
  };

  const placed = pieces.filter((p) => p.locked).length;

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#A560E8,#FF4B6E)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  return (
    <ArcadeShell
      title="Jigsaw Joy"
      emoji="🧩"
      color="linear-gradient(135deg,#A560E8,#FF4B6E)"
      score={elapsed}
      scoreLabel="Time"
      scoreDisplay={fmt(elapsed)}
      best={bestTime}
      bestOverride={bestTime > 0 ? fmt(bestTime) : "—"}
      onBack={onBack}
      onRestart={() => newGame(sizeId)}
      footer={
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            {(Object.keys(SIZES) as SizeId[]).map((s) => (
              <button key={s} onClick={() => newGame(s)} className="btn-game px-3 py-1.5 text-xs" style={chipStyle(sizeId === s)}>
                {SIZES[s].label}
              </button>
            ))}
            <button
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5 text-white touch-none"
              style={{ background: "rgba(255,255,255,0.09)", border: "2px solid rgba(255,255,255,0.2)" }}
            >
              <Eye size={14} /> Hold to peek
            </button>
            <button onClick={reshuffleTray} className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5 text-white" style={{ background: "rgba(255,255,255,0.09)", border: "2px solid rgba(255,255,255,0.2)" }}>
              <Shuffle size={14} /> Shuffle tray
            </button>
          </div>
          <p className="text-center text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
            🧩 {placed}/{cols * rows} placed · 🏆 {wins} completed · drag pieces onto the board
          </p>
        </div>
      }
    >
      <div ref={wrapRef} className="absolute inset-0" onPointerMove={onPieceMove}>
        {/* board frame + ghost guide */}
        <div
          className="absolute rounded-xl overflow-hidden"
          style={{
            left: board.x, top: board.y, width: board.w, height: board.h,
            border: "3px solid rgba(255,255,255,0.3)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.5)",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- our own generated artwork */}
          <img src={IMG} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ opacity: peek ? 1 : 0.22 }} draggable={false} />
          {/* cell guides */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.14) 1px, transparent 1px)`,
              backgroundSize: `${board.cw}px ${board.ch}px`,
            }}
          />
        </div>

        {/* pieces */}
        {pieces.map((p) => {
          const homeCol = p.idx % cols;
          const homeRow = Math.floor(p.idx / cols);
          const left = p.locked ? board.x + homeCol * board.cw : p.fx * wrapSize.w;
          const top = p.locked ? board.y + homeRow * board.ch : p.fy * wrapSize.h;
          return (
            <div
              key={p.idx}
              onPointerDown={onPieceDown(p.idx)}
              onPointerUp={onPieceUp(p.idx)}
              onPointerCancel={onPieceUp(p.idx)}
              className="absolute touch-none select-none"
              style={{
                left, top,
                width: board.cw, height: board.ch,
                zIndex: p.locked ? 2 : p.z,
                cursor: p.locked ? "default" : "grab",
                padding: p.locked ? 0 : 1.5,
              }}
              role="button"
              aria-label={p.locked ? "Placed piece" : "Puzzle piece — drag me"}
            >
              <div
                className="w-full h-full overflow-hidden relative"
                style={{
                  borderRadius: p.locked ? 0 : 7,
                  backgroundImage: `url(${IMG})`,
                  backgroundSize: `${cols * 100}% ${rows * 100}%`,
                  backgroundPosition: cols > 1 && rows > 1 ? `${(homeCol / (cols - 1)) * 100}% ${(homeRow / (rows - 1)) * 100}%` : "0% 0%",
                  border: p.locked ? "1px solid rgba(0,0,0,0.25)" : "2px solid rgba(255,255,255,0.75)",
                  boxShadow: p.locked ? "none" : "0 5px 12px rgba(0,0,0,0.5)",
                }}
              >
                {sparkle === p.idx && (
                  <span className="absolute inset-0 flex items-center justify-center text-xl pointer-events-none">✨</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCard && status === "won" && (
        <GameOverCard
          title="🧩 Puzzle complete!"
          score={elapsed}
          scoreLabel="Time"
          scoreDisplay={fmt(elapsed)}
          best={bestTime || elapsed}
          bestDisplay={fmt(bestTime || elapsed)}
          isNewBest={isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              {SIZES[sizeId].label} finished · 🏆 {wins} puzzles completed
            </p>
          }
          onRestart={() => newGame(sizeId)}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
