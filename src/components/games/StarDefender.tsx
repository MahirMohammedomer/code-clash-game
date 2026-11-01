"use client";

/**
 * Star Defender — original from-scratch wave shooter.
 * Piloting is pure positioning: your cannon auto-fires while you dodge.
 * Alien formations sweep and descend, return fire intensifies, power-ups
 * (rapid / triple / shield) drop from kills, and a bonus mothership
 * occasionally crosses the starfield. Fills the whole screen.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard, StartHint } from "./Shell";
import { bumpPlays, getBest, submitScore, arcadeDpr } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

interface Bullet { x: number; y: number; vx: number; vy: number; hostile: boolean }
interface Alien { col: number; row: number; hp: number; alive: boolean }
interface Power { x: number; y: number; type: "rapid" | "triple" | "shield" }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; life: number; color: string }

interface Engine {
  shipX: number;
  shipVX: number;
  pointerX: number | null;
  keys: { left: boolean; right: boolean };
  bullets: Bullet[];
  aliens: Alien[];
  cols: number;
  rows: number;
  formX: number;
  formY: number;
  formDir: number;
  powers: Power[];
  particles: Particle[];
  floaters: Floater[];
  fireIn: number;
  alienFireIn: number;
  motherIn: number;
  mother: { x: number } | null;
  rapidUntil: number;
  tripleUntil: number;
  shield: boolean;
  invulnUntil: number;
  lives: number;
  wave: number;
  score: number;
  kills: number;
  state: "ready" | "playing" | "waveclear" | "over";
  bannerUntil: number;
  shake: number;
  last: number;
  t: number;
}

const ROW_COLORS = ["#C084FC", "#FF6BCB", "#FF8A3D", "#2EE6A8", "#38BDF8"];
const ROW_POINTS = [30, 20, 20, 10, 10];

function makeWave(e: Engine, W: number) {
  e.cols = Math.max(6, Math.min(11, Math.floor(W / 86)));
  e.rows = Math.min(5, 3 + Math.floor((e.wave - 1) / 2) + (e.wave > 1 ? 1 : 0));
  e.aliens = [];
  for (let r = 0; r < e.rows; r++) {
    for (let c = 0; c < e.cols; c++) {
      e.aliens.push({ col: c, row: r, hp: e.wave >= 4 && r === 0 ? 2 : 1, alive: true });
    }
  }
  e.formDir = 1;
  e.formX = 0;
  e.formY = 0;
  e.bullets = e.bullets.filter((b) => !b.hostile);
}

function freshEngine(W: number): Engine {
  const e: Engine = {
    shipX: W / 2, shipVX: 0, pointerX: null, keys: { left: false, right: false },
    bullets: [], aliens: [], cols: 8, rows: 4, formX: 0, formY: 0, formDir: 1,
    powers: [], particles: [], floaters: [],
    fireIn: 200, alienFireIn: 1200, motherIn: 16000, mother: null,
    rapidUntil: 0, tripleUntil: 0, shield: false, invulnUntil: 0,
    lives: 3, wave: 1, score: 0, kills: 0,
    state: "ready", bannerUntil: 0, shake: 0, last: 0, t: 0,
  };
  makeWave(e, W);
  return e;
}

export default function StarDefender({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine(typeof window !== "undefined" ? window.innerWidth : 800));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("defender"));
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean; wave: number; kills: number } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { bumpPlays("defender"); }, []);

  const restart = useCallback(() => {
    engineRef.current = freshEngine(wrapRef.current?.getBoundingClientRect().width ?? window.innerWidth);
    setScore(0);
    setOverInfo(null);
    setPhase("ready");
  }, []);

  const start = useCallback(() => {
    const e = engineRef.current;
    if (phaseRef.current !== "ready") return;
    e.state = "playing";
    setPhase("playing");
    sfx.click();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 800;
    let H = 500;
    let U = 1;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = Math.max(280, Math.floor(rect.width));
      H = Math.max(320, Math.floor(rect.height));
      U = Math.max(0.75, Math.min(1.6, H / 600));
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

    const stars = Array.from({ length: 110 }, () => ({ x: Math.random(), y: Math.random(), s: Math.random() * 1.4 + 0.4, v: 12 + Math.random() * 30 }));
    const shipY = () => H - 54 * U;
    const shipW = () => 44 * U;
    // formation geometry
    const formGeom = (e: Engine) => {
      const formW = Math.min(W * 0.8, e.cols * 64 * U);
      const cellW = formW / e.cols;
      const cellH = 44 * U;
      const originX = (W - formW) / 2 + e.formX;
      const originY = 58 * U + e.formY;
      return { formW, cellW, cellH, originX, originY };
    };
    const alienPos = (e: Engine, a: Alien) => {
      const g = formGeom(e);
      return { x: g.originX + a.col * g.cellW + g.cellW / 2, y: g.originY + a.row * g.cellH + g.cellH / 2, r: Math.min(g.cellW, g.cellH) * 0.33 };
    };

    const burst = (e: Engine, x: number, y: number, color: string, n = 14) => {
      for (let i = 0; i < n; i++) {
        e.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 300 * U,
          vy: (Math.random() - 0.5) * 300 * U,
          life: 0, max: 0.3 + Math.random() * 0.3,
          color, size: (1.6 + Math.random() * 2.6) * U,
        });
      }
    };

    const gameOver = (e: Engine) => {
      e.state = "over";
      burst(e, e.shipX, shipY(), "#FFB020", 30);
      burst(e, e.shipX, shipY(), "#7DD3FC", 20);
      sfx.explosion();
      const res = submitScore("defender", e.score);
      setBest(res.best);
      setOverInfo({ ...res, wave: e.wave, kills: e.kills });
      setTimeout(() => {
        sfx.gameover();
        setPhase("over");
      }, 650);
    };

    const hitShip = (e: Engine, now: number) => {
      if (now < e.invulnUntil) return;
      if (e.shield) {
        e.shield = false;
        e.invulnUntil = now + 1200;
        burst(e, e.shipX, shipY() - 10 * U, "#7DD3FC", 16);
        e.floaters.push({ x: e.shipX, y: shipY() - 34 * U, text: "SHIELD DOWN!", life: 0, color: "#7DD3FC" });
        sfx.hit();
        return;
      }
      e.lives--;
      e.shake = 13;
      burst(e, e.shipX, shipY(), "#FF6B4A", 22);
      sfx.hit();
      if (e.lives <= 0) gameOver(e);
      else {
        e.invulnUntil = now + 1800;
        e.bullets = e.bullets.filter((b) => !b.hostile);
      }
    };

    const drawAlien = (x: number, y: number, r: number, row: number, hp: number, t: number) => {
      const color = ROW_COLORS[row % ROW_COLORS.length];
      const legPhase = Math.sin(t * 5 + row) > 0 ? 1 : -1;
      ctx.save();
      ctx.translate(x, y);
      // antennae
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.2 * U;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 0.4, -r * 0.7);
      ctx.lineTo(-r * 0.62, -r * 1.15);
      ctx.moveTo(r * 0.4, -r * 0.7);
      ctx.lineTo(r * 0.62, -r * 1.15);
      ctx.stroke();
      ctx.fillStyle = "#FFE27A";
      ctx.beginPath();
      ctx.arc(-r * 0.62, -r * 1.18, r * 0.13, 0, Math.PI * 2);
      ctx.arc(r * 0.62, -r * 1.18, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
      // body (dome)
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.15);
      grad.addColorStop(0, "#FFFFFF");
      grad.addColorStop(0.25, color);
      grad.addColorStop(1, color);
      ctx.fillStyle = hp > 1 ? color : grad;
      ctx.globalAlpha = hp > 1 ? 0.82 : 1;
      ctx.beginPath();
      ctx.arc(0, -r * 0.1, r * 0.82, Math.PI, 0);
      ctx.lineTo(r * 0.82, r * 0.42);
      ctx.lineTo(-r * 0.82, r * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // legs
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.6 * U;
      ctx.beginPath();
      for (const lx of [-0.52, -0.18, 0.18, 0.52]) {
        ctx.moveTo(lx * r, r * 0.42);
        ctx.lineTo(lx * r + legPhase * r * 0.14, r * 0.72);
      }
      ctx.stroke();
      // eyes
      ctx.fillStyle = "#14152B";
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.18, r * 0.14, 0, Math.PI * 2);
      ctx.arc(r * 0.3, -r * 0.18, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(-r * 0.26, -r * 0.22, r * 0.05, 0, Math.PI * 2);
      ctx.arc(r * 0.34, -r * 0.22, r * 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawShip = (e: Engine, now: number) => {
      const x = e.shipX;
      const y = shipY();
      const w = shipW();
      const invuln = now < e.invulnUntil;
      if (invuln && Math.floor(now / 110) % 2 === 0 && e.state === "playing") return; // blink
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.max(-0.22, Math.min(0.22, e.shipVX / 2400)));
      // engine flame
      const flame = (12 + Math.sin(now / 38) * 4) * U;
      ctx.fillStyle = "#FFB020";
      ctx.beginPath();
      ctx.moveTo(-w * 0.13, w * 0.34);
      ctx.lineTo(0, w * 0.34 + flame);
      ctx.lineTo(w * 0.13, w * 0.34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#FF7847";
      ctx.beginPath();
      ctx.moveTo(-w * 0.07, w * 0.34);
      ctx.lineTo(0, w * 0.34 + flame * 0.6);
      ctx.lineTo(w * 0.07, w * 0.34);
      ctx.closePath();
      ctx.fill();
      // wings
      ctx.fillStyle = "#FF4B6E";
      ctx.beginPath();
      ctx.moveTo(-w * 0.18, w * 0.05);
      ctx.lineTo(-w * 0.58, w * 0.42);
      ctx.lineTo(-w * 0.2, w * 0.42);
      ctx.closePath();
      ctx.moveTo(w * 0.18, w * 0.05);
      ctx.lineTo(w * 0.58, w * 0.42);
      ctx.lineTo(w * 0.2, w * 0.42);
      ctx.closePath();
      ctx.fill();
      // hull
      const grad = ctx.createLinearGradient(0, -w * 0.55, 0, w * 0.45);
      grad.addColorStop(0, "#E8F6FF");
      grad.addColorStop(0.5, "#7DD3FC");
      grad.addColorStop(1, "#2563EB");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.55);
      ctx.quadraticCurveTo(w * 0.3, -w * 0.1, w * 0.24, w * 0.4);
      ctx.lineTo(-w * 0.24, w * 0.4);
      ctx.quadraticCurveTo(-w * 0.3, -w * 0.1, 0, -w * 0.55);
      ctx.fill();
      // cockpit
      ctx.fillStyle = "#FFF3B0";
      ctx.beginPath();
      ctx.ellipse(0, -w * 0.12, w * 0.11, w * 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (e.shield) {
        ctx.strokeStyle = `rgba(125,211,252,${0.55 + Math.sin(now / 240) * 0.25})`;
        ctx.lineWidth = 2.6 * U;
        ctx.beginPath();
        ctx.arc(x, y, w * 0.78, 0, Math.PI * 2);
        ctx.stroke();
      }
    };

    const POWER_STYLE: Record<Power["type"], { label: string; color: string }> = {
      rapid: { label: "R", color: "#FFB020" },
      triple: { label: "T", color: "#C084FC" },
      shield: { label: "S", color: "#38BDF8" },
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      if (!e.last) e.last = now;
      const dt = Math.min(0.033, (now - e.last) / 1000);
      e.last = now;
      e.t += dt;

      const g = formGeom(e);
      const aliveCount = e.aliens.filter((a) => a.alive).length;

      // --- update ---
      if (e.state === "playing" || e.state === "waveclear") {
        // ship movement
        const ACC = 3400 * U;
        const MAXV = Math.max(420 * U, W * 0.75);
        if (e.keys.left) e.shipVX -= ACC * dt;
        if (e.keys.right) e.shipVX += ACC * dt;
        if (e.pointerX !== null) {
          const diff = e.pointerX - e.shipX;
          e.shipVX = Math.max(-MAXV * 1.5, Math.min(MAXV * 1.5, diff * 16));
        } else if (!e.keys.left && !e.keys.right) {
          e.shipVX *= Math.pow(0.0001, dt);
        }
        e.shipVX = Math.max(-MAXV * 1.5, Math.min(MAXV * 1.5, e.shipVX));
        e.shipX = Math.max(shipW() * 0.6, Math.min(W - shipW() * 0.6, e.shipX + e.shipVX * dt));
      }

      if (e.state === "waveclear" && now > e.bannerUntil) {
        e.state = "playing";
        makeWave(e, W);
      }

      if (e.state === "playing") {
        // formation sweep — faster as the swarm thins out
        const total = e.cols * e.rows;
        const speedMul = 1 + (1 - aliveCount / Math.max(1, total)) * 2.4 + (e.wave - 1) * 0.12;
        e.formX += e.formDir * 26 * U * speedMul * dt;
        const maxShift = (W - g.formW) / 2 - 8;
        if (e.formX > maxShift) { e.formX = maxShift; e.formDir = -1; e.formY += 15 * U; }
        if (e.formX < -maxShift) { e.formX = -maxShift; e.formDir = 1; e.formY += 15 * U; }

        // aliens reached the ship line?
        const lowest = Math.max(...e.aliens.filter((a) => a.alive).map((a) => a.row), -1);
        if (lowest >= 0 && g.originY + (lowest + 1) * g.cellH > shipY() - 26 * U) {
          gameOver(e);
        }

        // autofire
        e.fireIn -= dt * 1000;
        if (e.fireIn <= 0) {
          e.fireIn = now < e.rapidUntil ? 125 : 245;
          const by = shipY() - shipW() * 0.5;
          const bv = -640 * U;
          e.bullets.push({ x: e.shipX, y: by, vx: 0, vy: bv, hostile: false });
          if (now < e.tripleUntil) {
            e.bullets.push({ x: e.shipX - 10 * U, y: by + 8 * U, vx: -130 * U, vy: bv, hostile: false });
            e.bullets.push({ x: e.shipX + 10 * U, y: by + 8 * U, vx: 130 * U, vy: bv, hostile: false });
          }
          sfx.pop(0.55);
        }

        // alien return fire
        e.alienFireIn -= dt * 1000;
        if (e.alienFireIn <= 0 && aliveCount > 0) {
          e.alienFireIn = Math.max(340, 950 - e.wave * 70 - (1 - aliveCount / Math.max(1, total)) * 260) * (0.7 + Math.random() * 0.6);
          const shooters: Alien[] = [];
          for (let c = 0; c < e.cols; c++) {
            const colAliens = e.aliens.filter((a) => a.alive && a.col === c);
            if (colAliens.length) shooters.push(colAliens[colAliens.length - 1]);
          }
          const s2 = shooters[Math.floor(Math.random() * shooters.length)];
          const p = alienPos(e, s2);
          e.bullets.push({ x: p.x, y: p.y + p.r, vx: 0, vy: 300 * U, hostile: true });
        }

        // mothership
        e.motherIn -= dt * 1000;
        if (e.motherIn <= 0 && !e.mother) {
          e.mother = { x: -50 };
          e.motherIn = 22000 + Math.random() * 14000;
        }
        if (e.mother) {
          e.mother.x += 130 * U * dt;
          if (e.mother.x > W + 60) e.mother = null;
        }
      }

      // bullets
      if (e.state === "playing" || e.state === "waveclear") {
        for (const b of e.bullets) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }
        e.bullets = e.bullets.filter((b) => b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20);

        // player bullets vs aliens / mothership
        for (const b of e.bullets) {
          if (b.hostile || b.y < -999) continue;
          if (e.mother && Math.abs(b.x - e.mother.x) < 30 * U && Math.abs(b.y - 30 * U) < 14 * U) {
            b.y = -2000;
            e.score += 150;
            setScore(e.score);
            e.floaters.push({ x: e.mother.x, y: 52 * U, text: "+150", life: 0, color: "#FFE27A" });
            burst(e, e.mother.x, 30 * U, "#FF6BCB", 22);
            sfx.golden();
            e.mother = null;
            continue;
          }
          for (const a of e.aliens) {
            if (!a.alive) continue;
            const p = alienPos(e, a);
            if (Math.abs(b.x - p.x) < p.r + 3 * U && Math.abs(b.y - p.y) < p.r + 5 * U) {
              b.y = -2000;
              a.hp--;
              if (a.hp <= 0) {
                a.alive = false;
                e.kills++;
                const pts = ROW_POINTS[a.row % ROW_POINTS.length];
                e.score += pts;
                setScore(e.score);
                burst(e, p.x, p.y, ROW_COLORS[a.row % ROW_COLORS.length]);
                sfx.brick(1 + a.row * 0.08);
                if (Math.random() < 0.11) {
                  const types: Power["type"][] = ["rapid", "triple", "shield"];
                  e.powers.push({ x: p.x, y: p.y, type: types[Math.floor(Math.random() * 3)] });
                }
              } else {
                burst(e, p.x, p.y, "#fff", 5);
              }
              break;
            }
          }
        }
        e.bullets = e.bullets.filter((b) => b.y > -1000);

        // hostile bullets vs ship
        for (const b of e.bullets) {
          if (!b.hostile) continue;
          if (Math.abs(b.x - e.shipX) < shipW() * 0.34 && Math.abs(b.y - shipY()) < shipW() * 0.4) {
            b.y = H + 999;
            hitShip(e, now);
            if (e.state !== "playing") break;
          }
        }
        e.bullets = e.bullets.filter((b) => b.y < H + 500);

        // power-ups fall & catch
        for (const p of e.powers) {
          p.y += 165 * U * dt;
          if (Math.abs(p.x - e.shipX) < shipW() * 0.62 && Math.abs(p.y - shipY()) < shipW() * 0.55) {
            p.y = H + 999;
            if (p.type === "rapid") e.rapidUntil = now + 8000;
            if (p.type === "triple") e.tripleUntil = now + 10000;
            if (p.type === "shield") e.shield = true;
            e.floaters.push({
              x: e.shipX, y: shipY() - 36 * U,
              text: p.type === "rapid" ? "RAPID FIRE!" : p.type === "triple" ? "TRIPLE SHOT!" : "SHIELD!",
              life: 0, color: POWER_STYLE[p.type].color,
            });
            sfx.power();
          }
        }
        e.powers = e.powers.filter((p) => p.y < H + 40);

        // wave cleared?
        if (e.state === "playing" && aliveCount === 0) {
          e.wave++;
          e.score += 100;
          setScore(e.score);
          e.state = "waveclear";
          e.bannerUntil = now + 1500;
          e.bullets = e.bullets.filter((b) => !b.hostile);
          sfx.win();
        }
      }

      for (const p of e.particles) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      e.particles = e.particles.filter((p) => p.life < p.max);
      for (const f of e.floaters) { f.life += dt; f.y -= 30 * U * dt; }
      e.floaters = e.floaters.filter((f) => f.life < 0.95);
      if (e.shake > 0) e.shake *= 0.88;
      for (const s of stars) {
        s.y += (s.v * dt) / H;
        if (s.y > 1) s.y -= 1;
      }

      // --- draw ---
      ctx.save();
      if (e.shake > 0.4) ctx.translate((Math.random() - 0.5) * e.shake, (Math.random() - 0.5) * e.shake);
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0B0D26");
      bg.addColorStop(0.6, "#141538");
      bg.addColorStop(1, "#1B1040");
      ctx.fillStyle = bg;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // nebula glows
      const neb = ctx.createRadialGradient(W * 0.22, H * 0.24, 10, W * 0.22, H * 0.24, W * 0.42);
      neb.addColorStop(0, "rgba(165,96,232,0.20)");
      neb.addColorStop(1, "rgba(165,96,232,0)");
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, W, H);
      const neb2 = ctx.createRadialGradient(W * 0.82, H * 0.6, 10, W * 0.82, H * 0.6, W * 0.38);
      neb2.addColorStop(0, "rgba(28,176,246,0.16)");
      neb2.addColorStop(1, "rgba(28,176,246,0)");
      ctx.fillStyle = neb2;
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#fff";
      for (const s of stars) {
        ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(e.t * 1.3 + s.x * 20));
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // mothership
      if (e.mother) {
        const mx = e.mother.x;
        const my = 30 * U;
        ctx.fillStyle = "#FF6BCB";
        ctx.beginPath();
        ctx.ellipse(mx, my, 30 * U, 10 * U, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#B8F1FF";
        ctx.beginPath();
        ctx.ellipse(mx, my - 6 * U, 13 * U, 8 * U, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#FFE27A";
        for (const lx of [-18, 0, 18]) {
          ctx.beginPath();
          ctx.arc(mx + lx * U, my + 3 * U, 2.6 * U, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // aliens
      for (const a of e.aliens) {
        if (!a.alive) continue;
        const p = alienPos(e, a);
        drawAlien(p.x, p.y, p.r, a.row, a.hp, e.t);
      }

      // bullets
      for (const b of e.bullets) {
        if (b.hostile) {
          ctx.fillStyle = "#FF5A5A";
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, 3 * U, 7 * U, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,90,90,0.35)";
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, 6 * U, 11 * U, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#A5F3FC";
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, 2.6 * U, 8 * U, Math.atan2(b.vx, -b.vy) * 0.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(165,243,252,0.3)";
          ctx.beginPath();
          ctx.ellipse(b.x, b.y + 4 * U, 5 * U, 10 * U, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // power-ups
      for (const p of e.powers) {
        const st = POWER_STYLE[p.type];
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 12 * U, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#14152B";
        ctx.font = `900 ${Math.round(12 * U)}px system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(st.label, p.x, p.y + 1);
        ctx.textBaseline = "alphabetic";
      }

      if (e.state !== "over") drawShip(e, now);

      for (const p of e.particles) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      // HUD: lives + wave
      ctx.font = `${Math.round(17 * U)}px system-ui`;
      ctx.textAlign = "left";
      ctx.fillText("🚀".repeat(Math.max(0, e.lives)), 12, 30 * U + 4);
      ctx.font = `800 ${Math.round(15 * U)}px 'Fredoka', system-ui, sans-serif`;
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(`WAVE ${e.wave}`, W - 12, 30 * U + 4);
      // active power timers
      ctx.font = `800 ${Math.round(11.5 * U)}px 'Fredoka', system-ui, sans-serif`;
      let hudY = 52 * U;
      if (now < e.rapidUntil) { ctx.fillStyle = "#FFB020"; ctx.fillText(`RAPID ${Math.ceil((e.rapidUntil - now) / 1000)}s`, W - 12, hudY); hudY += 17 * U; }
      if (now < e.tripleUntil) { ctx.fillStyle = "#C084FC"; ctx.fillText(`TRIPLE ${Math.ceil((e.tripleUntil - now) / 1000)}s`, W - 12, hudY); }

      for (const f of e.floaters) {
        ctx.globalAlpha = 1 - f.life / 0.95;
        ctx.font = `800 ${Math.round(16 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(10,10,25,0.7)";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      if (e.state === "waveclear") {
        ctx.font = `800 ${Math.round(34 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(10,10,25,0.7)";
        ctx.strokeText(`WAVE ${e.wave} INCOMING!`, W / 2, H * 0.42);
        ctx.fillStyle = "#58CC02";
        ctx.fillText(`WAVE ${e.wave} INCOMING!`, W / 2, H * 0.42);
        ctx.font = `800 ${Math.round(16 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.fillStyle = "#FFE27A";
        ctx.fillText("+100 wave bonus", W / 2, H * 0.42 + 26 * U);
      }

      ctx.restore();
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
    const onPointerUp = () => { engineRef.current.pointerX = null; };
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
      title="Star Defender"
      emoji="👾"
      color="linear-gradient(135deg,#7B5CFF,#26283B)"
      score={score}
      best={best}
      onBack={onBack}
      onRestart={restart}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Drag or ← → to fly — cannon auto-fires! Catch <span style={{ color: "#FFB020" }}>R</span>apid,{" "}
          <span style={{ color: "#C084FC" }}>T</span>riple & <span style={{ color: "#38BDF8" }}>S</span>hield drops.
        </p>
      }
    >
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block touch-none" style={{ cursor: "crosshair" }} />
      </div>

      {phase === "ready" && <StartHint emoji="🚀" title="Star Defender" hint="Tap to launch — drag to steer, cannon auto-fires!" onStart={start} />}
      {phase === "over" && overInfo && (
        <GameOverCard
          score={score}
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Survived to wave {overInfo.wave} · {overInfo.kills} aliens zapped 👾
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
