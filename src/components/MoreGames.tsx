"use client";

/**
 * The Cipher Clash Arcade ("More Games") — one unified dark theme from
 * browsing to playing: deep-navy surfaces, one gradient accent, identical
 * calm cards everywhere. All 23 games are now original in-app remakes
 * (code-split native components with illustrated thumbnails) — full-screen,
 * touch-first, and playable offline once loaded.
 *
 * Takes over the whole screen (fixed, 100dvh) so the big BACK pill is
 * always visible here and inside every game.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Heart, History, Search, Sparkles, Trophy, X } from "lucide-react";
import { MORE_GAMES, MORE_GAME_CATEGORIES, type MoreGame, type MoreGameCategory } from "@/lib/more-games";
import { getBest } from "@/lib/arcade";
import { soundEngine } from "@/lib/sound-effects";

/** All 23 premium from-scratch remakes (code-split, loaded on demand). */
const NATIVE_GAMES = {
  g2048: dynamic(() => import("@/components/games/G2048"), { ssr: false }),
  snake: dynamic(() => import("@/components/games/Snake"), { ssr: false }),
  flappy: dynamic(() => import("@/components/games/Flappy"), { ssr: false }),
  gems: dynamic(() => import("@/components/games/GemCrush"), { ssr: false }),
  breakout: dynamic(() => import("@/components/games/Breakout"), { ssr: false }),
  hopper: dynamic(() => import("@/components/games/SkyHopper"), { ssr: false }),
  dino: dynamic(() => import("@/components/games/DinoDash"), { ssr: false }),
  defender: dynamic(() => import("@/components/games/StarDefender"), { ssr: false }),
  mole: dynamic(() => import("@/components/games/MoleMania"), { ssr: false }),
  mines: dynamic(() => import("@/components/games/MineSweeper"), { ssr: false }),
  connect4: dynamic(() => import("@/components/games/ConnectFour"), { ssr: false }),
  blackjack: dynamic(() => import("@/components/games/Blackjack21"), { ssr: false }),
  pong: dynamic(() => import("@/components/games/NeonPong"), { ssr: false }),
  dash: dynamic(() => import("@/components/games/TurboDash"), { ssr: false }),
  wordle: dynamic(() => import("@/components/games/WordQuest"), { ssr: false }),
  sudoku: dynamic(() => import("@/components/games/SudokuMaster"), { ssr: false }),
  slide: dynamic(() => import("@/components/games/SlidePuzzle"), { ssr: false }),
  rps: dynamic(() => import("@/components/games/RockPaperScissors"), { ssr: false }),
  duel: dynamic(() => import("@/components/games/SamuraiDuel"), { ssr: false }),
  defense: dynamic(() => import("@/components/games/CastleDefense"), { ssr: false }),
  jigsaw: dynamic(() => import("@/components/games/JigsawJoy"), { ssr: false }),
  cards: dynamic(() => import("@/components/games/CreatureCards"), { ssr: false }),
  keys: dynamic(() => import("@/components/games/KeyTester"), { ssr: false }),
} as const;

const RECENT_KEY = "cipherclash_recent_games";
const FAV_KEY = "cipherclash_favorite_games";

/** The newest additions get a little "NEW" ribbon for a while. */
const NEW_SLUGS = new Set(["fighting-game", "tower-defense", "puzzle-game", "creature-cards", "key-codes"]);

/* ---------- unified theme tokens ---------- */
const ACCENT = "linear-gradient(120deg,#FF4B6E,#FF7A18)";
const CARD_BG = "rgba(255,255,255,0.055)";
const CARD_BORDER = "1.5px solid rgba(255,255,255,0.10)";
const SOFT = "rgba(255,255,255,0.62)";
const FAINT = "rgba(255,255,255,0.42)";
const TILE_ART = "linear-gradient(145deg,#2A2B52,#1C1D3D)";

function loadList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function BackPill({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="btn-game h-11 pl-3 pr-4 !rounded-2xl flex items-center gap-1 shrink-0 text-white"
      style={{
        background: ACCENT,
        border: "2px solid rgba(255,255,255,0.45)",
        boxShadow: "0 4px 0 rgba(0,0,0,0.4), 0 6px 18px rgba(255,75,110,0.45)",
      }}
      aria-label="Back"
    >
      <ArrowLeft size={21} strokeWidth={3.2} />
      <span className="text-[15px] font-black tracking-wide">BACK</span>
    </button>
  );
}

export default function MoreGames({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<"All" | MoreGameCategory>("All");
  const [playing, setPlaying] = useState<MoreGame | null>(null);
  const [recent, setRecent] = useState<string[]>(() => loadList(RECENT_KEY));
  const [favorites, setFavorites] = useState<string[]>(() => loadList(FAV_KEY));
  const [bestsTick, setBestsTick] = useState(0);

  const closePlayer = useCallback(() => {
    setPlaying(null);
    setBestsTick((t) => t + 1); // refresh best-score chips after a run
  }, []);
  void bestsTick;

  // lock page scroll while the arcade is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const isDefaultView = cat === "All" && !query.trim();

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
  const favoriteGames = useMemo(
    () => favorites.map((slug) => MORE_GAMES.find((g) => g.slug === slug)).filter(Boolean) as MoreGame[],
    [favorites]
  );

  const play = (game: MoreGame) => {
    soundEngine.playJoin();
    setPlaying(game);
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

  const bestOf = (g: MoreGame) => (g.native ? getBest(g.native) : 0);

  /** One identical card design for every game in the arcade. */
  const renderCard = (g: MoreGame) => {
    const best = bestOf(g);
    return (
      <button
        key={g.slug}
        type="button"
        onClick={() => play(g)}
        className="rounded-3xl p-2.5 text-left active:scale-[0.97] transition-transform hover:-translate-y-0.5 relative w-full"
        style={{ background: CARD_BG, border: CARD_BORDER, boxShadow: "0 6px 18px rgba(0,0,0,0.28)" }}
      >
        <span className="block w-full aspect-[16/10] rounded-2xl overflow-hidden relative" aria-hidden>
          {g.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- static illustrated thumbnail
            <img src={g.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-5xl" style={{ background: TILE_ART }}>
              <span className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]">{g.emoji}</span>
            </span>
          )}
          {NEW_SLUGS.has(g.slug) && (
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: ACCENT }}>
              <Sparkles size={10} /> New
            </span>
          )}
          {best > 0 && (
            <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 rounded-md" style={{ background: "rgba(255,200,0,0.94)", color: "#5A3A00" }}>
              <Trophy size={11} /> {best.toLocaleString()}
            </span>
          )}
        </span>
        <span className="font-display font-semibold block leading-tight mt-2 pr-5 text-white">{g.title}</span>
        <span className="text-[11px] font-bold block leading-snug mt-0.5" style={{ color: SOFT }}>
          {g.blurb.replace("REMAKE ★ ", "")}
        </span>
        <span className="btn-game inline-flex px-3.5 py-1.5 mt-2 text-xs text-white" style={{ background: "linear-gradient(120deg,#58CC02,#1F9D55)", border: "2px solid rgba(255,255,255,0.3)" }}>
          ▶ Play
        </span>
        <span
          role="button"
          aria-label={favorites.includes(g.slug) ? `Unfavorite ${g.title}` : `Favorite ${g.title}`}
          onClick={(e) => toggleFav(g, e)}
          className="absolute top-3.5 right-3.5 text-[17px] leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)] active:scale-125 transition-transform"
        >
          {favorites.includes(g.slug) ? "⭐" : "☆"}
        </span>
      </button>
    );
  };

  const quickRow = (games: MoreGame[], highlight = false) => (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {games.map((g) => (
        <button
          key={g.slug}
          type="button"
          onClick={() => play(g)}
          className="shrink-0 pl-1.5 pr-3 py-1.5 rounded-2xl flex items-center gap-2 active:scale-95 transition-transform"
          style={
            highlight
              ? { background: "rgba(251,113,133,0.12)", border: "1.5px solid rgba(251,113,133,0.35)" }
              : { background: CARD_BG, border: CARD_BORDER }
          }
        >
          {g.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- static illustrated thumbnail
            <img src={g.thumb} alt="" className="w-9 h-9 rounded-xl object-cover" loading="lazy" decoding="async" />
          ) : (
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[19px]" style={{ background: TILE_ART }} aria-hidden>
              {g.emoji}
            </span>
          )}
          <span className="font-display font-semibold text-sm text-white">{g.title}</span>
          <span aria-hidden>▶</span>
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col animate-fade"
      style={{ background: "linear-gradient(180deg,#171838 0%,#101124 55%,#0D0D20 100%)", height: "100dvh", color: "#fff" }}
    >
      {/* ---------- header: big back pill, always visible ---------- */}
      <div
        className="relative z-30 shrink-0 px-3 sm:px-5"
        style={{
          background: "rgba(16,17,38,0.92)",
          borderBottom: "2px solid rgba(255,255,255,0.10)",
          paddingTop: "max(10px, env(safe-area-inset-top))",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-2.5 pb-2.5">
            <BackPill
              onClick={() => {
                soundEngine.playTap(420);
                onBack();
              }}
            />
            <div className="flex-1 min-w-0">
              <h2 className="font-display font-bold text-[22px] leading-tight truncate">🎮 Arcade</h2>
              <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: FAINT }}>
                Cipher Clash · More Games
              </p>
            </div>
            <span className="chip px-2.5 py-1 text-[11px] font-black shrink-0" style={{ background: "rgba(255,255,255,0.09)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.18)" }}>
              {MORE_GAMES.length} games
            </span>
          </div>

          {/* search */}
          <div className="relative mb-2.5">
            <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: FAINT }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search games..."
              className="w-full pl-10 pr-10 py-3 rounded-2xl font-black text-white outline-none"
              style={{ background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.14)" }}
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full text-white"
                style={{ background: "rgba(255,255,255,0.16)" }}
                aria-label="Clear search"
              >
                <X size={13} strokeWidth={3} />
              </button>
            )}
          </div>

          {/* categories — one calm style */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-2.5">
            {MORE_GAME_CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCat(c);
                  soundEngine.playTap(520);
                }}
                className="btn-game px-3.5 py-2 text-xs shrink-0 text-white"
                style={
                  cat === c
                    ? { background: ACCENT, border: "2px solid rgba(255,255,255,0.4)", boxShadow: "0 3px 0 rgba(0,0,0,0.35)" }
                    : { background: "rgba(255,255,255,0.08)", border: "2px solid rgba(255,255,255,0.14)" }
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---------- scrollable catalog ---------- */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 pt-4 pb-14">
          {isDefaultView ? (
            <>
              {favoriteGames.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-display font-semibold flex items-center gap-1.5 mb-2 text-white">
                    <Heart size={16} style={{ color: "#FB7185" }} fill="#FB7185" /> Your favorites
                  </h3>
                  {quickRow(favoriteGames, true)}
                </div>
              )}

              {recentGames.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-display font-semibold flex items-center gap-1.5 mb-2 text-white">
                    <History size={16} style={{ color: "#C4B5FD" }} /> Recently played
                  </h3>
                  {quickRow(recentGames)}
                </div>
              )}

              <div>
                <h3 className="font-display font-semibold flex items-center gap-1.5 text-white">
                  <Sparkles size={17} style={{ color: "#FF8A5C" }} /> All games
                  <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: ACCENT }}>
                    23 remakes ★
                  </span>
                </h3>
                <p className="text-xs font-bold mt-0.5 mb-2.5" style={{ color: SOFT }}>
                  Every game rebuilt from scratch for Cipher Clash — full-screen, touch-friendly, with high scores to chase.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {MORE_GAMES.map(renderCard)}
                </div>
              </div>
            </>
          ) : filtered.length === 0 ? (
            <div className="rounded-3xl p-8 text-center" style={{ background: CARD_BG, border: CARD_BORDER }}>
              <p className="text-4xl mb-2" aria-hidden>🕹️</p>
              <p className="font-display font-semibold text-white">No games match “{query}”</p>
              <p className="text-xs font-bold" style={{ color: SOFT }}>Try another name — like “snake” or “puzzle”.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {filtered.map(renderCard)}
            </div>
          )}

          <p className="text-center text-[11px] font-bold mt-9" style={{ color: FAINT }}>
            All 23 arcade games are original Cipher Clash creations — built in-house,
            playable offline after the first load, on any screen.
          </p>
        </div>
      </div>

      {/* --------------------------- native player --------------------------- */}
      {playing?.native &&
        (() => {
          const NativeGame = NATIVE_GAMES[playing.native];
          return <NativeGame onBack={closePlayer} />;
        })()}
    </div>
  );
}
