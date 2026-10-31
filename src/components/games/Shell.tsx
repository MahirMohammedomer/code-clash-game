"use client";

/**
 * Shared chrome for the premium arcade remakes:
 * branded header with a big friendly BACK button (returns to the arcade),
 * live score + best, sound toggle, restart — and a reusable game-over card.
 * All six rebuilt games use it so the experience feels like one product.
 */

import React, { useState } from "react";
import { ArrowLeft, RotateCcw, Trophy, Volume2, VolumeX } from "lucide-react";
import { arcadeMuted, setArcadeMuted, sfx } from "@/lib/arcade-sound";
import "./games.css";

const headerBtn: React.CSSProperties = {
  background: "rgba(255,255,255,0.10)",
  color: "#fff",
  border: "2px solid rgba(255,255,255,0.25)",
  boxShadow: "0 3px 0 rgba(0,0,0,0.35)",
};

export function ArcadeShell({
  title,
  emoji,
  color,
  score,
  scoreLabel = "Score",
  best,
  onBack,
  onRestart,
  children,
  footer,
}: {
  title: string;
  emoji: string;
  color: string;
  score: number;
  scoreLabel?: string;
  best: number;
  onBack: () => void;
  onRestart: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [isMuted, setIsMuted] = useState(arcadeMuted());

  return (
    <div className="fixed inset-0 z-[85] flex flex-col animate-fade select-none" style={{ background: "#14152B" }}>
      {/* header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 shrink-0"
        style={{ background: "rgba(255,255,255,0.06)", borderBottom: "2px solid rgba(255,255,255,0.12)" }}
      >
        <button
          onClick={() => {
            sfx.click();
            onBack();
          }}
          className="btn-game h-10 px-3 !rounded-xl flex items-center gap-1.5 shrink-0"
          style={headerBtn}
          aria-label="Back to Cipher Clash arcade"
        >
          <ArrowLeft size={18} strokeWidth={3} />
          <span className="text-sm font-black">Back</span>
        </button>

        <span className="hidden sm:flex w-10 h-10 rounded-xl items-center justify-center text-[20px] shrink-0" style={{ background: color }} aria-hidden>
          {emoji}
        </span>
        <div className="min-w-0 hidden xs:block sm:block">
          <p className="font-display font-semibold text-white leading-tight truncate">{title}</p>
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
            Cipher Clash Arcade
          </p>
        </div>

        <div className="flex-1" />

        <div className="text-right shrink-0 mr-1">
          <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>{scoreLabel}</p>
          <p className="font-display font-bold text-white text-lg leading-none tabular-nums">{score.toLocaleString()}</p>
        </div>
        <div
          className="shrink-0 rounded-xl px-2.5 py-1.5 text-right"
          style={{ background: "rgba(255,200,0,0.14)", border: "2px solid rgba(255,200,0,0.35)" }}
        >
          <p className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1" style={{ color: "#FFD94D" }}>
            <Trophy size={9} strokeWidth={3} /> Best
          </p>
          <p className="font-display font-bold text-base leading-none tabular-nums" style={{ color: "#FFE27A" }}>
            {Math.max(best, score).toLocaleString()}
          </p>
        </div>

        <button
          onClick={() => {
            const m = !isMuted;
            setArcadeMuted(m);
            setIsMuted(m);
            if (!m) sfx.click();
          }}
          className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center shrink-0"
          style={headerBtn}
          aria-label={isMuted ? "Unmute sounds" : "Mute sounds"}
        >
          {isMuted ? <VolumeX size={17} strokeWidth={2.7} /> : <Volume2 size={17} strokeWidth={2.7} />}
        </button>
        <button
          onClick={() => {
            sfx.click();
            onRestart();
          }}
          className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center shrink-0"
          style={headerBtn}
          aria-label="Restart game"
        >
          <RotateCcw size={17} strokeWidth={2.7} />
        </button>
      </div>

      {/* play area */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center relative overflow-hidden">{children}</div>

      {footer && <div className="shrink-0 px-3 pb-3 pt-1">{footer}</div>}
    </div>
  );
}

export function GameOverCard({
  title = "Game Over",
  score,
  scoreLabel = "Score",
  best,
  isNewBest,
  extra,
  onRestart,
  onBack,
}: {
  title?: string;
  score: number;
  scoreLabel?: string;
  best: number;
  isNewBest: boolean;
  extra?: React.ReactNode;
  onRestart: () => void;
  onBack: () => void;
}) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center p-4" style={{ background: "rgba(16,17,38,0.68)", backdropFilter: "blur(3px)" }}>
      <div className="card-game w-full max-w-xs p-5 text-center animate-pop" style={{ background: "#23243F", borderColor: "rgba(255,255,255,0.18)", color: "#fff" }}>
        <p className="text-4xl mb-1" aria-hidden>{isNewBest ? "🏆" : "🎮"}</p>
        <h3 className="font-display font-bold text-2xl leading-tight">{title}</h3>
        {isNewBest && (
          <p className="inline-block mt-1.5 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full animate-bounce" style={{ background: "#FFC800", color: "#5A3A00" }}>
            ⭐ New best!
          </p>
        )}
        <div className="flex justify-center gap-6 mt-4 mb-1">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>{scoreLabel}</p>
            <p className="font-display font-bold text-3xl tabular-nums">{score.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>Best</p>
            <p className="font-display font-bold text-3xl tabular-nums" style={{ color: "#FFE27A" }}>{best.toLocaleString()}</p>
          </div>
        </div>
        {extra}
        <button onClick={onRestart} className="btn-game btn-green w-full py-3.5 mt-3 text-base">
          ▶ Play again
        </button>
        <button
          onClick={onBack}
          className="btn-game w-full py-3 mt-2"
          style={{ background: "rgba(255,255,255,0.10)", color: "#fff", border: "2px solid rgba(255,255,255,0.25)", boxShadow: "0 3px 0 rgba(0,0,0,0.35)" }}
        >
          ← Back to games
        </button>
      </div>
    </div>
  );
}

/** Small "tap to start" overlay used by the canvas games. */
export function StartHint({ emoji, title, hint, onStart }: { emoji: string; title: string; hint: string; onStart: () => void }) {
  return (
    <button
      type="button"
      onClick={onStart}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 p-4 text-center"
      style={{ background: "rgba(16,17,38,0.45)" }}
    >
      <span className="text-6xl animate-bounce" aria-hidden>{emoji}</span>
      <span className="font-display font-bold text-3xl text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">{title}</span>
      <span className="text-sm font-black px-3 py-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.92)", color: "#26283B" }}>
        {hint}
      </span>
    </button>
  );
}
