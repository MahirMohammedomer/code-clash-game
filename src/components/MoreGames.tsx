"use client";

/**
 * The Cipher Clash Arcade ("More Games") — one unified dark theme from
 * browsing to playing: deep-navy surfaces, one gradient accent, identical
 * calm cards everywhere. Features our eighteen from-scratch premium remakes
 * (native in-app games with illustrated thumbnails) plus the community
 * mini-games bundled under /public/games/. Keyboard-only classics get an
 * on-screen touch gamepad (TouchPad below) so every game works on phones.
 *
 * It takes over the whole screen (fixed, 100dvh) so the big BACK pill is
 * always visible — here, in the iframe player, and inside every remake.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, Gamepad2, Heart, History, Maximize, Pointer, RotateCcw, Search, Sparkles, Trophy, X } from "lucide-react";
import { MORE_GAMES, MORE_GAME_CATEGORIES, type MoreGame, type MoreGameCategory } from "@/lib/more-games";
import { getBest } from "@/lib/arcade";
import { soundEngine } from "@/lib/sound-effects";

/** The twelve premium from-scratch remakes (code-split, loaded on demand). */
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
} as const;

const RECENT_KEY = "cipherclash_recent_games";
const FAV_KEY = "cipherclash_favorite_games";

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

function ControlsBadge({ game }: { game: MoreGame }) {
  const { controls } = game;
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white"
      style={{ background: "rgba(10,10,25,0.62)", backdropFilter: "blur(2px)" }}
    >
      {controls === "keyboard" ? <Gamepad2 size={10} /> : <Pointer size={10} />}
      {controls === "keyboard" ? "Touch pad" : controls === "touch" ? "Touch" : "Touch + Keys"}
    </span>
  );
}

function BackPill({ onClick, label = "BACK" }: { onClick: () => void; label?: string }) {
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
      <span className="text-[15px] font-black tracking-wide">{label}</span>
    </button>
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
  const [showPad, setShowPad] = useState(false);
  const playerWrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const closePlayer = useCallback(() => {
    setPlaying(null);
    setBestsTick((t) => t + 1); // refresh best-score chips after a remake run
  }, []);
  void bestsTick;

  // lock page scroll & probe touch once
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time environment probe
    setIsTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const featuredGames = useMemo(() => MORE_GAMES.filter((g) => g.featured), []);
  const communityGames = useMemo(() => MORE_GAMES.filter((g) => !g.featured), []);
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
    setReloadTick(0);
    // keyboard-only classics get the on-screen pad automatically on phones
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    setShowPad(!game.native && game.controls === "keyboard" && coarse);
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

  const bestOf = (g: MoreGame) => (g.native ? getBest(g.native) : 0);

  /** One identical card design for every game in the arcade. */
  const renderCard = (g: MoreGame, large: boolean) => {
    const best = bestOf(g);
    return (
      <button
        key={g.slug}
        type="button"
        onClick={() => play(g)}
        className="rounded-3xl p-2.5 text-left active:scale-[0.97] transition-transform hover:-translate-y-0.5 relative w-full"
        style={{ background: CARD_BG, border: CARD_BORDER, boxShadow: "0 6px 18px rgba(0,0,0,0.28)" }}
      >
        <span className={`block w-full ${large ? "aspect-[16/10]" : "aspect-[4/3]"} rounded-2xl overflow-hidden relative`} aria-hidden>
          {g.thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- static illustrated thumbnail
            <img src={g.thumb} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-5xl" style={{ background: TILE_ART }}>
              <span className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.5)]">{g.emoji}</span>
            </span>
          )}
          {g.native && (
            <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md text-white" style={{ background: ACCENT }}>
              <Sparkles size={10} /> Remake
            </span>
          )}
          <span className="absolute bottom-1.5 left-1.5">
            <ControlsBadge game={g} />
          </span>
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
        {large && (
          <span className="btn-game inline-flex px-3.5 py-1.5 mt-2 text-xs text-white" style={{ background: "linear-gradient(120deg,#58CC02,#1F9D55)", border: "2px solid rgba(255,255,255,0.3)" }}>
            ▶ Play
          </span>
        )}
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
              {/* favorites — one-tap access to starred games */}
              {favoriteGames.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-display font-semibold flex items-center gap-1.5 mb-2 text-white">
                    <Heart size={16} style={{ color: "#FB7185" }} fill="#FB7185" /> Your favorites
                  </h3>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {favoriteGames.map((g) => (
                      <button
                        key={g.slug}
                        type="button"
                        onClick={() => play(g)}
                        className="shrink-0 pl-1.5 pr-3 py-1.5 rounded-2xl flex items-center gap-2 active:scale-95 transition-transform"
                        style={{ background: "rgba(251,113,133,0.12)", border: "1.5px solid rgba(251,113,133,0.35)" }}
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
                </div>
              )}

              {/* recently played */}
              {recentGames.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-display font-semibold flex items-center gap-1.5 mb-2 text-white">
                    <History size={16} style={{ color: "#C4B5FD" }} /> Recently played
                  </h3>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    {recentGames.map((g) => (
                      <button
                        key={g.slug}
                        type="button"
                        onClick={() => play(g)}
                        className="shrink-0 pl-1.5 pr-3 py-1.5 rounded-2xl flex items-center gap-2 active:scale-95 transition-transform"
                        style={{ background: CARD_BG, border: CARD_BORDER }}
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
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* featured remakes — calm grid, one card style */}
              <div className="mb-7">
                <h3 className="font-display font-semibold flex items-center gap-1.5 text-white">
                  <Sparkles size={17} style={{ color: "#FF8A5C" }} /> Featured Remakes
                  <span className="text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white" style={{ background: ACCENT }}>
                    12 rebuilt ★
                  </span>
                </h3>
                <p className="text-xs font-bold mt-0.5 mb-2.5" style={{ color: SOFT }}>
                  Our most-loved games, rebuilt from scratch — full-screen, smooth and shiny, with high scores to chase.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {featuredGames.map((g) => renderCard(g, true))}
                </div>
              </div>

              {/* community classics */}
              <div>
                <h3 className="font-display font-semibold flex items-center gap-1.5 text-white">🕹️ Community Classics</h3>
                <p className="text-xs font-bold mt-0.5 mb-2.5" style={{ color: SOFT }}>
                  More mini-games from the collection — tap any to play instantly.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {communityGames.map((g) => renderCard(g, false))}
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
              {filtered.map((g) => renderCard(g, !!g.featured))}
            </div>
          )}

          <p className="text-center text-[11px] font-bold mt-9" style={{ color: FAINT }}>
            The 12 Featured Remakes are original Cipher Clash creations. Community Classics are
            open-source mini-games bundled for offline fun — each keeps its own authors and credits.
          </p>
        </div>
      </div>

      {/* ----------------------- native remake player ----------------------- */}
      {playing?.native &&
        (() => {
          const NativeGame = NATIVE_GAMES[playing.native];
          return <NativeGame onBack={closePlayer} />;
        })()}

      {/* ---------------------------- iframe player ---------------------------- */}
      {playing && !playing.native && (
        <div className="fixed inset-0 z-[80] flex flex-col animate-fade" style={{ background: "#14152B", height: "100dvh" }}>
          <div
            className="relative z-40 flex items-center gap-2 px-3 shrink-0"
            style={{
              background: "rgba(20,21,43,0.96)",
              borderBottom: "2px solid rgba(255,255,255,0.12)",
              paddingTop: "max(8px, env(safe-area-inset-top))",
              paddingBottom: 8,
            }}
          >
            <BackPill
              onClick={() => {
                soundEngine.playTap(420);
                closePlayer();
              }}
            />
            <span className="w-10 h-10 rounded-xl hidden sm:flex items-center justify-center text-[20px] shrink-0" style={{ background: TILE_ART }} aria-hidden>
              {playing.emoji}
            </span>
            <div className="flex-1 min-w-0">
              <p className="font-display font-semibold text-white leading-tight truncate">{playing.title}</p>
              <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: FAINT }}>
                {playing.category}
              </p>
            </div>
            <button
              onClick={() => {
                soundEngine.playTap(560);
                setReloadTick((t) => t + 1);
              }}
              className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center shrink-0 text-white"
              style={{ background: "rgba(255,255,255,0.09)", border: "2px solid rgba(255,255,255,0.2)", boxShadow: "0 3px 0 rgba(0,0,0,0.35)" }}
              title="Restart game"
            >
              <RotateCcw size={17} strokeWidth={2.7} />
            </button>
            <button
              onClick={goFullscreen}
              className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center shrink-0 text-white"
              style={{ background: "rgba(255,255,255,0.09)", border: "2px solid rgba(255,255,255,0.2)", boxShadow: "0 3px 0 rgba(0,0,0,0.35)" }}
              title="Full screen"
            >
              <Maximize size={17} strokeWidth={2.7} />
            </button>
            {playing.controls === "keyboard" && (
              <button
                onClick={() => {
                  soundEngine.playTap(560);
                  setShowPad((v) => !v);
                }}
                className="btn-game h-10 px-2.5 !rounded-xl flex items-center gap-1 shrink-0 text-white text-[11px] font-black"
                style={
                  showPad
                    ? { background: ACCENT, border: "2px solid rgba(255,255,255,0.4)", boxShadow: "0 3px 0 rgba(0,0,0,0.35)" }
                    : { background: "rgba(255,255,255,0.09)", border: "2px solid rgba(255,255,255,0.2)", boxShadow: "0 3px 0 rgba(0,0,0,0.35)" }
                }
                title="Toggle on-screen gamepad"
              >
                <Gamepad2 size={17} strokeWidth={2.7} /> PAD
              </button>
            )}
          </div>

          {playing.controls === "keyboard" && isTouch && showPad && (
            <p className="text-center text-xs font-black px-3 py-2 shrink-0" style={{ background: "rgba(88,204,2,0.16)", color: "#B5E048" }}>
              🎮 Touch pad on — use the buttons at the bottom to play! (PAD button hides it)
            </p>
          )}

          <div ref={playerWrapRef} className="flex-1 min-h-0 relative" style={{ background: "#14152B" }}>
            <iframe
              ref={iframeRef}
              key={`${playing.slug}-${reloadTick}`}
              src={`/games/${playing.slug}/index.html`}
              title={playing.title}
              className="w-full h-full block"
              style={{ border: "none", background: "#14152B" }}
              sandbox="allow-scripts allow-same-origin allow-pointer-lock"
              allow="fullscreen"
            />
            {showPad && <TouchPad mode={playing.pad ?? "arrows"} iframeRef={iframeRef} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ on-screen gamepad ============================ */

interface KeyDef { key: string; code: string; keyCode: number }
const KEYS: Record<string, KeyDef> = {
  left: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
  up: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
  right: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
  down: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
  a: { key: "a", code: "KeyA", keyCode: 65 },
  d: { key: "d", code: "KeyD", keyCode: 68 },
  w: { key: "w", code: "KeyW", keyCode: 87 },
  s: { key: "s", code: "KeyS", keyCode: 83 },
  space: { key: " ", code: "Space", keyCode: 32 },
  enter: { key: "Enter", code: "Enter", keyCode: 13 },
};

function dispatchKey(iframe: HTMLIFrameElement | null, type: "keydown" | "keyup", def: KeyDef) {
  const win = iframe?.contentWindow;
  if (!win) return;
  const make = () => {
    const ev = new KeyboardEvent(type, { key: def.key, code: def.code, bubbles: true, cancelable: true });
    try {
      Object.defineProperty(ev, "keyCode", { get: () => def.keyCode });
      Object.defineProperty(ev, "which", { get: () => def.keyCode });
    } catch {}
    return ev;
  };
  try {
    win.dispatchEvent(make());
    win.document?.dispatchEvent(make());
  } catch {}
}

/**
 * Translucent touch buttons that play keyboard-only bundled games on phones
 * by sending real key events into the (same-origin) game iframe.
 * "arrows": D-pad (arrows + WASD together) + SPACE + ENTER.
 * "dual": two mini-pads — left = WASD+Space (player 1), right = arrows (player 2).
 */
function PadButton({
  defs,
  repeat = true,
  iframeRef,
  className,
  style,
  label,
  children,
}: {
  defs: KeyDef[];
  repeat?: boolean;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  className?: string;
  style?: React.CSSProperties;
  label: string;
  children: React.ReactNode;
}) {
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (ivRef.current) clearInterval(ivRef.current);
    };
  }, []);

  const release = () => {
    if (ivRef.current) {
      clearInterval(ivRef.current);
      ivRef.current = null;
    }
    for (const d of defs) dispatchKey(iframeRef.current, "keyup", d);
  };

  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        for (const d of defs) dispatchKey(iframeRef.current, "keydown", d);
        if (repeat) {
          ivRef.current = setInterval(() => {
            for (const d of defs) dispatchKey(iframeRef.current, "keydown", d);
          }, 120);
        }
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

function TouchPad({ mode, iframeRef }: { mode: "arrows" | "dual"; iframeRef: React.RefObject<HTMLIFrameElement | null> }) {
  const btn: React.CSSProperties = {
    background: "rgba(20,21,43,0.55)",
    border: "2px solid rgba(255,255,255,0.4)",
    boxShadow: "0 3px 0 rgba(0,0,0,0.45)",
    backdropFilter: "blur(2px)",
    color: "#fff",
    touchAction: "none",
    userSelect: "none",
    WebkitUserSelect: "none",
  };
  const dirBtn = "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black active:scale-95";
  const atkBtn = "w-14 h-14 rounded-full flex items-center justify-center text-xl active:scale-95";
  const atkStyle: React.CSSProperties = { ...btn, background: "rgba(255,75,110,0.6)" };

  if (mode === "dual") {
    return (
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-3 pointer-events-none" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        {/* Player 1: A/D move, W jump, SPACE attack */}
        <div className="flex flex-col items-center gap-1.5 pointer-events-auto">
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(28,176,246,0.35)", color: "#BFDBFE" }}>Player 1</span>
          <div className="flex items-center gap-1.5">
            <PadButton defs={[KEYS.a]} iframeRef={iframeRef} className={dirBtn} style={btn} label="P1 left">◀</PadButton>
            <div className="flex flex-col gap-1.5">
              <PadButton defs={[KEYS.w]} repeat={false} iframeRef={iframeRef} className={dirBtn} style={btn} label="P1 jump">▲</PadButton>
              <PadButton defs={[KEYS.space]} repeat={false} iframeRef={iframeRef} className={atkBtn} style={atkStyle} label="P1 attack">⚔️</PadButton>
            </div>
            <PadButton defs={[KEYS.d]} iframeRef={iframeRef} className={dirBtn} style={btn} label="P1 right">▶</PadButton>
          </div>
        </div>
        {/* Player 2: arrows move/jump, down attacks */}
        <div className="flex flex-col items-center gap-1.5 pointer-events-auto">
          <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,75,110,0.35)", color: "#FECDD3" }}>Player 2</span>
          <div className="flex items-center gap-1.5">
            <PadButton defs={[KEYS.left]} iframeRef={iframeRef} className={dirBtn} style={btn} label="P2 left">◀</PadButton>
            <div className="flex flex-col gap-1.5">
              <PadButton defs={[KEYS.up]} repeat={false} iframeRef={iframeRef} className={dirBtn} style={btn} label="P2 jump">▲</PadButton>
              <PadButton defs={[KEYS.down]} repeat={false} iframeRef={iframeRef} className={atkBtn} style={atkStyle} label="P2 attack">⚔️</PadButton>
            </div>
            <PadButton defs={[KEYS.right]} iframeRef={iframeRef} className={dirBtn} style={btn} label="P2 right">▶</PadButton>
          </div>
        </div>
      </div>
    );
  }

  // arrows mode: D-pad sends arrows AND WASD (games vary), plus SPACE / ENTER
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex items-end justify-between p-3 pointer-events-none" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      <div className="flex items-center gap-1.5 pointer-events-auto">
        <PadButton defs={[KEYS.left, KEYS.a]} iframeRef={iframeRef} className={dirBtn} style={btn} label="Left">◀</PadButton>
        <div className="flex flex-col gap-1.5">
          <PadButton defs={[KEYS.up, KEYS.w]} iframeRef={iframeRef} className={dirBtn} style={btn} label="Up">▲</PadButton>
          <PadButton defs={[KEYS.down, KEYS.s]} iframeRef={iframeRef} className={dirBtn} style={btn} label="Down">▼</PadButton>
        </div>
        <PadButton defs={[KEYS.right, KEYS.d]} iframeRef={iframeRef} className={dirBtn} style={btn} label="Right">▶</PadButton>
      </div>
      <div className="flex items-end gap-2 pointer-events-auto">
        <PadButton defs={[KEYS.enter]} repeat={false} iframeRef={iframeRef} className="w-14 h-14 rounded-full flex flex-col items-center justify-center active:scale-95" style={{ ...btn, background: "rgba(255,200,0,0.55)" }} label="Enter">
          <span className="text-base leading-none">⏎</span>
          <span className="text-[7px] font-black">ENTER</span>
        </PadButton>
        <PadButton defs={[KEYS.space]} iframeRef={iframeRef} className="w-[76px] h-[76px] rounded-full flex flex-col items-center justify-center active:scale-95" style={{ ...btn, background: "rgba(88,204,2,0.6)" }} label="Space / action">
          <span className="text-2xl leading-none">●</span>
          <span className="text-[8px] font-black">SPACE</span>
        </PadButton>
      </div>
    </div>
  );
}
