"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Gamepad2, History, Keyboard, Maximize, Pointer, RotateCcw, Search, Sparkles, Trophy, X } from "lucide-react";
import { MORE_GAMES, MORE_GAME_CATEGORIES, type MoreGame, type MoreGameCategory } from "@/lib/more-games";
import { getBest } from "@/lib/arcade";
import { soundEngine } from "@/lib/sound-effects";

/** The six premium from-scratch remakes (code-split, loaded on demand). */
const NATIVE_GAMES = {
  g2048: dynamic(() => import("@/components/games/G2048"), { ssr: false }),
  snake: dynamic(() => import("@/components/games/Snake"), { ssr: false }),
  flappy: dynamic(() => import("@/components/games/Flappy"), { ssr: false }),
  gems: dynamic(() => import("@/components/games/GemCrush"), { ssr: false }),
  breakout: dynamic(() => import("@/components/games/Breakout"), { ssr: false }),
  hopper: dynamic(() => import("@/components/games/SkyHopper"), { ssr: false }),
} as const;

const RECENT_KEY = "cipherclash_recent_games";
const FAV_KEY = "cipherclash_favorite_games";

function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function ControlsBadge({ controls }: { controls: MoreGame["controls"] }) {
  if (controls === "keyboard") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: "rgba(38,40,59,0.75)" }}>
        <Keyboard size={10} /> Keyboard
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: "rgba(38,40,59,0.75)" }}>
      <Pointer size={10} /> {controls === "touch" ? "Touch" : "Touch + Keys"}
    </span>
  );
}

export default function MoreGames({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"All" | MoreGameCategory>("All");
  const [playing, setPlaying] = useState<MoreGame | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => loadList(RECENT_KEY));
  const [favorites, setFavorites] = useState<string[]>(() => loadList(FAV_KEY));
  const [isTouch, setIsTouch] = useState(false);
  const [bestsTick, setBestsTick] = useState(0);
  const playerWrapRef = useRef<HTMLDivElement>(null);

  const closePlayer = useCallback(() => {
    setPlaying(null);
    setBestsTick((t) => t + 1); // refresh best-score chips after a remake run
  }, []);

  const featuredGames = useMemo(() => MORE_GAMES.filter((g) => g.featured), []);
  void bestsTick;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time environment probe
    setIsTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MORE_GAMES.filter(
      (g) =>
        (cat === "All" || g.category === cat) &&
        (!q || g.title.toLowerCase().includes(q) || g.blurb.toLowerCase().includes(q))
    );
  }, [query, cat]);

  const recentGames = useMemo(
    () => recent.map((slug) => MORE_GAMES.find((g) => g.slug === slug)).filter(Boolean) as MoreGame[],
    [recent]
  );

  const play = (game: MoreGame) => {
    soundEngine.playJoin();
    setPlaying(game);
    setReloadTick(0);
    const next = [game.slug, ...recent.filter((s) => s !== game.slug)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
  };

  const toggleFav = (game: MoreGame, e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.playTap(favorites.includes(game.slug) ? 420 : 760);
    const next = favorites.includes(game.slug)
      ? favorites.filter((s) => s !== game.slug)
      : [game.slug, ...favorites];
    setFavorites(next);
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(next));
    } catch {}
  };

  const goFullscreen = () => {
    soundEngine.playTap(620);
    playerWrapRef.current?.requestFullscreen?.().catch(() => {});
  };

  const tile = (g: MoreGame) => (
    <button
      key={g.slug}
      type="button"
      onClick={() => play(g)}
      className="card-game p-3 text-left active:scale-[0.97] transition-transform hover:-translate-y-0.5 relative"
    >
      <span
        className="w-full aspect-[4/3] rounded-2xl flex items-center justify-center text-[44px] leading-none relative overflow-hidden"
        style={{ background: g.color }}
        aria-hidden
      >
        {g.thumb ? (
          // eslint-disable-next-line @next/next/no-img-element -- static illustrated thumbnail
          <img src={g.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        ) : (
          <span className="drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)]">{g.emoji}</span>
        )}
        {g.native && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: "linear-gradient(90deg,#FF4B6E,#A560E8)" }}>
            <Sparkles size={10} /> Remake
          </span>
        )}
        <span className="absolute bottom-1.5 left-1.5">
          <ControlsBadge controls={g.controls} />
        </span>
        {g.native && getBest(g.native) > 0 && (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-md" style={{ background: "rgba(255,200,0,0.92)", color: "#5A3A00" }}>
            <Trophy size={10} /> {getBest(g.native).toLocaleString()}
          </span>
        )}
      </span>
      <span className="font-display font-semibold block leading-tight mt-2 pr-5">{g.title}</span>
      <span className="text-[11px] font-bold block leading-snug mt-0.5" style={{ color: "var(--ink-soft)" }}>
        {g.blurb}
      </span>
      <span
        role="button"
        aria-label={favorites.includes(g.slug) ? `Unfavorite ${g.title}` : `Favorite ${g.title}`}
        onClick={(e) => toggleFav(g, e)}
        className="absolute top-2.5 right-2.5 text-[17px] leading-none drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] active:scale-125 transition-transform"
      >
        {favorites.includes(g.slug) ? "⭐" : "☆"}
      </span>
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto px-3 sm:px-5 pb-16 animate-fade">
      <div
        className="flex items-center gap-2 py-3 sticky top-0 z-20"
        style={{ background: "color-mix(in srgb, var(--bg) 84%, transparent)", backdropFilter: "blur(10px)" }}
      >
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <h2 className="font-display font-bold text-2xl flex-1 flex items-center gap-2">
          <Gamepad2 size={24} style={{ color: "#FF4B6E" }} /> More Games
        </h2>
        <span className="chip px-2.5 py-1 text-[11px] font-black">{MORE_GAMES.length} games</span>
      </div>

      <p className="text-sm font-bold mb-3" style={{ color: "var(--ink-soft)" }}>
        A whole arcade inside Cipher Clash! 🎮 Pick a game and play instantly — no downloads, works offline after the first load.
      </p>

      {/* search + categories */}
      <div className="relative mb-2.5">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--ink-faint)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search games..."
          className="input-game w-full pl-10 pr-9 py-3 font-black"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full"
            style={{ background: "var(--surface-3)" }}
            aria-label="Clear search"
          >
            <X size={13} strokeWidth={3} />
          </button>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 mb-3">
        {MORE_GAME_CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => {
              setCat(c);
              soundEngine.playTap(520);
            }}
            className={`btn-game px-3.5 py-2 text-xs shrink-0 ${cat === c ? "btn-red" : "btn-ghost"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* featured remakes rail */}
      {cat === "All" && !query && (
        <div className="mb-5">
          <h3 className="font-display font-semibold flex items-center gap-1.5 mb-1">
            <Sparkles size={17} style={{ color: "#FF4B6E" }} /> Featured Remakes
            <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: "linear-gradient(90deg,#FF4B6E,#A560E8)" }}>Rebuilt ★</span>
          </h3>
          <p className="text-xs font-bold mb-2.5" style={{ color: "var(--ink-soft)" }}>
            Our six most-loved games, rebuilt from scratch — smoother, prettier, with high scores!
          </p>
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
            {featuredGames.map((g) => {
              const best = g.native ? getBest(g.native) : 0;
              return (
                <button
                  key={g.slug}
                  type="button"
                  onClick={() => play(g)}
                  className="card-game shrink-0 w-[218px] sm:w-[248px] p-2.5 text-left active:scale-[0.97] transition-transform hover:-translate-y-0.5 relative overflow-hidden"
                >
                  <span className="block w-full aspect-[16/10] rounded-2xl overflow-hidden relative" aria-hidden>
                    {g.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- static illustrated thumbnail
                      <img src={g.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-5xl" style={{ background: g.color }}>{g.emoji}</span>
                    )}
                    <span className="absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: "linear-gradient(90deg,#FF4B6E,#A560E8)" }}>
                      <Sparkles size={10} /> Remake
                    </span>
                    {best > 0 && (
                      <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md" style={{ background: "rgba(255,200,0,0.94)", color: "#5A3A00" }}>
                        <Trophy size={11} /> {best.toLocaleString()}
                      </span>
                    )}
                  </span>
                  <span className="font-display font-semibold block leading-tight mt-2">{g.title}</span>
                  <span className="text-[11px] font-bold block leading-snug mt-0.5" style={{ color: "var(--ink-soft)" }}>
                    {g.blurb.replace("REMAKE ★ ", "")}
                  </span>
                  <span className="btn-game btn-green inline-flex px-3.5 py-1.5 mt-2 text-xs">▶ Play</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* recently played */}
      {cat === "All" && !query && recentGames.length > 0 && (
        <div className="mb-4">
          <h3 className="font-display font-semibold flex items-center gap-1.5 mb-2">
            <History size={16} style={{ color: "var(--purple)" }} /> Recently played
          </h3>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {recentGames.map((g) => (
              <button
                key={g.slug}
                type="button"
                onClick={() => play(g)}
                className="card-game shrink-0 px-3 py-2 flex items-center gap-2 active:scale-95 transition-transform"
              >
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[19px]" style={{ background: g.color }} aria-hidden>
                  {g.emoji}
                </span>
                <span className="font-display font-semibold text-sm">{g.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* grid */}
      {filtered.length === 0 ? (
        <div className="card-game p-8 text-center">
          <p className="text-4xl mb-2" aria-hidden>🕹️</p>
          <p className="font-display font-semibold">No games match “{query}”</p>
          <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>Try another name — like “snake” or “puzzle”.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {(cat === "All" && !query ? filtered.filter((g) => !g.featured) : filtered).map(tile)}
        </div>
      )}

      <p className="text-center text-[11px] font-bold mt-8" style={{ color: "var(--ink-faint)" }}>
        Mini-games are community open-source creations, bundled here for offline fun.
        Each game keeps its own authors and credits.
      </p>

      {/* ----------------------- native remake player ----------------------- */}
      {playing?.native &&
        (() => {
          const NativeGame = NATIVE_GAMES[playing.native];
          return <NativeGame onBack={closePlayer} />;
        })()}

      {/* ---------------------------- iframe player ---------------------------- */}
      {playing && !playing.native && (
        <div className="fixed inset-0 z-[80] flex flex-col animate-fade" style={{ background: "#14152B" }}>
          <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{ background: "rgba(255,255,255,0.06)", borderBottom: "2px solid rgba(255,255,255,0.12)" }}>
            <button
              onClick={() => {
                soundEngine.playTap(420);
                closePlayer();
              }}
              className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#26283B", color: "#fff", border: "2px solid rgba(255,255,255,0.25)", boxShadow: "0 3px 0 rgba(0,0,0,0.4)" }}
              aria-label="Back to games"
            >
              <ArrowLeft size={19} strokeWidth={2.8} />
            </button>
            <span className="w-10 h-10 rounded-xl flex items-center justify-center text-[20px] shrink-0" style={{ background: playing.color }} aria-hidden>
              {playing.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-white leading-tight truncate">{playing.title}</p>
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.55)" }}>
                {playing.category}
              </p>
            </div>
            <button
              onClick={() => {
                soundEngine.playTap(560);
                setReloadTick((t) => t + 1);
              }}
              className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#26283B", color: "#fff", border: "2px solid rgba(255,255,255,0.25)", boxShadow: "0 3px 0 rgba(0,0,0,0.4)" }}
              title="Restart game"
            >
              <RotateCcw size={17} strokeWidth={2.7} />
            </button>
            <button
              onClick={goFullscreen}
              className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "#26283B", color: "#fff", border: "2px solid rgba(255,255,255,0.25)", boxShadow: "0 3px 0 rgba(0,0,0,0.4)" }}
              title="Full screen"
            >
              <Maximize size={17} strokeWidth={2.7} />
            </button>
          </div>

          {playing.controls === "keyboard" && isTouch && (
            <p className="text-center text-xs font-black px-3 py-2 shrink-0" style={{ background: "rgba(255,200,0,0.16)", color: "#FFD94D" }}>
              ⌨️ {playing.title} plays best with a keyboard — grab a laptop or pair one to your phone!
            </p>
          )}

          <div ref={playerWrapRef} className="flex-1 min-h-0" style={{ background: "#14152B" }}>
            <iframe
              key={`${playing.slug}-${reloadTick}`}
              src={`/games/${playing.slug}/index.html`}
              title={playing.title}
              className="w-full h-full block"
              style={{ border: "none", background: "#14152B" }}
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
              allow="fullscreen"
            />
          </div>
        </div>
      )}
    </div>
  );
}
