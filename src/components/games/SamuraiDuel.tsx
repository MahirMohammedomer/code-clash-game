"use client";

/**
 * Samurai Duel — original from-scratch 2D sword-fighting game.
 * Two code-drawn samurai clash on a bamboo bridge: move, jump, slash and
 * block. Battle the CPU across three skill levels, or duel a friend on the
 * same screen (each side gets its own touch buttons). Best of 3 rounds.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Users } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { arcadeDpr, bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type Mode = "ai" | "2p";
type Diff = "easy" | "medium" | "hard";
type FState = "idle" | "attack" | "block" | "hit" | "ko";

interface Fighter {
  x: number; // px, left edge of the play field reference
  jumpY: number; // px above ground
  vy: number;
  vx: number;
  facing: 1 | -1;
  hp: number;
  state: FState;
  stateT: number; // ms left in state
  attackCd: number;
  hasHit: boolean;
  walkPhase: number;
  color: string;
  dark: string;
}

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Floater { x: number; y: number; text: string; life: number; color: string }

interface Engine {
  p1: Fighter;
  p2: Fighter;
  particles: Particle[];
  floaters: Floater[];
  petals: { x: number; y: number; vx: number; rot: number }[];
  keys: Record<string, boolean>;
  touch: { p1: Record<string, boolean>; p2: Record<string, boolean> };
  roundWins: [number, number];
  round: number;
  phase: "intro" | "fight" | "roundEnd" | "matchEnd";
  phaseT: number;
  roundMs: number;
  winner: 0 | 1 | -1;
  aiT: number;
  aiPlan: "approach" | "retreat" | "wait" | "jump";
  last: number;
  t: number;
}

const ROUND_TIME = 60_000;
const ATTACK_DMG = 9;
const BLOCK_DMG = 1;

function makeFighter(x: number, facing: 1 | -1, color: string, dark: string): Fighter {
  return {
    x, jumpY: 0, vy: 0, vx: 0, facing, hp: 100,
    state: "idle", stateT: 0, attackCd: 0, hasHit: false, walkPhase: 0,
    color, dark,
  };
}

function freshEngine(): Engine {
  return {
    p1: makeFighter(0.22, 1, "#1CB0F6", "#0B5FFF"),
    p2: makeFighter(0.78, -1, "#FF4B6E", "#C22424"),
    particles: [], floaters: [],
    petals: Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random() * 0.6, vx: 12 + Math.random() * 22, rot: Math.random() * Math.PI })),
    keys: {},
    touch: { p1: {}, p2: {} },
    roundWins: [0, 0], round: 1,
    phase: "intro", phaseT: 1400, roundMs: ROUND_TIME,
    winner: -1, aiT: 0, aiPlan: "approach",
    last: 0, t: 0,
  };
}

/* ---------- touch controls (module-level so they never remount) ---------- */

const PAD_BTN: React.CSSProperties = {
  background: "rgba(20,21,43,0.55)",
  border: "2px solid rgba(255,255,255,0.4)",
  boxShadow: "0 3px 0 rgba(0,0,0,0.45)",
  backdropFilter: "blur(2px)",
  color: "#fff",
  touchAction: "none",
  userSelect: "none",
  WebkitUserSelect: "none",
};

function DuelControls({
  who,
  tint,
  onTouch,
}: {
  who: "p1" | "p2";
  tint: string;
  onTouch: (who: "p1" | "p2", action: string, down: boolean) => void;
}) {
  const btn = (action: string, label: string, aria: string, round = false, bg?: string) => (
    <button
      type="button"
      className={`w-12 h-12 ${round ? "rounded-full" : "rounded-2xl"} flex items-center justify-center text-lg font-black active:scale-95`}
      style={bg ? { ...PAD_BTN, background: bg } : PAD_BTN}
      onPointerDown={(e) => { e.preventDefault(); onTouch(who, action, true); }}
      onPointerUp={() => onTouch(who, action, false)}
      onPointerLeave={() => onTouch(who, action, false)}
      onPointerCancel={() => onTouch(who, action, false)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={aria}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1.5">
      {btn("left", "◀", "Move left")}
      {btn("right", "▶", "Move right")}
      {btn("jump", "⬆", "Jump")}
      {btn("attack", "⚔️", "Attack", true, tint)}
      {btn("block", "🛡️", "Block", true, "rgba(255,200,0,0.5)")}
    </div>
  );
}

export default function SamuraiDuel({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine());
  const [mode, setMode] = useState<Mode>("ai");
  const [diff, setDiff] = useState<Diff>("medium");
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => getBest("duel"));
  const [showCard, setShowCard] = useState(false);
  const [cardInfo, setCardInfo] = useState<{ winner: number; isNewBest: boolean; wins: [number, number] } | null>(null);
  const [isTouch, setIsTouch] = useState(false);

  const modeRef = useRef(mode);
  const diffRef = useRef(diff);
  const streakRef = useRef(0);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { diffRef.current = diff; }, [diff]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time probe
    setIsTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
    bumpPlays("duel");
  }, []);

  const restart = useCallback(() => {
    engineRef.current = freshEngine();
    setShowCard(false);
    setCardInfo(null);
  }, []);

  const setTouch = (who: "p1" | "p2", action: string, down: boolean) => {
    engineRef.current.touch[who][action] = down;
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 800;
    let H = 450;
    let U = 1;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = Math.max(300, Math.floor(rect.width));
      H = Math.max(280, Math.floor(rect.height));
      U = Math.max(0.68, Math.min(1.45, Math.min(W / 900, H / 520) * 1.55));
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

    const groundY = () => H * 0.82;
    const fH = () => 108 * U; // fighter height
    const fW = () => 34 * U; // body width (hitbox half = fW)

    const keys = engineRef.current.keys;
    const kd = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const inputFor = (e: Engine, who: 1 | 2) => {
      const t = who === 1 ? e.touch.p1 : e.touch.p2;
      if (who === 1) {
        return {
          left: !!keys["a"] || !!t.left,
          right: !!keys["d"] || !!t.right,
          jump: !!keys["w"] || !!t.jump,
          attack: !!keys["f"] || !!t.attack,
          block: !!keys["g"] || !!keys["s"] || !!t.block,
        };
      }
      return {
        left: !!keys["arrowleft"] || !!t.left,
        right: !!keys["arrowright"] || !!t.right,
        jump: !!keys["arrowup"] || !!t.jump,
        attack: !!keys["k"] || !!t.attack,
        block: !!keys["l"] || !!keys["arrowdown"] || !!t.block,
      };
    };

    const burst = (e: Engine, x: number, y: number, color: string, n = 10) => {
      for (let i = 0; i < n; i++) {
        e.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 320 * U,
          vy: (Math.random() - 0.6) * 280 * U,
          life: 0, max: 0.3 + Math.random() * 0.25,
          color, size: (2 + Math.random() * 3) * U,
        });
      }
    };

    const resetRound = (e: Engine) => {
      e.p1 = makeFighter(W * 0.22, 1, "#1CB0F6", "#0B5FFF");
      e.p2 = makeFighter(W * 0.78, -1, "#FF4B6E", "#C22424");
      e.roundMs = ROUND_TIME;
      e.phase = "intro";
      e.phaseT = 1300;
      e.winner = -1;
    };

    const endRound = (e: Engine, winner: 0 | 1) => {
      e.roundWins[winner]++;
      const loser = winner === 0 ? e.p2 : e.p1;
      if (loser.hp > 0) { loser.state = "hit"; loser.stateT = 600; }
      e.phase = "roundEnd";
      e.phaseT = 1700;
      e.winner = winner;
      sfx.score();
    };

    const endMatch = (e: Engine) => {
      e.phase = "matchEnd";
      const winner = e.roundWins[0] > e.roundWins[1] ? 0 : 1;
      let isNewBest = false;
      if (modeRef.current === "ai") {
        if (winner === 0) {
          streakRef.current++;
          setStreak(streakRef.current);
          const res = submitScore("duel", streakRef.current);
          setBest(res.best);
          isNewBest = res.isNewBest && streakRef.current > 1;
          sfx.win();
        } else {
          streakRef.current = 0;
          setStreak(0);
          sfx.gameover();
        }
      } else {
        sfx.win();
      }
      setCardInfo({ winner, isNewBest, wins: [...e.roundWins] as [number, number] });
      setTimeout(() => setShowCard(true), 900);
    };

    const tryAttack = (e: Engine, atk: Fighter, def: Fighter) => {
      if (atk.state === "ko" || atk.state === "hit" || atk.attackCd > 0) return;
      atk.state = "attack";
      atk.stateT = 300;
      atk.attackCd = 520;
      atk.hasHit = false;
      sfx.flap();
      void def;
    };

    const stepFighter = (e: Engine, f: Fighter, foe: Fighter, input: ReturnType<typeof inputFor>, dt: number) => {
      const speed = 295 * U;
      f.attackCd = Math.max(0, f.attackCd - dt * 1000);
      if (f.stateT > 0) {
        f.stateT -= dt * 1000;
        if (f.stateT <= 0 && f.state !== "ko") f.state = "idle";
      }
      const busy = f.state === "attack" || f.state === "hit" || f.state === "ko";

      // facing follows the opponent unless mid-action
      if (!busy) f.facing = foe.x >= f.x ? 1 : -1;

      // blocking (held)
      if (!busy && input.block && f.jumpY === 0) f.state = "block";
      else if (f.state === "block" && !input.block) f.state = "idle";

      // movement
      f.vx = 0;
      if (!busy && f.state !== "block") {
        if (input.left) f.vx = -speed;
        if (input.right) f.vx = speed;
        if (input.jump && f.jumpY === 0) {
          f.vy = 760 * U;
          sfx.pop(0.7);
        }
        if (input.attack) tryAttack(e, f, foe);
      }
      f.x += f.vx * dt;
      if (f.vx !== 0) f.walkPhase += dt * 11;

      // gravity / jump
      if (f.jumpY > 0 || f.vy > 0) {
        f.jumpY += f.vy * dt;
        f.vy -= 2050 * U * dt;
        if (f.jumpY <= 0) { f.jumpY = 0; f.vy = 0; }
      }

      // arena bounds + bodies can't cross through each other on the ground
      const margin = 34 * U;
      f.x = Math.max(margin, Math.min(W - margin, f.x));

      // attack hit detection (active mid-swing)
      if (f.state === "attack" && !f.hasHit && f.stateT < 210 && f.stateT > 60) {
        const reach = 98 * U;
        const dx = (foe.x - f.x) * f.facing;
        const dy = Math.abs(foe.jumpY - f.jumpY);
        if (dx > -6 * U && dx < reach && dy < 74 * U && foe.state !== "ko") {
          f.hasHit = true;
          const blocked = foe.state === "block";
          const dmg = blocked ? BLOCK_DMG : ATTACK_DMG;
          foe.hp = Math.max(0, foe.hp - dmg);
          const hitX = foe.x - f.facing * fW() * 0.6;
          const hitY = groundY() - foe.jumpY - fH() * 0.58;
          if (blocked) {
            burst(e, hitX, hitY, "#FFE27A", 6);
            foe.x += f.facing * 10 * U;
            e.floaters.push({ x: hitX, y: hitY - 18 * U, text: "BLOCKED", life: 0, color: "#FFE27A" });
            sfx.paddle();
          } else {
            burst(e, hitX, hitY, "#FFB3C2", 12);
            foe.state = foe.hp <= 0 ? "ko" : "hit";
            foe.stateT = foe.hp <= 0 ? 99999 : 320;
            foe.x += f.facing * 16 * U;
            e.floaters.push({ x: hitX, y: hitY - 18 * U, text: `-${dmg}`, life: 0, color: "#FF8FA3" });
            sfx.hit();
          }
        }
      }
    };

    /** CPU brain — returns an input set for player 2. */
    const aiInput = (e: Engine, dt: number) => {
      const cpu = e.p2;
      const foe = e.p1;
      const out = { left: false, right: false, jump: false, attack: false, block: false };
      const d = diffRef.current;
      const reactMs = d === "easy" ? 420 : d === "medium" ? 260 : 150;
      const aggression = d === "easy" ? 0.45 : d === "medium" ? 0.68 : 0.88;
      const blockChance = d === "easy" ? 0.15 : d === "medium" ? 0.38 : 0.62;

      e.aiT -= dt * 1000;
      if (e.aiT <= 0) {
        e.aiT = reactMs * (0.7 + Math.random() * 0.6);
        const r = Math.random();
        e.aiPlan = r < aggression ? "approach" : r < aggression + 0.18 ? "retreat" : r < aggression + 0.3 ? "jump" : "wait";
      }

      const dist = Math.abs(foe.x - cpu.x);
      const dirToFoe = foe.x >= cpu.x ? 1 : -1;
      const inRange = dist < 92 * U;

      // block incoming attacks sometimes
      if (foe.state === "attack" && dist < 130 * U && Math.random() < blockChance) {
        out.block = true;
        return out;
      }
      if (inRange) {
        if (Math.random() < aggression) out.attack = true;
        else if (Math.random() < 0.3) out.block = true;
        else if (dirToFoe === 1) out.left = true; else out.right = true;
        return out;
      }
      if (e.aiPlan === "approach") {
        if (dirToFoe === 1) out.right = true; else out.left = true;
        if (dist < 170 * U && Math.random() < 0.02) out.jump = true;
      } else if (e.aiPlan === "retreat") {
        if (dirToFoe === 1) out.left = true; else out.right = true;
      } else if (e.aiPlan === "jump") {
        out.jump = true;
        if (dirToFoe === 1) out.right = true; else out.left = true;
        if (dist < 120 * U) out.attack = true;
        e.aiPlan = "approach";
      }
      return out;
    };

    const drawFighter = (e: Engine, f: Fighter) => {
      const h = fH();
      const feetY = groundY() - f.jumpY;
      const cx = f.x;
      const ko = f.state === "ko";
      ctx.save();
      ctx.translate(cx, feetY);
      if (ko) ctx.rotate(f.facing * -1.35);
      ctx.scale(f.facing, 1);

      const legSwing = f.state === "idle" && f.vx !== 0 ? Math.sin(f.walkPhase) * 9 * U : 0;
      const bob = f.state === "idle" ? Math.sin(e.t * 3.2 + f.walkPhase * 0.2) * 1.6 * U : 0;

      // legs (hakama trousers)
      ctx.strokeStyle = f.dark;
      ctx.lineWidth = 8.5 * U;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.42 + bob);
      ctx.lineTo(-8 * U + legSwing, -2 * U);
      ctx.moveTo(0, -h * 0.42 + bob);
      ctx.lineTo(9 * U - legSwing, -2 * U);
      ctx.stroke();

      // kimono body (trapezoid robe)
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(-13 * U, -h * 0.78 + bob);
      ctx.lineTo(13 * U, -h * 0.78 + bob);
      ctx.lineTo(17 * U, -h * 0.34 + bob);
      ctx.lineTo(-17 * U, -h * 0.34 + bob);
      ctx.closePath();
      ctx.fill();
      // robe cross-fold + belt
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 2.4 * U;
      ctx.beginPath();
      ctx.moveTo(-8 * U, -h * 0.76 + bob);
      ctx.lineTo(6 * U, -h * 0.58 + bob);
      ctx.stroke();
      ctx.fillStyle = "#FFD94D";
      ctx.fillRect(-14 * U, -h * 0.52 + bob, 28 * U, 5 * U);

      // head
      const hy = -h * 0.9 + bob;
      ctx.fillStyle = "#FFDFC4";
      ctx.beginPath();
      ctx.arc(2 * U, hy, 10.5 * U, 0, Math.PI * 2);
      ctx.fill();
      // hair + topknot
      ctx.fillStyle = "#26283B";
      ctx.beginPath();
      ctx.arc(1 * U, hy - 3.5 * U, 9.5 * U, Math.PI * 1.02, Math.PI * 2.05);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-1 * U, hy - 12 * U, 3.6 * U, 0, Math.PI * 2);
      ctx.fill();
      // headband
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 3.4 * U;
      ctx.beginPath();
      ctx.moveTo(-8 * U, hy - 4.5 * U);
      ctx.lineTo(11 * U, hy - 4.5 * U);
      ctx.stroke();
      // eye (determined / dizzy)
      ctx.fillStyle = "#26283B";
      if (ko || f.state === "hit") {
        ctx.font = `900 ${Math.round(9 * U)}px system-ui`;
        ctx.textAlign = "center";
        ctx.fillText("×", 7 * U, hy + 3 * U);
      } else {
        ctx.beginPath();
        ctx.arc(7.5 * U, hy + 0.5 * U, 1.9 * U, 0, Math.PI * 2);
        ctx.fill();
      }

      // arms + katana by state
      const shoulderY = -h * 0.7 + bob;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 6.5 * U;
      let handX = 12 * U;
      let handY = -h * 0.52 + bob;
      let swordAngle = -0.5; // resting, blade up-forward
      if (f.state === "attack") {
        const p = 1 - f.stateT / 300; // 0→1 through the swing
        swordAngle = -2.2 + p * 2.9;
        handX = 14 * U + Math.sin(p * Math.PI) * 7 * U;
        handY = -h * 0.56 + bob;
      } else if (f.state === "block") {
        swordAngle = -1.5;
        handX = 13 * U;
        handY = -h * 0.6 + bob;
      } else if (f.state === "hit") {
        swordAngle = 0.7;
        handY = -h * 0.42 + bob;
      }
      ctx.beginPath();
      ctx.moveTo(2 * U, shoulderY);
      ctx.lineTo(handX, handY);
      ctx.stroke();
      // katana: handle + blade
      const bladeLen = 52 * U;
      const hx2 = handX + Math.cos(swordAngle) * 8 * U;
      const hy2 = handY + Math.sin(swordAngle) * 8 * U;
      const tipX = handX + Math.cos(swordAngle) * bladeLen;
      const tipY = handY + Math.sin(swordAngle) * bladeLen;
      ctx.strokeStyle = "#5B3A1A";
      ctx.lineWidth = 4 * U;
      ctx.beginPath();
      ctx.moveTo(handX - Math.cos(swordAngle) * 5 * U, handY - Math.sin(swordAngle) * 5 * U);
      ctx.lineTo(hx2, hy2);
      ctx.stroke();
      ctx.strokeStyle = f.state === "block" ? "#FFE27A" : "#E8F1FF";
      ctx.lineWidth = 3.6 * U;
      ctx.beginPath();
      ctx.moveTo(hx2, hy2);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      if (f.state === "attack") {
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 7 * U;
        ctx.beginPath();
        ctx.arc(handX, handY, bladeLen * 0.82, swordAngle - 0.7, swordAngle);
        ctx.stroke();
      }
      ctx.restore();

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(cx, groundY() + 6 * U, 24 * U * (1 - f.jumpY / 700), 5.5 * U, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawBar = (x: number, y: number, w: number, pct: number, color: string, flip: boolean) => {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.roundRect(x, y, w, 13 * U, 6 * U);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      const fw = Math.max(0, (w - 4) * (pct / 100));
      ctx.fillStyle = pct <= 25 ? "#FF4B4B" : color;
      ctx.beginPath();
      ctx.roundRect(flip ? x + w - 2 - fw : x + 2, y + 2, fw, 9 * U, 4 * U);
      ctx.fill();
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      if (!e.last) e.last = now;
      const dt = Math.min(0.033, (now - e.last) / 1000);
      e.last = now;
      e.t += dt;

      // phases
      if (e.phase === "intro" || e.phase === "roundEnd") {
        e.phaseT -= dt * 1000;
        if (e.phaseT <= 0) {
          if (e.phase === "intro") e.phase = "fight";
          else if (e.roundWins[0] >= 2 || e.roundWins[1] >= 2) endMatch(e);
          else { e.round++; resetRound(e); }
        }
      }
      if (e.phase === "fight") {
        e.roundMs -= dt * 1000;
        const in1 = inputFor(e, 1);
        const in2 = modeRef.current === "ai" ? aiInput(e, dt) : inputFor(e, 2);
        stepFighter(e, e.p1, e.p2, in1, dt);
        stepFighter(e, e.p2, e.p1, in2, dt);
        // keep some body separation on the ground
        const minGap = 30 * U;
        if (e.p1.jumpY === 0 && e.p2.jumpY === 0 && Math.abs(e.p1.x - e.p2.x) < minGap) {
          const push = (minGap - Math.abs(e.p1.x - e.p2.x)) / 2;
          const dir = e.p1.x <= e.p2.x ? 1 : -1;
          e.p1.x -= push * dir;
          e.p2.x += push * dir;
        }
        if (e.p1.hp <= 0) endRound(e, 1);
        else if (e.p2.hp <= 0) endRound(e, 0);
        else if (e.roundMs <= 0) endRound(e, e.p1.hp >= e.p2.hp ? 0 : 1);
      } else {
        // let ko fighter settle; winner idles
        for (const f of [e.p1, e.p2]) {
          if (f.stateT > 0 && f.state !== "ko") {
            f.stateT -= dt * 1000;
            if (f.stateT <= 0) f.state = "idle";
          }
          if (f.jumpY > 0) {
            f.jumpY += f.vy * dt;
            f.vy -= 2050 * U * dt;
            if (f.jumpY <= 0) { f.jumpY = 0; f.vy = 0; }
          }
        }
      }

      for (const p of e.particles) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 500 * U * dt;
      }
      e.particles = e.particles.filter((p) => p.life < p.max);
      for (const f of e.floaters) { f.life += dt; f.y -= 30 * U * dt; }
      e.floaters = e.floaters.filter((f) => f.life < 0.8);
      for (const pt of e.petals) {
        pt.x += (pt.vx * dt) / W;
        pt.y += dt * 0.05;
        pt.rot += dt * 2;
        if (pt.x > 1.05) { pt.x = -0.05; pt.y = Math.random() * 0.4; }
        if (pt.y > 0.85) pt.y = 0;
      }

      // --- draw scene: sunset over a lake with a bridge ---
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#FF9A5C");
      sky.addColorStop(0.55, "#FF6B8A");
      sky.addColorStop(1, "#5B4B9E");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // sun
      ctx.fillStyle = "rgba(255,236,170,0.95)";
      ctx.beginPath();
      ctx.arc(W * 0.5, groundY() - 105 * U, 44 * U, 0, Math.PI * 2);
      ctx.fill();
      // distant mountains
      ctx.fillStyle = "rgba(70,50,110,0.75)";
      ctx.beginPath();
      ctx.moveTo(0, groundY());
      for (let x = 0; x <= W; x += Math.max(30, W / 14)) {
        ctx.lineTo(x, groundY() - (30 + Math.abs(Math.sin(x * 0.011)) * 62) * U);
      }
      ctx.lineTo(W, groundY());
      ctx.closePath();
      ctx.fill();
      // water + bridge planks
      ctx.fillStyle = "#2E5E8C";
      ctx.fillRect(0, groundY() + 10 * U, W, H - groundY());
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      for (let i = 0; i < 6; i++) {
        const y = groundY() + (18 + i * 12) * U;
        const off = Math.sin(e.t * 1.4 + i * 1.7) * 14 * U;
        ctx.fillRect(W * 0.42 + off, y, W * 0.16, 2.4 * U);
      }
      ctx.fillStyle = "#8A5A2B";
      ctx.fillRect(0, groundY(), W, 11 * U);
      ctx.fillStyle = "#6B4423";
      for (let x = 6 * U; x < W; x += 44 * U) ctx.fillRect(x, groundY(), 3 * U, 11 * U);
      ctx.fillStyle = "#5B3A1A";
      for (const bx of [0.16, 0.5, 0.84]) ctx.fillRect(W * bx - 5 * U, groundY() + 8 * U, 10 * U, 22 * U);

      // petals
      ctx.fillStyle = "rgba(255,183,213,0.85)";
      for (const pt of e.petals) {
        ctx.save();
        ctx.translate(pt.x * W, pt.y * H);
        ctx.rotate(pt.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.5 * U, 2.6 * U, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      drawFighter(e, e.p1);
      drawFighter(e, e.p2);

      for (const p of e.particles) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      for (const f of e.floaters) {
        ctx.globalAlpha = 1 - f.life / 0.8;
        ctx.font = `800 ${Math.round(14 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(20,10,30,0.7)";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // --- HUD ---
      const barW = Math.min(W * 0.38, 340 * U);
      drawBar(12, 12, barW, e.p1.hp, "#38BDF8", false);
      drawBar(W - 12 - barW, 12, barW, e.p2.hp, "#FB7185", true);
      ctx.font = `800 ${Math.round(12 * U)}px 'Fredoka', system-ui, sans-serif`;
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText("YOU 🔵", 14, 40 * U);
      ctx.textAlign = "right";
      ctx.fillText(modeRef.current === "ai" ? "🔴 CPU" : "🔴 P2", W - 14, 40 * U);
      // round pips + timer
      ctx.textAlign = "center";
      ctx.font = `800 ${Math.round(17 * U)}px 'Fredoka', system-ui, sans-serif`;
      ctx.fillStyle = e.roundMs < 10000 && e.phase === "fight" ? "#FF8FA3" : "#fff";
      ctx.fillText(`${Math.max(0, Math.ceil(e.roundMs / 1000))}`, W / 2, 30 * U);
      ctx.font = `${Math.round(13 * U)}px system-ui`;
      ctx.fillText(`${"●".repeat(e.roundWins[0])}${"○".repeat(2 - e.roundWins[0])}   ${"●".repeat(e.roundWins[1])}${"○".repeat(2 - e.roundWins[1])}`, W / 2, 50 * U);

      // announcements
      const announce = (big: string, small?: string) => {
        ctx.textAlign = "center";
        ctx.font = `800 ${Math.round(40 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(20,10,30,0.65)";
        ctx.strokeText(big, W / 2, H * 0.38);
        ctx.fillStyle = "#FFE27A";
        ctx.fillText(big, W / 2, H * 0.38);
        if (small) {
          ctx.font = `800 ${Math.round(16 * U)}px 'Fredoka', system-ui, sans-serif`;
          ctx.lineWidth = 5;
          ctx.strokeText(small, W / 2, H * 0.38 + 26 * U);
          ctx.fillStyle = "#fff";
          ctx.fillText(small, W / 2, H * 0.38 + 26 * U);
        }
      };
      if (e.phase === "intro") announce(`ROUND ${e.round}`, e.phaseT < 450 ? "FIGHT!" : "Ready…");
      else if (e.phase === "roundEnd") announce(e.winner === 0 ? "🔵 K.O.!" : "🔴 K.O.!", e.winner === 0 ? (modeRef.current === "ai" ? "You take the round!" : "Player 1 takes the round!") : modeRef.current === "ai" ? "CPU takes the round" : "Player 2 takes the round!");
      else if (e.phase === "matchEnd") announce("🏆 MATCH!", "What a duel!");
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#E85D04,#FF4B6E)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  return (
    <ArcadeShell
      title="Samurai Duel"
      emoji="🥋"
      color="linear-gradient(135deg,#E85D04,#9D0208)"
      score={streak}
      scoreLabel={mode === "ai" ? "Win streak" : "P1 streak"}
      best={best}
      onBack={onBack}
      onRestart={restart}
      footer={
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center justify-center gap-1.5 flex-wrap">
            <button onClick={() => { setMode("ai"); sfx.click(); restart(); }} className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5" style={chipStyle(mode === "ai")}>
              <Bot size={14} /> vs CPU
            </button>
            <button onClick={() => { setMode("2p"); sfx.click(); restart(); }} className="btn-game px-3 py-1.5 text-xs flex items-center gap-1.5" style={chipStyle(mode === "2p")}>
              <Users size={14} /> 2 Players
            </button>
            {mode === "ai" && (["easy", "medium", "hard"] as Diff[]).map((d) => (
              <button key={d} onClick={() => { setDiff(d); sfx.click(); restart(); }} className="btn-game px-2.5 py-1.5 text-xs capitalize" style={chipStyle(diff === d)}>
                {d}
              </button>
            ))}
          </div>
          <p className="text-center text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
            {mode === "ai" ? "A/D move · W jump · F slash · G/S block — or use the touch buttons" : "P1: A/D/W + F/G · P2: ←/→/↑ + K/L — or both use the touch buttons"}
          </p>
        </div>
      }
    >
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block touch-none" />
      </div>

      {/* touch controls */}
      {!showCard && (
        <>
          <div className="absolute bottom-3 left-3 z-10" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
            <DuelControls who="p1" tint="rgba(28,176,246,0.6)" onTouch={setTouch} />
          </div>
          {(mode === "2p" || !isTouch) && mode === "2p" && (
            <div className="absolute bottom-3 right-3 z-10" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
              <DuelControls who="p2" tint="rgba(255,75,110,0.6)" onTouch={setTouch} />
            </div>
          )}
        </>
      )}

      {showCard && cardInfo && (
        <GameOverCard
          title={mode === "ai" ? (cardInfo.winner === 0 ? "🏆 Victory!" : "💀 Defeated") : cardInfo.winner === 0 ? "🔵 Player 1 wins!" : "🔴 Player 2 wins!"}
          score={streak}
          scoreLabel="Win streak"
          best={Math.max(best, streak)}
          isNewBest={cardInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Rounds {cardInfo.wins[0]} — {cardInfo.wins[1]} ⚔️ {mode === "ai" && cardInfo.winner === 0 ? "The blade bows to you, master." : "Sharpen up and duel again!"}
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
