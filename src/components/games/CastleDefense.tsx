"use client";

/**
 * Castle Defense — original from-scratch tower-defense.
 * Monsters march down the winding path toward your castle. Build Arrow,
 * Frost and Cannon towers, upgrade them, and survive endless escalating
 * waves. Tap a tower card, tap a grass tile to build. Pure strategy!
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { arcadeDpr, bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type TowerType = "arrow" | "frost" | "cannon";
type EnemyKind = "blob" | "runner" | "tank";

interface Tower { gx: number; gy: number; type: TowerType; level: number; cd: number; angle: number; invested: number }
interface Enemy { x: number; y: number; wp: number; hp: number; maxHp: number; speed: number; kind: EnemyKind; slowUntil: number; slowFactor: number; reward: number; wobble: number }
interface Shot { x: number; y: number; target: Enemy; type: TowerType; dmg: number; speed: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; life: number; color: string }

interface Engine {
  towers: Tower[];
  enemies: Enemy[];
  shots: Shot[];
  particles: Particle[];
  floaters: Floater[];
  gold: number;
  lives: number;
  wave: number;
  kills: number;
  score: number;
  spawning: number; // enemies left to spawn this wave
  spawnT: number;
  waveActive: boolean;
  speedMul: 1 | 2;
  selectedCell: { gx: number; gy: number } | null;
  buildType: TowerType;
  state: "ready" | "playing" | "over";
  bannerT: number;
  last: number;
  t: number;
}

const COLS = 12;
const ROWS = 8;
// path waypoints in grid coords (cell centers); starts/ends just off-grid
const PATH: [number, number][] = [
  [-1, 1], [9, 1], [9, 4], [2, 4], [2, 6], [12, 6],
];
const PATH_CELLS = new Set<string>();
for (let i = 0; i < PATH.length - 1; i++) {
  const [x1, y1] = PATH[i];
  const [x2, y2] = PATH[i + 1];
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let sIdx = 0; sIdx <= steps; sIdx++) {
    const gx = Math.round(x1 + ((x2 - x1) * sIdx) / steps);
    const gy = Math.round(y1 + ((y2 - y1) * sIdx) / steps);
    if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) PATH_CELLS.add(`${gx},${gy}`);
  }
}

const TOWERS: Record<TowerType, { name: string; emoji: string; cost: number; range: number; dmg: number; rateMs: number; color: string; desc: string }> = {
  arrow: { name: "Arrow", emoji: "🏹", cost: 40, range: 2.6, dmg: 9, rateMs: 380, color: "#B07A3C", desc: "Fast & cheap" },
  frost: { name: "Frost", emoji: "❄️", cost: 55, range: 2.3, dmg: 3, rateMs: 650, color: "#38BDF8", desc: "Slows monsters" },
  cannon: { name: "Cannon", emoji: "💣", cost: 85, range: 2.9, dmg: 26, rateMs: 1100, color: "#64748B", desc: "Splash damage" },
};

function freshEngine(): Engine {
  return {
    towers: [], enemies: [], shots: [], particles: [], floaters: [],
    gold: 130, lives: 20, wave: 0, kills: 0, score: 0,
    spawning: 0, spawnT: 0, waveActive: false,
    speedMul: 1, selectedCell: null, buildType: "arrow",
    state: "ready", bannerT: 0, last: 0, t: 0,
  };
}

interface Hud {
  gold: number; lives: number; wave: number; score: number;
  waveActive: boolean; speedMul: number;
  selected: { gx: number; gy: number; tower: Tower | null } | null;
  buildType: TowerType; state: Engine["state"];
}

export default function CastleDefense({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine());
  const [best, setBest] = useState(() => getBest("defense"));
  const [hud, setHud] = useState<Hud>({ gold: 130, lives: 20, wave: 0, score: 0, waveActive: false, speedMul: 1, selected: null, buildType: "arrow", state: "ready" });
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean; wave: number; kills: number } | null>(null);
  const hudRef = useRef("");

  useEffect(() => { bumpPlays("defense"); }, []);

  const restart = useCallback(() => {
    engineRef.current = freshEngine();
    setOverInfo(null);
    hudRef.current = "";
  }, []);

  const startWave = useCallback(() => {
    const e = engineRef.current;
    if (e.state === "over" || e.waveActive) return;
    e.state = "playing";
    e.wave++;
    e.waveActive = true;
    e.bannerT = 1500;
    e.spawning = 6 + e.wave * 2;
    e.spawnT = 300;
    sfx.score();
  }, []);

  const buildOrSelect = useCallback((gx: number, gy: number) => {
    const e = engineRef.current;
    if (e.state === "over") return;
    e.selectedCell = { gx, gy };
    sfx.click();
  }, []);

  const confirmBuild = useCallback(() => {
    const e = engineRef.current;
    const sel = e.selectedCell;
    if (!sel) return;
    const spec = TOWERS[e.buildType];
    if (PATH_CELLS.has(`${sel.gx},${sel.gy}`)) { sfx.badSwap(); return; }
    if (e.towers.some((t) => t.gx === sel.gx && t.gy === sel.gy)) { sfx.badSwap(); return; }
    if (e.gold < spec.cost) { sfx.badSwap(); return; }
    e.gold -= spec.cost;
    e.towers.push({ gx: sel.gx, gy: sel.gy, type: e.buildType, level: 1, cd: 0, angle: -Math.PI / 2, invested: spec.cost });
    if (e.state === "ready") e.state = "playing";
    sfx.merge(1.2);
  }, []);

  const upgradeSelected = useCallback(() => {
    const e = engineRef.current;
    const sel = e.selectedCell;
    if (!sel) return;
    const t = e.towers.find((x) => x.gx === sel.gx && x.gy === sel.gy);
    if (!t || t.level >= 3) return;
    const cost = Math.round(TOWERS[t.type].cost * 0.8 * t.level);
    if (e.gold < cost) { sfx.badSwap(); return; }
    e.gold -= cost;
    t.invested += cost;
    t.level++;
    sfx.power();
  }, []);

  const sellSelected = useCallback(() => {
    const e = engineRef.current;
    const sel = e.selectedCell;
    if (!sel) return;
    const idx = e.towers.findIndex((x) => x.gx === sel.gx && x.gy === sel.gy);
    if (idx < 0) return;
    e.gold += Math.round(e.towers[idx].invested * 0.7);
    e.towers.splice(idx, 1);
    sfx.coin();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 800;
    let H = 500;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = Math.max(280, Math.floor(rect.width));
      H = Math.max(260, Math.floor(rect.height));
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

    const grid = () => {
      const cell = Math.floor(Math.min(W / COLS, H / ROWS));
      const ox = Math.floor((W - cell * COLS) / 2);
      const oy = Math.floor((H - cell * ROWS) / 2);
      return { cell, ox, oy };
    };
    const cellCenter = (gx: number, gy: number) => {
      const { cell, ox, oy } = grid();
      return { x: ox + gx * cell + cell / 2, y: oy + gy * cell + cell / 2, cell };
    };
    const pathPx = PATH.map(([gx, gy]) => cellCenter(gx, gy));

    const onPointer = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const { cell, ox, oy } = grid();
      const lx = ((ev.clientX - rect.left) / rect.width) * W;
      const ly = ((ev.clientY - rect.top) / rect.height) * H;
      const gx = Math.floor((lx - ox) / cell);
      const gy = Math.floor((ly - oy) / cell);
      if (gx >= 0 && gx < COLS && gy >= 0 && gy < ROWS) {
        buildOrSelect(gx, gy);
        // one-tap build: empty grass + enough gold builds immediately
        const e = engineRef.current;
        const empty = !e.towers.some((t) => t.gx === gx && t.gy === gy) && !PATH_CELLS.has(`${gx},${gy}`);
        if (empty && e.gold >= TOWERS[e.buildType].cost) confirmBuild();
      }
    };
    canvas.addEventListener("pointerdown", onPointer);

    const burst = (e: Engine, x: number, y: number, color: string, n = 8, cell = 30) => {
      for (let i = 0; i < n; i++) {
        e.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * cell * 6,
          vy: (Math.random() - 0.5) * cell * 6,
          life: 0, max: 0.25 + Math.random() * 0.2,
          color, size: cell * (0.06 + Math.random() * 0.08),
        });
      }
    };

    const spawnEnemy = (e: Engine) => {
      const w = e.wave;
      const roll = Math.random();
      const kind: EnemyKind = w >= 3 && roll < 0.22 ? "runner" : w >= 5 && roll > 0.85 ? "tank" : "blob";
      const baseHp = 16 * Math.pow(1.21, w - 1) + w * 3;
      const hp = kind === "tank" ? baseHp * 4.2 : kind === "runner" ? baseHp * 0.55 : baseHp;
      const start = cellCenter(PATH[0][0], PATH[0][1]);
      e.enemies.push({
        x: start.x, y: start.y, wp: 1,
        hp, maxHp: hp,
        speed: kind === "runner" ? 1.55 : kind === "tank" ? 0.55 : 1,
        kind, slowUntil: 0, slowFactor: 1,
        reward: kind === "tank" ? 14 : kind === "runner" ? 6 : 7,
        wobble: Math.random() * Math.PI * 2,
      });
    };

    const gameOver = (e: Engine) => {
      e.state = "over";
      const res = submitScore("defense", e.score);
      setBest(res.best);
      setOverInfo({ ...res, wave: e.wave, kills: e.kills });
      sfx.gameover();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      if (!e.last) e.last = now;
      const rawDt = Math.min(0.05, (now - e.last) / 1000);
      e.last = now;
      const dt = rawDt * e.speedMul;
      e.t += dt;
      const { cell, ox, oy } = grid();
      const pts = PATH.map(([gx, gy]) => cellCenter(gx, gy));

      if (e.state === "playing") {
        if (e.bannerT > 0) e.bannerT -= rawDt * 1000;

        // spawning
        if (e.spawning > 0) {
          e.spawnT -= dt * 1000;
          if (e.spawnT <= 0) {
            spawnEnemy(e);
            e.spawning--;
            e.spawnT = Math.max(320, 850 - e.wave * 22);
          }
        } else if (e.waveActive && e.enemies.length === 0) {
          e.waveActive = false;
          const bonus = 18 + e.wave * 2;
          e.gold += bonus;
          e.score += 120;
          e.floaters.push({ x: W / 2, y: H * 0.3, text: `Wave clear! +${bonus}g`, life: 0, color: "#FFD94D" });
          sfx.win();
        }

        // enemies
        for (const en of e.enemies) {
          const target = pts[Math.min(en.wp, pts.length - 1)];
          const dx = target.x - en.x;
          const dy = target.y - en.y;
          const dist = Math.hypot(dx, dy);
          const slowed = now < en.slowUntil ? en.slowFactor : 1;
          const step = en.speed * cell * 1.15 * slowed * dt;
          if (dist <= step) {
            en.x = target.x;
            en.y = target.y;
            en.wp++;
            if (en.wp >= pts.length) {
              en.hp = -9999; // mark escaped
            }
          } else {
            en.x += (dx / dist) * step;
            en.y += (dy / dist) * step;
          }
          en.wobble += dt * 7;
        }
        // escapes cost lives
        for (const en of e.enemies) {
          if (en.hp === -9999) {
            e.lives -= en.kind === "tank" ? 3 : 1;
            burst(e, en.x, en.y, "#FF6B6B", 10, cell);
            sfx.hit();
            if (e.lives <= 0) { e.lives = 0; gameOver(e); }
          }
        }
        e.enemies = e.enemies.filter((en) => en.hp > -9999 && en.hp > 0);

        // towers fire
        for (const t of e.towers) {
          t.cd -= dt * 1000;
          const spec = TOWERS[t.type];
          const c = cellCenter(t.gx, t.gy);
          const range = spec.range * cell * (1 + (t.level - 1) * 0.08);
          // target the enemy furthest along the path within range
          let bestT: Enemy | null = null;
          let bestProg = -1;
          for (const en of e.enemies) {
            const d = Math.hypot(en.x - c.x, en.y - c.y);
            if (d > range) continue;
            const prog = en.wp * 1000 - Math.hypot(pts[Math.min(en.wp, pts.length - 1)].x - en.x, pts[Math.min(en.wp, pts.length - 1)].y - en.y);
            if (prog > bestProg) { bestProg = prog; bestT = en; }
          }
          if (bestT) {
            t.angle = Math.atan2(bestT.y - c.y, bestT.x - c.x);
            if (t.cd <= 0) {
              t.cd = spec.rateMs;
              const dmg = spec.dmg * (1 + (t.level - 1) * 0.65);
              e.shots.push({ x: c.x, y: c.y - cell * 0.18, target: bestT, type: t.type, dmg, speed: cell * 13 });
              if (t.type === "cannon") sfx.paddle();
            }
          }
        }

        // shots
        for (const s of e.shots) {
          if (s.target.hp <= 0) { s.speed = 0; continue; }
          const dx = s.target.x - s.x;
          const dy = s.target.y - s.y;
          const dist = Math.hypot(dx, dy);
          const step = s.speed * dt;
          if (dist <= step + cell * 0.16) {
            const en = s.target;
            if (s.type === "frost") {
              en.slowUntil = now + 1400;
              en.slowFactor = 0.5;
              en.hp -= s.dmg;
              burst(e, en.x, en.y, "#A5F3FC", 5, cell);
            } else if (s.type === "cannon") {
              burst(e, en.x, en.y, "#FFB020", 10, cell);
              for (const other of e.enemies) {
                if (Math.hypot(other.x - en.x, other.y - en.y) < cell * 0.95) other.hp -= s.dmg * (other === en ? 1 : 0.55);
              }
              sfx.brick(0.7);
            } else {
              en.hp -= s.dmg;
            }
            s.speed = 0;
          } else {
            s.x += (dx / dist) * step;
            s.y += (dy / dist) * step;
          }
        }
        e.shots = e.shots.filter((s) => s.speed > 0);

        // collect kills
        for (const en of e.enemies) {
          if (en.hp <= 0 && en.hp > -9999) {
            e.kills++;
            e.gold += en.reward;
            e.score += en.kind === "tank" ? 25 : 10;
            burst(e, en.x, en.y, en.kind === "tank" ? "#C084FC" : "#4ADE80", 9, cell);
            e.floaters.push({ x: en.x, y: en.y - cell * 0.4, text: `+${en.reward}g`, life: 0, color: "#FFD94D" });
            sfx.coin();
          }
        }
        e.enemies = e.enemies.filter((en) => en.hp > 0);
      }

      for (const p of e.particles) {
        p.life += rawDt;
        p.x += p.vx * rawDt;
        p.y += p.vy * rawDt;
      }
      e.particles = e.particles.filter((p) => p.life < p.max);
      for (const f of e.floaters) { f.life += rawDt; f.y -= 26 * rawDt; }
      e.floaters = e.floaters.filter((f) => f.life < 0.9);

      /* ---------- draw ---------- */
      // meadow background
      const grassGrad = ctx.createLinearGradient(0, 0, 0, H);
      grassGrad.addColorStop(0, "#1E4A24");
      grassGrad.addColorStop(1, "#14331B");
      ctx.fillStyle = grassGrad;
      ctx.fillRect(0, 0, W, H);

      // checkerboard grass tiles
      for (let gy = 0; gy < ROWS; gy++) {
        for (let gx = 0; gx < COLS; gx++) {
          const isPath = PATH_CELLS.has(`${gx},${gy}`);
          ctx.fillStyle = isPath ? "#9A7B4F" : (gx + gy) % 2 === 0 ? "#27632F" : "#225A2A";
          ctx.fillRect(ox + gx * cell, oy + gy * cell, cell, cell);
          if (isPath) {
            ctx.fillStyle = "rgba(0,0,0,0.1)";
            ctx.fillRect(ox + gx * cell, oy + gy * cell + cell - 3, cell, 3);
          }
        }
      }
      // path center dashes
      ctx.strokeStyle = "rgba(255,240,200,0.4)";
      ctx.lineWidth = Math.max(2, cell * 0.07);
      ctx.setLineDash([cell * 0.3, cell * 0.3]);
      ctx.beginPath();
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);

      // castle at path end
      const castle = cellCenter(11, 6);
      ctx.font = `${Math.round(cell * 0.95)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("🏰", castle.x, castle.y);
      // spawn gate
      const gate = cellCenter(0, 1);
      ctx.fillText("🌀", gate.x, gate.y);
      ctx.textBaseline = "alphabetic";

      // selected cell + range preview
      if (e.selectedCell) {
        const { gx, gy } = e.selectedCell;
        const sel = cellCenter(gx, gy);
        const existing = e.towers.find((t) => t.gx === gx && t.gy === gy);
        const spec = existing ? TOWERS[existing.type] : TOWERS[e.buildType];
        const range = spec.range * cell * (existing ? 1 + (existing.level - 1) * 0.08 : 1);
        ctx.fillStyle = "rgba(255,255,255,0.10)";
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, range, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.45)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.strokeStyle = "#FFE27A";
        ctx.lineWidth = 2.5;
        ctx.strokeRect(ox + gx * cell + 1.5, oy + gy * cell + 1.5, cell - 3, cell - 3);
      }

      // towers
      for (const t of e.towers) {
        const c = cellCenter(t.gx, t.gy);
        const spec = TOWERS[t.type];
        const s = cell;
        // base
        ctx.fillStyle = "rgba(0,0,0,0.25)";
        ctx.beginPath();
        ctx.ellipse(c.x, c.y + s * 0.3, s * 0.36, s * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = spec.color;
        ctx.beginPath();
        ctx.roundRect(c.x - s * 0.3, c.y - s * 0.12, s * 0.6, s * 0.44, s * 0.1);
        ctx.fill();
        // roof / top by type
        if (t.type === "arrow") {
          ctx.fillStyle = "#7C4A21";
          ctx.beginPath();
          ctx.moveTo(c.x - s * 0.36, c.y - s * 0.12);
          ctx.lineTo(c.x, c.y - s * 0.44);
          ctx.lineTo(c.x + s * 0.36, c.y - s * 0.12);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = "#4A2E18";
          ctx.lineWidth = Math.max(2, s * 0.06);
          ctx.beginPath();
          ctx.moveTo(c.x, c.y - s * 0.2);
          ctx.lineTo(c.x + Math.cos(t.angle) * s * 0.34, c.y - s * 0.2 + Math.sin(t.angle) * s * 0.34);
          ctx.stroke();
        } else if (t.type === "frost") {
          ctx.fillStyle = "#BAE6FD";
          ctx.beginPath();
          ctx.moveTo(c.x, c.y - s * 0.5);
          ctx.lineTo(c.x + s * 0.2, c.y - s * 0.16);
          ctx.lineTo(c.x - s * 0.2, c.y - s * 0.16);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath();
          ctx.arc(c.x, c.y - s * 0.3, s * 0.07, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = "#475569";
          ctx.beginPath();
          ctx.arc(c.x, c.y - s * 0.16, s * 0.22, Math.PI, 0);
          ctx.fill();
          ctx.strokeStyle = "#1E293B";
          ctx.lineWidth = s * 0.16;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(c.x, c.y - s * 0.2);
          ctx.lineTo(c.x + Math.cos(t.angle) * s * 0.36, c.y - s * 0.2 + Math.sin(t.angle) * s * 0.36);
          ctx.stroke();
        }
        // level pips
        ctx.fillStyle = "#FFD94D";
        for (let i = 0; i < t.level; i++) {
          ctx.beginPath();
          ctx.arc(c.x - (t.level - 1) * s * 0.09 + i * s * 0.18, c.y + s * 0.42, s * 0.045, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // enemies (cute monsters drawn from shapes)
      for (const en of e.enemies) {
        const r = cell * (en.kind === "tank" ? 0.38 : en.kind === "runner" ? 0.26 : 0.3);
        const squash = 1 + Math.sin(en.wobble) * 0.08;
        const color = en.kind === "tank" ? "#A560E8" : en.kind === "runner" ? "#FF9600" : "#4ADE80";
        const slowed = now < en.slowUntil;
        ctx.save();
        ctx.translate(en.x, en.y);
        ctx.scale(1 / squash, squash);
        ctx.fillStyle = slowed ? "#7DD3FC" : color;
        ctx.beginPath();
        ctx.arc(0, 0, r, Math.PI, 0);
        ctx.lineTo(r, r * 0.7);
        ctx.lineTo(-r, r * 0.7);
        ctx.closePath();
        ctx.fill();
        // horns for tanks
        if (en.kind === "tank") {
          ctx.fillStyle = "#7B3FD4";
          for (const sgn of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(sgn * r * 0.6, -r * 0.65);
            ctx.lineTo(sgn * r * 0.95, -r * 1.15);
            ctx.lineTo(sgn * r * 0.3, -r * 0.85);
            ctx.closePath();
            ctx.fill();
          }
        }
        // eyes
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(-r * 0.32, -r * 0.15, r * 0.2, 0, Math.PI * 2);
        ctx.arc(r * 0.32, -r * 0.15, r * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#1F2430";
        ctx.beginPath();
        ctx.arc(-r * 0.3, -r * 0.13, r * 0.1, 0, Math.PI * 2);
        ctx.arc(r * 0.34, -r * 0.13, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
        // toothy mouth
        ctx.fillRect(-r * 0.22, r * 0.28, r * 0.44, r * 0.12);
        ctx.restore();

        // hp bar
        if (en.hp < en.maxHp) {
          const bw = r * 1.9;
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(en.x - bw / 2, en.y - r * 1.55, bw, cell * 0.11);
          ctx.fillStyle = en.hp / en.maxHp > 0.35 ? "#4ADE80" : "#FF6B6B";
          ctx.fillRect(en.x - bw / 2, en.y - r * 1.55, bw * Math.max(0, en.hp / en.maxHp), cell * 0.11);
        }
      }

      // shots
      for (const s of e.shots) {
        ctx.fillStyle = s.type === "frost" ? "#A5F3FC" : s.type === "cannon" ? "#1E293B" : "#FFE9B8";
        ctx.beginPath();
        ctx.arc(s.x, s.y, cell * (s.type === "cannon" ? 0.11 : 0.07), 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of e.particles) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      for (const f of e.floaters) {
        ctx.globalAlpha = 1 - f.life / 0.9;
        ctx.font = `800 ${Math.round(Math.max(12, cell * 0.36))}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(10,25,10,0.7)";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // wave banner
      if (e.bannerT > 0) {
        ctx.font = `800 ${Math.round(Math.min(34, cell * 0.9))}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "rgba(10,25,10,0.65)";
        ctx.strokeText(`🌊 WAVE ${e.wave}`, W / 2, H * 0.3);
        ctx.fillStyle = "#FFE27A";
        ctx.fillText(`🌊 WAVE ${e.wave}`, W / 2, H * 0.3);
      }

      // sync HUD state (only when something changed)
      const selTower = e.selectedCell ? e.towers.find((t) => t.gx === e.selectedCell!.gx && t.gy === e.selectedCell!.gy) ?? null : null;
      const snap = `${e.gold}|${e.lives}|${e.wave}|${e.score}|${e.waveActive}|${e.speedMul}|${e.selectedCell?.gx},${e.selectedCell?.gy},${selTower?.level ?? 0},${selTower?.type ?? ""}|${e.buildType}|${e.state}|${e.towers.length}`;
      if (snap !== hudRef.current) {
        hudRef.current = snap;
        setHud({
          gold: e.gold, lives: e.lives, wave: e.wave, score: e.score,
          waveActive: e.waveActive, speedMul: e.speedMul,
          selected: e.selectedCell ? { gx: e.selectedCell.gx, gy: e.selectedCell.gy, tower: selTower ? { ...selTower } : null } : null,
          buildType: e.buildType, state: e.state,
        });
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointer);
    };
  }, [buildOrSelect, confirmBuild]);

  const sel = hud.selected;
  const selTower = sel?.tower ?? null;
  const upgradeCost = selTower ? Math.round(TOWERS[selTower.type].cost * 0.8 * selTower.level) : 0;
  const sellValue = selTower ? Math.round(selTower.invested * 0.7) : 0;

  return (
    <ArcadeShell
      title="Castle Defense"
      emoji="🏰"
      color="linear-gradient(135deg,#1899D6,#0B5FFF)"
      score={hud.score}
      best={best}
      onBack={onBack}
      onRestart={restart}
      footer={
        <div className="w-full max-w-3xl mx-auto flex flex-col gap-2">
          {/* status row */}
          <div className="flex items-center justify-center gap-2 flex-wrap">
            <span className="chip px-2.5 py-1.5 text-xs font-black" style={{ background: "rgba(255,200,0,0.18)", color: "#FFD94D", border: "1.5px solid rgba(255,200,0,0.4)" }}>🪙 {hud.gold}</span>
            <span className="chip px-2.5 py-1.5 text-xs font-black" style={{ background: "rgba(255,75,110,0.16)", color: "#FFB3C2", border: "1.5px solid rgba(255,75,110,0.4)" }}>❤️ {hud.lives}</span>
            <span className="chip px-2.5 py-1.5 text-xs font-black" style={{ background: "rgba(255,255,255,0.09)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.2)" }}>🌊 Wave {hud.wave}</span>
            <button
              onClick={startWave}
              disabled={hud.waveActive || hud.state === "over"}
              className="btn-game btn-green px-4 py-2 text-sm disabled:opacity-40"
            >
              {hud.waveActive ? "Fighting…" : `▶ Send wave ${hud.wave + 1}`}
            </button>
            <button
              onClick={() => { engineRef.current.speedMul = engineRef.current.speedMul === 1 ? 2 : 1; sfx.click(); }}
              className="btn-game px-3 py-2 text-xs text-white"
              style={{ background: "rgba(255,255,255,0.09)", border: "2px solid rgba(255,255,255,0.2)" }}
            >
              {hud.speedMul}× speed
            </button>
          </div>

          {/* build / selected row */}
          {selTower ? (
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="text-sm font-black text-white">
                {TOWERS[selTower.type].emoji} {TOWERS[selTower.type].name} · Lv {selTower.level}
              </span>
              <button onClick={upgradeSelected} disabled={selTower.level >= 3 || hud.gold < upgradeCost} className="btn-game px-3.5 py-2 text-xs text-white disabled:opacity-40" style={{ background: "linear-gradient(120deg,#A560E8,#7B5CFF)", border: "2px solid rgba(255,255,255,0.35)" }}>
                {selTower.level >= 3 ? "MAX level" : `⬆ Upgrade · ${upgradeCost}g`}
              </button>
              <button onClick={sellSelected} className="btn-game px-3.5 py-2 text-xs text-white" style={{ background: "rgba(255,75,75,0.25)", border: "2px solid rgba(255,75,75,0.5)" }}>
                Sell · {sellValue}g
              </button>
            </div>
          ) : (
            <div className="flex items-stretch justify-center gap-2">
              {(Object.keys(TOWERS) as TowerType[]).map((t) => {
                const spec = TOWERS[t];
                const active = hud.buildType === t;
                const afford = hud.gold >= spec.cost;
                return (
                  <button
                    key={t}
                    onClick={() => { engineRef.current.buildType = t; sfx.click(); }}
                    className="btn-game px-3 py-2 flex flex-col items-center gap-0 min-w-[86px]"
                    style={{
                      background: active ? "linear-gradient(140deg,#FFC800,#FF7A18)" : "rgba(255,255,255,0.08)",
                      color: active ? "#3A2A00" : "#fff",
                      border: `2px solid ${active ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)"}`,
                      opacity: afford ? 1 : 0.5,
                    }}
                  >
                    <span className="text-lg leading-none">{spec.emoji}</span>
                    <span className="text-[11px] font-black">{spec.name} · {spec.cost}g</span>
                    <span className="text-[9px] font-bold opacity-75">{spec.desc}</span>
                  </button>
                );
              })}
            </div>
          )}
          <p className="text-center text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.5)" }}>
            {selTower ? "Upgrade for more damage, or sell to reposition." : "Tap a grass tile to build the selected tower · tap a tower to upgrade it"}
          </p>
        </div>
      }
    >
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block touch-none" style={{ cursor: "pointer" }} />
      </div>

      {overInfo && (
        <GameOverCard
          title="🏰 The castle has fallen!"
          score={hud.score}
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Survived {overInfo.wave} waves · {overInfo.kills} monsters stopped 🌊
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
