"use client";

/**
 * Sky Hopper — original from-scratch endless vertical jumper.
 * Normal / moving / breakable platforms, springs, jetpacks, stompable
 * sky blobs, and a sky that fades from day → sunset → space as you climb.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard, StartHint } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type PlatType = "normal" | "moving" | "break";
interface Platform { x: number; y: number; w: number; type: PlatType; phase: number; spring: boolean; broken: boolean; breakVy: number }
interface Monster { x: number; y: number; phase: number; alive: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; world: boolean }
interface Pickup { x: number; y: number; taken: boolean }

interface Engine {
  px: number; py: number; vx: number; vy: number;
  camY: number;
  maxHeight: number;
  platforms: Platform[];
  monsters: Monster[];
  jetpacks: Pickup[];
  particles: Particle[];
  topY: number;
  jetUntil: number;
  squash: number;
  stomps: number;
  springsUsed: number;
  state: "ready" | "playing" | "dead";
  keys: { left: boolean; right: boolean };
  pointerX: number | null;
  last: number;
  t: number;
  scoreShown: number;
}

const GRAV = 1500;
const BOUNCE = -950;
const SPRING_V = -1520;

function freshEngine(W: number): Engine {
  const e: Engine = {
    px: W / 2, py: 0, vx: 0, vy: 0,
    camY: -10, maxHeight: 0,
    platforms: [], monsters: [], jetpacks: [], particles: [],
    topY: 0, jetUntil: 0, squash: 0, stomps: 0, springsUsed: 0,
    state: "ready", keys: { left: false, right: false }, pointerX: null,
    last: 0, t: 0, scoreShown: 0,
  };
  // starting ground
  e.platforms.push({ x: W / 2 - 70, y: 36, w: 140, type: "normal", phase: 0, spring: false, broken: false, breakVy: 0 });
  e.topY = 36;
  return e;
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const SKY_STOPS: { top: [number, number, number]; bottom: [number, number, number] }[] = [
  { top: [86, 180, 245], bottom: [207, 243, 255] },   // day
  { top: [255, 140, 80], bottom: [255, 214, 150] },   // sunset
  { top: [88, 66, 180], bottom: [196, 148, 232] },    // dusk
  { top: [16, 16, 48], bottom: [44, 44, 92] },        // space
];

function skyAt(meters: number): { top: string; bottom: string; starAlpha: number } {
  const seg = meters / 500; // change palette every 500m
  const i = Math.min(SKY_STOPS.length - 2, Math.floor(seg));
  const t = Math.max(0, Math.min(1, seg - i));
  return {
    top: lerpColor(SKY_STOPS[i].top, SKY_STOPS[i + 1].top, t),
    bottom: lerpColor(SKY_STOPS[i].bottom, SKY_STOPS[i + 1].bottom, t),
    starAlpha: Math.max(0, Math.min(1, (meters - 900) / 500)),
  };
}

export default function SkyHopper({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine(typeof window !== "undefined" ? window.innerWidth : 360));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("hopper"));
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean; stomps: number } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const restart = useCallback(() => {
    engineRef.current = freshEngine(wrapRef.current?.getBoundingClientRect().width ?? 360);
    setScore(0);
    setOverInfo(null);
    setPhase("ready");
  }, []);

  useEffect(() => {
    bumpPlays("hopper");
  }, []);

  const start = useCallback(() => {
    const e = engineRef.current;
    if (phaseRef.current !== "ready") return;
    e.state = "playing";
    e.vy = BOUNCE * 0.9;
    sfx.bounce();
    setPhase("playing");
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 360;
    let H = 560;

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

    // Scale unit follows the stage HEIGHT so jump physics feel the same everywhere.
    const u = () => Math.max(0.8, Math.min(1.7, H / 640));
    const PR = () => 21 * u(); // player radius
    const PLAT_H = () => 14 * u();
    const meters = (e: Engine) => Math.max(0, Math.floor(e.maxHeight / (46 * u())));

    const stars = Array.from({ length: 80 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.6 + 0.5, tw: Math.random() * Math.PI * 2 }));
    const clouds = Array.from({ length: 7 }, (_, i) => ({ x: Math.random(), y: i / 7, s: 0.6 + Math.random() * 0.9 }));

    const burst = (e: Engine, x: number, y: number, color: string, n = 12) => {
      for (let i = 0; i < n; i++) {
        e.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 240 * u(),
          vy: (Math.random() - 0.6) * 240 * u(),
          life: 0, max: 0.35 + Math.random() * 0.3,
          color, size: (1.8 + Math.random() * 2.6) * u(), world: true,
        });
      }
    };

    const genPlatforms = (e: Engine) => {
      const m = meters(e);
      while (e.topY > e.camY - 140 * u()) {
        const gap = (80 + Math.min(42, m * 0.05) + Math.random() * 34) * u();
        e.topY -= gap;
        const w = Math.max(58 * u(), (86 - Math.min(24, m * 0.03)) * u());
        const x = Math.random() * (W - w);
        const roll = Math.random();
        const type: PlatType = m < 25 ? "normal" : roll < 0.16 + Math.min(0.12, m / 4000) ? "moving" : roll > 0.86 ? "break" : "normal";
        const plat: Platform = {
          x, y: e.topY, w, type,
          phase: Math.random() * Math.PI * 2,
          spring: type === "normal" && Math.random() < 0.09,
          broken: false, breakVy: 0,
        };
        e.platforms.push(plat);
        if (type === "normal" && Math.random() < 0.022) {
          e.jetpacks.push({ x: x + w / 2, y: e.topY - 30 * u(), taken: false });
        }
        if (m > 60 && Math.random() < 0.05) {
          e.monsters.push({ x: 40 * u() + Math.random() * (W - 80 * u()), y: e.topY - 46 * u(), phase: Math.random() * 6, alive: true });
        }
      }
      e.platforms = e.platforms.filter((p) => p.y < e.camY + H + 120);
      e.monsters = e.monsters.filter((mo) => mo.y < e.camY + H + 120);
      e.jetpacks = e.jetpacks.filter((j) => !j.taken && j.y < e.camY + H + 120);
    };

    const finishDeath = (e: Engine) => {
      const res = submitScore("hopper", meters(e));
      setBest(res.best);
      setOverInfo({ ...res, stomps: e.stomps });
      sfx.gameover();
      setPhase("over");
    };

    const drawPlatform = (p: Platform, sy: number) => {
      const h = PLAT_H();
      ctx.save();
      if (p.type === "normal") {
        ctx.fillStyle = "#8A5A2B";
        roundRectPath(p.x, sy, p.w, h, 6 * u());
        ctx.fill();
        ctx.fillStyle = "#58CC02";
        roundRectPath(p.x, sy, p.w, h * 0.55, 6 * u());
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(p.x + 3, sy + 1.5, p.w - 6, 2.2 * u());
      } else if (p.type === "moving") {
        ctx.fillStyle = "#2563EB";
        roundRectPath(p.x, sy, p.w, h, 6 * u());
        ctx.fill();
        ctx.fillStyle = "#7DD3FC";
        roundRectPath(p.x, sy, p.w, h * 0.5, 6 * u());
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `900 ${10 * u()}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText("⇄", p.x + p.w / 2, sy + h - 3 * u());
      } else {
        ctx.fillStyle = "#A9805A";
        roundRectPath(p.x, sy, p.w, h, 5 * u());
        ctx.fill();
        ctx.strokeStyle = "rgba(70,45,20,0.7)";
        ctx.lineWidth = 1.4 * u();
        ctx.beginPath();
        ctx.moveTo(p.x + p.w * 0.3, sy + 2);
        ctx.lineTo(p.x + p.w * 0.45, sy + h * 0.55);
        ctx.lineTo(p.x + p.w * 0.38, sy + h - 2);
        ctx.moveTo(p.x + p.w * 0.62, sy + 2);
        ctx.lineTo(p.x + p.w * 0.55, sy + h * 0.6);
        ctx.stroke();
      }
      if (p.spring && !p.broken) {
        const sx = p.x + p.w / 2;
        const topY = sy - 13 * u();
        ctx.strokeStyle = "#C0C7D1";
        ctx.lineWidth = 2.4 * u();
        ctx.beginPath();
        ctx.moveTo(sx - 7 * u(), sy);
        ctx.lineTo(sx + 7 * u(), sy - 4 * u());
        ctx.lineTo(sx - 7 * u(), sy - 8 * u());
        ctx.lineTo(sx + 7 * u(), sy - 12 * u());
        ctx.stroke();
        ctx.fillStyle = "#FF4B4B";
        roundRectPath(sx - 11 * u(), topY - 4 * u(), 22 * u(), 5 * u(), 2.5 * u());
        ctx.fill();
      }
      ctx.restore();
    };

    const roundRectPath = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    };

    const drawPlayer = (e: Engine, sx: number, sy: number, now: number) => {
      const r = PR();
      const stretch = e.state === "playing" ? Math.max(-0.16, Math.min(0.22, -e.vy / 4200)) : 0;
      const syScale = 1 + stretch - e.squash * 0.35;
      const sxScale = 1 - stretch * 0.6 + e.squash * 0.3;
      const jetting = now < e.jetUntil;

      ctx.save();
      ctx.translate(sx, sy);
      if (e.vx < -30) ctx.scale(-1, 1);

      // jetpack
      if (jetting) {
        ctx.fillStyle = "#FF7847";
        ctx.beginPath();
        ctx.moveTo(-r * 0.95, r * 0.3);
        ctx.lineTo(-r * 0.75, r * (1.1 + Math.random() * 0.5));
        ctx.lineTo(-r * 0.5, r * 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#F43F5E";
        roundRectPath(-r * 1.15, -r * 0.5, r * 0.42, r * 0.95, r * 0.18);
        ctx.fill();
        ctx.fillStyle = "#CBD5E1";
        roundRectPath(-r * 1.15, -r * 0.5, r * 0.42, r * 0.3, r * 0.15);
        ctx.fill();
      }

      ctx.scale(sxScale, syScale);
      // feet
      ctx.fillStyle = "#2E8B1E";
      ctx.beginPath();
      ctx.ellipse(-r * 0.48, r * 0.92, r * 0.34, r * 0.17, 0, 0, Math.PI * 2);
      ctx.ellipse(r * 0.48, r * 0.92, r * 0.34, r * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      // body
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.25, 0, 0, r * 1.25);
      grad.addColorStop(0, "#A7F08B");
      grad.addColorStop(0.6, "#5ECB3F");
      grad.addColorStop(1, "#35A81F");
      ctx.fillStyle = e.state === "dead" ? "#8B93A5" : grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.94, 0, 0, Math.PI * 2);
      ctx.fill();
      // belly
      ctx.fillStyle = "rgba(240,255,220,0.95)";
      ctx.beginPath();
      ctx.ellipse(0, r * 0.4, r * 0.56, r * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      // eye bumps
      for (const s of [-1, 1]) {
        ctx.fillStyle = e.state === "dead" ? "#8B93A5" : "#5ECB3F";
        ctx.beginPath();
        ctx.arc(s * r * 0.42, -r * 0.82, r * 0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s * r * 0.42, -r * 0.84, r * 0.22, 0, Math.PI * 2);
        ctx.fill();
        if (e.state === "dead") {
          ctx.strokeStyle = "#1F2430";
          ctx.lineWidth = r * 0.09;
          const ex = s * r * 0.42, ey = -r * 0.84, d = r * 0.1;
          ctx.beginPath();
          ctx.moveTo(ex - d, ey - d); ctx.lineTo(ex + d, ey + d);
          ctx.moveTo(ex + d, ey - d); ctx.lineTo(ex - d, ey + d);
          ctx.stroke();
        } else {
          const look = Math.max(-1, Math.min(1, e.vx / 260));
          ctx.fillStyle = "#1F2430";
          ctx.beginPath();
          ctx.arc(s * r * 0.42 + look * r * 0.08, -r * 0.84 + (e.vy > 240 ? r * 0.05 : -r * 0.04), r * 0.11, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // mouth
      ctx.strokeStyle = "rgba(20,70,20,0.8)";
      ctx.lineWidth = r * 0.09;
      ctx.lineCap = "round";
      ctx.beginPath();
      if (e.state === "dead") ctx.arc(0, r * 0.28, r * 0.2, Math.PI * 1.15, Math.PI * 1.85);
      else if (e.vy < -500) { ctx.arc(0, r * 0.08, r * 0.17, 0, Math.PI * 2); }
      else ctx.arc(0, r * 0.02, r * 0.3, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      // blush
      ctx.fillStyle = "rgba(255,130,130,0.55)";
      ctx.beginPath();
      ctx.ellipse(-r * 0.62, r * 0.05, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
      ctx.ellipse(r * 0.62, r * 0.05, r * 0.16, r * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawMonster = (mo: Monster, sx: number, sy: number, t: number) => {
      const r = 17 * u() * (1 + Math.sin(t * 4 + mo.phase) * 0.06);
      ctx.save();
      ctx.translate(sx, sy + Math.sin(t * 2 + mo.phase) * 4 * u());
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.25, 0, 0, r * 1.2);
      grad.addColorStop(0, "#E9C6FF");
      grad.addColorStop(1, "#9333EA");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      // spikes
      ctx.fillStyle = "#7E22CE";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + mo.phase;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * r * 0.85, Math.sin(a) * r * 0.85);
        ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
        ctx.lineTo(Math.cos(a + 0.35) * r * 0.85, Math.sin(a + 0.35) * r * 0.85);
        ctx.closePath();
        ctx.fill();
      }
      // one big eye
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, -r * 0.12, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1F2430";
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      // toothy frown
      ctx.strokeStyle = "#3B0764";
      ctx.lineWidth = 2 * u();
      ctx.beginPath();
      ctx.arc(0, r * 0.62, r * 0.3, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.restore();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      if (!e.last) e.last = now;
      const dt = Math.min(0.033, (now - e.last) / 1000);
      e.last = now;
      e.t += dt;
      const r = PR();

      // keep engine anchored to current width on first frames
      if (e.state === "ready" && e.px === 180) e.px = W / 2;

      // --- update ---
      if (e.state === "playing" || e.state === "dead") {
        // horizontal
        const ACC = 2600 * u();
        const MAXV = Math.max(330 * u(), W * 0.52);
        if (e.state === "playing") {
          if (e.keys.left) e.vx -= ACC * dt;
          if (e.keys.right) e.vx += ACC * dt;
          if (e.pointerX !== null) {
            const diff = e.pointerX - e.px;
            e.vx += Math.max(-ACC, Math.min(ACC, diff * 14)) * dt * 3;
          }
          if (!e.keys.left && !e.keys.right && e.pointerX === null) e.vx *= Math.pow(0.0015, dt);
          e.vx = Math.max(-MAXV, Math.min(MAXV, e.vx));
        }
        e.px += e.vx * dt;
        if (e.px < -r) e.px = W + r - 1;
        if (e.px > W + r) e.px = -r + 1;

        // vertical
        if (now < e.jetUntil) {
          e.vy = -1150 * u();
          if (Math.random() < 0.7) {
            e.particles.push({
              x: e.px - r * 0.8, y: e.py + r, vx: (Math.random() - 0.5) * 40, vy: 180 * u(),
              life: 0, max: 0.3, color: Math.random() < 0.5 ? "#FFB020" : "#FF7847", size: 2.6 * u(), world: true,
            });
          }
        } else {
          e.vy += GRAV * u() * dt;
        }
        const prevFeet = e.py + r * 0.95;
        e.py += e.vy * dt;
        const newFeet = e.py + r * 0.95;

        // moving platforms advance
        for (const p of e.platforms) {
          if (p.type === "moving") {
            p.phase += dt * 1.7;
            p.x += Math.cos(p.phase) * 68 * u() * dt;
            if (p.x < 0) { p.x = 0; p.phase = 0; }
            if (p.x + p.w > W) { p.x = W - p.w; p.phase = Math.PI; }
          }
          if (p.broken) {
            p.breakVy += GRAV * u() * dt * 0.7;
            p.y += p.breakVy * dt;
          }
        }

        // landings (only while falling)
        if (e.state === "playing" && e.vy > 0) {
          for (const p of e.platforms) {
            if (p.broken) continue;
            const withinX = e.px + r * 0.62 > p.x && e.px - r * 0.62 < p.x + p.w;
            if (withinX && prevFeet <= p.y + 6 * u() && newFeet >= p.y) {
              if (p.type === "break") {
                p.broken = true;
                p.breakVy = 60 * u();
                burst(e, e.px, p.y, "#A9805A", 8);
                sfx.hit();
              } else if (p.spring && Math.abs(e.px - (p.x + p.w / 2)) < 15 * u()) {
                e.py = p.y - r * 0.95;
                e.vy = SPRING_V * u();
                e.squash = 1;
                e.springsUsed++;
                sfx.spring();
                burst(e, e.px, p.y, "#FF4B4B", 8);
              } else {
                e.py = p.y - r * 0.95;
                e.vy = BOUNCE * u();
                e.squash = 1;
                sfx.bounce();
              }
              break;
            }
          }
        }

        // jetpack pickups
        if (e.state === "playing") {
          for (const j of e.jetpacks) {
            if (!j.taken && Math.abs(e.px - j.x) < r + 14 * u() && Math.abs(e.py - j.y) < r + 16 * u()) {
              j.taken = true;
              e.jetUntil = now + 1650;
              sfx.power();
              burst(e, j.x, j.y, "#FFB020", 14);
            }
          }
          // monsters
          for (const mo of e.monsters) {
            if (!mo.alive) continue;
            const mx = mo.x + Math.sin(e.t * 1.3 + mo.phase) * 24 * u();
            const dx = e.px - mx;
            const dy = e.py - mo.y;
            const dist = Math.hypot(dx, dy);
            if (dist < r + 15 * u()) {
              if (e.vy > 60 && e.py < mo.y - 4 * u()) {
                mo.alive = false;
                e.stomps++;
                e.vy = BOUNCE * u() * 1.02;
                sfx.pop(1.4);
                burst(e, mx, mo.y, "#C084FC", 16);
              } else if (now > e.jetUntil) {
                e.state = "dead";
                e.vy = -320 * u();
                sfx.hit();
                burst(e, e.px, e.py, "#FF6B4A", 16);
              }
            }
          }
        }

        // camera follows upward progress only
        const targetCam = e.py - H * 0.38;
        if (targetCam < e.camY) e.camY = targetCam;
        e.maxHeight = Math.max(e.maxHeight, -e.py);

        const m = meters(e);
        if (m !== e.scoreShown) {
          e.scoreShown = m;
          setScore(m);
        }

        // fell below camera?
        if (e.py - e.camY > H + 50) {
          if (e.state === "playing") sfx.hit();
          if (phaseRef.current !== "over") finishDeath(e);
          e.state = "dead";
        }
      }

      e.squash = Math.max(0, e.squash - dt * 7);
      genPlatforms(e);

      for (const p of e.particles) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * u() * dt;
      }
      e.particles = e.particles.filter((p) => p.life < p.max);

      // --- draw ---
      const m = meters(e);
      const sky = skyAt(m);
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, sky.top);
      grad.addColorStop(1, sky.bottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // stars (parallax)
      if (sky.starAlpha > 0) {
        for (const s of stars) {
          const y = ((s.y * H * 2 - e.camY * 0.25) % H + H) % H;
          ctx.globalAlpha = sky.starAlpha * (0.5 + 0.5 * Math.sin(e.t * 2.4 + s.tw));
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(s.x * W, y, s.s, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // clouds (fade with altitude)
      const cloudAlpha = Math.max(0, 1 - m / 900);
      if (cloudAlpha > 0.02) {
        ctx.fillStyle = `rgba(255,255,255,${0.85 * cloudAlpha})`;
        for (const c of clouds) {
          const y = ((c.y * H * 1.6 - e.camY * 0.45) % (H + 90) + H + 90) % (H + 90) - 45;
          const x = c.x * W;
          const s = c.s * u();
          ctx.beginPath();
          ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
          ctx.arc(x + 15 * s, y + 3 * s, 12 * s, 0, Math.PI * 2);
          ctx.arc(x - 15 * s, y + 4 * s, 11 * s, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // altitude marker lines every 100m
      ctx.font = `800 ${12 * u()}px 'Fredoka', system-ui, sans-serif`;
      ctx.textAlign = "left";
      const meterPx = 46 * u();
      const firstMark = Math.ceil(-(e.camY + H) / (meterPx * 100));
      for (let k = firstMark; k < firstMark + 4; k++) {
        if (k <= 0) continue;
        const y = -k * meterPx * 100 - e.camY;
        if (y < -20 || y > H + 20) continue;
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 7]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillText(`${k * 100}m`, 8, y - 5);
      }

      for (const p of e.platforms) drawPlatform(p, p.y - e.camY);

      // jetpack pickups
      for (const j of e.jetpacks) {
        if (j.taken) continue;
        const sy = j.y - e.camY + Math.sin(e.t * 3 + j.x) * 3 * u();
        ctx.save();
        ctx.translate(j.x, sy);
        ctx.fillStyle = "#F43F5E";
        roundRectPath(-9 * u(), -13 * u(), 18 * u(), 24 * u(), 5 * u());
        ctx.fill();
        ctx.fillStyle = "#CBD5E1";
        roundRectPath(-9 * u(), -13 * u(), 18 * u(), 7 * u(), 4 * u());
        ctx.fill();
        ctx.fillStyle = "#FFB020";
        ctx.beginPath();
        ctx.moveTo(-6 * u(), 11 * u());
        ctx.lineTo(0, (17 + Math.sin(e.t * 18) * 2.5) * u());
        ctx.lineTo(6 * u(), 11 * u());
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      for (const mo of e.monsters) {
        if (mo.alive) drawMonster(mo, mo.x + Math.sin(e.t * 1.3 + mo.phase) * 24 * u(), mo.y - e.camY, e.t);
      }

      for (const p of e.particles) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y - e.camY, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      drawPlayer(e, e.px, e.py - e.camY, now);

      // height HUD
      ctx.font = "800 30px 'Fredoka', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(31,36,48,0.55)";
      const label = `${m}m`;
      ctx.strokeText(label, W / 2, 40);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, W / 2, 40);
    };

    raf = requestAnimationFrame(frame);

    const toGameX = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return ((ev.clientX - rect.left) / rect.width) * W;
    };
    const onPointerDown = (ev: PointerEvent) => {
      engineRef.current.pointerX = toGameX(ev);
      if (phaseRef.current === "ready") start();
    };
    const onPointerMove = (ev: PointerEvent) => {
      if (engineRef.current.pointerX !== null) engineRef.current.pointerX = toGameX(ev);
    };
    const onPointerUp = () => {
      engineRef.current.pointerX = null;
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") { e.keys.left = true; ev.preventDefault(); if (phaseRef.current === "ready") start(); }
      if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") { e.keys.right = true; ev.preventDefault(); if (phaseRef.current === "ready") start(); }
      if (ev.code === "Space") { ev.preventDefault(); if (phaseRef.current === "ready") start(); }
    };
    const onKeyUp = (ev: KeyboardEvent) => {
      const e = engineRef.current;
      if (ev.key === "ArrowLeft" || ev.key === "a" || ev.key === "A") e.keys.left = false;
      if (ev.key === "ArrowRight" || ev.key === "d" || ev.key === "D") e.keys.right = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [start]);

  return (
    <ArcadeShell
      title="Sky Hopper"
      emoji="🐸"
      color="linear-gradient(135deg,#2EE6A8,#1CB0F6)"
      score={score}
      scoreLabel="Height (m)"
      best={best}
      onBack={onBack}
      onRestart={restart}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Drag or use ← → to steer · red pads are springs · stomp the purple blobs · grab 🚀 jetpacks!
        </p>
      }
    >
      <div ref={wrapRef} className="absolute inset-0 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="rounded-3xl touch-none"
          style={{ border: "2px solid rgba(255,255,255,0.14)", boxShadow: "0 18px 40px rgba(0,0,0,0.45)" }}
        />
      </div>

      {phase === "ready" && <StartHint emoji="🐸" title="Sky Hopper" hint="Tap to bounce — steer by dragging!" onStart={start} />}
      {phase === "over" && overInfo && (
        <GameOverCard
          score={score}
          scoreLabel="Height (m)"
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              👾 {overInfo.stomps} blobs stomped · 🚀 the sky turns to space at 1,000m!
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
