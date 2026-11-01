"use client";

/**
 * Turbo Dash — original from-scratch highway dodger.
 * Swipe (or ← →) to switch lanes, thread through traffic, grab coins,
 * and graze cars for near-miss bonuses. Speed ramps until you crash.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard, StartHint } from "./Shell";
import { arcadeDpr, bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

interface Car { lane: number; y: number; color: string; type: "car" | "truck"; speedMul: number; passed: boolean; nearMissed: boolean }
interface Coin { lane: number; y: number; taken: boolean }
interface Floater { x: number; y: number; text: string; life: number; color: string }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }

interface Engine {
  lane: number; // target lane
  carX: number; // 0..1 across road (eased toward lane center)
  cars: Car[];
  coins: Coin[];
  floaters: Floater[];
  particles: Particle[];
  spawnIn: number;
  coinIn: number;
  dist: number;
  score: number;
  coinCount: number;
  nearMisses: number;
  speed: number;
  roadScroll: number;
  state: "ready" | "playing" | "dead";
  last: number;
  t: number;
}

const TRAFFIC_COLORS = ["#FF4B6E", "#FFB020", "#A560E8", "#2EE6A8", "#F87171", "#FACC15", "#38BDF8"];

function freshEngine(): Engine {
  return {
    lane: 1, carX: 0.5,
    cars: [], coins: [], floaters: [], particles: [],
    spawnIn: 700, coinIn: 400,
    dist: 0, score: 0, coinCount: 0, nearMisses: 0,
    speed: 430, roadScroll: 0,
    state: "ready", last: 0, t: 0,
  };
}

export default function TurboDash({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("dash"));
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean; coins: number; near: number } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { bumpPlays("dash"); }, []);

  const restart = useCallback(() => {
    engineRef.current = freshEngine();
    setScore(0);
    setOverInfo(null);
    setPhase("ready");
  }, []);

  const start = useCallback(() => {
    const e = engineRef.current;
    if (e.state !== "ready") return;
    e.state = "playing";
    setPhase("playing");
    sfx.click();
  }, []);

  const steer = useCallback((dir: -1 | 1, lanes: number) => {
    const e = engineRef.current;
    if (e.state === "ready") {
      e.state = "playing";
      setPhase("playing");
    }
    if (e.state !== "playing") return;
    const next = Math.max(0, Math.min(lanes - 1, e.lane + dir));
    if (next !== e.lane) {
      e.lane = next;
      sfx.flap();
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 400;
    let H = 600;
    let U = 1;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = Math.max(260, Math.floor(rect.width));
      H = Math.max(300, Math.floor(rect.height));
      U = Math.max(0.7, Math.min(1.4, Math.min(W, H) / 430));
      const dpr = arcadeDpr();
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    // road geometry
    const geo = () => {
      const roadW = Math.min(W * 0.92, 520 * U + W * 0.12);
      const lanes = W >= 700 ? 4 : 3;
      const roadX = (W - roadW) / 2;
      const laneW = roadW / lanes;
      const carW = Math.min(laneW * 0.62, 58 * U);
      const carH = carW * 1.9;
      const playerY = H - carH - 26 * U;
      return { roadW, lanes, roadX, laneW, carW, carH, playerY };
    };
    const laneCenter = (g: ReturnType<typeof geo>, lane: number) => g.roadX + g.laneW * lane + g.laneW / 2;

    const crash = (e: Engine, g: ReturnType<typeof geo>) => {
      e.state = "dead";
      const px = laneCenter(g, 0) + e.carX * g.roadW - g.laneW / 2; // approx player x
      for (let i = 0; i < 22; i++) {
        e.particles.push({
          x: px, y: g.playerY + g.carH / 2,
          vx: (Math.random() - 0.5) * 380 * U,
          vy: (Math.random() - 0.5) * 380 * U,
          life: 0, max: 0.4 + Math.random() * 0.4,
          color: ["#FFB020", "#FF6B4A", "#94A3B8"][i % 3],
        });
      }
      sfx.explosion();
      const res = submitScore("dash", e.score);
      setBest(res.best);
      setOverInfo({ ...res, coins: e.coinCount, near: e.nearMisses });
      setTimeout(() => setPhase("over"), 650);
    };

    const drawCarShape = (cx: number, cy: number, w: number, h: number, color: string, isPlayer: boolean, tilt = 0) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 3, -h / 2 + 5, w, h, w * 0.22);
      ctx.fill();
      // body
      const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      grad.addColorStop(0, color);
      grad.addColorStop(0.5, "#FFFFFF");
      grad.addColorStop(1, color);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.24);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.24);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h * 0.4, w * 0.2);
      ctx.fill();
      // cabin + windows (front = up)
      ctx.fillStyle = "#1E293B";
      ctx.beginPath();
      ctx.roundRect(-w * 0.36, -h * 0.24, w * 0.72, h * 0.3, w * 0.12);
      ctx.fill();
      ctx.fillStyle = "#7DD3FC";
      ctx.beginPath();
      ctx.roundRect(-w * 0.33, -h * 0.22, w * 0.66, h * 0.11, w * 0.08);
      ctx.fill();
      ctx.fillStyle = "#1E293B";
      ctx.beginPath();
      ctx.roundRect(-w * 0.36, h * 0.12, w * 0.72, h * 0.13, w * 0.1);
      ctx.fill();
      // headlights / taillights
      ctx.fillStyle = "#FEF9C3";
      const lw = w * 0.16, lh = h * 0.045;
      ctx.beginPath();
      ctx.roundRect(-w * 0.42, -h / 2 + 2, lw, lh, 2);
      ctx.roundRect(w * 0.42 - lw, -h / 2 + 2, lw, lh, 2);
      ctx.fill();
      ctx.fillStyle = "#EF4444";
      ctx.beginPath();
      ctx.roundRect(-w * 0.42, h / 2 - lh - 2, lw, lh, 2);
      ctx.roundRect(w * 0.42 - lw, h / 2 - lh - 2, lw, lh, 2);
      ctx.fill();
      // wheels
      ctx.fillStyle = "#111827";
      const ww = w * 0.12, wh = h * 0.16;
      for (const [wx, wy] of [[-w / 2 - ww * 0.4, -h * 0.3], [w / 2 - ww * 0.6, -h * 0.3], [-w / 2 - ww * 0.4, h * 0.16], [w / 2 - ww * 0.6, h * 0.16]]) {
        ctx.beginPath();
        ctx.roundRect(wx, wy, ww, wh, 2);
        ctx.fill();
      }
      if (isPlayer) {
        // racing stripe
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.fillRect(-w * 0.07, -h / 2 + 3, w * 0.14, h - 6);
      }
      ctx.restore();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      if (!e.last) e.last = now;
      const dt = Math.min(0.033, (now - e.last) / 1000);
      e.last = now;
      e.t += dt;
      const g = geo();
      const playerCX = () => g.roadX + e.carX * g.roadW;

      if (e.state === "playing") {
        e.speed = Math.min(1080, e.speed + dt * 11);
        e.dist += (e.speed * U) * dt;
        e.roadScroll = (e.roadScroll + e.speed * U * dt) % (56 * U);
        const newScore = Math.floor(e.dist / (26 * U)) + e.coinCount * 25 + e.nearMisses * 15;
        if (newScore !== e.score) {
          e.score = newScore;
          setScore(newScore);
        }

        // ease toward target lane center
        const targetX = (laneCenter(g, e.lane) - g.roadX) / g.roadW;
        e.carX += (targetX - e.carX) * Math.min(1, dt * 11);

        // spawn traffic
        e.spawnIn -= e.speed * U * dt;
        if (e.spawnIn <= 0) {
          const lane = Math.floor(Math.random() * g.lanes);
          const tooClose = e.cars.some((c) => c.lane === lane && c.y < 150 * U);
          if (!tooClose) {
            e.cars.push({
              lane,
              y: -120 * U,
              color: TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)],
              type: Math.random() < 0.22 ? "truck" : "car",
              speedMul: 0.42 + Math.random() * 0.2,
              passed: false,
              nearMissed: false,
            });
          }
          e.spawnIn = Math.max(300, 640 - e.speed * 0.22) + Math.random() * 260;
        }
        e.coinIn -= e.speed * U * dt;
        if (e.coinIn <= 0) {
          e.coins.push({ lane: Math.floor(Math.random() * g.lanes), y: -30 * U, taken: false });
          e.coinIn = 700 + Math.random() * 900;
        }

        const relV = (c: Car) => e.speed * U * (1 - c.speedMul);
        for (const c of e.cars) c.y += relV(c) * dt;
        for (const c of e.coins) c.y += e.speed * U * dt;
        e.cars = e.cars.filter((c) => c.y < H + 160 * U);
        e.coins = e.coins.filter((c) => c.y < H + 60 * U && !c.taken);

        const px = playerCX();
        const py = g.playerY + g.carH / 2;
        const pHalfW = g.carW * 0.4;
        const pHalfH = g.carH * 0.42;

        for (const c of e.cars) {
          const cx = laneCenter(g, c.lane);
          const cH = c.type === "truck" ? g.carH * 1.45 : g.carH;
          const cy = c.y + cH / 2;
          if (Math.abs(cx - px) < pHalfW + g.carW * 0.4 && Math.abs(cy - py) < pHalfH + cH * 0.42) {
            crash(e, g);
            break;
          }
          // near miss: passed closely in an adjacent lane while overlapping vertically
          if (!c.nearMissed && Math.abs(cy - py) < pHalfH + cH * 0.42 && Math.abs(cx - px) < g.laneW * 1.15) {
            c.nearMissed = true;
            if (Math.abs(cx - px) > pHalfW + g.carW * 0.4) {
              e.nearMisses++;
              e.floaters.push({ x: px, y: py - g.carH * 0.8, text: "NEAR MISS +15", life: 0, color: "#7DD3FC" });
              sfx.pop(1.5);
            }
          }
        }
        if (e.state === "playing") {
          for (const c of e.coins) {
            const cx = laneCenter(g, c.lane);
            if (Math.abs(cx - px) < g.carW * 0.55 && Math.abs(c.y - py) < g.carH * 0.55) {
              c.taken = true;
              e.coinCount++;
              e.floaters.push({ x: cx, y: c.y, text: "+25", life: 0, color: "#FFD94D" });
              sfx.coin();
            }
          }
        }
      }

      for (const f of e.floaters) { f.life += dt; f.y -= 34 * U * dt; }
      e.floaters = e.floaters.filter((f) => f.life < 0.85);
      for (const p of e.particles) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      e.particles = e.particles.filter((p) => p.life < p.max);

      // --- draw ---
      // grass / surroundings
      const grass = ctx.createLinearGradient(0, 0, W, 0);
      grass.addColorStop(0, "#14532D");
      grass.addColorStop(0.5, "#166534");
      grass.addColorStop(1, "#14532D");
      ctx.fillStyle = grass;
      ctx.fillRect(0, 0, W, H);

      // roadside dashes (scrolling)
      ctx.fillStyle = "rgba(255,255,255,0.16)";
      const dashGap = 56 * U;
      for (let y = -(e.roadScroll % dashGap) - dashGap; y < H + dashGap; y += dashGap) {
        ctx.fillRect(g.roadX - 14 * U, y, 6 * U, 26 * U);
        ctx.fillRect(g.roadX + g.roadW + 8 * U, y, 6 * U, 26 * U);
      }

      // asphalt
      ctx.fillStyle = "#334155";
      ctx.fillRect(g.roadX, 0, g.roadW, H);
      ctx.fillStyle = "#F8FAFC";
      ctx.fillRect(g.roadX, 0, 4, H);
      ctx.fillRect(g.roadX + g.roadW - 4, 0, 4, H);
      // lane markers
      ctx.fillStyle = "rgba(249,250,251,0.75)";
      for (let l = 1; l < g.lanes; l++) {
        const x = g.roadX + l * g.laneW;
        for (let y = -(e.roadScroll % dashGap) - dashGap; y < H + dashGap; y += dashGap) {
          ctx.fillRect(x - 2.5, y, 5, 30 * U);
        }
      }

      // coins
      for (const c of e.coins) {
        const cx = laneCenter(g, c.lane);
        const r = 11 * U * (0.86 + Math.sin(e.t * 5 + cx) * 0.14);
        ctx.fillStyle = "#FFD94D";
        ctx.beginPath();
        ctx.arc(cx, c.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#D9930D";
        ctx.lineWidth = 2.4 * U;
        ctx.stroke();
        ctx.fillStyle = "#B45309";
        ctx.font = `900 ${Math.round(12 * U)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("¢", cx, c.y + 1);
        ctx.textBaseline = "alphabetic";
      }

      // traffic
      for (const c of e.cars) {
        const cx = laneCenter(g, c.lane);
        const cH = c.type === "truck" ? g.carH * 1.45 : g.carH;
        drawCarShape(cx, c.y + cH / 2, g.carW, cH, c.color, false);
      }

      // player
      const px = playerCX();
      const tilt = Math.max(-0.14, Math.min(0.14, (((laneCenter(g, e.lane) - g.roadX) / g.roadW - e.carX) * 1.4)));
      if (e.state !== "dead") {
        drawCarShape(px, g.playerY + g.carH / 2, g.carW, g.carH, "#14B8A6", true, tilt);
      }

      // speedometer
      if (e.state === "playing") {
        const kmh = Math.round(e.speed * 0.22);
        ctx.font = `800 ${Math.round(20 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "right";
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(`${kmh}`, W - 40 * U, 40 * U);
        ctx.font = `800 ${Math.round(10 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillText("km/h", W - 14 * U, 40 * U);
        ctx.textAlign = "left";
        ctx.font = `800 ${Math.round(16 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.fillStyle = "#FFD94D";
        ctx.fillText(`🪙 ${e.coinCount}`, 14 * U, 40 * U);
      }

      for (const p of e.particles) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - 3 * U, p.y - 3 * U, 6 * U, 6 * U);
      }
      ctx.globalAlpha = 1;

      for (const f of e.floaters) {
        ctx.globalAlpha = 1 - f.life / 0.85;
        ctx.font = `800 ${Math.round(15 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(15,23,42,0.7)";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(frame);

    // input: swipe + tap-halves + keys
    let downX: number | null = null;
    let downAt = 0;
    const onDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downAt = performance.now();
    };
    const onUp = (ev: PointerEvent) => {
      if (downX === null) return;
      const dx = ev.clientX - downX;
      const g = geo();
      if (Math.abs(dx) > 24) {
        steer(dx > 0 ? 1 : -1, g.lanes);
      } else if (performance.now() - downAt < 300) {
        // tap: left/right half of the canvas steers
        const rect = canvas.getBoundingClientRect();
        const x = ev.clientX - rect.left;
        steer(x < rect.width / 2 ? -1 : 1, g.lanes);
      }
      downX = null;
    };
    const onKey = (ev: KeyboardEvent) => {
      const g = geo();
      if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") { steer(-1, g.lanes); ev.preventDefault(); }
      if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") { steer(1, g.lanes); ev.preventDefault(); }
      if (ev.code === "Space") { ev.preventDefault(); start(); }
    };

    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [steer, start]);

  return (
    <ArcadeShell
      title="Turbo Dash"
      emoji="🏎️"
      color="linear-gradient(135deg,#14D4C5,#0E7C66)"
      score={score}
      best={best}
      onBack={onBack}
      onRestart={restart}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Swipe or tap left/right to switch lanes · coins +25 · near misses +15
        </p>
      }
    >
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block touch-none" />
      </div>

      {phase === "ready" && <StartHint emoji="🏎️" title="Turbo Dash" hint="Tap to drive — swipe to dodge the traffic!" onStart={start} />}
      {phase === "over" && overInfo && (
        <GameOverCard
          title="💥 Crash!"
          score={score}
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              🪙 {overInfo.coins} coins · 😱 {overInfo.near} near misses
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
