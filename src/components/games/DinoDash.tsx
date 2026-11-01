"use client";

/**
 * Dino Dash — original from-scratch endless runner.
 * A cute code-drawn T-Rex sprints across a shifting desert: leap cacti,
 * duck under pterodactyls, chase distance milestones as day turns to dusk.
 * Fully responsive: the stage is the whole screen, physics scale with height.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ArcadeShell, GameOverCard, StartHint } from "./Shell";
import { bumpPlays, getBest, submitScore, arcadeDpr } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

interface Obstacle { x: number; kind: "cactus1" | "cactus2" | "cactus3" | "bird"; birdY: number; w: number; h: number }
interface Cloud { x: number; y: number; s: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number }
interface Floater { x: number; y: number; text: string; life: number }

interface Engine {
  y: number; // dino feet offset above ground (px, +up)
  vy: number;
  jumpQueued: boolean;
  fastFall: boolean;
  ducking: boolean;
  grounded: boolean;
  squash: number;
  obstacles: Obstacle[];
  spawnIn: number;
  dist: number;
  score: number;
  milestone: number;
  speedBoost: number;
  groundX: number;
  clouds: Cloud[];
  particles: Particle[];
  floaters: Floater[];
  state: "ready" | "playing" | "dead";
  runPhase: number;
  blink: number;
  last: number;
  t: number;
}

function freshEngine(): Engine {
  return {
    y: 0, vy: 0, jumpQueued: false, fastFall: false, ducking: false, grounded: true, squash: 0,
    obstacles: [], spawnIn: 520,
    dist: 0, score: 0, milestone: 0, speedBoost: 0,
    groundX: 0,
    clouds: Array.from({ length: 6 }, () => ({ x: Math.random(), y: 0.05 + Math.random() * 0.22, s: 0.6 + Math.random() * 0.9 })),
    particles: [], floaters: [],
    state: "ready", runPhase: 0, blink: 0, last: 0, t: 0,
  };
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function mix(c1: [number, number, number], c2: [number, number, number], t: number): string {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}
const DAY: [number, number, number][] = [[92, 186, 245], [207, 243, 255]];
const DUSK: [number, number, number][] = [[255, 128, 72], [255, 205, 140]];
const NIGHT: [number, number, number][] = [[30, 32, 78], [78, 74, 140]];

function skyFor(score: number): { top: string; bottom: string; night: number } {
  const seg = (score % 1200) / 1200; // 0..1 cycle
  // day -> dusk (0-.4), dusk -> night (.4-.7), night -> day (.7-1)
  let cols: [number, number, number][];
  let night = 0;
  if (seg < 0.4) { const t = seg / 0.4; cols = [DAY[0], DAY[1]].map((c, i) => [lerp(c[0], DUSK[i][0], t), lerp(c[1], DUSK[i][1], t), lerp(c[2], DUSK[i][2], t)] as [number, number, number]); }
  else if (seg < 0.7) { const t = (seg - 0.4) / 0.3; night = t; cols = [DUSK[0], DUSK[1]].map((c, i) => [lerp(c[0], NIGHT[i][0], t), lerp(c[1], NIGHT[i][1], t), lerp(c[2], NIGHT[i][2], t)] as [number, number, number]); }
  else { const t = (seg - 0.7) / 0.3; night = 1 - t; cols = [NIGHT[0], NIGHT[1]].map((c, i) => [lerp(c[0], DAY[i][0], t), lerp(c[1], DAY[i][1], t), lerp(c[2], DAY[i][2], t)] as [number, number, number]); }
  return { top: `rgb(${cols[0].map(Math.round).join(",")})`, bottom: `rgb(${cols[1].map(Math.round).join(",")})`, night };
}

export default function DinoDash({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("dino"));
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean } | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time probe
    setIsTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
    bumpPlays("dino");
  }, []);

  const restart = useCallback(() => {
    engineRef.current = freshEngine();
    setScore(0);
    setOverInfo(null);
    setPhase("ready");
  }, []);

  const jump = useCallback(() => {
    const e = engineRef.current;
    if (phaseRef.current === "over") return;
    if (e.state === "ready") {
      e.state = "playing";
      setPhase("playing");
    }
    if (e.grounded) {
      e.grounded = false;
      e.jumpQueued = true; // impulse applied in the loop with the live scale unit
      sfx.flap();
    } else {
      e.fastFall = true; // slam down when pressed mid-air
    }
  }, []);

  const setDuck = useCallback((duck: boolean) => {
    const e = engineRef.current;
    e.ducking = duck;
    if (duck && !e.grounded) e.fastFall = true;
    if (!duck) e.fastFall = false;
    if (duck && phaseRef.current === "ready") {
      e.state = "playing";
      setPhase("playing");
    }
  }, []);

  useEffect(() => {
    const down = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.code === "ArrowUp" || ev.key === "w" || ev.key === "W") {
        ev.preventDefault();
        if (!ev.repeat) jump();
      } else if (ev.code === "ArrowDown" || ev.key === "s" || ev.key === "S") {
        ev.preventDefault();
        setDuck(true);
      }
    };
    const up = (ev: KeyboardEvent) => {
      if (ev.code === "ArrowDown" || ev.key === "s" || ev.key === "S") setDuck(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [jump, setDuck]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 800;
    let H = 400;
    let U = 1;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = Math.max(280, Math.floor(rect.width));
      H = Math.max(240, Math.floor(rect.height));
      U = Math.max(0.72, Math.min(1.6, H / 520));
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

    const groundY = () => H * 0.8;
    const dinoX = () => Math.max(56 * U, W * 0.11);
    const stars = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random() * 0.5, s: Math.random() * 1.5 + 0.4 }));

    // dino dimensions (standing)
    const dinoSize = (e: Engine) => {
      const h = e.ducking && e.grounded ? 34 * U : 52 * U;
      const w = e.ducking && e.grounded ? 58 * U : 46 * U;
      return { w, h };
    };

    const spawnObstacle = (e: Engine) => {
      const kinds: Obstacle["kind"][] = ["cactus1", "cactus2", "cactus3", "cactus1", "cactus2"];
      if (e.score > 180) kinds.push("bird", "bird");
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      if (kind === "bird") {
        // low bird must be ducked (or perfectly jumped); high bird is flown under
        const low = Math.random() < 0.6;
        e.obstacles.push({ x: W + 40, kind, birdY: low ? 40 * U : 78 * U, w: 44 * U, h: 20 * U });
      } else {
        const n = kind === "cactus1" ? 1 : kind === "cactus2" ? 2 : 3;
        e.obstacles.push({ x: W + 40, kind, birdY: 0, w: (16 * n + 6) * U, h: (34 + Math.random() * 12) * U });
      }
      const speed = curSpeed(e);
      e.spawnIn = (320 + Math.random() * 430) * U + speed * 0.32;
    };

    const curSpeed = (e: Engine) => (375 + e.speedBoost) * U;

    const die = (e: Engine) => {
      e.state = "dead";
      sfx.hit();
      const res = submitScore("dino", e.score);
      setBest(res.best);
      setOverInfo(res);
      setTimeout(() => {
        sfx.gameover();
        setPhase("over");
      }, 420);
    };

    const drawCactus = (x: number, gy: number, w: number, h: number, n: number) => {
      ctx.fillStyle = "#2E9E4F";
      ctx.strokeStyle = "rgba(20,80,35,0.6)";
      ctx.lineWidth = 1.6;
      const segW = w / n;
      for (let i = 0; i < n; i++) {
        const cx = x + i * segW + segW / 2;
        const hh = h * (0.8 + ((i * 37) % 10) / 34);
        const r = segW * 0.3;
        ctx.beginPath();
        ctx.moveTo(cx - r, gy);
        ctx.lineTo(cx - r, gy - hh + r);
        ctx.arc(cx, gy - hh + r, r, Math.PI, 0);
        ctx.lineTo(cx + r, gy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // arm
        if (i % 2 === 0) {
          ctx.beginPath();
          ctx.arc(cx - r - 3.5 * U, gy - hh * 0.55, 3.5 * U, 0, Math.PI * 2);
          ctx.fill();
        }
        // spines
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        for (let sIdx = 0; sIdx < 3; sIdx++) {
          ctx.fillRect(cx - 1, gy - hh * (0.25 + sIdx * 0.25), 2, 2);
        }
        ctx.fillStyle = "#2E9E4F";
      }
      // flower on top of first
      ctx.fillStyle = "#FF6BCB";
      ctx.beginPath();
      ctx.arc(x + segW / 2, gy - h * 0.97, 3.4 * U, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawBird = (x: number, y: number, t: number) => {
      const w = 44 * U;
      const flapA = Math.sin(t * 18) * 0.7;
      ctx.save();
      ctx.translate(x, y);
      // wings
      ctx.strokeStyle = "#4A4E69";
      ctx.lineWidth = 4.5 * U;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-w * 0.05, 0);
      ctx.lineTo(-w * 0.42, -Math.sin(flapA) * w * 0.34 - 2);
      ctx.moveTo(w * 0.18, 0);
      ctx.lineTo(w * 0.5, -Math.sin(flapA + 0.5) * w * 0.3 - 2);
      ctx.stroke();
      // body
      ctx.fillStyle = "#6C63FF";
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.34, w * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      // head + beak (facing left, toward the dino)
      ctx.beginPath();
      ctx.arc(-w * 0.3, -w * 0.1, w * 0.16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#FFB020";
      ctx.beginPath();
      ctx.moveTo(-w * 0.44, -w * 0.12);
      ctx.lineTo(-w * 0.62, -w * 0.04);
      ctx.lineTo(-w * 0.42, w * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-w * 0.33, -w * 0.13, w * 0.07, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1F2430";
      ctx.beginPath();
      ctx.arc(-w * 0.35, -w * 0.13, w * 0.035, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawDino = (e: Engine, x: number, feetY: number) => {
      const { w, h } = dinoSize(e);
      const duck = e.ducking && e.grounded;
      const dead = e.state === "dead";
      ctx.save();
      ctx.translate(x, feetY);
      const sq = 1 - e.squash * 0.22;
      ctx.scale(1 + e.squash * 0.18, sq);

      const bodyGrad = ctx.createLinearGradient(0, -h, 0, 0);
      bodyGrad.addColorStop(0, dead ? "#9AA0AE" : "#8ED081");
      bodyGrad.addColorStop(1, dead ? "#6B7280" : "#4CAF50");
      ctx.fillStyle = bodyGrad;

      // tail
      ctx.beginPath();
      ctx.moveTo(-w * 0.32, -h * 0.52);
      ctx.lineTo(-w * 0.85, -h * 0.28);
      ctx.lineTo(-w * 0.3, -h * 0.18);
      ctx.closePath();
      ctx.fill();

      // legs (run cycle)
      const legSwing = e.grounded && !dead ? Math.sin(e.runPhase) * h * 0.16 : 0;
      ctx.fillRect(-w * 0.12, -h * 0.22 + Math.max(0, legSwing), w * 0.16, h * 0.22 - Math.max(0, legSwing));
      ctx.fillRect(w * 0.1, -h * 0.22 + Math.max(0, -legSwing), w * 0.16, h * 0.22 - Math.max(0, -legSwing));
      // feet
      ctx.fillRect(-w * 0.14, -2.5 * U + Math.max(0, legSwing) * 0, w * 0.24, 3 * U);
      ctx.fillRect(w * 0.08, -2.5 * U, w * 0.24, 3 * U);

      // body
      ctx.beginPath();
      ctx.ellipse(0, -h * 0.46, w * 0.4, h * 0.34, duck ? 0.12 : -0.06, 0, Math.PI * 2);
      ctx.fill();
      // belly
      ctx.fillStyle = "rgba(245,255,230,0.9)";
      ctx.beginPath();
      ctx.ellipse(w * 0.06, -h * 0.36, w * 0.24, h * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bodyGrad;

      // head
      const hx = duck ? w * 0.42 : w * 0.3;
      const hy = duck ? -h * 0.66 : -h * 0.86;
      ctx.beginPath();
      ctx.ellipse(hx, hy, w * 0.26, h * 0.21, 0, 0, Math.PI * 2);
      ctx.fill();
      // snout
      ctx.beginPath();
      ctx.ellipse(hx + w * 0.16, hy + h * 0.05, w * 0.17, h * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();
      // nostril + smile
      ctx.fillStyle = "rgba(20,60,25,0.8)";
      ctx.beginPath();
      ctx.arc(hx + w * 0.24, hy + h * 0.01, 1.6 * U, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(20,60,25,0.75)";
      ctx.lineWidth = 1.7 * U;
      ctx.beginPath();
      ctx.arc(hx + w * 0.1, hy + h * 0.05, w * 0.13, Math.PI * 0.15, Math.PI * 0.75);
      ctx.stroke();
      // tooth
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.moveTo(hx + w * 0.2, hy + h * 0.13);
      ctx.lineTo(hx + w * 0.25, hy + h * 0.13);
      ctx.lineTo(hx + w * 0.225, hy + h * 0.2);
      ctx.closePath();
      ctx.fill();
      // tiny arm
      ctx.strokeStyle = dead ? "#6B7280" : "#43A047";
      ctx.lineWidth = 3.4 * U;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(w * 0.22, -h * 0.48);
      ctx.lineTo(w * 0.34, -h * 0.36 + (e.grounded ? Math.sin(e.runPhase) * 2 * U : 0));
      ctx.stroke();
      // eye
      const blinkNow = (e.t % 3.4) < 0.12;
      if (dead) {
        ctx.strokeStyle = "#1F2430";
        ctx.lineWidth = 2 * U;
        const ex = hx + w * 0.05, ey = hy - h * 0.05, ds = 3.4 * U;
        ctx.beginPath();
        ctx.moveTo(ex - ds, ey - ds); ctx.lineTo(ex + ds, ey + ds);
        ctx.moveTo(ex + ds, ey - ds); ctx.lineTo(ex - ds, ey + ds);
        ctx.stroke();
      } else if (blinkNow) {
        ctx.strokeStyle = "#1F2430";
        ctx.lineWidth = 2 * U;
        ctx.beginPath();
        ctx.moveTo(hx, hy - h * 0.05);
        ctx.lineTo(hx + w * 0.11, hy - h * 0.05);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(hx + w * 0.05, hy - h * 0.05, 4.6 * U, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1F2430";
        ctx.beginPath();
        ctx.arc(hx + w * 0.08, hy - h * 0.05, 2.4 * U, 0, Math.PI * 2);
        ctx.fill();
      }
      // back spikes
      ctx.fillStyle = dead ? "#7A8090" : "#FFB020";
      for (let i = 0; i < 3; i++) {
        const bx = -w * 0.05 - i * w * 0.16;
        const by = -h * 0.74 + i * h * 0.05;
        ctx.beginPath();
        ctx.moveTo(bx - 4 * U, by + 4 * U);
        ctx.lineTo(bx, by - 5 * U);
        ctx.lineTo(bx + 4 * U, by + 4 * U);
        ctx.closePath();
        ctx.fill();
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

      const gy = groundY();
      const dx = dinoX();
      const GRAV = 2600 * U;
      const JUMP = 1010 * U;

      // --- update ---
      if (e.state === "playing") {
        e.speedBoost = Math.min(560, e.speedBoost + dt * 7.5);
        const speed = curSpeed(e);
        e.dist += speed * dt;
        e.groundX = (e.groundX + speed * dt) % (46 * U);
        const newScore = Math.floor(e.dist / (30 * U));
        if (newScore !== e.score) {
          e.score = newScore;
          setScore(newScore);
          if (newScore > 0 && newScore % 100 === 0 && newScore !== e.milestone) {
            e.milestone = newScore;
            e.floaters.push({ x: W / 2, y: H * 0.3, text: `${newScore}!`, life: 0 });
            sfx.score();
          }
        }

        if (e.jumpQueued) {
          e.vy = JUMP;
          e.jumpQueued = false;
        }
        if (!e.grounded) {
          e.vy -= GRAV * (e.fastFall ? 2.6 : 1) * dt;
          e.y += e.vy * dt;
          if (e.y <= 0) {
            e.y = 0;
            e.vy = 0;
            e.grounded = true;
            e.fastFall = false;
            e.squash = 1;
            for (let i = 0; i < 6; i++) {
              e.particles.push({ x: dx + (Math.random() - 0.5) * 30 * U, y: gy, vx: (Math.random() - 0.7) * 90 * U, vy: -Math.random() * 40 * U, life: 0, max: 0.4 });
            }
          }
        }
        e.squash = Math.max(0, e.squash - dt * 6);
        e.runPhase += dt * (9 + e.speedBoost / 40);

        e.spawnIn -= speed * dt;
        if (e.spawnIn <= 0) spawnObstacle(e);

        const { w: dw, h: dh } = dinoSize(e);
        const dBox = { x: dx - dw * 0.3, y: gy - e.y - dh + 4 * U, w: dw * 0.72, h: dh - 6 * U };

        for (const o of e.obstacles) {
          o.x -= speed * (o.kind === "bird" ? 1.12 : 1) * dt;
          const oBox = o.kind === "bird"
            ? { x: o.x - o.w * 0.32, y: gy - o.birdY - o.h, w: o.w * 0.64, h: o.h }
            : { x: o.x + 3 * U, y: gy - o.h + 3 * U, w: o.w - 6 * U, h: o.h - 3 * U };
          if (
            dBox.x < oBox.x + oBox.w && dBox.x + dBox.w > oBox.x &&
            dBox.y < oBox.y + oBox.h && dBox.y + dBox.h > oBox.y
          ) {
            die(e);
            break;
          }
        }
        e.obstacles = e.obstacles.filter((o) => o.x > -90);

        // dust while running
        if (e.grounded && Math.random() < 0.3) {
          e.particles.push({ x: dx - 14 * U, y: gy - 2, vx: -(40 + Math.random() * 60) * U, vy: -(8 + Math.random() * 22) * U, life: 0, max: 0.45 });
        }
      }

      for (const c of e.clouds) {
        c.x -= dt * 0.012 * (e.state === "playing" ? 1.6 : 0.5);
        if (c.x < -0.18) { c.x = 1.15; c.y = 0.05 + Math.random() * 0.22; }
      }
      for (const p of e.particles) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 240 * U * dt;
      }
      e.particles = e.particles.filter((p) => p.life < p.max);
      for (const f of e.floaters) f.life += dt;
      e.floaters = e.floaters.filter((f) => f.life < 0.9);

      // --- draw ---
      const sky = skyFor(e.score);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, sky.top);
      grad.addColorStop(1, sky.bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      if (sky.night > 0.05) {
        ctx.fillStyle = "#fff";
        for (const s of stars) {
          ctx.globalAlpha = sky.night * (0.4 + 0.6 * Math.abs(Math.sin(e.t * 1.5 + s.x * 9)));
          ctx.beginPath();
          ctx.arc(s.x * W, s.y * H, s.s, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // moon
        ctx.fillStyle = `rgba(245,240,210,${sky.night})`;
        ctx.beginPath();
        ctx.arc(W - 74 * U, 62 * U, 21 * U, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = sky.top;
        ctx.beginPath();
        ctx.arc(W - 64 * U, 56 * U, 17 * U, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // sun
        ctx.fillStyle = "rgba(255,224,102,0.95)";
        ctx.beginPath();
        ctx.arc(W - 74 * U, 62 * U, 24 * U, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,224,102,0.22)";
        ctx.beginPath();
        ctx.arc(W - 74 * U, 62 * U, 38 * U, 0, Math.PI * 2);
        ctx.fill();
      }

      // clouds
      ctx.fillStyle = sky.night > 0.5 ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.9)";
      for (const c of e.clouds) {
        const cx = c.x * W, cy = c.y * H, s2 = c.s * U;
        ctx.beginPath();
        ctx.arc(cx, cy, 15 * s2, 0, Math.PI * 2);
        ctx.arc(cx + 14 * s2, cy + 3 * s2, 11 * s2, 0, Math.PI * 2);
        ctx.arc(cx - 14 * s2, cy + 4 * s2, 10 * s2, 0, Math.PI * 2);
        ctx.fill();
      }

      // distant dunes
      ctx.fillStyle = sky.night > 0.5 ? "rgba(60,55,110,0.55)" : "rgba(237,190,120,0.65)";
      ctx.beginPath();
      for (let x = 0; x <= W; x += 10) {
        const y = gy - 16 * U - Math.sin((x + e.groundX * 1.5) / (150 * U)) * 13 * U;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(W, gy);
      ctx.lineTo(0, gy);
      ctx.closePath();
      ctx.fill();

      // ground
      ctx.fillStyle = sky.night > 0.5 ? "#3A3A5E" : "#EAD29A";
      ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = sky.night > 0.5 ? "#2C2C4A" : "#D9B978";
      ctx.fillRect(0, gy, W, 5 * U);
      ctx.fillStyle = sky.night > 0.5 ? "rgba(255,255,255,0.14)" : "rgba(160,120,50,0.5)";
      for (let x = -(e.groundX % (46 * U)) - 46 * U; x < W + 46 * U; x += 46 * U) {
        ctx.fillRect(x, gy + 12 * U + ((Math.floor(x * 7) % 13) * 1.3) * U, 15 * U, 2.6 * U);
      }

      // obstacles
      for (const o of e.obstacles) {
        if (o.kind === "bird") drawBird(o.x, gy - o.birdY - o.h / 2 + Math.sin(e.t * 6 + o.x * 0.05) * 2.5 * U, e.t + o.x * 0.02);
        else drawCactus(o.x, gy, o.w, o.h, o.kind === "cactus1" ? 1 : o.kind === "cactus2" ? 2 : 3);
      }

      // dust
      for (const p of e.particles) {
        ctx.globalAlpha = (1 - p.life / p.max) * 0.55;
        ctx.fillStyle = "#CBB27A";
        ctx.beginPath();
        ctx.arc(p.x, p.y, (2 + p.life * 6) * U, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      drawDino(e, dx, gy - e.y);

      // score (top-right, blinks on milestone)
      const showScore = !(e.milestone === e.score && e.score > 0 && (e.t % 0.5) < 0.22);
      if (e.state !== "ready" && showScore) {
        ctx.font = `800 ${Math.round(24 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "right";
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(31,36,48,0.5)";
        const txt = String(e.score).padStart(5, "0");
        ctx.strokeText(txt, W - 16, 38 * U + 6);
        ctx.fillStyle = "#fff";
        ctx.fillText(txt, W - 16, 38 * U + 6);
        ctx.font = `800 ${Math.round(13 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.globalAlpha = 0.75;
        ctx.fillText(`HI ${String(Math.max(best, e.score)).padStart(5, "0")}`, W - 110 * U, 38 * U + 6);
        ctx.globalAlpha = 1;
      }

      for (const f of e.floaters) {
        ctx.globalAlpha = 1 - f.life / 0.9;
        ctx.font = `800 ${Math.round(30 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(31,36,48,0.55)";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = "#FFE27A";
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [best]);

  const ctrlBtn: React.CSSProperties = {
    background: "rgba(255,255,255,0.14)",
    border: "2px solid rgba(255,255,255,0.35)",
    boxShadow: "0 4px 0 rgba(0,0,0,0.35)",
    backdropFilter: "blur(2px)",
  };

  return (
    <ArcadeShell
      title="Dino Dash"
      emoji="🦖"
      color="linear-gradient(135deg,#58CC02,#FFB020)"
      score={score}
      scoreLabel="Distance"
      best={best}
      onBack={onBack}
      onRestart={restart}
    >
      <div
        ref={wrapRef}
        className="absolute inset-0 touch-none"
        onPointerDown={(e) => {
          e.preventDefault();
          jump();
        }}
      >
        <canvas ref={canvasRef} className="block" />
      </div>

      {/* touch controls */}
      {isTouch && phase === "playing" && (
        <>
          <button
            className="btn-game absolute bottom-4 left-4 z-10 w-16 h-16 !rounded-full flex flex-col items-center justify-center text-white"
            style={ctrlBtn}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); setDuck(true); }}
            onPointerUp={() => setDuck(false)}
            onPointerLeave={() => setDuck(false)}
            aria-label="Duck"
          >
            <ArrowDown size={24} strokeWidth={3} />
            <span className="text-[8px] font-black">DUCK</span>
          </button>
          <button
            className="btn-game absolute bottom-4 right-4 z-10 w-20 h-20 !rounded-full flex flex-col items-center justify-center text-white"
            style={{ ...ctrlBtn, background: "linear-gradient(140deg,rgba(88,204,2,0.85),rgba(31,157,85,0.85))" }}
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); jump(); }}
            aria-label="Jump"
          >
            <ArrowUp size={30} strokeWidth={3} />
            <span className="text-[9px] font-black">JUMP</span>
          </button>
        </>
      )}

      {phase === "ready" && <StartHint emoji="🦖" title="Dino Dash" hint="Tap / SPACE to jump · hold ↓ to duck!" onStart={jump} />}
      {phase === "over" && overInfo && (
        <GameOverCard
          score={score}
          scoreLabel="Distance"
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              {score >= 500 ? "Serious speed! The desert fears you 🌵💨" : "Tip: press ↓ mid-air to slam down faster!"}
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
