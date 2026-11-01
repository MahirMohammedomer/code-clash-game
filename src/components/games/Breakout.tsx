"use client";

/**
 * Neon Breakout — original from-scratch brick breaker.
 * Level patterns, brick HP, power-ups (wide paddle / multi-ball / slow-mo /
 * extra life), combo multipliers, particle shards and ball trails.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

interface Ball { x: number; y: number; vx: number; vy: number; stuck: boolean; trail: { x: number; y: number }[] }
interface Brick { col: number; row: number; hp: number; maxHp: number; alive: boolean; hue: string }
interface PowerUp { x: number; y: number; type: "wide" | "multi" | "slow" | "life" }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; life: number; big?: boolean }

interface Engine {
  paddleX: number;
  paddleTarget: number | null;
  keys: { left: boolean; right: boolean };
  wideUntil: number;
  slowUntil: number;
  balls: Ball[];
  bricks: Brick[];
  powerups: PowerUp[];
  particles: Particle[];
  floaters: Floater[];
  lives: number;
  level: number;
  score: number;
  combo: number;
  bestCombo: number;
  bricksBroken: number;
  cols: number;
  state: "ready" | "playing" | "levelclear" | "over";
  bannerUntil: number;
  shake: number;
  last: number;
}

const COLS = 9;
/** Brick columns adapt to the stage width so the game fills any screen. */
const colsForWidth = (w: number) => Math.max(7, Math.min(14, Math.round(w / 62)));
const ROW_PALETTE = ["#FF4B6E", "#FF8A3D", "#FFC800", "#58CC02", "#1CB0F6", "#A560E8", "#FF6BCB", "#2EE6A8"];
const POWER_ART: Record<PowerUp["type"], { label: string; color: string }> = {
  wide: { label: "W", color: "#1CB0F6" },
  multi: { label: "×3", color: "#A560E8" },
  slow: { label: "S", color: "#2EE6A8" },
  life: { label: "♥", color: "#FF4B6E" },
};

function makeLevel(level: number, cols: number = COLS): Brick[] {
  const bricks: Brick[] = [];
  const pattern = (level - 1) % 6;
  const cycle = Math.floor((level - 1) / 6);
  const add = (col: number, row: number, hp: number) =>
    bricks.push({ col, row, hp: hp + (cycle > 0 && row === 0 ? 1 : 0), maxHp: hp, alive: true, hue: ROW_PALETTE[row % ROW_PALETTE.length] });

  if (pattern === 0) {
    for (let r = 0; r < 5; r++) for (let c = 0; c < cols; c++) add(c, r, 1);
  } else if (pattern === 1) {
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < cols; c++) {
        if (r === 2) add(c, r, 2);
        else if ((r + c) % 2 === 0) add(c, r, 1);
      }
  } else if (pattern === 2) {
    for (let r = 0; r < 5; r++)
      for (let c = r; c < cols - r; c++) add(c, r, r === 0 ? 2 : 1);
  } else if (pattern === 3) {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < cols; c++) {
        const border = r === 0 || r === 4 || c === 0 || c === cols - 1;
        add(c, r, border ? 2 : 1);
      }
  } else if (pattern === 4) {
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < cols; c++) {
        if (c % 2 === 0) add(c, r, r % 3 === 0 ? 2 : 1);
        else if (r === 5) add(c, r, 1);
      }
  } else {
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < cols; c++) {
        if ((c + r * 2) % 7 !== 3) add(c, r, r < 2 ? 2 : 1);
      }
  }
  bricks.forEach((b) => (b.maxHp = b.hp));
  return bricks;
}

function freshEngine(cols: number = COLS): Engine {
  return {
    paddleX: 0.5, paddleTarget: null, keys: { left: false, right: false },
    wideUntil: 0, slowUntil: 0,
    balls: [{ x: 0.5, y: 0, vx: 0, vy: 0, stuck: true, trail: [] }],
    bricks: makeLevel(1, cols), powerups: [], particles: [], floaters: [], cols,
    lives: 3, level: 1, score: 0, combo: 0, bestCombo: 0, bricksBroken: 0,
    state: "ready", bannerUntil: 0, shake: 0, last: 0,
  };
}

export default function Breakout({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine(colsForWidth(typeof window !== "undefined" ? window.innerWidth : 420)));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("breakout"));
  const [over, setOver] = useState<{ best: number; isNewBest: boolean; level: number; bricks: number; bestCombo: number } | null>(null);

  const restart = useCallback(() => {
    engineRef.current = freshEngine(colsForWidth(wrapRef.current?.getBoundingClientRect().width ?? window.innerWidth));
    setScore(0);
    setOver(null);
  }, []);

  useEffect(() => {
    bumpPlays("breakout");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 360;
    let H = 530;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = Math.max(240, Math.floor(rect.width));
      H = Math.max(300, Math.floor(rect.height));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current) ro.observe(wrapRef.current);

    // Scale unit follows the average stage size so speeds/sizes feel right on any screen.
    const u = () => Math.max(0.75, Math.min(1.8, (W + H) / 2 / 560));
    const paddleY = () => H - 44 * u();
    const paddleW = (e: Engine, now: number) => (now < e.wideUntil ? 150 : 100) * u();
    const paddleH = () => 14 * u();
    const ballR = () => 7.5 * u();
    const brickGeom = (b: Brick, cols: number) => {
      const bw = W / cols;
      const bh = 21 * u();
      const top = 64 * u();
      return { x: b.col * bw + 2, y: top + b.row * (bh + 4 * u()), w: bw - 4, h: bh };
    };

    const launch = (e: Engine) => {
      for (const ball of e.balls) {
        if (ball.stuck) {
          ball.stuck = false;
          const sp = ballSpeed(e, performance.now());
          const ang = -Math.PI / 2 + (Math.random() * 0.5 - 0.25);
          ball.vx = Math.cos(ang) * sp;
          ball.vy = Math.sin(ang) * sp;
        }
      }
      if (e.state === "ready") e.state = "playing";
    };

    const ballSpeed = (e: Engine, now: number) => {
      const base = (330 + (e.level - 1) * 26 + e.bricksBroken * 0.9) * u();
      return now < e.slowUntil ? base * 0.68 : base;
    };

    const normalizeBall = (e: Engine, ball: Ball, now: number) => {
      const sp = ballSpeed(e, now);
      const mag = Math.hypot(ball.vx, ball.vy) || 1;
      ball.vx = (ball.vx / mag) * sp;
      ball.vy = (ball.vy / mag) * sp;
      const minVy = sp * 0.3;
      if (Math.abs(ball.vy) < minVy) {
        ball.vy = ball.vy < 0 ? -minVy : minVy;
        const m2 = Math.hypot(ball.vx, ball.vy);
        ball.vx = (ball.vx / m2) * sp;
        ball.vy = (ball.vy / m2) * sp;
      }
    };

    const burst = (e: Engine, x: number, y: number, color: string) => {
      for (let i = 0; i < 10; i++) {
        e.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 260 * u(),
          vy: (Math.random() - 0.65) * 260 * u(),
          life: 0, max: 0.35 + Math.random() * 0.3,
          color, size: (1.6 + Math.random() * 2.6) * u(),
        });
      }
    };

    const loseLife = (e: Engine) => {
      e.lives--;
      e.combo = 0;
      e.shake = 10;
      sfx.hit();
      if (e.lives <= 0) {
        e.state = "over";
        const res = submitScore("breakout", e.score);
        setBest(res.best);
        sfx.gameover();
        setOver({ ...res, level: e.level, bricks: e.bricksBroken, bestCombo: e.bestCombo });
      } else {
        e.balls = [{ x: e.paddleX * W, y: 0, vx: 0, vy: 0, stuck: true, trail: [] }];
        e.powerups = [];
      }
    };

    const nextLevel = (e: Engine, now: number) => {
      e.level++;
      e.bricks = makeLevel(e.level, e.cols);
      e.balls = [{ x: e.paddleX * W, y: 0, vx: 0, vy: 0, stuck: true, trail: [] }];
      e.powerups = [];
      e.combo = 0;
      e.state = "levelclear";
      e.bannerUntil = now + 1400;
      sfx.win();
    };

    const applyPower = (e: Engine, p: PowerUp, now: number) => {
      sfx.power();
      if (p.type === "wide") {
        e.wideUntil = now + 12000;
        e.floaters.push({ x: p.x, y: p.y - 8, text: "WIDE!", life: 0 });
      } else if (p.type === "slow") {
        e.slowUntil = now + 8000;
        e.floaters.push({ x: p.x, y: p.y - 8, text: "SLOW-MO!", life: 0 });
        e.balls.forEach((b) => !b.stuck && normalizeBall(e, b, now));
      } else if (p.type === "life") {
        e.lives = Math.min(5, e.lives + 1);
        e.floaters.push({ x: p.x, y: p.y - 8, text: "+1 ♥", life: 0 });
      } else if (p.type === "multi") {
        const src = e.balls.filter((b) => !b.stuck);
        const extra: Ball[] = [];
        for (const b of src) {
          if (e.balls.length + extra.length >= 6) break;
          extra.push({ x: b.x, y: b.y, vx: -b.vx, vy: b.vy, stuck: false, trail: [] });
        }
        e.balls.push(...extra);
        e.floaters.push({ x: p.x, y: p.y - 8, text: "MULTI-BALL!", life: 0 });
      }
    };

    const stepBall = (e: Engine, ball: Ball, dt: number, now: number) => {
      const r = ballR();
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.x - r < 0) { ball.x = r; ball.vx = Math.abs(ball.vx); }
      if (ball.x + r > W) { ball.x = W - r; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - r < 0) { ball.y = r; ball.vy = Math.abs(ball.vy); }

      // paddle
      const pw = paddleW(e, now);
      const px = e.paddleX * W - pw / 2;
      const py = paddleY();
      if (
        ball.vy > 0 &&
        ball.y + r >= py && ball.y - r <= py + paddleH() &&
        ball.x >= px - r * 0.5 && ball.x <= px + pw + r * 0.5
      ) {
        const offset = Math.max(-1, Math.min(1, (ball.x - (px + pw / 2)) / (pw / 2)));
        const sp = ballSpeed(e, now);
        const ang = -Math.PI / 2 + offset * (Math.PI * 0.38);
        ball.vx = Math.cos(ang) * sp;
        ball.vy = Math.sin(ang) * sp;
        ball.y = py - r - 0.5;
        e.combo = 0;
        sfx.paddle();
      }

      // bricks
      for (const b of e.bricks) {
        if (!b.alive) continue;
        const g = brickGeom(b, e.cols);
        const cx = Math.max(g.x, Math.min(ball.x, g.x + g.w));
        const cy = Math.max(g.y, Math.min(ball.y, g.y + g.h));
        const dx = ball.x - cx;
        const dy = ball.y - cy;
        if (dx * dx + dy * dy <= r * r) {
          if (Math.abs(dx) > Math.abs(dy)) ball.vx = dx > 0 ? Math.abs(ball.vx) : -Math.abs(ball.vx);
          else ball.vy = dy > 0 ? Math.abs(ball.vy) : -Math.abs(ball.vy);
          normalizeBall(e, ball, now);

          b.hp--;
          e.combo++;
          e.bestCombo = Math.max(e.bestCombo, e.combo);
          const mult = Math.min(3, 1 + e.combo * 0.1);
          const pts = Math.round(10 * mult);
          e.score += pts;
          setScore(e.score);
          sfx.brick(Math.min(1.9, 0.85 + e.combo * 0.05));

          if (b.hp <= 0) {
            b.alive = false;
            e.bricksBroken++;
            burst(e, g.x + g.w / 2, g.y + g.h / 2, b.hue);
            e.floaters.push({ x: g.x + g.w / 2, y: g.y, text: `+${pts}`, life: 0 });
            if (e.combo > 0 && e.combo % 8 === 0) {
              e.floaters.push({ x: W / 2, y: H * 0.42, text: `🔥 COMBO ×${mult.toFixed(1)}`, life: 0, big: true });
            }
            if (Math.random() < 0.16) {
              const types: PowerUp["type"][] = ["wide", "multi", "slow", "life"];
              const weights = [0.32, 0.3, 0.24, 0.14];
              let roll = Math.random();
              let idx = 0;
              while (roll > weights[idx] && idx < 3) { roll -= weights[idx]; idx++; }
              e.powerups.push({ x: g.x + g.w / 2, y: g.y + g.h / 2, type: types[idx] });
            }
            if (e.bricks.every((x) => !x.alive)) nextLevel(e, now);
          }
          break;
        }
      }
    };

    const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      if (!e.last) e.last = now;
      const dt = Math.min(0.033, (now - e.last) / 1000);
      e.last = now;

      // --- update ---
      if (e.keys.left) e.paddleX -= dt * 1.9;
      if (e.keys.right) e.paddleX += dt * 1.9;
      if (e.paddleTarget !== null) {
        const diff = e.paddleTarget - e.paddleX * W;
        e.paddleX += (diff / W) * Math.min(1, dt * 22);
      }
      const pwFrac = paddleW(e, now) / W / 2;
      e.paddleX = Math.max(pwFrac, Math.min(1 - pwFrac, e.paddleX));

      if (e.state === "levelclear" && now > e.bannerUntil) e.state = "playing";

      if (e.state === "playing" || e.state === "ready" || e.state === "levelclear") {
        for (const ball of e.balls) {
          if (ball.stuck) {
            ball.x = e.paddleX * W;
            ball.y = paddleY() - ballR() - 2;
            ball.trail = [];
            continue;
          }
          const speedNow = Math.hypot(ball.vx, ball.vy);
          const steps = Math.max(1, Math.ceil((speedNow * dt) / (ballR() * 0.8)));
          for (let i = 0; i < steps; i++) {
            stepBall(e, ball, dt / steps, now);
            if (e.state !== "playing" && e.state !== "levelclear") break;
          }
          ball.trail.push({ x: ball.x, y: ball.y });
          if (ball.trail.length > 9) ball.trail.shift();
        }
        // remove lost balls
        const before = e.balls.length;
        e.balls = e.balls.filter((b) => b.y - ballR() < H + 6);
        if (e.balls.length === 0 && before > 0 && e.state === "playing") loseLife(e);

        // powerups fall
        const py = paddleY();
        const pw = paddleW(e, now);
        const px = e.paddleX * W - pw / 2;
        for (const p of e.powerups) {
          p.y += 150 * u() * dt;
          if (p.y >= py && p.y <= py + paddleH() + 10 && p.x >= px - 8 && p.x <= px + pw + 8) {
            applyPower(e, p, now);
            p.y = H + 100;
          }
        }
        e.powerups = e.powerups.filter((p) => p.y < H + 30);
      }

      for (const p of e.particles) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 520 * u() * dt;
      }
      e.particles = e.particles.filter((p) => p.life < p.max);
      for (const f of e.floaters) { f.life += dt; f.y -= 30 * u() * dt; }
      e.floaters = e.floaters.filter((f) => f.life < 0.9);
      if (e.shake > 0) e.shake *= 0.88;

      // --- draw ---
      ctx.save();
      if (e.shake > 0.4) ctx.translate((Math.random() - 0.5) * e.shake, (Math.random() - 0.5) * e.shake);

      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#171A33");
      bg.addColorStop(1, "#0D0E22");
      ctx.fillStyle = bg;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.strokeStyle = "rgba(123,92,255,0.08)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 42 * u()) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += 42 * u()) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // HUD: lives + level
      ctx.font = `${16 * u()}px system-ui`;
      ctx.textAlign = "left";
      ctx.fillText("♥".repeat(Math.max(0, e.lives)), 10, 26 * u());
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `800 ${14 * u()}px 'Fredoka', system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillText(`LEVEL ${e.level}`, W - 10, 26 * u());
      ctx.textAlign = "center";
      if (e.combo >= 4) {
        ctx.fillStyle = "#FFB020";
        ctx.font = `800 ${14 * u()}px 'Fredoka', system-ui, sans-serif`;
        ctx.fillText(`COMBO ×${Math.min(3, 1 + e.combo * 0.1).toFixed(1)}`, W / 2, 26 * u());
      }

      // bricks
      for (const b of e.bricks) {
        if (!b.alive) continue;
        const g = brickGeom(b, e.cols);
        const grad = ctx.createLinearGradient(g.x, g.y, g.x, g.y + g.h);
        grad.addColorStop(0, b.hue);
        grad.addColorStop(1, b.hue);
        ctx.globalAlpha = b.hp === b.maxHp ? 1 : 0.55 + 0.45 * (b.hp / b.maxHp);
        ctx.fillStyle = grad;
        roundRect(g.x, g.y, g.w, g.h, 5 * u());
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        roundRect(g.x + 2, g.y + 1.5, g.w - 4, 3.5 * u(), 2 * u());
        ctx.fill();
        if (b.maxHp > 1) {
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          for (let i = 0; i < b.hp; i++) {
            ctx.beginPath();
            ctx.arc(g.x + g.w / 2 + (i - (b.hp - 1) / 2) * 8 * u(), g.y + g.h / 2 + 2 * u(), 2 * u(), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // powerups
      for (const p of e.powerups) {
        const art = POWER_ART[p.type];
        const r = 13 * u();
        ctx.fillStyle = art.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.font = `900 ${12 * u()}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(art.label, p.x, p.y + 1);
        ctx.textBaseline = "alphabetic";
      }

      // paddle
      const pw = paddleW(e, now);
      const px = e.paddleX * W - pw / 2;
      const py = paddleY();
      const pgrad = ctx.createLinearGradient(px, py, px + pw, py);
      pgrad.addColorStop(0, "#1CB0F6");
      pgrad.addColorStop(0.5, "#7B5CFF");
      pgrad.addColorStop(1, "#FF4B6E");
      ctx.fillStyle = pgrad;
      roundRect(px, py, pw, paddleH(), 7 * u());
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      roundRect(px + 3, py + 2, pw - 6, 3 * u(), 2 * u());
      ctx.fill();

      // balls + trails
      for (const ball of e.balls) {
        ball.trail.forEach((t, i) => {
          ctx.globalAlpha = (i / ball.trail.length) * 0.3;
          ctx.fillStyle = "#9BE7FF";
          ctx.beginPath();
          ctx.arc(t.x, t.y, ballR() * (i / ball.trail.length) * 0.9, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        const bgrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ballR());
        bgrad.addColorStop(0, "#FFFFFF");
        bgrad.addColorStop(1, "#7DD3FC");
        ctx.fillStyle = bgrad;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ballR(), 0, Math.PI * 2);
        ctx.fill();
      }

      // particles
      for (const p of e.particles) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // floaters
      for (const f of e.floaters) {
        ctx.globalAlpha = 1 - f.life / 0.9;
        ctx.font = `800 ${(f.big ? 21 : 13.5) * u()}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(10,10,25,0.7)";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.big ? "#FFB020" : "#FFE27A";
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // banners
      ctx.textAlign = "center";
      if (e.state === "ready" || (e.balls.some((b) => b.stuck) && e.state === "playing")) {
        ctx.font = `800 ${19 * u()}px 'Fredoka', system-ui, sans-serif`;
        ctx.lineWidth = 6;
        ctx.strokeStyle = "rgba(10,10,25,0.65)";
        const msg = e.level === 1 && e.score === 0 ? "Drag to move · tap to launch!" : "Tap to launch!";
        ctx.strokeText(msg, W / 2, H * 0.58);
        ctx.fillStyle = "#fff";
        ctx.fillText(msg, W / 2, H * 0.58);
      }
      if (e.state === "levelclear") {
        ctx.font = `800 ${30 * u()}px 'Fredoka', system-ui, sans-serif`;
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(10,10,25,0.7)";
        ctx.strokeText(`LEVEL ${e.level}!`, W / 2, H * 0.45);
        ctx.fillStyle = "#58CC02";
        ctx.fillText(`LEVEL ${e.level}!`, W / 2, H * 0.45);
      }

      ctx.restore();
    };

    raf = requestAnimationFrame(frame);

    const onPointerMove = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      engineRef.current.paddleTarget = ((ev.clientX - rect.left) / rect.width) * W;
    };
    const onPointerDown = (ev: PointerEvent) => {
      onPointerMove(ev);
      launch(engineRef.current);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") { e.keys.left = true; ev.preventDefault(); }
      if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") { e.keys.right = true; ev.preventDefault(); }
      if (ev.code === "Space") { launch(e); ev.preventDefault(); }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") e.keys.left = false;
      if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") e.keys.right = false;
    };

    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  return (
    <ArcadeShell
      title="Neon Breakout"
      emoji="🧱"
      color="linear-gradient(135deg,#FF7A18,#FF4B4B)"
      score={score}
      best={best}
      onBack={onBack}
      onRestart={restart}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Catch power-ups: <span style={{ color: "#1CB0F6" }}>W</span> wide · <span style={{ color: "#A560E8" }}>×3</span> multi-ball ·{" "}
          <span style={{ color: "#2EE6A8" }}>S</span> slow-mo · <span style={{ color: "#FF4B6E" }}>♥</span> extra life
        </p>
      }
    >
      <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="rounded-3xl touch-none"
          style={{ border: "2px solid rgba(255,255,255,0.14)", boxShadow: "0 18px 40px rgba(0,0,0,0.45)", cursor: "pointer" }}
        />
      </div>

      {over && (
        <GameOverCard
          score={score}
          best={over.best}
          isNewBest={over.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Reached level {over.level} · {over.bricks} bricks smashed · best combo {over.bestCombo}
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
