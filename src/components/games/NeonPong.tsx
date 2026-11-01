"use client";

/**
 * Neon Pong — original from-scratch paddle duel.
 * Drag anywhere (or use a mouse / W-S keys) to move your paddle, bounce the
 * ball past the CPU across three difficulties, or grab a friend: in 2P mode
 * each half of the screen steers one paddle. First to 7 takes the match.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Users } from "lucide-react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { arcadeDpr, bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

const WIN_SCORE = 7;
type Mode = "ai" | "2p";
type Diff = "easy" | "medium" | "hard";

interface Engine {
  ballX: number; ballY: number; ballVX: number; ballVY: number;
  leftY: number; rightY: number;
  leftTarget: number | null; rightTarget: number | null;
  keys: { w: boolean; s: boolean; up: boolean; down: boolean };
  leftScore: number; rightScore: number;
  serveAt: number;
  state: "ready" | "playing" | "point" | "over";
  trail: { x: number; y: number }[];
  last: number;
}

function freshEngine(): Engine {
  return {
    ballX: 0.5, ballY: 0.5, ballVX: 0, ballVY: 0,
    leftY: 0.5, rightY: 0.5,
    leftTarget: null, rightTarget: null,
    keys: { w: false, s: false, up: false, down: false },
    leftScore: 0, rightScore: 0,
    serveAt: 0,
    state: "ready",
    trail: [], last: 0,
  };
}

const AI_SPEED: Record<Diff, number> = { easy: 0.55, medium: 0.85, hard: 1.2 };
const AI_ERROR: Record<Diff, number> = { easy: 0.14, medium: 0.07, hard: 0.025 };

export default function NeonPong({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine>(freshEngine());
  const [mode, setMode] = useState<Mode>("ai");
  const [diff, setDiff] = useState<Diff>("medium");
  const [hud, setHud] = useState({ left: 0, right: 0 });
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(() => getBest("pong"));
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean; winnerLeft: boolean } | null>(null);

  const modeRef = useRef(mode);
  const diffRef = useRef(diff);
  const streakRef = useRef(0);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { diffRef.current = diff; }, [diff]);
  useEffect(() => { bumpPlays("pong"); }, []);

  const restart = useCallback(() => {
    engineRef.current = freshEngine();
    setHud({ left: 0, right: 0 });
    setOverInfo(null);
    setPhase("ready");
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
      H = Math.max(260, Math.floor(rect.height));
      U = Math.max(0.7, Math.min(1.5, H / 520));
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

    const paddleH = () => 92 * U;
    const paddleW = () => 13 * U;
    const paddleX = (side: "left" | "right") => (side === "left" ? 18 * U : W - 18 * U - paddleW());
    const ballR = () => 8.5 * U;

    const serve = (e: Engine, towardLeft: boolean, now: number) => {
      e.ballX = W / 2;
      e.ballY = H / 2;
      const speed = Math.max(300 * U, W * 0.42);
      const angle = (Math.random() * 0.6 - 0.3);
      e.ballVX = Math.cos(angle) * speed * (towardLeft ? -1 : 1);
      e.ballVY = Math.sin(angle) * speed;
      e.trail = [];
      e.state = "playing";
      e.serveAt = now;
    };

    const finish = (e: Engine) => {
      e.state = "over";
      const winnerLeft = e.leftScore > e.rightScore;
      if (modeRef.current === "ai") {
        if (winnerLeft) {
          streakRef.current++;
          setStreak(streakRef.current);
          const res = submitScore("pong", streakRef.current);
          setBest(res.best);
          setOverInfo({ ...res, winnerLeft });
          sfx.win();
        } else {
          streakRef.current = 0;
          setStreak(0);
          setOverInfo({ best: getBest("pong"), isNewBest: false, winnerLeft });
          sfx.gameover();
        }
      } else {
        setOverInfo({ best: getBest("pong"), isNewBest: false, winnerLeft });
        sfx.win();
      }
      setTimeout(() => setPhase("over"), 500);
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const e = engineRef.current;
      if (!e.last) e.last = now;
      const dt = Math.min(0.033, (now - e.last) / 1000);
      e.last = now;

      const ph = paddleH();
      const pSpeed = H * 1.7;

      // --- paddle control ---
      const movePaddle = (side: "left" | "right") => {
        const target = side === "left" ? e.leftTarget : e.rightTarget;
        let y = side === "left" ? e.leftY : e.rightY;
        if (target !== null) {
          const diffPx = target - y * H;
          const step = Math.max(-pSpeed * 2.2 * dt, Math.min(pSpeed * 2.2 * dt, diffPx * 18 * dt + diffPx * 0.35));
          y = (y * H + step) / H;
        }
        return y;
      };

      if (e.state === "playing" || e.state === "point" || e.state === "ready") {
        e.leftY = movePaddle("left");
        if (e.keys.w) e.leftY -= (pSpeed * dt) / H;
        if (e.keys.s) e.leftY += (pSpeed * dt) / H;

        if (modeRef.current === "2p") {
          e.rightY = movePaddle("right");
          if (e.keys.up) e.rightY -= (pSpeed * dt) / H;
          if (e.keys.down) e.rightY += (pSpeed * dt) / H;
        } else if (e.state === "playing") {
          // CPU tracks the ball with human-like error
          const aiTarget = e.ballY / H + Math.sin(now / 300) * AI_ERROR[diffRef.current] * 0.4;
          const aiSpeed = pSpeed * AI_SPEED[diffRef.current];
          const dy = (aiTarget - e.rightY) * H;
          const step = Math.max(-aiSpeed * dt, Math.min(aiSpeed * dt, dy));
          e.rightY += step / H;
        }
        const minY = (ph / 2) / H;
        const maxY = 1 - minY;
        e.leftY = Math.max(minY, Math.min(maxY, e.leftY));
        e.rightY = Math.max(minY, Math.min(maxY, e.rightY));
      }

      // --- ball ---
      if (e.state === "point" && now > e.serveAt) {
        serve(e, Math.random() < 0.5, now);
      }
      if (e.state === "playing") {
        e.ballX += e.ballVX * dt;
        e.ballY += e.ballVY * dt;
        e.trail.push({ x: e.ballX, y: e.ballY });
        if (e.trail.length > 12) e.trail.shift();

        const r = ballR();
        if (e.ballY < r) { e.ballY = r; e.ballVY = Math.abs(e.ballVY); sfx.paddle(); }
        if (e.ballY > H - r) { e.ballY = H - r; e.ballVY = -Math.abs(e.ballVY); sfx.paddle(); }

        const bounce = (side: "left" | "right") => {
          const py = (side === "left" ? e.leftY : e.rightY) * H;
          const rel = Math.max(-1, Math.min(1, (e.ballY - py) / (ph / 2)));
          const speed = Math.min(Math.hypot(e.ballVX, e.ballVY) * 1.045, Math.max(950 * U, W * 1.05));
          const angle = rel * 1.05; // up to ~60°
          e.ballVX = Math.cos(angle) * speed * (side === "left" ? 1 : -1);
          e.ballVY = Math.sin(angle) * speed;
          sfx.paddle();
        };

        // left paddle
        const lx = paddleX("left");
        if (e.ballVX < 0 && e.ballX - r <= lx + paddleW() && e.ballX > lx - 6 * U && Math.abs(e.ballY - e.leftY * H) <= ph / 2 + r * 0.4) {
          e.ballX = lx + paddleW() + r;
          bounce("left");
        }
        // right paddle
        const rx = paddleX("right");
        if (e.ballVX > 0 && e.ballX + r >= rx && e.ballX < rx + paddleW() + 6 * U && Math.abs(e.ballY - e.rightY * H) <= ph / 2 + r * 0.4) {
          e.ballX = rx - r;
          bounce("right");
        }

        // scoring
        if (e.ballX < -r * 2 || e.ballX > W + r * 2) {
          if (e.ballX < 0) e.rightScore++;
          else e.leftScore++;
          setHud({ left: e.leftScore, right: e.rightScore });
          sfx.score();
          if (e.leftScore >= WIN_SCORE || e.rightScore >= WIN_SCORE) {
            finish(e);
          } else {
            e.state = "point";
            e.serveAt = now + 750;
            e.ballX = W / 2;
            e.ballY = H / 2;
            e.trail = [];
          }
        }
      }

      // --- draw ---
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#0B1026");
      bg.addColorStop(1, "#141038");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // center line + circle
      ctx.strokeStyle = "rgba(255,255,255,0.16)";
      ctx.lineWidth = 3;
      ctx.setLineDash([12 * U, 12 * U]);
      ctx.beginPath();
      ctx.moveTo(W / 2, 0);
      ctx.lineTo(W / 2, H);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 54 * U, 0, Math.PI * 2);
      ctx.stroke();

      // scores
      ctx.font = `800 ${Math.round(52 * U)}px 'Fredoka', system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "rgba(56,225,255,0.35)";
      ctx.fillText(String(e.leftScore), W / 2 - 84 * U, 84 * U);
      ctx.fillStyle = "rgba(255,75,110,0.35)";
      ctx.fillText(String(e.rightScore), W / 2 + 84 * U, 84 * U);
      ctx.font = `800 ${Math.round(11 * U)}px 'Fredoka', system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(modeRef.current === "ai" ? "YOU" : "LEFT", W / 2 - 84 * U, 104 * U);
      ctx.fillText(modeRef.current === "ai" ? "CPU" : "RIGHT", W / 2 + 84 * U, 104 * U);
      ctx.fillText(`FIRST TO ${WIN_SCORE}`, W / 2, H - 14 * U);

      // paddles with neon glow
      const drawPaddle = (side: "left" | "right", color: string) => {
        const x = paddleX(side);
        const y = (side === "left" ? e.leftY : e.rightY) * H - ph / 2;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16 * U;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x, y, paddleW(), ph, 6 * U);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.roundRect(x + paddleW() * 0.28, y + 5 * U, paddleW() * 0.44, ph - 10 * U, 4 * U);
        ctx.fill();
      };
      drawPaddle("left", "#22D3EE");
      drawPaddle("right", "#FF4B6E");

      // ball trail + ball
      for (let i = 0; i < e.trail.length; i++) {
        const t = e.trail[i];
        ctx.globalAlpha = (i / e.trail.length) * 0.35;
        ctx.fillStyle = "#7DD3FC";
        ctx.beginPath();
        ctx.arc(t.x, t.y, ballR() * (0.4 + 0.6 * (i / e.trail.length)), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (e.state === "playing") {
        ctx.shadowColor = "#FFFFFF";
        ctx.shadowBlur = 18 * U;
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.arc(e.ballX, e.ballY, ballR(), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      if (e.state === "ready") {
        ctx.font = `800 ${Math.round(24 * U)}px 'Fredoka', system-ui, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText("Tap to serve! 🏓", W / 2, H / 2 - 70 * U);
      }
    };

    raf = requestAnimationFrame(frame);

    const localPos = (ev: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((ev.clientX - rect.left) / rect.width) * W,
        y: ((ev.clientY - rect.top) / rect.height) * H,
      };
    };

    const pointers = new Map<number, "left" | "right">();
    const onDown = (ev: PointerEvent) => {
      const { x, y } = localPos(ev);
      const e = engineRef.current;
      const side: "left" | "right" = modeRef.current === "2p" ? (x < W / 2 ? "left" : "right") : "left";
      pointers.set(ev.pointerId, side);
      if (side === "left") e.leftTarget = y;
      else e.rightTarget = y;
      if (e.state === "ready") {
        setPhase("playing");
        serve(e, false, performance.now());
        sfx.click();
      }
    };
    const onMove = (ev: PointerEvent) => {
      const side = pointers.get(ev.pointerId);
      const e = engineRef.current;
      const { y } = localPos(ev);
      if (side === "left") e.leftTarget = y;
      else if (side === "right") e.rightTarget = y;
      else if (ev.pointerType === "mouse" && modeRef.current === "ai") e.leftTarget = y;
      else if (ev.pointerType === "mouse" && modeRef.current === "2p") {
        const { x } = localPos(ev);
        if (x < W / 2) e.leftTarget = y;
        else e.rightTarget = y;
      }
    };
    const onUp = (ev: PointerEvent) => {
      const side = pointers.get(ev.pointerId);
      pointers.delete(ev.pointerId);
      const e = engineRef.current;
      if (side === "left" && ev.pointerType !== "mouse") e.leftTarget = null;
      if (side === "right" && ev.pointerType !== "mouse") e.rightTarget = null;
    };
    const onKey = (down: boolean) => (ev: KeyboardEvent) => {
      const e = engineRef.current;
      const k = ev.key.toLowerCase();
      if (k === "w") e.keys.w = down;
      if (k === "s") e.keys.s = down;
      if (k === "arrowup") { e.keys.up = down; ev.preventDefault(); }
      if (k === "arrowdown") { e.keys.down = down; ev.preventDefault(); }
      if (down && e.state === "ready" && (k === "w" || k === "s" || k === "arrowup" || k === "arrowdown" || ev.code === "Space")) {
        setPhase("playing");
        serve(e, false, performance.now());
      }
    };
    const kd = onKey(true);
    const ku = onKey(false);

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#22D3EE,#7B5CFF)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  return (
    <ArcadeShell
      title="Neon Pong"
      emoji="🏓"
      color="linear-gradient(135deg,#334155,#0F172A)"
      score={mode === "ai" ? streak : hud.left}
      scoreLabel={mode === "ai" ? "Match streak" : "Left points"}
      best={best}
      bestOverride={mode === "2p" ? `${hud.right} right` : undefined}
      onBack={onBack}
      onRestart={restart}
      footer={
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
          <span className="w-full text-center text-[11px] font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
            {mode === "ai" ? "Drag anywhere to move — first to 7 wins" : "Each half of the screen steers its paddle!"}
          </span>
        </div>
      }
    >
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block touch-none" style={{ cursor: "none" }} />
      </div>

      {phase === "over" && overInfo && (
        <GameOverCard
          title={mode === "ai" ? (overInfo.winnerLeft ? "🏆 Match won!" : "🤖 CPU takes it") : overInfo.winnerLeft ? "🔵 Left wins!" : "🔴 Right wins!"}
          score={mode === "ai" ? streak : hud.left}
          scoreLabel={mode === "ai" ? "Match streak" : "Left points"}
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              Final score {hud.left} — {hud.right} 🏓
            </p>
          }
          onRestart={restart}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}
