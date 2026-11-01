"use client";

/**
 * Snake — original from-scratch remake of the timeless classic.
 * Smooth interpolated movement (not choppy grid jumps), golden bonus
 * apples, particle bursts, speed ramping, swipe / D-pad / keyboard.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { ArcadeShell, GameOverCard, StartHint } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

/** The board reshapes itself to the screen: ~26px cells, clamped to sane bounds. */
function gridForSize(w: number, h: number): { cols: number; rows: number } {
  const cols = Math.max(15, Math.min(38, Math.floor(w / 26)));
  const rows = Math.max(15, Math.min(38, Math.floor(h / 26)));
  return { cols, rows };
}
type Pt = { x: number; y: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };

interface Engine {
  cols: number;
  rows: number;
  snake: Pt[];
  prev: Pt[];
  dir: Pt;
  queue: Pt[];
  food: Pt;
  golden: (Pt & { expires: number }) | null;
  foodCount: number;
  score: number;
  tickMs: number;
  acc: number;
  last: number;
  dead: boolean;
  started: boolean;
  shake: number;
  particles: Particle[];
}

function randomCell(snake: Pt[], extra: Pt[], cols: number, rows: number): Pt {
  for (;;) {
    const p = { x: Math.floor(Math.random() * cols), y: Math.floor(Math.random() * rows) };
    if (!snake.some((s) => s.x === p.x && s.y === p.y) && !extra.some((s) => s.x === p.x && s.y === p.y)) return p;
  }
}

function freshEngine(cols = 21, rows = 21): Engine {
  const cy = Math.floor(rows / 2);
  const hx = Math.floor(cols / 2);
  const snake = [
    { x: hx, y: cy },
    { x: hx - 1, y: cy },
    { x: hx - 2, y: cy },
  ];
  return {
    cols,
    rows,
    snake,
    prev: snake.map((p) => ({ ...p })),
    dir: { x: 1, y: 0 },
    queue: [],
    food: randomCell(snake, [], cols, rows),
    golden: null,
    foodCount: 0,
    score: 0,
    tickMs: 150,
    acc: 0,
    last: 0,
    dead: false,
    started: false,
    shake: 0,
    particles: [],
  };
}

export default function Snake({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(
    (() => {
      const { cols, rows } = gridForSize(
        typeof window !== "undefined" ? window.innerWidth : 390,
        typeof window !== "undefined" ? window.innerHeight - 120 : 640
      );
      return freshEngine(cols, rows);
    })()
  );
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time environment probe
    setIsTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("snake"));
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean; length: number; apples: number } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const restart = useCallback(() => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const { cols, rows } = rect ? gridForSize(rect.width, rect.height) : { cols: 21, rows: 21 };
    engineRef.current = freshEngine(cols, rows);
    setScore(0);
    setOverInfo(null);
    setPhase("ready");
  }, []);

  useEffect(() => {
    bumpPlays("snake");
  }, []);

  const start = useCallback(() => {
    const e = engineRef.current;
    if (phaseRef.current === "ready") {
      e.started = true;
      setPhase("playing");
      sfx.click();
    }
  }, []);

  const setDir = useCallback((d: Pt) => {
    const e = engineRef.current;
    const last = e.queue.length > 0 ? e.queue[e.queue.length - 1] : e.dir;
    if (last.x === -d.x && last.y === -d.y) return; // no 180° turns
    if (last.x === d.x && last.y === d.y) return;
    if (e.queue.length < 3) e.queue.push(d);
    if (phaseRef.current === "ready") start();
  }, [start]);

  // keyboard
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const map: Record<string, Pt> = {
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
        a: { x: -1, y: 0 }, d: { x: 1, y: 0 }, w: { x: 0, y: -1 }, s: { x: 0, y: 1 },
        A: { x: -1, y: 0 }, D: { x: 1, y: 0 }, W: { x: 0, y: -1 }, S: { x: 0, y: 1 },
      };
      const d = map[ev.key];
      if (d) {
        ev.preventDefault();
        setDir(d);
      } else if (ev.key === " ") {
        ev.preventDefault();
        start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDir, start]);

  // main loop + rendering
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let cw = 300;
    let ch = 300;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const e = engineRef.current;
      const cell = Math.max(10, Math.floor(Math.min(rect.width / e.cols, rect.height / e.rows)));
      cw = cell * e.cols;
      ch = cell * e.rows;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = cw * dpr;
      canvas.height = ch * dpr;
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    const burst = (e: Engine, x: number, y: number, color: string) => {
      for (let i = 0; i < 14; i++) {
        e.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 3.2,
          vy: (Math.random() - 0.5) * 3.2,
          life: 0, max: 380 + Math.random() * 260,
          color, size: 1.6 + Math.random() * 2.4,
        });
      }
    };

    const step = (e: Engine) => {
      e.prev = e.snake.map((p) => ({ ...p }));
      if (e.queue.length > 0) e.dir = e.queue.shift()!;
      const head = { x: e.snake[0].x + e.dir.x, y: e.snake[0].y + e.dir.y };

      const hitWall = head.x < 0 || head.y < 0 || head.x >= e.cols || head.y >= e.rows;
      const hitSelf = e.snake.some((s, i) => i < e.snake.length - 1 && s.x === head.x && s.y === head.y);
      if (hitWall || hitSelf) {
        e.dead = true;
        e.shake = 14;
        burst(e, e.snake[0].x + 0.5, e.snake[0].y + 0.5, "#FF6B4A");
        sfx.hit();
        const res = submitScore("snake", e.score);
        setBest(res.best);
        setOverInfo({ ...res, length: e.snake.length, apples: e.foodCount });
        setTimeout(() => {
          sfx.gameover();
          setPhase("over");
        }, 550);
        return;
      }

      e.snake.unshift(head);
      const ateFood = head.x === e.food.x && head.y === e.food.y;
      const ateGolden = e.golden && head.x === e.golden.x && head.y === e.golden.y;

      if (ateFood) {
        e.score += 10;
        e.foodCount++;
        burst(e, head.x + 0.5, head.y + 0.5, "#FF4B4B");
        sfx.eat();
        e.food = randomCell(e.snake, e.golden ? [e.golden] : [], e.cols, e.rows);
        e.tickMs = Math.max(68, 150 - e.foodCount * 3);
        if (e.foodCount % 5 === 0 && !e.golden) {
          const g = randomCell(e.snake, [e.food], e.cols, e.rows);
          e.golden = { ...g, expires: performance.now() + 6000 };
        }
        setScore(e.score);
      } else if (ateGolden) {
        e.score += 50;
        burst(e, head.x + 0.5, head.y + 0.5, "#FFC800");
        sfx.golden();
        e.golden = null;
        setScore(e.score);
      } else {
        e.snake.pop();
      }
    };

    const drawFood = (cell: number, p: Pt, golden: boolean, now: number, blink: boolean) => {
      if (blink && Math.floor(now / 160) % 2 === 0) return;
      const cx = (p.x + 0.5) * cell;
      const cy = (p.y + 0.55) * cell;
      const pulse = 1 + Math.sin(now / 240) * 0.08;
      const r = cell * 0.34 * pulse;
      // body
      const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r);
      if (golden) {
        grad.addColorStop(0, "#FFE98A");
        grad.addColorStop(1, "#F5A623");
      } else {
        grad.addColorStop(0, "#FF8A7A");
        grad.addColorStop(1, "#E5322D");
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      // leaf
      ctx.fillStyle = "#43B02A";
      ctx.beginPath();
      ctx.ellipse(cx + r * 0.28, cy - r * 0.95, r * 0.34, r * 0.16, -0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#8A5A2B";
      ctx.lineWidth = Math.max(1.4, cell * 0.07);
      ctx.beginPath();
      ctx.moveTo(cx, cy - r * 0.8);
      ctx.quadraticCurveTo(cx + r * 0.1, cy - r * 1.15, cx + r * 0.22, cy - r * 1.2);
      ctx.stroke();
      if (golden) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        const sx = cx + Math.sin(now / 300) * r * 0.6;
        const sy = cy - r * 0.4;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1.2, cell * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      if (!e.last) e.last = now;
      const dt = Math.min(100, now - e.last);
      e.last = now;

      if (e.started && !e.dead) {
        e.acc += dt;
        while (e.acc >= e.tickMs) {
          e.acc -= e.tickMs;
          step(e);
          if (e.dead) break;
        }
      }
      if (e.golden && now > e.golden.expires) e.golden = null;

      const cell = cw / e.cols;
      ctx.clearRect(0, 0, cw, ch);

      ctx.save();
      if (e.shake > 0) {
        ctx.translate((Math.random() - 0.5) * e.shake, (Math.random() - 0.5) * e.shake);
        e.shake *= 0.88;
        if (e.shake < 0.3) e.shake = 0;
      }

      // board
      ctx.fillStyle = "#1B2B22";
      ctx.fillRect(-20, -20, cw + 40, ch + 40);
      ctx.fillStyle = "rgba(255,255,255,0.035)";
      for (let y = 0; y < e.rows; y++)
        for (let x = 0; x < e.cols; x++)
          if ((x + y) % 2 === 0) ctx.fillRect(x * cell, y * cell, cell, cell);

      drawFood(cell, e.food, false, now, false);
      if (e.golden) drawFood(cell, e.golden, true, now, e.golden.expires - now < 1800);

      // snake (interpolated)
      const frac = e.started && !e.dead ? Math.min(1, e.acc / e.tickMs) : 1;
      const pts = e.snake.map((s, i) => {
        const p = e.prev[Math.min(i, e.prev.length - 1)] ?? s;
        return { x: (p.x + (s.x - p.x) * frac + 0.5) * cell, y: (p.y + (s.y - p.y) * frac + 0.5) * cell };
      });

      for (let i = pts.length - 1; i >= 0; i--) {
        const t = i / Math.max(1, pts.length - 1);
        const r = cell * (0.46 - t * 0.16);
        const grad = ctx.createRadialGradient(pts[i].x - r * 0.3, pts[i].y - r * 0.3, r * 0.2, pts[i].x, pts[i].y, r);
        grad.addColorStop(0, i === 0 ? "#9BE15D" : "#7ED957");
        grad.addColorStop(1, i === 0 ? "#43B02A" : "#2E8B1E");
        ctx.fillStyle = e.dead ? "#6B7280" : grad;
        ctx.beginPath();
        ctx.arc(pts[i].x, pts[i].y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // head face
      if (pts.length > 0) {
        const h = pts[0];
        const d = e.dir;
        const perp = { x: -d.y, y: d.x };
        const eyeOff = cell * 0.16;
        const fwd = cell * 0.12;
        for (const s of [-1, 1]) {
          const ex = h.x + perp.x * eyeOff * s + d.x * fwd;
          const ey = h.y + perp.y * eyeOff * s + d.y * fwd;
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(ex, ey, cell * 0.13, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#1F2430";
          ctx.beginPath();
          ctx.arc(ex + d.x * cell * 0.045, ey + d.y * cell * 0.045, cell * 0.065, 0, Math.PI * 2);
          ctx.fill();
        }
        // forked tongue (flickers)
        if (!e.dead && Math.floor(now / 700) % 3 === 0 && (now % 700) < 180) {
          ctx.strokeStyle = "#FF4B6E";
          ctx.lineWidth = Math.max(1.4, cell * 0.07);
          const tx = h.x + d.x * cell * 0.42;
          const ty = h.y + d.y * cell * 0.42;
          const tx2 = h.x + d.x * cell * 0.72;
          const ty2 = h.y + d.y * cell * 0.72;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx2, ty2);
          ctx.moveTo(tx2, ty2);
          ctx.lineTo(tx2 + (d.x * 0.6 + perp.x * 0.5) * cell * 0.18, ty2 + (d.y * 0.6 + perp.y * 0.5) * cell * 0.18);
          ctx.moveTo(tx2, ty2);
          ctx.lineTo(tx2 + (d.x * 0.6 - perp.x * 0.5) * cell * 0.18, ty2 + (d.y * 0.6 - perp.y * 0.5) * cell * 0.18);
          ctx.stroke();
        }
      }

      // particles
      e.particles = e.particles.filter((p) => p.life < p.max);
      for (const p of e.particles) {
        p.life += dt;
        p.x += p.vx * (dt / 16.7) * 0.14;
        p.y += p.vy * (dt / 16.7) * 0.14;
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x * cell, p.y * cell, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // swipe controls
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    touchRef.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = touchRef.current;
    touchRef.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
      start();
      return;
    }
    setDir(Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) });
  };

  const dBtn =
    "btn-game w-14 h-14 !rounded-2xl flex items-center justify-center text-white active:scale-90";
  const dStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.10)",
    border: "2px solid rgba(255,255,255,0.25)",
    boxShadow: "0 4px 0 rgba(0,0,0,0.35)",
  };

  return (
    <ArcadeShell
      title="Snake"
      emoji="🐍"
      color="linear-gradient(135deg,#58CC02,#1F9D55)"
      score={score}
      best={best}
      onBack={onBack}
      onRestart={restart}
    >
      <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
        <canvas
          ref={canvasRef}
          className="rounded-3xl touch-none"
          style={{ border: "2px solid rgba(255,255,255,0.14)", boxShadow: "0 18px 40px rgba(0,0,0,0.45)", background: "#1B2B22" }}
        />
      </div>
      <p className="absolute top-2.5 text-[11px] font-black px-2.5 py-1 rounded-full hidden sm:block z-10" style={{ background: "rgba(0,0,0,0.35)", color: "rgba(255,255,255,0.75)" }}>
        🍎 +10 · ⭐ golden apple +50 (be quick!) · Swipe or arrow keys
      </p>

      {/* on-screen D-pad (touch devices) — floats over the board */}
      {isTouch && phase !== "over" && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1 opacity-80">
          <button className={dBtn} style={dStyle} onPointerDown={(ev) => { ev.preventDefault(); setDir({ x: 0, y: -1 }); }} aria-label="Up">
            <ChevronUp size={26} strokeWidth={3} />
          </button>
          <div className="flex gap-12">
            <button className={dBtn} style={dStyle} onPointerDown={(ev) => { ev.preventDefault(); setDir({ x: -1, y: 0 }); }} aria-label="Left">
              <ChevronLeft size={26} strokeWidth={3} />
            </button>
            <button className={dBtn} style={dStyle} onPointerDown={(ev) => { ev.preventDefault(); setDir({ x: 1, y: 0 }); }} aria-label="Right">
              <ChevronRight size={26} strokeWidth={3} />
            </button>
          </div>
          <button className={dBtn} style={dStyle} onPointerDown={(ev) => { ev.preventDefault(); setDir({ x: 0, y: 1 }); }} aria-label="Down">
            <ChevronDown size={26} strokeWidth={3} />
          </button>
        </div>
      )}

      {phase === "ready" && <StartHint emoji="🐍" title="Snake" hint="Tap or press an arrow key to start" onStart={start} />}
      {phase === "over" && overInfo && (
        <GameOverCard
          score={score}
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Snake length: {overInfo.length} · Apples eaten: {overInfo.apples}
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
