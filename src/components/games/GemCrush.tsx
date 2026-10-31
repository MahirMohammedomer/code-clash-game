"use client";

/**
 * Gem Crush — original from-scratch match-3 blitz.
 * 60 seconds, cascading combos, striped gems (4-match), bombs (5-match),
 * a FEVER meter that doubles points, idle hints and auto-shuffle.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell, GameOverCard } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

const N = 8;
const GAME_SECONDS = 60;

type Special = "row" | "col" | "bomb" | null;
interface Gem {
  id: number;
  type: number;
  r: number;
  c: number;
  special: Special;
  dying?: boolean;
  fallFrom?: number;
}
type Floater = { id: number; text: string; left: number; top: number; big?: boolean };

let nextId = 1;
let floaterId = 1;

const GEM_ART: { bg: string; clip: string; round?: boolean }[] = [
  { bg: "linear-gradient(145deg,#FF8A7A,#E5322D 60%,#B71C1C)", clip: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" },
  { bg: "linear-gradient(145deg,#7DD3FC,#2563EB 60%,#1E3A8A)", clip: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" },
  { bg: "linear-gradient(145deg,#86EFAC,#16A34A 60%,#14532D)", clip: "polygon(50% 0%, 100% 38%, 81% 100%, 19% 100%, 0% 38%)" },
  { bg: "linear-gradient(145deg,#FFE98A,#F59E0B 60%,#B45309)", clip: "polygon(50% 0%, 100% 100%, 0% 100%)" },
  { bg: "linear-gradient(145deg,#D8B4FE,#9333EA 60%,#581C87)", clip: "polygon(50% 0%, 95% 35%, 78% 100%, 22% 100%, 5% 35%)" },
  { bg: "linear-gradient(145deg,#FFFFFF,#FBCFE8 60%,#F472B6)", clip: "circle(50% at 50% 50%)", round: true },
];

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function makeGem(type: number, r: number, c: number): Gem {
  return { id: nextId++, type, r, c, special: null };
}

function randomBoard(): Gem[] {
  for (;;) {
    const types: number[][] = Array.from({ length: N }, () => Array(N).fill(0));
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        let t: number;
        do {
          t = Math.floor(Math.random() * GEM_ART.length);
        } while (
          (c >= 2 && types[r][c - 1] === t && types[r][c - 2] === t) ||
          (r >= 2 && types[r - 1][c] === t && types[r - 2][c] === t)
        );
        types[r][c] = t;
      }
    }
    const gems: Gem[] = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) gems.push(makeGem(types[r][c], r, c));
    if (findPossibleMove(gems)) return gems;
  }
}

function typeGrid(gems: Gem[]): (Gem | null)[][] {
  const g: (Gem | null)[][] = Array.from({ length: N }, () => Array<Gem | null>(N).fill(null));
  gems.forEach((gem) => {
    if (gem.r >= 0 && gem.r < N && gem.c >= 0 && gem.c < N) g[gem.r][gem.c] = gem;
  });
  return g;
}

interface MatchGroup { gems: Gem[]; dir: "h" | "v" }

function findMatches(gems: Gem[]): MatchGroup[] {
  const g = typeGrid(gems);
  const groups: MatchGroup[] = [];
  for (let r = 0; r < N; r++) {
    let c = 0;
    while (c < N) {
      const cur = g[r][c];
      if (!cur) { c++; continue; }
      let end = c;
      while (end + 1 < N && g[r][end + 1]?.type === cur.type) end++;
      if (end - c + 1 >= 3) groups.push({ gems: g[r].slice(c, end + 1) as Gem[], dir: "h" });
      c = end + 1;
    }
  }
  for (let c = 0; c < N; c++) {
    let r = 0;
    while (r < N) {
      const cur = g[r][c];
      if (!cur) { r++; continue; }
      let end = r;
      while (end + 1 < N && g[end + 1][c]?.type === cur.type) end++;
      if (end - r + 1 >= 3) {
        const col: Gem[] = [];
        for (let i = r; i <= end; i++) col.push(g[i][c] as Gem);
        groups.push({ gems: col, dir: "v" });
      }
      r = end + 1;
    }
  }
  return groups;
}

function hasMatchTypes(types: number[][]): boolean {
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const t = types[r][c];
      if (c + 2 < N && types[r][c + 1] === t && types[r][c + 2] === t) return true;
      if (r + 2 < N && types[r + 1][c] === t && types[r + 2][c] === t) return true;
    }
  return false;
}

function findPossibleMove(gems: Gem[]): [Gem, Gem] | null {
  const g = typeGrid(gems);
  const types = g.map((row) => row.map((gem) => gem?.type ?? -1));
  const dirs: [number, number][] = [[0, 1], [1, 0]];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      for (const [dr, dc] of dirs) {
        const r2 = r + dr, c2 = c + dc;
        if (r2 >= N || c2 >= N) continue;
        [types[r][c], types[r2][c2]] = [types[r2][c2], types[r][c]];
        const ok = hasMatchTypes(types);
        [types[r][c], types[r2][c2]] = [types[r2][c2], types[r][c]];
        if (ok) return [g[r][c] as Gem, g[r2][c2] as Gem];
      }
    }
  }
  return null;
}

export default function GemCrush({ onBack }: { onBack: () => void }) {
  const [gems, setGems] = useState<Gem[]>(() => randomBoard());
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => getBest("gems"));
  const [timeLeft, setTimeLeft] = useState(GAME_SECONDS);
  const [fever, setFever] = useState(0);
  const [feverOn, setFeverOn] = useState(false);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<number[]>([]);
  const [over, setOver] = useState<{ best: number; isNewBest: boolean } | null>(null);

  const gemsRef = useRef(gems);
  gemsRef.current = gems;
  const scoreRef = useRef(0);
  const busyRef = useRef(false);
  const overRef = useRef(false);
  const feverRef = useRef(0);
  const feverOnRef = useRef(false);
  const mountedRef = useRef(true);
  const dragRef = useRef<{ gem: Gem; x: number; y: number } | null>(null);
  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsRef = useRef({ gems: 0, cascades: 0, bestCombo: 0 });

  useEffect(() => {
    bumpPlays("gems");
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (idleRef.current) clearTimeout(idleRef.current);
    };
  }, []);

  const addFloater = useCallback((text: string, r: number, c: number, big = false) => {
    const f: Floater = { id: floaterId++, text, left: (c + 0.5) * (100 / N), top: r * (100 / N), big };
    setFloaters((prev) => [...prev.slice(-6), f]);
    setTimeout(() => {
      if (mountedRef.current) setFloaters((prev) => prev.filter((x) => x.id !== f.id));
    }, 900);
  }, []);

  const armHint = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    idleRef.current = setTimeout(() => {
      if (!mountedRef.current || busyRef.current || overRef.current) return;
      const move = findPossibleMove(gemsRef.current);
      if (move) setHint([move[0].id, move[1].id]);
    }, 4500);
  }, []);

  useEffect(() => {
    armHint();
  }, [armHint]);

  // countdown + fever decay
  useEffect(() => {
    const iv = setInterval(() => {
      if (overRef.current) return;
      setTimeLeft((t) => {
        const next = Math.max(0, t - 0.25);
        if (next <= 0 && !overRef.current) {
          overRef.current = true;
          const res = submitScore("gems", scoreRef.current);
          setBest(res.best);
          sfx.gameover();
          setTimeout(() => mountedRef.current && setOver(res), 400);
        }
        return next;
      });
      if (feverOnRef.current) {
        feverRef.current = Math.max(0, feverRef.current - 4.2);
        if (feverRef.current <= 0) {
          feverOnRef.current = false;
          setFeverOn(false);
        }
        setFever(feverRef.current);
      } else if (feverRef.current > 0) {
        feverRef.current = Math.max(0, feverRef.current - 0.35);
        setFever(feverRef.current);
      }
    }, 250);
    return () => clearInterval(iv);
  }, []);

  const newGame = useCallback(() => {
    overRef.current = false;
    busyRef.current = false;
    scoreRef.current = 0;
    feverRef.current = 0;
    feverOnRef.current = false;
    statsRef.current = { gems: 0, cascades: 0, bestCombo: 0 };
    setGems(randomBoard());
    setScore(0);
    setTimeLeft(GAME_SECONDS);
    setFever(0);
    setFeverOn(false);
    setSelected(null);
    setHint([]);
    setOver(null);
    armHint();
  }, [armHint]);

  const resolveBoard = useCallback(async (initial: Gem[], hostPreference: number | null) => {
    let current = initial;
    let combo = 0;

    for (;;) {
      if (!mountedRef.current) return;
      const groups = findMatches(current);
      if (groups.length === 0) break;
      combo++;
      statsRef.current.bestCombo = Math.max(statsRef.current.bestCombo, combo);
      if (combo > 1) statsRef.current.cascades++;

      // decide kills + special hosts
      const kill = new Set<number>();
      const hosts = new Map<number, Special>();
      let bonus = 0;
      for (const group of groups) {
        const list = group.gems;
        if (list.length >= 4) {
          const host = list.find((g) => g.id === hostPreference) ?? list[Math.floor(list.length / 2)];
          hosts.set(host.id, list.length >= 5 ? "bomb" : group.dir === "h" ? "row" : "col");
          bonus += list.length >= 5 ? 100 : 40;
          list.forEach((g) => {
            if (g.id !== host.id) kill.add(g.id);
          });
        } else {
          list.forEach((g) => kill.add(g.id));
        }
      }
      // expand special effects (chain reactions)
      const byId = new Map(current.map((g) => [g.id, g]));
      let expanded = true;
      while (expanded) {
        expanded = false;
        for (const id of Array.from(kill)) {
          const gem = byId.get(id);
          if (!gem || !gem.special) continue;
          const targets =
            gem.special === "row"
              ? current.filter((g) => g.r === gem.r)
              : gem.special === "col"
                ? current.filter((g) => g.c === gem.c)
                : current.filter((g) => Math.abs(g.r - gem.r) <= 1 && Math.abs(g.c - gem.c) <= 1);
          for (const t of targets) {
            if (!kill.has(t.id) && !hosts.has(t.id)) {
              kill.add(t.id);
              expanded = true;
            }
          }
        }
      }

      // scoring + floaters
      const mult = combo * (feverOnRef.current ? 2 : 1);
      const gained = kill.size * 10 * mult + bonus * mult;
      scoreRef.current += gained;
      setScore(scoreRef.current);
      statsRef.current.gems += kill.size;

      const center = groups[0].gems[Math.floor(groups[0].gems.length / 2)];
      addFloater(combo > 1 ? `+${gained} ×${combo} COMBO!` : `+${gained}`, center.r, center.c, combo > 1 || bonus > 0);
      if (combo >= 3) sfx.fever();
      sfx.pop(Math.min(2, 0.8 + combo * 0.22));
      if (hosts.size > 0) sfx.power();

      // fever charge
      if (!feverOnRef.current) {
        feverRef.current = Math.min(100, feverRef.current + kill.size * 3.4 + (combo - 1) * 6);
        setFever(feverRef.current);
        if (feverRef.current >= 100) {
          feverOnRef.current = true;
          setFeverOn(true);
          sfx.fever();
          addFloater("🔥 FEVER ×2!", 3, 3.5, true);
        }
      }

      // pop animation
      current = current.map((g) => {
        if (hosts.has(g.id)) return { ...g, special: hosts.get(g.id)! };
        if (kill.has(g.id)) return { ...g, dying: true };
        return g;
      });
      setGems(current);
      await sleep(230);
      if (!mountedRef.current) return;

      // gravity + refill
      current = current.filter((g) => !kill.has(g.id));
      const next: Gem[] = [];
      for (let c = 0; c < N; c++) {
        const col = current.filter((g) => g.c === c).sort((a, b) => a.r - b.r);
        const missing = N - col.length;
        col.forEach((g, i) => next.push({ ...g, r: missing + i, fallFrom: 0 }));
        for (let i = 0; i < missing; i++) {
          const gem = makeGem(Math.floor(Math.random() * GEM_ART.length), i, c);
          gem.fallFrom = missing + 1;
          next.push(gem);
        }
      }
      current = next;
      setGems(current);
      await sleep(40);
      if (!mountedRef.current) return;
      current = current.map((g) => (g.fallFrom ? { ...g, fallFrom: 0 } : g));
      setGems(current);
      await sleep(260);
      hostPreference = null;
    }

    // no moves left? shuffle
    if (mountedRef.current && !findPossibleMove(current)) {
      addFloater("🔀 Shuffled!", 3, 3.5, true);
      sfx.power();
      const fresh = randomBoard();
      // keep ids stable-ish: just replace board
      setGems(fresh);
    }
  }, [addFloater]);

  const trySwap = useCallback(async (a: Gem, b: Gem) => {
    if (busyRef.current || overRef.current) return;
    busyRef.current = true;
    setHint([]);
    setSelected(null);
    sfx.swap();

    const swapped = gemsRef.current.map((g) => {
      if (g.id === a.id) return { ...g, r: b.r, c: b.c };
      if (g.id === b.id) return { ...g, r: a.r, c: a.c };
      return g;
    });
    setGems(swapped);
    await sleep(210);
    if (!mountedRef.current) return;

    const swappedA = swapped.find((g) => g.id === a.id)!;
    if (findMatches(swapped).length === 0) {
      sfx.badSwap();
      setGems(gemsRef.current.map((g) => {
        if (g.id === a.id) return { ...g, r: a.r, c: a.c };
        if (g.id === b.id) return { ...g, r: b.r, c: b.c };
        return g;
      }));
      await sleep(190);
      busyRef.current = false;
      armHint();
      return;
    }

    await resolveBoard(swapped, swappedA.id);
    busyRef.current = false;
    armHint();
  }, [resolveBoard, armHint]);

  const gemAt = (r: number, c: number) => gemsRef.current.find((g) => g.r === r && g.c === c);

  const onPointerDown = (e: React.PointerEvent, gem: Gem) => {
    if (busyRef.current || overRef.current) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragRef.current = { gem, x: e.clientX, y: e.clientY };
    setHint([]);

    if (selected && selected !== gem.id) {
      const sel = gemsRef.current.find((g) => g.id === selected);
      if (sel && Math.abs(sel.r - gem.r) + Math.abs(sel.c - gem.c) === 1) {
        dragRef.current = null;
        void trySwap(sel, gem);
        return;
      }
    }
    setSelected(gem.id);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || busyRef.current || overRef.current) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) return; // tap-select only
    const dr = Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0;
    const dc = dr === 0 ? Math.sign(dx) : 0;
    const target = gemAt(drag.gem.r + dr, drag.gem.c + dc);
    if (target) void trySwap(drag.gem, target);
  };

  const back = () => {
    submitScore("gems", scoreRef.current);
    onBack();
  };

  const timePct = (timeLeft / GAME_SECONDS) * 100;
  const lowTime = timeLeft <= 10 && !over;

  return (
    <ArcadeShell
      title="Gem Crush"
      emoji="💎"
      color="linear-gradient(135deg,#A560E8,#FF4B6E)"
      score={score}
      best={best}
      onBack={back}
      onRestart={newGame}
      footer={
        <p className="text-center text-xs font-black" style={{ color: "rgba(255,255,255,0.6)" }}>
          Drag a gem to swap · match 4 for a striped gem · 5 for a 💣 · fill the meter for FEVER!
        </p>
      }
    >
      {/* timer + fever bars */}
      <div className="w-full px-4 pt-3 shrink-0" style={{ maxWidth: 460 }}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={`text-sm font-black tabular-nums ${lowTime ? "animate-pulse" : ""}`} style={{ color: lowTime ? "#FF6B6B" : "#fff" }}>
            ⏱️ {Math.ceil(timeLeft)}s
          </span>
          <div className="flex-1 h-3.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.2)" }}>
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${timePct}%`, background: lowTime ? "linear-gradient(90deg,#FF4B4B,#FF8A3D)" : "linear-gradient(90deg,#1CB0F6,#7B5CFF)" }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-black" style={{ color: feverOn ? "#FFB020" : "rgba(255,255,255,0.75)" }}>
            🔥 {feverOn ? "FEVER ×2" : "Fever"}
          </span>
          <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,176,32,0.35)" }}>
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${fever}%`, background: "linear-gradient(90deg,#FFC800,#FF6B00)" }}
            />
          </div>
        </div>
      </div>

      {/* board */}
      <div
        className={`relative rounded-3xl touch-none my-auto ${feverOn ? "fever-glow" : ""}`}
        style={{
          width: "min(94vw, 440px, 52vh)",
          aspectRatio: "1",
          background: feverOn
            ? "linear-gradient(160deg,#4A2B12,#2B1B3D)"
            : "linear-gradient(160deg,#2B2350,#1D1B38)",
          border: "2px solid rgba(255,255,255,0.14)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
        }}
      >
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${N},1fr)`, gridTemplateRows: `repeat(${N},1fr)` }}>
          {Array.from({ length: N * N }).map((_, i) => (
            <div key={i} style={{ background: (Math.floor(i / N) + (i % N)) % 2 === 0 ? "rgba(255,255,255,0.045)" : "transparent" }} />
          ))}
        </div>

        {gems.map((gem) => {
          const art = GEM_ART[gem.type];
          const displayR = gem.r - (gem.fallFrom ?? 0);
          const isSelected = selected === gem.id;
          const isHint = hint.includes(gem.id);
          return (
            <div
              key={gem.id}
              className="absolute left-0 top-0"
              style={{
                width: `${100 / N}%`,
                height: `${100 / N}%`,
                transform: `translate(${gem.c * 100}%, ${displayR * 100}%)`,
                transition: "transform 220ms ease-in-out",
                zIndex: gem.dying ? 5 : isSelected ? 6 : 2,
                padding: "4%",
                cursor: "pointer",
                touchAction: "none",
              }}
              onPointerDown={(e) => onPointerDown(e, gem)}
              onPointerUp={onPointerUp}
            >
              <div
                className={`w-full h-full relative ${gem.dying ? "gem-pop" : ""} ${isHint ? "wiggle-hint" : ""}`}
                style={{
                  transform: isSelected ? "scale(1.14)" : "scale(1)",
                  transition: "transform 120ms ease",
                  filter: isSelected
                    ? "drop-shadow(0 0 6px #fff) brightness(1.25)"
                    : "drop-shadow(0 3px 3px rgba(0,0,0,0.4))",
                }}
              >
                <div
                  className="absolute inset-0"
                  style={{ background: art.bg, clipPath: art.clip, borderRadius: art.round ? "50%" : undefined }}
                />
                <div
                  className="absolute rounded-full"
                  style={{ left: "18%", top: "12%", width: "34%", height: "22%", background: "rgba(255,255,255,0.75)", filter: "blur(1px)", transform: "rotate(-18deg)" }}
                />
                {gem.special && (
                  <span
                    className="absolute inset-0 flex items-center justify-center font-black text-white"
                    style={{ fontSize: "clamp(12px,3.6vw,19px)", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
                  >
                    {gem.special === "bomb" ? "💣" : gem.special === "row" ? "↔" : "↕"}
                  </span>
                )}
                {gem.special === "bomb" && (
                  <span className="absolute inset-0 rounded-full animate-ping" style={{ border: "2.5px solid rgba(255,255,255,0.65)" }} />
                )}
              </div>
            </div>
          );
        })}

        {floaters.map((f) => (
          <span
            key={f.id}
            className="float-up absolute font-display font-bold pointer-events-none z-10 whitespace-nowrap"
            style={{
              left: `${f.left}%`,
              top: `${f.top}%`,
              fontSize: f.big ? "clamp(17px,5vw,26px)" : "clamp(13px,3.8vw,19px)",
              color: f.big ? "#FFB020" : "#FFE27A",
              textShadow: "0 2px 8px rgba(0,0,0,0.85)",
            }}
          >
            {f.text}
          </span>
        ))}
      </div>

      {over && (
        <GameOverCard
          title="⏰ Time's up!"
          score={score}
          best={over.best}
          isNewBest={over.isNewBest}
          extra={
            <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.65)" }}>
              💎 {statsRef.current.gems} gems crushed · 🔥 best combo ×{Math.max(1, statsRef.current.bestCombo)}
            </p>
          }
          onRestart={newGame}
          onBack={back}
        />
      )}
    </ArcadeShell>
  );
}
