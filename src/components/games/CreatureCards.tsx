"use client";

/**
 * Creature Cards — original from-scratch collectible card game.
 * Crack open packs to discover 28 invented elemental creatures across five
 * elements and four rarities. Duplicates melt into shards; spend shards on
 * Shiny pulls that guarantee something rare. Complete the whole set!
 * All creature names, art direction and flavor lines are original.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type ElementId = "ember" | "tide" | "leaf" | "volt" | "shade";
type Rarity = "common" | "rare" | "epic" | "legendary";

interface Creature {
  id: string;
  name: string;
  emoji: string;
  element: ElementId;
  rarity: Rarity;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  flavor: string;
}

const ELEMENTS: Record<ElementId, { label: string; icon: string; from: string; to: string; glow: string }> = {
  ember: { label: "Ember", icon: "🔥", from: "#FF7A18", to: "#D92B1F", glow: "rgba(255,122,24,0.55)" },
  tide: { label: "Tide", icon: "🌊", from: "#38BDF8", to: "#1D4ED8", glow: "rgba(56,189,248,0.55)" },
  leaf: { label: "Leaf", icon: "🍃", from: "#4ADE80", to: "#15803D", glow: "rgba(74,222,128,0.55)" },
  volt: { label: "Volt", icon: "⚡", from: "#FACC15", to: "#D97706", glow: "rgba(250,204,21,0.55)" },
  shade: { label: "Shade", icon: "🌙", from: "#A78BFA", to: "#5B21B6", glow: "rgba(167,139,250,0.55)" },
};

const RARITY_STYLE: Record<Rarity, { label: string; color: string; stars: string; shardValue: number }> = {
  common: { label: "Common", color: "#CBD5E1", stars: "★", shardValue: 1 },
  rare: { label: "Rare", color: "#38BDF8", stars: "★★", shardValue: 3 },
  epic: { label: "Epic", color: "#C084FC", stars: "★★★", shardValue: 6 },
  legendary: { label: "Legendary", color: "#FFD700", stars: "★★★★", shardValue: 15 },
};

const CREATURES: Creature[] = [
  // commons
  { id: "pipflame", name: "Pipflame", emoji: "🦊", element: "ember", rarity: "common", hp: 42, atk: 38, def: 30, spd: 44, flavor: "Its tail sparks whenever it sneezes." },
  { id: "splashlet", name: "Splashlet", emoji: "🐸", element: "tide", rarity: "common", hp: 46, atk: 32, def: 36, spd: 40, flavor: "Born in a rain puddle, dreams of oceans." },
  { id: "sproutle", name: "Sproutle", emoji: "🐢", element: "leaf", rarity: "common", hp: 55, atk: 28, def: 48, spd: 22, flavor: "A garden grows a little wherever it naps." },
  { id: "voltini", name: "Voltini", emoji: "🐭", element: "volt", rarity: "common", hp: 38, atk: 41, def: 26, spd: 52, flavor: "Stores static in its cheeks for snack time." },
  { id: "gloomoth", name: "Gloomoth", emoji: "🦋", element: "shade", rarity: "common", hp: 40, atk: 35, def: 30, spd: 46, flavor: "Only dances where lanterns have gone out." },
  { id: "coalkit", name: "Coalkit", emoji: "🐱", element: "ember", rarity: "common", hp: 44, atk: 40, def: 28, spd: 48, flavor: "Purrs at exactly the temperature of toast." },
  { id: "drizzard", name: "Drizzard", emoji: "🦎", element: "tide", rarity: "common", hp: 48, atk: 36, def: 34, spd: 42, flavor: "Forecast: light lizard with a chance of rain." },
  { id: "mossback", name: "Mossback", emoji: "🦔", element: "leaf", rarity: "common", hp: 52, atk: 30, def: 46, spd: 26, flavor: "Mistaken for a shrub three times a week." },
  { id: "zapup", name: "Zapup", emoji: "🐶", element: "volt", rarity: "common", hp: 45, atk: 39, def: 31, spd: 50, flavor: "Chases thunderstorms. Sometimes catches one." },
  { id: "shadecub", name: "Shadecub", emoji: "🐻", element: "shade", rarity: "common", hp: 54, atk: 37, def: 38, spd: 30, flavor: "Hibernates through daylight, parties by moonlight." },
  { id: "embunny", name: "Embunny", emoji: "🐰", element: "ember", rarity: "common", hp: 41, atk: 36, def: 29, spd: 55, flavor: "Leaves tiny scorch marks shaped like hearts." },
  { id: "coralpup", name: "Coralpup", emoji: "🐙", element: "tide", rarity: "common", hp: 47, atk: 34, def: 39, spd: 37, flavor: "Eight hugs available at all times." },
  // rares
  { id: "pyrox", name: "Pyrox", emoji: "🦖", element: "ember", rarity: "rare", hp: 68, atk: 62, def: 45, spd: 50, flavor: "Stomps first, asks questions never." },
  { id: "tidalisk", name: "Tidalisk", emoji: "🐳", element: "tide", rarity: "rare", hp: 78, atk: 52, def: 55, spd: 38, flavor: "Its songs rearrange the beaches." },
  { id: "florasaur", name: "Florasaur", emoji: "🦕", element: "leaf", rarity: "rare", hp: 74, atk: 48, def: 62, spd: 30, flavor: "The flower on its back blooms once a decade." },
  { id: "stormjay", name: "Stormjay", emoji: "🦅", element: "volt", rarity: "rare", hp: 58, atk: 66, def: 36, spd: 78, flavor: "Outruns its own thunder by half a second." },
  { id: "nocturne", name: "Nocturne", emoji: "🦉", element: "shade", rarity: "rare", hp: 60, atk: 60, def: 42, spd: 64, flavor: "Hums lullabies that make shadows sway." },
  { id: "magmoth", name: "Magmoth", emoji: "🦣", element: "ember", rarity: "rare", hp: 85, atk: 58, def: 58, spd: 28, flavor: "Ancient, enormous, and always slightly warm." },
  { id: "kelphorn", name: "Kelphorn", emoji: "🦄", element: "tide", rarity: "rare", hp: 66, atk: 57, def: 49, spd: 66, flavor: "Gallops across waves without getting wet." },
  { id: "briarbear", name: "Briarbear", emoji: "🐼", element: "leaf", rarity: "rare", hp: 76, atk: 55, def: 52, spd: 34, flavor: "Vegetarian, except for very rude picnics." },
  { id: "galvant", name: "Galvant", emoji: "🦁", element: "volt", rarity: "rare", hp: 70, atk: 68, def: 44, spd: 70, flavor: "Its mane stands up before every storm." },
  // epics
  { id: "infernix", name: "Infernix", emoji: "🦅", element: "ember", rarity: "epic", hp: 88, atk: 86, def: 52, spd: 82, flavor: "Reborn every sunrise, fabulous every sunset." },
  { id: "abyssal", name: "Abyssal", emoji: "🦑", element: "tide", rarity: "epic", hp: 102, atk: 80, def: 66, spd: 44, flavor: "The deep sea keeps its secrets. It is most of them." },
  { id: "elderoot", name: "Elderoot", emoji: "🌳", element: "leaf", rarity: "epic", hp: 118, atk: 64, def: 88, spd: 20, flavor: "Older than the forest. The forest asks its advice." },
  { id: "voltrex", name: "Voltrex", emoji: "🦖", element: "volt", rarity: "epic", hp: 95, atk: 92, def: 58, spd: 74, flavor: "Every roar comes with its own lightning show." },
  { id: "umbrafox", name: "Umbrafox", emoji: "🦊", element: "shade", rarity: "epic", hp: 84, atk: 88, def: 54, spd: 90, flavor: "Has nine tails and at least eleven secrets." },
  // legendaries
  { id: "solaryn", name: "Solaryn", emoji: "🐲", element: "ember", rarity: "legendary", hp: 130, atk: 110, def: 80, spd: 95, flavor: "A piece of the sun that learned to fly." },
  { id: "lunaris", name: "Lunaris", emoji: "🐉", element: "shade", rarity: "legendary", hp: 126, atk: 104, def: 86, spd: 92, flavor: "It collects moonbeams and trades them for dreams." },
];

const BY_RARITY: Record<Rarity, Creature[]> = {
  common: CREATURES.filter((c) => c.rarity === "common"),
  rare: CREATURES.filter((c) => c.rarity === "rare"),
  epic: CREATURES.filter((c) => c.rarity === "epic"),
  legendary: CREATURES.filter((c) => c.rarity === "legendary"),
};

const STORE_KEY = "arcade_cards_state_v1";
interface CardState { owned: Record<string, number>; shards: number; pulls: number }

function loadState(): CardState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (raw && typeof raw === "object" && raw.owned) return { owned: raw.owned, shards: raw.shards ?? 0, pulls: raw.pulls ?? 0 };
  } catch {}
  return { owned: {}, shards: 0, pulls: 0 };
}

function rollRarity(shiny: boolean): Rarity {
  const r = Math.random();
  if (shiny) {
    if (r < 0.14) return "legendary";
    if (r < 0.48) return "epic";
    return "rare";
  }
  if (r < 0.045) return "legendary";
  if (r < 0.165) return "epic";
  if (r < 0.445) return "rare";
  return "common";
}

const FREE_COOLDOWN_MS = 8000;
const SHINY_COST = 10;

export default function CreatureCards({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<CardState>(() => loadState());
  const [pulls3, setPulls3] = useState<Creature[]>([]);
  const [revealKey, setRevealKey] = useState(0);
  const [lastWasNew, setLastWasNew] = useState<boolean[]>([]);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [best, setBest] = useState(() => getBest("cards"));
  const [view, setView] = useState<"pull" | "collection">("pull");
  const [opening, setOpening] = useState(false);

  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { bumpPlays("cards"); }, []);

  // cooldown ticker
  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const iv = setInterval(() => setCooldownLeft((c) => Math.max(0, c - 250)), 250);
    return () => clearInterval(iv);
  }, [cooldownLeft]);

  const uniqueCount = Object.keys(state.owned).filter((k) => state.owned[k] > 0).length;

  const doPull = useCallback((shiny: boolean) => {
    const cur = stateRef.current;
    if (shiny && cur.shards < SHINY_COST) { sfx.badSwap(); return; }
    if (!shiny && cooldownLeft > 0) { sfx.badSwap(); return; }
    setOpening(true);
    sfx.power();

    const pulled: Creature[] = [];
    const wasNew: boolean[] = [];
    const next: CardState = { owned: { ...cur.owned }, shards: cur.shards - (shiny ? SHINY_COST : 0), pulls: cur.pulls + (shiny ? 1 : 3) };

    const n = shiny ? 1 : 3;
    for (let i = 0; i < n; i++) {
      const rarity = rollRarity(shiny);
      const pool = BY_RARITY[rarity];
      const c = pool[Math.floor(Math.random() * pool.length)];
      pulled.push(c);
      const isNew = !next.owned[c.id];
      wasNew.push(isNew);
      if (isNew) next.owned[c.id] = 1;
      else {
        next.owned[c.id]++;
        next.shards += RARITY_STYLE[c.rarity].shardValue;
      }
    }

    setTimeout(() => {
      setState(next);
      stateRef.current = next;
      try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch {}
      setPulls3(pulled);
      setLastWasNew(wasNew);
      setRevealKey((k) => k + 1);
      setView("pull");
      setOpening(false);
      if (!shiny) setCooldownLeft(FREE_COOLDOWN_MS);
      const newUnique = Object.keys(next.owned).length;
      const res = submitScore("cards", newUnique);
      setBest(res.best);
      const bestRarity = pulled.reduce((acc, c) => {
        const order: Rarity[] = ["common", "rare", "epic", "legendary"];
        return order.indexOf(c.rarity) > order.indexOf(acc) ? c.rarity : acc;
      }, "common" as Rarity);
      if (bestRarity === "legendary" || bestRarity === "epic") sfx.golden();
      else sfx.score();
    }, 420);
  }, [cooldownLeft]);

  const restart = useCallback(() => {
    // "restart" here just jumps back to the pull screen; collection persists.
    setView("pull");
    sfx.click();
  }, []);

  const pct = Math.round((uniqueCount / CREATURES.length) * 100);

  const chipStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "linear-gradient(120deg,#FFC800,#FF4B4B)", color: "#fff", border: "2px solid rgba(255,255,255,0.4)" }
      : { background: "rgba(255,255,255,0.09)", color: "#fff", border: "2px solid rgba(255,255,255,0.2)" };

  return (
    <ArcadeShell
      title="Creature Cards"
      emoji="🃏"
      color="linear-gradient(135deg,#FFC800,#FF4B4B)"
      score={uniqueCount}
      scoreLabel={`Collected / ${CREATURES.length}`}
      best={best}
      onBack={onBack}
      onRestart={restart}
    >
      <div className="w-full max-w-2xl mx-auto px-3 flex flex-col items-center overflow-y-auto py-3 w-full">
        {/* header stats */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <button onClick={() => { setView("pull"); sfx.click(); }} className="btn-game px-3.5 py-2 text-xs" style={chipStyle(view === "pull")}>
            🎁 Open packs
          </button>
          <button onClick={() => { setView("collection"); sfx.click(); }} className="btn-game px-3.5 py-2 text-xs" style={chipStyle(view === "collection")}>
            📚 Collection {uniqueCount}/{CREATURES.length}
          </button>
          <span className="chip px-2.5 py-1.5 text-xs font-black" style={{ background: "rgba(167,139,250,0.18)", color: "#C4B5FD", border: "1.5px solid rgba(167,139,250,0.45)" }}>
            🔷 {state.shards} shards
          </span>
        </div>

        {/* progress */}
        <div className="w-full max-w-md mt-3">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>
            <span>Set completion</span>
            <span>{pct}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden mt-1" style={{ background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.2)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg,#FFC800,#FF4B4B)" }} />
          </div>
          {pct === 100 && <p className="text-center text-sm font-black mt-1.5" style={{ color: "#FFD700" }}>👑 COMPLETE SET! You collected every creature!</p>}
        </div>

        {view === "pull" ? (
          <>
            {/* pack buttons */}
            <div className="flex items-stretch gap-2.5 mt-4 flex-wrap justify-center">
              <button
                onClick={() => doPull(false)}
                disabled={cooldownLeft > 0 || opening}
                className="btn-game btn-green px-6 py-4 text-base disabled:opacity-50 flex flex-col items-center"
              >
                <span>{opening ? "Opening…" : cooldownLeft > 0 ? `Next pack in ${Math.ceil(cooldownLeft / 1000)}s` : "🎁 Open free pack"}</span>
                <span className="text-[10px] font-black opacity-80">3 cards</span>
              </button>
              <button
                onClick={() => doPull(true)}
                disabled={state.shards < SHINY_COST || opening}
                className="btn-game px-6 py-4 text-base disabled:opacity-50 flex flex-col items-center text-white"
                style={{ background: "linear-gradient(140deg,#A560E8,#FF4B6E)", border: "2px solid rgba(255,255,255,0.4)" }}
              >
                <span>✨ Shiny pull</span>
                <span className="text-[10px] font-black opacity-85">Rare or better · {SHINY_COST} shards</span>
              </button>
            </div>

            {/* revealed cards */}
            {pulls3.length > 0 ? (
              <div key={revealKey} className={`grid gap-3 mt-5 ${pulls3.length === 1 ? "grid-cols-1" : "grid-cols-3"} w-full`}>
                {pulls3.map((c, i) => (
                  <div key={`${revealKey}-${i}`} className="card-in" style={{ animationDelay: `${i * 140}ms` }}>
                    <CreatureCard c={c} isNew={lastWasNew[i]} big={pulls3.length === 1} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-8 text-center">
                <p className="text-6xl animate-bounce" aria-hidden>🎁</p>
                <p className="font-display font-semibold text-white mt-2">28 creatures are hiding in the packs…</p>
                <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.55)" }}>
                  Duplicates melt into shards 🔷 — save up for guaranteed Shiny pulls!
                </p>
              </div>
            )}
            <p className="text-[11px] font-bold mt-4" style={{ color: "rgba(255,255,255,0.45)" }}>
              {state.pulls} cards pulled so far · odds: Legendary 4.5% · Epic 12% · Rare 28%
            </p>
          </>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-4 w-full pb-4">
            {CREATURES.map((c) => {
              const owned = (state.owned[c.id] ?? 0) > 0;
              return owned ? (
                <CreatureCard key={c.id} c={c} count={state.owned[c.id]} small />
              ) : (
                <div
                  key={c.id}
                  className="rounded-2xl flex flex-col items-center justify-center py-5"
                  style={{ background: "rgba(255,255,255,0.05)", border: "2px dashed rgba(255,255,255,0.18)" }}
                >
                  <span className="text-3xl" style={{ filter: "brightness(0) opacity(0.4)" }} aria-hidden>{c.emoji}</span>
                  <span className="font-display font-semibold text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>? ? ?</span>
                  <span className="text-[9px] font-black uppercase tracking-wide" style={{ color: RARITY_STYLE[c.rarity].color }}>{RARITY_STYLE[c.rarity].label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ArcadeShell>
  );
}

function CreatureCard({ c, isNew, count, big = false, small = false }: { c: Creature; isNew?: boolean; count?: number; big?: boolean; small?: boolean }) {
  const el = ELEMENTS[c.element];
  const rs = RARITY_STYLE[c.rarity];
  const maxStat = 130;
  const bar = (label: string, v: number) => (
    <div className="flex items-center gap-1">
      <span className="text-[8px] font-black w-6" style={{ color: "rgba(255,255,255,0.65)" }}>{label}</span>
      <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.35)" }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (v / maxStat) * 100)}%`, background: rs.color }} />
      </span>
      <span className="text-[9px] font-black tabular-nums text-white w-5 text-right">{v}</span>
    </div>
  );
  return (
    <div
      className="relative rounded-2xl overflow-hidden mx-auto w-full"
      style={{
        maxWidth: big ? 230 : undefined,
        background: `linear-gradient(165deg, ${el.from}, ${el.to})`,
        border: `2.5px solid ${rs.color}`,
        boxShadow: `0 10px 26px rgba(0,0,0,0.45), 0 0 ${c.rarity === "legendary" ? 26 : c.rarity === "epic" ? 16 : 0}px ${el.glow}`,
        padding: small ? 8 : 10,
      }}
    >
      {/* holo sweep for epic+ */}
      {(c.rarity === "epic" || c.rarity === "legendary") && (
        <span className="holo-sweep absolute inset-0 pointer-events-none" aria-hidden />
      )}
      {isNew && (
        <span className="absolute top-2 right-2 text-[9px] font-black px-2 py-0.5 rounded-full animate-bounce z-10" style={{ background: "#FFD700", color: "#5A3A00" }}>
          NEW!
        </span>
      )}
      {count && count > 1 && (
        <span className="absolute top-2 right-2 text-[9px] font-black px-2 py-0.5 rounded-full z-10" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
          ×{count}
        </span>
      )}
      <div className="flex items-center justify-between relative">
        <span className="font-display font-bold text-white leading-tight" style={{ fontSize: small ? 13 : 17, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
          {c.name}
        </span>
        <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md" style={{ background: "rgba(0,0,0,0.35)", color: "#fff" }}>
          {el.icon} {small ? "" : el.label}
        </span>
      </div>
      <div
        className="rounded-xl mt-1.5 flex items-center justify-center relative"
        style={{ background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.4), rgba(0,0,0,0.28) 75%)", padding: small ? 6 : 12 }}
      >
        <span style={{ fontSize: small ? 40 : big ? 84 : 58, lineHeight: 1.1, filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))" }} aria-hidden>
          {c.emoji}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1.5 relative">
        <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: rs.color, textShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
          {rs.stars} {rs.label}
        </span>
        <span className="text-[10px] font-black text-white/85">HP {c.hp}</span>
      </div>
      {!small && (
        <>
          <div className="flex flex-col gap-[3px] mt-1 relative">
            {bar("ATK", c.atk)}
            {bar("DEF", c.def)}
            {bar("SPD", c.spd)}
          </div>
          <p className="text-[10px] font-bold italic mt-1.5 leading-snug relative" style={{ color: "rgba(255,255,255,0.85)" }}>
            “{c.flavor}”
          </p>
        </>
      )}
    </div>
  );
}
