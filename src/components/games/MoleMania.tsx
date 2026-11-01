"use client";

/**
 * Mole Mania — original from-scratch whack-'em frenzy.
 * CSS-drawn moles (some in hard hats) pop from 9 burrows for 45 seconds:
 * chain hits to build combo multipliers, grab golden moles for +50 & +1s,
 * and whatever you do, don't bonk a bomb. Speed ramps the longer you last.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

const GAME_SECONDS = 45;
const HOLES = 9;

type CritterKind = "mole" | "golden" | "bomb";
interface Critter { id: number; kind: CritterKind; bonked: boolean; hat: boolean }
type Floater = { id: number; text: string; hole: number; big?: boolean; color?: string };

let nextId = 1;
let floaterId = 1;

function comboMult(combo: number): number {
  if (combo >= 20) return 5;
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}

export default function MoleMania({ onBack }: { onBack: () => void }) {
  const [holes, setHoles] = useState<(Critter | null)[]>(Array(HOLES).fill(null));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("mole"));
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [combo, setCombo] = useState(0);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [shake, setShake] = useState(false);
  const [phase, setPhase] = useState<"ready" | "playing" | "over">("ready");
  const [overInfo, setOverInfo] = useState<{ best: number; isNewBest: boolean; hits: number; taps: number; bestCombo: number } | null>(null);

  const holesRef = useRef(holes);
  useEffect(() => {
    holesRef.current = holes;
  }, [holes]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const timeRef = useRef(GAME_SECONDS);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);
  const statsRef = useRef({ hits: 0, taps: 0, bestCombo: 0 });
  const mountedRef = useRef(true);
  const upTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    bumpPlays("mole");
    mountedRef.current = true;
    const timers = upTimersRef.current;
    return () => {
      mountedRef.current = false;
      timers.forEach(clearTimeout);
    };
  }, []);

  const addFloater = useCallback((text: string, hole: number, big = false, color?: string) => {
    const f: Floater = { id: floaterId++, text, hole, big, color };
    setFloaters((prev) => [...prev.slice(-5), f]);
    setTimeout(() => {
      if (mountedRef.current) setFloaters((prev) => prev.filter((x) => x.id !== f.id));
    }, 850);
  }, []);

  const endGame = useCallback(() => {
    setPhase("over");
    setHoles(Array(HOLES).fill(null));
    const res = submitScore("mole", scoreRef.current);
    setBest(res.best);
    setOverInfo({ ...res, hits: statsRef.current.hits, taps: statsRef.current.taps, bestCombo: statsRef.current.bestCombo });
    sfx.gameover();
  }, []);

  // clock
  useEffect(() => {
    if (phase !== "playing") return;
    const iv = setInterval(() => {
      timeRef.current = Math.max(0, timeRef.current - 0.1);
      setTimeLeft(timeRef.current);
      if (timeRef.current <= 0) {
        clearInterval(iv);
        endGame();
      }
    }, 100);
    return () => clearInterval(iv);
  }, [phase, endGame]);

  // spawner
  useEffect(() => {
    if (phase !== "playing") return;
    let cancelled = false;

    const spawn = () => {
      if (cancelled || !mountedRef.current || phaseRef.current !== "playing") return;
      const elapsed = GAME_SECONDS - timeRef.current;
      const speedUp = Math.min(1, elapsed / GAME_SECONDS);
      const empty = holesRef.current.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
      if (empty.length > 0) {
        const hole = empty[Math.floor(Math.random() * empty.length)];
        const roll = Math.random();
        const kind: CritterKind = roll < 0.07 ? "golden" : roll < 0.2 ? "bomb" : "mole";
        const critter: Critter = { id: nextId++, kind, bonked: false, hat: kind === "mole" && Math.random() < 0.3 };
        const upMs = kind === "golden" ? 620 : 980 - speedUp * 430;
        setHoles((prev) => {
          const next = [...prev];
          if (!next[hole]) next[hole] = critter;
          return next;
        });
        const timer = setTimeout(() => {
          upTimersRef.current.delete(critter.id);
          if (!mountedRef.current) return;
          setHoles((prev) => {
            const next = [...prev];
            if (next[hole]?.id === critter.id && !next[hole]?.bonked) next[hole] = null;
            return next;
          });
        }, upMs);
        upTimersRef.current.set(critter.id, timer);
      }
      const nextDelay = 700 - speedUp * 360 + Math.random() * 160;
      timer = setTimeout(spawn, nextDelay);
    };

    let timer = setTimeout(spawn, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phase]);

  const start = useCallback(() => {
    scoreRef.current = 0;
    comboRef.current = 0;
    timeRef.current = GAME_SECONDS;
    statsRef.current = { hits: 0, taps: 0, bestCombo: 0 };
    upTimersRef.current.forEach(clearTimeout);
    upTimersRef.current.clear();
    setHoles(Array(HOLES).fill(null));
    setScore(0);
    setCombo(0);
    setTimeLeft(GAME_SECONDS);
    setOverInfo(null);
    setPhase("playing");
    sfx.click();
  }, []);

  const whack = (hole: number) => {
    if (phaseRef.current !== "playing") return;
    statsRef.current.taps++;
    const critter = holesRef.current[hole];

    if (!critter || critter.bonked) {
      // whiffed — combo breaks
      if (comboRef.current >= 3) addFloater("MISS!", hole, false, "#FF8A8A");
      comboRef.current = 0;
      setCombo(0);
      sfx.badSwap();
      return;
    }

    if (critter.kind === "bomb") {
      comboRef.current = 0;
      setCombo(0);
      timeRef.current = Math.max(0.1, timeRef.current - 2);
      setTimeLeft(timeRef.current);
      addFloater("💥 -2s!", hole, true, "#FF6B6B");
      setShake(true);
      setTimeout(() => mountedRef.current && setShake(false), 380);
      sfx.explosion();
      setHoles((prev) => {
        const next = [...prev];
        next[hole] = null;
        return next;
      });
      return;
    }

    // clean hit!
    statsRef.current.hits++;
    comboRef.current++;
    statsRef.current.bestCombo = Math.max(statsRef.current.bestCombo, comboRef.current);
    setCombo(comboRef.current);
    const mult = comboMult(comboRef.current);

    if (critter.kind === "golden") {
      scoreRef.current += 50;
      timeRef.current = Math.min(GAME_SECONDS, timeRef.current + 1);
      setTimeLeft(timeRef.current);
      addFloater("+50 ⭐ +1s", hole, true, "#FFD94D");
      sfx.golden();
    } else {
      const pts = 10 * mult;
      scoreRef.current += pts;
      addFloater(mult > 1 ? `+${pts} ×${mult}` : `+${pts}`, hole, mult >= 3);
      sfx.pop(Math.min(2, 0.9 + comboRef.current * 0.05));
    }
    setScore(scoreRef.current);

    setHoles((prev) => {
      const next = [...prev];
      if (next[hole]?.id === critter.id) next[hole] = { ...critter, bonked: true };
      return next;
    });
    setTimeout(() => {
      if (!mountedRef.current) return;
      setHoles((prev) => {
        const next = [...prev];
        if (next[hole]?.id === critter.id) next[hole] = null;
        return next;
      });
    }, 240);
  };

  const mult = comboMult(combo);
  const frenzy = mult >= 5;
  const timePct = (timeLeft / GAME_SECONDS) * 100;
  const boardW = "min(94vw, 540px, calc(100dvh - 310px))";

  return (
    <ArcadeShell
      title="Mole Mania"
      emoji="🔨"
      color="linear-gradient(135deg,#B0703C,#7C4A21)"
      score={score}
      best={best}
      onBack={onBack}
      onRestart={start}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Chain hits to raise your multiplier · ⭐ golden = +50 & +1s · never bonk a 💣!
        </p>
      }
    >
      {/* timer + combo */}
      <div className="px-1 pt-3 shrink-0" style={{ width: boardW }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-sm font-black tabular-nums ${timeLeft <= 8 && phase === "playing" ? "animate-pulse" : ""}`} style={{ color: timeLeft <= 8 && phase === "playing" ? "#FF6B6B" : "#fff" }}>
            ⏱️ {Math.ceil(timeLeft)}s
          </span>
          <div className="flex-1 h-3.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.2)" }}>
            <div className="h-full rounded-full transition-all duration-150" style={{ width: `${timePct}%`, background: "linear-gradient(90deg,#58CC02,#B5E048)" }} />
          </div>
          <span
            className="text-xs font-black px-2 py-1 rounded-full tabular-nums"
            style={{
              background: frenzy ? "linear-gradient(90deg,#FF4B6E,#FF7A18)" : mult > 1 ? "rgba(255,176,32,0.25)" : "rgba(255,255,255,0.1)",
              color: frenzy ? "#fff" : mult > 1 ? "#FFD94D" : "rgba(255,255,255,0.7)",
              border: "1.5px solid rgba(255,255,255,0.25)",
            }}
          >
            {frenzy ? "🔥 FRENZY " : ""}×{mult} · {combo} combo
          </span>
        </div>
      </div>

      {/* burrow field */}
      <div
        className={`relative rounded-3xl my-auto p-3 ${shake ? "shake-x" : ""} ${frenzy ? "fever-glow" : ""}`}
        style={{
          width: boardW,
          background: "linear-gradient(165deg,#2E5E1E,#1E4213)",
          border: "2px solid rgba(255,255,255,0.14)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div className="grid grid-cols-3 gap-2.5">
          {holes.map((critter, i) => (
            <button
              key={i}
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                whack(i);
              }}
              className="relative overflow-hidden rounded-2xl touch-none active:scale-[0.98] transition-transform"
              style={{
                aspectRatio: "1",
                background: "linear-gradient(180deg,#69B84A 0%,#4C9440 55%,#3A7A30 100%)",
                border: "2px solid rgba(0,0,0,0.18)",
                boxShadow: "inset 0 -8px 14px rgba(0,0,0,0.22)",
              }}
              aria-label={`Burrow ${i + 1}`}
            >
              {/* hole */}
              <span
                className="absolute left-1/2 -translate-x-1/2 rounded-[50%]"
                style={{ bottom: "8%", width: "74%", height: "26%", background: "radial-gradient(ellipse at 50% 40%, #2A1A0E 55%, #4A2E18 100%)", boxShadow: "inset 0 4px 8px rgba(0,0,0,0.8), 0 2px 0 rgba(255,255,255,0.12)" }}
                aria-hidden
              />
              {/* dirt mound lip */}
              <span
                className="absolute left-1/2 -translate-x-1/2 rounded-[50%]"
                style={{ bottom: "4%", width: "84%", height: "16%", background: "radial-gradient(ellipse at 50% 30%, #8A5A2B, #6B4423)", zIndex: 0 }}
                aria-hidden
              />
              {critter && <CritterFig critter={critter} />}
              {/* front grass lip hides the mole's base */}
              <span
                className="absolute left-0 right-0"
                style={{ bottom: 0, height: "13%", background: "linear-gradient(180deg, rgba(76,148,64,0) 0%, #4C9440 45%)", zIndex: 3 }}
                aria-hidden
              />
            </button>
          ))}
        </div>

        {/* floaters */}
        {floaters.map((f) => (
          <span
            key={f.id}
            className="float-up absolute font-display font-bold pointer-events-none z-10 whitespace-nowrap"
            style={{
              left: `${(f.hole % 3) * 33.3 + 16.6}%`,
              top: `${Math.floor(f.hole / 3) * 33.3 + 4}%`,
              fontSize: f.big ? "clamp(16px,4.6vw,24px)" : "clamp(13px,3.6vw,18px)",
              color: f.color ?? "#FFE27A",
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
            }}
          >
            {f.text}
          </span>
        ))}

        {phase === "ready" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-3xl text-center p-4" style={{ background: "rgba(16,17,38,0.55)" }}>
            <span className="text-6xl animate-bounce" aria-hidden>🔨</span>
            <span className="font-display font-bold text-3xl text-white">Mole Mania</span>
            <span className="text-sm font-black px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.92)", color: "#26283B" }}>
              45 seconds — how many can you bonk?
            </span>
            <button onClick={start} className="btn-game btn-green px-7 py-3 mt-1 text-base">▶ Start bonking!</button>
          </div>
        )}
      </div>

      {phase === "over" && overInfo && (
        <GameOverCard
          title="⏰ Time's up!"
          score={score}
          best={overInfo.best}
          isNewBest={overInfo.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              🔨 {overInfo.hits} bonks · 🎯 {overInfo.taps > 0 ? Math.round((overInfo.hits / overInfo.taps) * 100) : 0}% accuracy · 🔥 best combo {overInfo.bestCombo}
            </p>
          }
          onRestart={start}
          onBack={onBack}
        />
      )}
    </ArcadeShell>
  );
}

/** A mole (or bomb) drawn purely with CSS shapes. */
function CritterFig({ critter }: { critter: Critter }) {
  const up = true;
  const stars = critter.bonked && critter.kind !== "bomb";

  if (critter.kind === "bomb") {
    return (
      <span
        className="mole-rise absolute left-1/2 bottom-[10%] z-[2] flex items-end justify-center"
        style={{ width: "46%", height: "62%", transform: `translateX(-50%) translateY(${up ? "0%" : "105%"})`, transition: "transform 130ms ease-out" }}
        aria-hidden
      >
        <span className="relative block w-full aspect-square rounded-full" style={{ background: "radial-gradient(circle at 34% 30%, #5B6270, #23262E 65%)", boxShadow: "inset 0 -4px 8px rgba(0,0,0,0.6)" }}>
          <span className="absolute left-1/2 -translate-x-1/2 rounded" style={{ top: "-14%", width: "26%", height: "16%", background: "#3A3F4A" }} />
          <span className="absolute text-[10px]" style={{ top: "-30%", left: "56%" }}>✨</span>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white/85 font-black" style={{ fontSize: "clamp(10px,2.6vw,15px)" }}>✖</span>
        </span>
      </span>
    );
  }

  const golden = critter.kind === "golden";
  const fur = golden ? "linear-gradient(160deg,#FFE98A,#F5A623)" : "linear-gradient(160deg,#B08968,#7C5A3A)";
  const belly = golden ? "#FFF6D8" : "#EAD9C2";

  return (
    <span
      className="mole-rise absolute left-1/2 bottom-[9%] z-[2]"
      style={{
        width: "56%",
        height: "74%",
        transform: `translateX(-50%) translateY(${critter.bonked ? "16%" : "0%"}) scaleY(${critter.bonked ? 0.82 : 1})`,
        transition: "transform 120ms ease-out",
      }}
      aria-hidden
    >
      {/* body */}
      <span className="absolute inset-x-0 bottom-0 top-[12%] block" style={{ background: fur, borderRadius: "48% 48% 12% 12% / 62% 62% 8% 8%", boxShadow: "inset 0 -6px 10px rgba(0,0,0,0.25)" }}>
        {/* belly */}
        <span className="absolute left-1/2 -translate-x-1/2 rounded-[50%]" style={{ bottom: "4%", width: "58%", height: "42%", background: belly }} />
        {/* hard hat */}
        {critter.hat && (
          <>
            <span className="absolute left-1/2 -translate-x-1/2" style={{ top: "-7%", width: "62%", height: "24%", background: "linear-gradient(180deg,#FFD94D,#F5A623)", borderRadius: "999px 999px 4px 4px" }} />
            <span className="absolute left-1/2 -translate-x-1/2 rounded-full" style={{ top: "12%", width: "78%", height: "7%", background: "#F5A623" }} />
          </>
        )}
        {/* eyes */}
        {critter.bonked ? (
          <span className="absolute left-1/2 -translate-x-1/2 font-black" style={{ top: "16%", color: "#3A2A18", fontSize: "clamp(11px,3vw,17px)", letterSpacing: "0.35em" }}>✖✖</span>
        ) : (
          <>
            <span className="absolute rounded-full bg-white" style={{ top: "17%", left: "24%", width: "17%", height: "13%" }}>
              <span className="absolute rounded-full" style={{ background: "#241708", width: "55%", height: "62%", left: "24%", top: "22%" }} />
            </span>
            <span className="absolute rounded-full bg-white" style={{ top: "17%", right: "24%", width: "17%", height: "13%" }}>
              <span className="absolute rounded-full" style={{ background: "#241708", width: "55%", height: "62%", left: "24%", top: "22%" }} />
            </span>
          </>
        )}
        {/* snout + nose */}
        <span className="absolute left-1/2 -translate-x-1/2 rounded-[50%]" style={{ top: "32%", width: "46%", height: "24%", background: golden ? "#FFD9A0" : "#D9B48F" }}>
          <span className="absolute left-1/2 -translate-x-1/2 rounded-[50%]" style={{ top: "12%", width: "34%", height: "34%", background: "#E5637C" }} />
          {/* buck teeth */}
          <span className="absolute left-1/2 -translate-x-1/2 flex gap-[2px]" style={{ bottom: "-16%" }}>
            <span className="block bg-white rounded-b" style={{ width: "0.5em", height: "0.55em", fontSize: "clamp(8px,2vw,12px)", border: "1px solid rgba(0,0,0,0.15)" }} />
            <span className="block bg-white rounded-b" style={{ width: "0.5em", height: "0.55em", fontSize: "clamp(8px,2vw,12px)", border: "1px solid rgba(0,0,0,0.15)" }} />
          </span>
        </span>
        {/* paws */}
        <span className="absolute rounded-[50%]" style={{ left: "-7%", top: "52%", width: "22%", height: "15%", background: fur, transform: "rotate(-24deg)" }} />
        <span className="absolute rounded-[50%]" style={{ right: "-7%", top: "52%", width: "22%", height: "15%", background: fur, transform: "rotate(24deg)" }} />
        {golden && <span className="absolute" style={{ top: "-12%", right: "2%", fontSize: "clamp(12px,3vw,18px)" }}>⭐</span>}
      </span>
      {/* bonk stars */}
      {stars && (
        <>
          <span className="star-burst absolute" style={{ top: "-4%", left: "18%", ["--sx" as string]: "-16px", ["--sy" as string]: "-24px", fontSize: "15px" }}>⭐</span>
          <span className="star-burst absolute" style={{ top: "-8%", left: "48%", ["--sx" as string]: "2px", ["--sy" as string]: "-32px", fontSize: "18px" }}>⭐</span>
          <span className="star-burst absolute" style={{ top: "-4%", right: "14%", ["--sx" as string]: "18px", ["--sy" as string]: "-24px", fontSize: "14px" }}>⭐</span>
        </>
      )}
    </span>
  );
}
