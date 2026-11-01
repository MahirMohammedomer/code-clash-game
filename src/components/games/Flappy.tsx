"use client";

/**
 * Flappy Wings — original from-scratch one-tap flying game.
 * Parallax sky, squash-and-stretch bird drawn with canvas shapes,
 * medal ranks, score popups, screen shake, death tumble.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard, StartHint } from "./Shell";
import { bumpPlays, getBest, submitScore, arcadeDpr } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

interface Pipe { x: number; gapY: number; passed: boolean }
interface Cloud { x: number; y: number; s: number; speed: number }
interface Popup { x: number; y: number; life: number; text: string }

interface Engine {
  birdY: number;
  vy: number;
  rot: number;
  pipes: Pipe[];
  spawnIn: number;
  score: number;
  groundX: number;
  clouds: Cloud[];
  popups: Popup[];
  state: "ready" | "playing" | "falling" | "dead";
  uScale: number;
  flash: number;
  shake: number;
  last: number;
  t: number;
}

// Physics constants are expressed for a ~620px-tall stage and scaled by U
// (computed from the live canvas height) so the game feels identical on
// any screen size — phone, tablet or desktop monitor.
const GRAV = 1500;
const FLAP = -430;

function freshEngine(): Engine {
  return {
    birdY: 0.45, vy: 0, rot: 0,
    pipes: [], spawnIn: 600,
    score: 0, groundX: 0,
    clouds: Array.from({ length: 6 }, (_, i) => ({
      x: Math.random(), y: 0.06 + Math.random() * 0.3, s: 0.5 + Math.random() * 0.9, speed: 6 + i * 2,
    })),
    popups: [],
    state: "ready", flash: 0, shake: 0, last: 0, t: 0, uScale: 1,
  };
}

function medalFor(score: number): { emoji: string; label: string } | null {
  if (score >= 40) return { emoji: "💎", label: "Platinum" };
  if (score >= 30) return { emoji: "🥇", label: "Gold" };
  if (score >= 20) return { emoji: "🥈", label: "Silver" };
  if (score >= 10) return { emoji: "🥉", label: "Bronze" };
  return null;
}

export default function Flappy({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("flappy"));
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean } | null>(null);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const restart = useCallback(() => {
    engineRef.current = freshEngine();
    setScore(0);
    setOverInfo(null);
    setPhase("ready");
  }, []);

  useEffect(() => {
    bumpPlays("flappy");
  }, []);

  const flap = useCallback(() => {
    const e = engineRef.current;
    if (phaseRef.current === "over") return;
    if (e.state === "ready") {
      e.state = "playing";
      setPhase("playing");
    }
    if (e.state === "playing") {
      e.vy = FLAP * (engineRef.current.uScale ?? 1);
      sfx.flap();
    }
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.code === "Space" || ev.code === "ArrowUp") {
        ev.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flap]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let W = 360;
    let H = 520;
    let U = 1; // height scale unit
    let PIPE_W = 74;
    let GAP = 168;

    const resize = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = Math.max(240, Math.floor(rect.width));
      H = Math.max(300, Math.floor(rect.height));
      U = Math.max(0.78, Math.min(1.7, H / 620));
      engineRef.current.uScale = U;
      PIPE_W = 74 * U;
      GAP = Math.max(126, Math.min(250, 168 * U));
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

    const groundH = () => Math.max(52, H * 0.11);
    const birdX = () => W * 0.3;
    const birdR = () => Math.max(14, 17 * U);

    const die = (e: Engine) => {
      e.state = "falling";
      e.flash = 1;
      e.shake = 12;
      e.vy = Math.min(e.vy, -220 * U);
      sfx.hit();
    };

    const finishDeath = (e: Engine) => {
      e.state = "dead";
      const res = submitScore("flappy", e.score);
      setBest(res.best);
      setOverInfo(res);
      sfx.gameover();
      setPhase("over");
    };

    const drawCloud = (x: number, y: number, s: number) => {
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.arc(x, y, 17 * s, 0, Math.PI * 2);
      ctx.arc(x + 16 * s, y + 3 * s, 13 * s, 0, Math.PI * 2);
      ctx.arc(x - 16 * s, y + 4 * s, 12 * s, 0, Math.PI * 2);
      ctx.arc(x + 2 * s, y + 6 * s, 14 * s, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawPipe = (x: number, y: number, h: number, top: boolean) => {
      if (h <= 0) return;
      const grad = ctx.createLinearGradient(x, 0, x + PIPE_W, 0);
      grad.addColorStop(0, "#3E9B2F");
      grad.addColorStop(0.25, "#7ED957");
      grad.addColorStop(0.55, "#4CAF50");
      grad.addColorStop(1, "#2E7D32");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "rgba(20,60,20,0.55)";
      ctx.lineWidth = 2;
      const lipH = 26 * U;
      const lipW = 6;
      if (top) {
        ctx.fillRect(x + 3, y, PIPE_W - 6, h - lipH);
        ctx.strokeRect(x + 3, y - 2, PIPE_W - 6, h - lipH);
        ctx.fillRect(x - lipW / 2 + 3, y + h - lipH, PIPE_W - 6 + lipW, lipH);
        ctx.strokeRect(x - lipW / 2 + 3, y + h - lipH, PIPE_W - 6 + lipW, lipH);
      } else {
        ctx.fillRect(x - lipW / 2 + 3, y, PIPE_W - 6 + lipW, lipH);
        ctx.strokeRect(x - lipW / 2 + 3, y, PIPE_W - 6 + lipW, lipH);
        ctx.fillRect(x + 3, y + lipH, PIPE_W - 6, h - lipH);
        ctx.strokeRect(x + 3, y + lipH, PIPE_W - 6, h - lipH + 2);
      }
    };

    const drawBird = (e: Engine, cx: number, cy: number) => {
      const r = birdR();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(e.rot);
      // body
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.25, 0, 0, r * 1.25);
      grad.addColorStop(0, "#FFE066");
      grad.addColorStop(0.6, "#FFC53D");
      grad.addColorStop(1, "#F59E0B");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.22, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(140,90,0,0.35)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // belly
      ctx.fillStyle = "rgba(255,244,214,0.95)";
      ctx.beginPath();
      ctx.ellipse(r * 0.18, r * 0.42, r * 0.62, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      // wing (flaps with time; faster right after a flap)
      const flapSpeed = e.vy < 0 ? 40 : 14;
      const wingA = Math.sin(e.t * flapSpeed) * 0.55 - 0.15;
      ctx.save();
      ctx.translate(-r * 0.25, r * 0.05);
      ctx.rotate(wingA);
      ctx.fillStyle = "#FB923C";
      ctx.beginPath();
      ctx.ellipse(-r * 0.28, 0, r * 0.55, r * 0.3, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // crest
      ctx.strokeStyle = "#F59E0B";
      ctx.lineWidth = r * 0.14;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-r * 0.08, -r * 0.9);
      ctx.quadraticCurveTo(r * 0.05, -r * 1.25, r * 0.3, -r * 1.2);
      ctx.stroke();
      // beak
      ctx.fillStyle = "#FF4B4B";
      ctx.beginPath();
      ctx.moveTo(r * 0.95, -r * 0.12);
      ctx.lineTo(r * 1.55, r * 0.08);
      ctx.lineTo(r * 0.92, r * 0.32);
      ctx.closePath();
      ctx.fill();
      // eye
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(r * 0.48, -r * 0.3, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      if (e.state === "falling" || e.state === "dead") {
        ctx.strokeStyle = "#1F2430";
        ctx.lineWidth = r * 0.11;
        const ex = r * 0.52, ey = -r * 0.3, s = r * 0.14;
        ctx.beginPath();
        ctx.moveTo(ex - s, ey - s); ctx.lineTo(ex + s, ey + s);
        ctx.moveTo(ex + s, ey - s); ctx.lineTo(ex - s, ey + s);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#1F2430";
        ctx.beginPath();
        ctx.arc(r * 0.56, -r * 0.3, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(r * 0.61, -r * 0.37, r * 0.055, 0, Math.PI * 2);
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

      const gh = groundH();
      const floorY = H - gh;
      const bx = birdX();
      const br = birdR();
      const speed = Math.max(W / 3.6, Math.min(W / 1.8, (168 + Math.min(70, e.score * 2.2)) * U));

      // --- update ---
      if (e.state === "ready") {
        e.birdY = 0.45 + Math.sin(e.t * 2.6) * 0.016;
        e.rot = Math.sin(e.t * 2.6) * 0.07;
      } else if (e.state === "playing" || e.state === "falling") {
        e.vy += GRAV * U * dt;
        e.birdY += (e.vy * dt) / H;
        e.rot = e.state === "falling"
          ? Math.min(1.5, e.rot + dt * 7)
          : Math.max(-0.42, Math.min(1.25, e.vy / 620));
        if (e.birdY < 0.02) { e.birdY = 0.02; e.vy = Math.max(e.vy, 0); }

        if (e.state === "playing") {
          e.groundX = (e.groundX + speed * dt) % 48;
          e.spawnIn -= speed * dt;
          if (e.spawnIn <= 0) {
            e.spawnIn = PIPE_W + 205 * U;
            const margin = 66;
            const gapY = margin + Math.random() * Math.max(40, floorY - GAP - margin * 1.5);
            e.pipes.push({ x: W + 10, gapY, passed: false });
          }
          const by = e.birdY * H;
          for (const p of e.pipes) {
            p.x -= speed * dt;
            if (!p.passed && p.x + PIPE_W < bx - br) {
              p.passed = true;
              e.score++;
              setScore(e.score);
              e.popups.push({ x: bx + 26, y: by - 30, life: 0, text: "+1" });
              sfx.score();
            }
            // collision (circle vs rects, forgiving radius)
            const rr = br * 0.86;
            const inX = bx + rr > p.x + 3 && bx - rr < p.x + PIPE_W - 3;
            const inTop = by - rr < p.gapY;
            const inBottom = by + rr > p.gapY + GAP;
            if (inX && (inTop || inBottom)) die(e);
          }
          e.pipes = e.pipes.filter((p) => p.x > -PIPE_W - 20);
        }

        if (e.birdY * H + br >= floorY) {
          e.birdY = (floorY - br) / H;
          if (e.state === "playing") {
            die(e);
            finishDeath(e);
          } else if (e.state === "falling") {
            finishDeath(e);
          }
        }
      }

      for (const c of e.clouds) {
        c.x -= (c.speed * dt) / W * 4;
        if (c.x < -0.2) { c.x = 1.15; c.y = 0.06 + Math.random() * 0.3; }
      }
      e.popups = e.popups.filter((p) => p.life < 0.8);
      for (const p of e.popups) { p.life += dt; p.y -= 34 * dt; }
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 2.6);
      if (e.shake > 0) e.shake *= 0.88;

      // --- draw ---
      ctx.save();
      if (e.shake > 0.4) ctx.translate((Math.random() - 0.5) * e.shake, (Math.random() - 0.5) * e.shake);

      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#4EC5F5");
      sky.addColorStop(0.55, "#8FE0FF");
      sky.addColorStop(1, "#D8F7FF");
      ctx.fillStyle = sky;
      ctx.fillRect(-20, -20, W + 40, H + 40);

      // sun
      ctx.fillStyle = "rgba(255,224,102,0.95)";
      ctx.beginPath();
      ctx.arc(W - 54, 58, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,224,102,0.25)";
      ctx.beginPath();
      ctx.arc(W - 54, 58, 40, 0, Math.PI * 2);
      ctx.fill();

      for (const c of e.clouds) drawCloud(c.x * W, c.y * H, c.s);

      // distant hills
      ctx.fillStyle = "rgba(126,217,87,0.5)";
      ctx.beginPath();
      for (let x = -20; x <= W + 20; x += 8) {
        const y = floorY - 26 - Math.sin((x + e.groundX * 2) / 90) * 20 - Math.sin((x + e.groundX * 2) / 37) * 8;
        if (x === -20) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineTo(W + 20, floorY);
      ctx.lineTo(-20, floorY);
      ctx.closePath();
      ctx.fill();

      for (const p of e.pipes) {
        drawPipe(p.x, -4, p.gapY + 4, true);
        drawPipe(p.x, p.gapY + GAP, floorY - (p.gapY + GAP) + 4, false);
      }

      // ground
      ctx.fillStyle = "#E8D08A";
      ctx.fillRect(-20, floorY, W + 40, gh + 20);
      ctx.fillStyle = "#7ED957";
      ctx.fillRect(-20, floorY, W + 40, 14);
      ctx.fillStyle = "rgba(46,125,50,0.5)";
      for (let x = -((e.groundX) % 48) - 48; x < W + 48; x += 48) {
        ctx.beginPath();
        ctx.moveTo(x, floorY + 14);
        ctx.lineTo(x + 16, floorY + 14);
        ctx.lineTo(x + 8, floorY + 26);
        ctx.closePath();
        ctx.fill();
      }

      drawBird(e, bx, e.birdY * H);

      // big score while playing
      if (e.state === "playing" || e.state === "falling") {
        ctx.font = `800 ${Math.round(44 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "rgba(31,36,48,0.75)";
        ctx.strokeText(String(e.score), W / 2, 64);
        ctx.fillStyle = "#fff";
        ctx.fillText(String(e.score), W / 2, 64);
      }

      for (const p of e.popups) {
        ctx.globalAlpha = 1 - p.life / 0.8;
        ctx.font = `800 ${Math.round(20 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(31,36,48,0.6)";
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillStyle = "#FFE27A";
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;

      if (e.flash > 0) {
        ctx.fillStyle = `rgba(255,70,70,${e.flash * 0.45})`;
        ctx.fillRect(-20, -20, W + 40, H + 40);
      }
      ctx.restore();
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const medal = medalFor(score);

  return (
    <ArcadeShell
      title="Flappy Wings"
      emoji="🐤"
      color="linear-gradient(135deg,#FFC53D,#1CB0F6)"
      score={score}
      best={best}
      onBack={onBack}
      onRestart={restart}
    >
      <div
        ref={wrapRef}
        className="absolute inset-0 flex items-center justify-center touch-none"
        onPointerDown={(e) => {
          e.preventDefault();
          flap();
        }}
      >
        <canvas
          ref={canvasRef}
          className="rounded-3xl"
          style={{ border: "2px solid rgba(255,255,255,0.14)", boxShadow: "0 18px 40px rgba(0,0,0,0.45)" }}
        />
      </div>

      {phase === "ready" && <StartHint emoji="🐤" title="Flappy Wings" hint="Tap, click or press SPACE to flap!" onStart={flap} />}
      {phase === "over" && overInfo && (
        <GameOverCard
          title={medal ? `${medal.emoji} ${medal.label} medal!` : "Game Over"}
          score={score}
          scoreLabel="Pipes"
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              {score < 10
                ? "Reach 10 pipes for the 🥉 Bronze medal!"
                : score < 40
                  ? `Next medal at ${score < 20 ? 20 : score < 30 ? 30 : 40} pipes — you can do it!`
                  : "Maximum medal achieved. Absolute legend! 💎"}
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
