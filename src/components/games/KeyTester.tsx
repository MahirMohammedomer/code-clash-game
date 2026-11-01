"use client";

/**
 * Key Tester — original from-scratch keyboard inspector.
 * Press any key (or tap the on-screen keyboard) to reveal its secret codes:
 * the modern `key` and `code`, plus the classic `keyCode`. Keeps a history
 * and tracks how many different keys you've ever discovered.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

interface KeyInfo {
  key: string;
  code: string;
  keyCode: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  at: number;
}

const FOUND_KEY = "arcade_keys_found_v1";

function loadFound(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(FOUND_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const ROWS: { label: string; key: string; code: string; keyCode: number; wide?: boolean }[][] = [
  "1234567890".split("").map((d, i) => ({ label: d, key: d, code: `Digit${d}`, keyCode: 48 + i })),
  "QWERTYUIOP".split("").map((ch) => ({ label: ch, key: ch.toLowerCase(), code: `Key${ch}`, keyCode: ch.charCodeAt(0) })),
  "ASDFGHJKL".split("").map((ch) => ({ label: ch, key: ch.toLowerCase(), code: `Key${ch}`, keyCode: ch.charCodeAt(0) })),
  [
    { label: "⇧ Shift", key: "Shift", code: "ShiftLeft", keyCode: 16, wide: true },
    ..."ZXCVBNM".split("").map((ch) => ({ label: ch, key: ch.toLowerCase(), code: `Key${ch}`, keyCode: ch.charCodeAt(0) })),
    { label: "⌫", key: "Backspace", code: "Backspace", keyCode: 8, wide: true },
  ],
  [
    { label: "←", key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    { label: "↑", key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    { label: "↓", key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    { label: "→", key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    { label: "SPACE", key: " ", code: "Space", keyCode: 32, wide: true },
    { label: "⏎ Enter", key: "Enter", code: "Enter", keyCode: 13, wide: true },
    { label: "Esc", key: "Escape", code: "Escape", keyCode: 27 },
    { label: "⇥ Tab", key: "Tab", code: "Tab", keyCode: 9, wide: true },
  ],
];

function prettyKey(k: string): string {
  if (k === " ") return "␣ Space";
  if (k === "ArrowLeft") return "← Left";
  if (k === "ArrowRight") return "→ Right";
  if (k === "ArrowUp") return "↑ Up";
  if (k === "ArrowDown") return "↓ Down";
  return k.length === 1 ? k.toUpperCase() : k;
}

export default function KeyTester({ onBack }: { onBack: () => void }) {
  const [last, setLast] = useState<KeyInfo | null>(null);
  const [history, setHistory] = useState<KeyInfo[]>([]);
  const [presses, setPresses] = useState(0);
  const [found, setFound] = useState<string[]>(() => loadFound());
  const [best, setBest] = useState(() => getBest("keys"));
  const [activeCode, setActiveCode] = useState<string>("");
  const [justFound, setJustFound] = useState<string | null>(null);

  const foundRef = useRef(found);
  const seqRef = useRef(0);
  useEffect(() => { foundRef.current = found; }, [found]);

  useEffect(() => { bumpPlays("keys"); }, []);

  const register = useCallback((raw: Omit<KeyInfo, "at">) => {
    const info: KeyInfo = { ...raw, at: ++seqRef.current };
    setLast(info);
    setHistory((h) => [info, ...h].slice(0, 14));
    setPresses((p) => p + 1);
    setActiveCode(info.code);
    sfx.pop(0.9 + Math.min(0.8, info.keyCode / 160));

    if (!foundRef.current.includes(info.code)) {
      const next = [...foundRef.current, info.code];
      foundRef.current = next;
      setFound(next);
      try { localStorage.setItem(FOUND_KEY, JSON.stringify(next)); } catch {}
      const res = submitScore("keys", next.length);
      setBest(res.best);
      setJustFound(info.code);
      setTimeout(() => setJustFound(null), 1500);
      sfx.golden();
    }
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Tab" || e.key.startsWith("Arrow") || e.key === " ") e.preventDefault();
      register({
        key: e.key,
        code: e.code || "(unknown)",
        keyCode: e.keyCode || e.which || 0,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
      });
    };
    const up = () => setTimeout(() => setActiveCode(""), 120);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [register]);

  const tapKey = (def: { key: string; code: string; keyCode: number }) => {
    register({ key: def.key, code: def.code, keyCode: def.keyCode, shift: false, ctrl: false, alt: false });
    setTimeout(() => setActiveCode(""), 180);
  };

  const restart = useCallback(() => {
    setLast(null);
    setHistory([]);
    setPresses(0);
    setActiveCode("");
    sfx.click();
  }, []);

  const TOTAL_POSSIBLE = ROWS.flat().length + 30; // on-screen keys + extra physical ones

  return (
    <ArcadeShell
      title="Key Tester"
      emoji="⌨️"
      color="linear-gradient(135deg,#64748B,#334155)"
      score={found.length}
      scoreLabel="Keys found"
      best={best}
      onBack={onBack}
      onRestart={restart}
    >
      <div className="w-full max-w-2xl mx-auto px-3 flex flex-col items-center overflow-y-auto py-3 w-full">
        {/* readout */}
        {last ? (
          <div key={last.at} className="banner-pop w-full max-w-md rounded-3xl text-center px-4 py-4" style={{ background: "linear-gradient(160deg,#2A2B52,#1B1B3A)", border: "2px solid rgba(255,255,255,0.18)", boxShadow: "0 14px 34px rgba(0,0,0,0.45)" }}>
            <p className="font-display font-bold text-white leading-none" style={{ fontSize: "clamp(40px,10vw,64px)" }}>
              {prettyKey(last.key)}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-3">
              {[
                { label: "event.key", value: last.key === " " ? '" "' : last.key },
                { label: "event.code", value: last.code },
                { label: "keyCode", value: String(last.keyCode || "—") },
              ].map((f) => (
                <div key={f.label} className="rounded-xl px-2 py-1.5" style={{ background: "rgba(0,0,0,0.35)" }}>
                  <p className="text-[8px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>{f.label}</p>
                  <p className="font-mono font-bold text-[13px] text-white truncate">{f.value}</p>
                </div>
              ))}
            </div>
            {(last.shift || last.ctrl || last.alt) && (
              <p className="text-[11px] font-black mt-2" style={{ color: "#FFE27A" }}>
                Held with: {[last.shift && "Shift ⇧", last.ctrl && "Ctrl", last.alt && "Alt"].filter(Boolean).join(" + ")}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <p className="text-6xl animate-bounce" aria-hidden>⌨️</p>
            <p className="font-display font-bold text-2xl text-white mt-1">Press any key!</p>
            <p className="text-sm font-black px-3 py-1.5 rounded-full inline-block mt-1" style={{ background: "rgba(255,255,255,0.92)", color: "#26283B" }}>
              On a phone? Tap the keyboard below 👇
            </p>
          </div>
        )}

        {justFound && (
          <p className="banner-pop text-xs font-black px-3 py-1.5 rounded-full mt-2" style={{ background: "#FFD700", color: "#5A3A00" }}>
            ⭐ New key discovered: {justFound}! ({found.length} total)
          </p>
        )}

        {/* stats */}
        <div className="flex items-center gap-2 mt-3 flex-wrap justify-center">
          <span className="chip px-2.5 py-1.5 text-[11px] font-black" style={{ background: "rgba(255,255,255,0.09)", color: "#fff", border: "1.5px solid rgba(255,255,255,0.2)" }}>
            👆 {presses} presses this visit
          </span>
          <span className="chip px-2.5 py-1.5 text-[11px] font-black" style={{ background: "rgba(255,200,0,0.16)", color: "#FFD94D", border: "1.5px solid rgba(255,200,0,0.4)" }}>
            🔑 {found.length} / {TOTAL_POSSIBLE}+ keys discovered
          </span>
        </div>

        {/* history */}
        {history.length > 0 && (
          <div className="flex gap-1.5 mt-3 flex-wrap justify-center max-w-lg">
            {history.slice(1).map((h, i) => (
              <span
                key={`${h.at}-${i}`}
                className="text-[11px] font-black px-2 py-1 rounded-lg"
                style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.75)", border: "1.5px solid rgba(255,255,255,0.14)" }}
              >
                {prettyKey(h.key)} <span style={{ opacity: 0.55 }}>{h.keyCode || ""}</span>
              </span>
            ))}
          </div>
        )}

        {/* on-screen keyboard */}
        <div className="w-full max-w-xl flex flex-col gap-1.5 mt-4">
          {ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1.5 justify-center">
              {row.map((def) => {
                const active = activeCode === def.code;
                const discovered = found.includes(def.code);
                return (
                  <button
                    key={def.code + def.label}
                    onPointerDown={(e) => { e.preventDefault(); tapKey(def); }}
                    className="rounded-xl font-black touch-none active:scale-95 transition-transform"
                    style={{
                      flex: def.wide ? "1.8" : "1",
                      height: 48,
                      maxWidth: def.wide ? 110 : 52,
                      fontSize: def.label.length > 2 ? 10 : 15,
                      background: active
                        ? "linear-gradient(140deg,#FFC800,#FF7A18)"
                        : discovered
                          ? "rgba(88,204,2,0.22)"
                          : "rgba(255,255,255,0.1)",
                      color: active ? "#3A2A00" : "#fff",
                      border: `2px solid ${active ? "rgba(255,255,255,0.6)" : discovered ? "rgba(88,204,2,0.5)" : "rgba(255,255,255,0.18)"}`,
                      boxShadow: active ? "0 0 16px rgba(255,200,0,0.55)" : "0 3px 0 rgba(0,0,0,0.35)",
                    }}
                    aria-label={`Key ${def.label}`}
                  >
                    {def.label}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <p className="text-[11px] font-bold mt-3 pb-2 text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
          Green keys = discovered · Can you find them all? Try F-keys, Caps Lock, symbols and more on a real keyboard!
        </p>
      </div>
    </ArcadeShell>
  );
}
