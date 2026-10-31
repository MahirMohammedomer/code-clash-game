"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Coins, Share2, Swords } from "lucide-react";
import { CharacterAvatar, SpeechBubble } from "./Character";
import { GuessRow, InputTiles, Keypad } from "./GameBoard";
import {
  AI_BOTS, DAILY_CODE_MAX, dailyCodeShareText, evaluateGuess, getDailyCodeSecret, isValidSecretCode,
} from "@/lib/game-engine";
import { fireWinEffect } from "@/lib/win-effects";
import { historyPayload, newHistoryId, saveLocalHistoryEntry } from "@/lib/history";
import { makeId, tzEastMinutes } from "@/lib/session";
import { soundEngine } from "@/lib/sound-effects";
import type { GuessEntry, HistoryEntry, Player } from "@/lib/types";

interface SavedState {
  feedback: { guess: string; points: number; orders: number }[];
  done: boolean;
  won: boolean;
  resultId: string;
  recorded: boolean;
}

function localToday(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function DailyCode({
  me,
  token,
  onBack,
  showToast,
  onPlayerUpdate,
  onGuestDaily,
}: {
  me: Player;
  token: string | null;
  onBack: () => void;
  showToast: (m: string, k?: "ok" | "err") => void;
  onPlayerUpdate: (p: Player) => void;
  onGuestDaily: (won: boolean, guessesUsed: number) => void;
}) {
  const dateKey = localToday();
  const secret = useMemo(() => getDailyCodeSecret(dateKey), [dateKey]);
  const storageKey = `cipherclash_dailycode_${dateKey}_${me.username}`;

  const [state, setState] = useState<SavedState>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw) as SavedState;
    } catch {}
    return { feedback: [], done: false, won: false, resultId: makeId("dc"), recorded: false };
  });
  const [buffer, setBuffer] = useState("");
  const [shakeTiles, setShakeTiles] = useState(false);
  const recordingRef = useRef(false);

  const persist = useCallback((next: SavedState) => {
    setState(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  }, [storageKey]);

  const guesses: GuessEntry[] = state.feedback.map((f, i) => ({
    id: `dc-${i}`,
    playerSlot: 1,
    playerName: me.username,
    guess: f.guess,
    points: f.points,
    orders: f.orders,
    isTimeout: false,
    turnNumber: i + 1,
    timestamp: new Date().toISOString(),
  }));

  const recordFinish = useCallback(async (finalState: SavedState) => {
    if (recordingRef.current || finalState.recorded) return;
    recordingRef.current = true;
    const entry: HistoryEntry = {
      historyId: newHistoryId(),
      mode: "daily_code",
      result: finalState.won ? "win" : "loss",
      myName: me.username,
      myAvatar: me.avatarConfig,
      oppName: "Daily Code 🧩",
      oppAvatar: AI_BOTS.Mastermind.avatar,
      oppPlayerId: null,
      mySecret: "",
      oppSecret: secret,
      guesses: finalState.feedback.map((f, i) => ({
        id: `dc-${i}`, playerSlot: 1 as const, playerName: me.username, guess: f.guess,
        points: f.points, orders: f.orders, isTimeout: false, turnNumber: i + 1,
        timestamp: new Date().toISOString(),
      })),
      endReason: finalState.won ? "cracked" : "out_of_guesses",
      turnsTaken: finalState.feedback.length,
      createdAt: new Date().toISOString(),
    };
    saveLocalHistoryEntry(entry);

    if (token) {
      try {
        const res = await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "record_daily_code", token, tz: tzEastMinutes(),
            resultId: finalState.resultId, won: finalState.won,
            guessesUsed: finalState.feedback.length, history: historyPayload(entry),
          }),
        });
        const data = await res.json();
        if (data.player) {
          onPlayerUpdate(data.player);
          if (data.applied && data.coins) showToast(`🧩 Daily Code rewards: +${data.coins} coins!`);
        }
        if (data.applied || data.player) persist({ ...finalState, recorded: true });
      } catch {
        showToast("Rewards will sync when you're back online!", "err");
      }
    } else {
      onGuestDaily(finalState.won, finalState.feedback.length);
      persist({ ...finalState, recorded: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, me.username, secret]);

  // If a previous session finished but never recorded (offline), record now.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- flush a finished-but-unrecorded game on mount
    if (state.done && !state.recorded) void recordFinish(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = () => {
    if (state.done || !isValidSecretCode(buffer)) {
      setShakeTiles(true);
      setTimeout(() => setShakeTiles(false), 450);
      return;
    }
    if (state.feedback.some((f) => f.guess === buffer)) {
      showToast("You already tried that code!", "err");
      return;
    }
    const res = evaluateGuess(secret, buffer);
    soundEngine.playFeedback(res.points, res.orders);
    const feedback = [...state.feedback, { guess: buffer, points: res.points, orders: res.orders }];
    const won = res.isWin;
    const done = won || feedback.length >= DAILY_CODE_MAX;
    const next: SavedState = { ...state, feedback, done, won };
    persist(next);
    setBuffer("");
    if (done) {
      if (won) { void fireWinEffect(me.effectId); soundEngine.playVictory(); }
      else soundEngine.playDefeat();
      void recordFinish(next);
    }
  };

  const pressDigit = (d: string) => {
    if (state.done) return;
    if (buffer.includes(d) || buffer.length >= 4) {
      setShakeTiles(true);
      setTimeout(() => setShakeTiles(false), 450);
      return;
    }
    soundEngine.playTap(440 + Number(d) * 25);
    setBuffer(buffer + d);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "9") pressDigit(e.key);
      else if (e.key === "Backspace") { e.preventDefault(); setBuffer((b) => b.slice(0, -1)); }
      else if (e.key === "Enter") submit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const share = async () => {
    const text = dailyCodeShareText(dateKey, state.feedback, state.won);
    try {
      if (navigator.share) await navigator.share({ title: "Cipher Clash — Daily Code", text });
      else {
        await navigator.clipboard.writeText(text);
        showToast("📋 Result copied — paste it anywhere!");
      }
      soundEngine.playTap(700);
    } catch {}
  };

  const autoOut = useMemo(() => {
    const out = new Set<string>();
    for (const f of state.feedback) if (f.points === 0) for (const ch of f.guess) out.add(ch);
    return out;
  }, [state.feedback]);

  const coachLine = state.done
    ? state.won
      ? state.feedback.length <= 4
        ? `Cracked in ${state.feedback.length}?! Grandmaster brain! 🧠✨`
        : `Cracked in ${state.feedback.length} guesses — splendid work! 🦉`
      : `The code was ${secret}. Tomorrow brings a fresh one! 🌅`
    : state.feedback.length === 0
      ? "One secret code for EVERY player today. 8 guesses — make them count! 🧩"
      : state.feedback[state.feedback.length - 1].points === 0
        ? "Zero hits — four digits eliminated. Excellent data! 💡"
        : state.feedback[state.feedback.length - 1].orders >= 3
          ? "THREE in place! You're one swap away! 🔥"
          : "Steady... read the pegs like a book. 📖";

  return (
    <div className="board-theme min-h-[100dvh] flex flex-col" data-board={me.themeId}>
      <div className="sticky top-0 z-30 px-3 sm:px-5 pt-3 pb-2" style={{ background: "color-mix(in srgb, var(--board-panel) 88%, transparent)", backdropFilter: "blur(10px)", borderBottom: "2px solid var(--board-border)" }}>
        <div className="max-w-3xl mx-auto flex items-center gap-2">
          <button onClick={onBack} className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "var(--board-key)", color: "var(--board-ink)", border: "2px solid var(--board-border)", boxShadow: "0 3px 0 var(--board-border)" }} aria-label="Back">
            <ArrowLeft size={19} strokeWidth={2.8} />
          </button>
          <div className="flex-1 min-w-0" style={{ color: "var(--board-ink)" }}>
            <h2 className="font-display font-bold text-xl leading-tight">🧩 Daily Code</h2>
            <p className="text-[11px] font-black" style={{ color: "var(--board-soft)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} · same code for everyone!
            </p>
          </div>
          <span className="chip px-2.5 py-1.5 font-black text-sm flex items-center gap-1">
            <Coins size={15} style={{ color: "#E0A800" }} /> {me.coins.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex-1 w-full max-w-3xl mx-auto px-3 sm:px-5 py-3 space-y-3">
        <div className="flex items-start gap-3">
          <CharacterAvatar config={AI_BOTS.Mastermind.avatar} frameId={AI_BOTS.Mastermind.frameId} size={60} ringWidth={3}
            mood={state.done ? (state.won ? "win" : "sad") : "think"} />
          <div className="flex-1 min-w-0 pt-1">
            <SpeechBubble text={coachLine} side="right" />
            <p className="text-[10px] font-black mt-1" style={{ color: "var(--board-soft)" }}>PROFESSOR Hoot · DAILY PUZZLE KEEPER</p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: DAILY_CODE_MAX }).map((_, i) => (
            <span key={i} className="w-3.5 h-3.5 rounded-full border-2"
              style={{
                borderColor: i < state.feedback.length ? (state.won && i === state.feedback.length - 1 ? "#46A302" : "#0E86C8") : "var(--board-border)",
                background: i < state.feedback.length ? (state.won && i === state.feedback.length - 1 ? "#58CC02" : "#1CB0F6") : "transparent",
              }} />
          ))}
          <span className="text-[11px] font-black ml-1.5" style={{ color: "var(--board-soft)" }}>
            {state.feedback.length}/{DAILY_CODE_MAX} guesses
          </span>
        </div>

        <div className="rounded-2xl p-3" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
          <div className="space-y-1.5">
            {guesses.length === 0 && (
              <p className="text-sm font-bold py-4 text-center" style={{ color: "var(--board-soft)" }}>
                Your guesses will appear here. 🟢 = right digit + right place · 🔵 = right digit, wrong place
              </p>
            )}
            {guesses.map((g, i) => <GuessRow key={g.id} g={g} highlight={i === guesses.length - 1} />)}
          </div>
        </div>

        {state.done && (
          <div className="card-game p-4 text-center animate-pop">
            <p className="font-display font-bold text-2xl">{state.won ? `🎉 Cracked in ${state.feedback.length}/${DAILY_CODE_MAX}!` : `The code was ${secret} 🔐`}</p>
            <p className="text-sm font-bold mt-1" style={{ color: "var(--ink-soft)" }}>
              {state.won ? "Come back tomorrow for a brand-new code!" : "So close! A fresh code drops tomorrow — your streak is safe."}
            </p>
            <button onClick={share} className="btn-game btn-blue px-6 py-3 mt-3 flex items-center gap-2 mx-auto">
              <Share2 size={18} strokeWidth={2.6} /> Share my result
            </button>
          </div>
        )}
      </div>

      {!state.done && (
        <div className="sticky bottom-0 z-30 px-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          style={{ background: "color-mix(in srgb, var(--board-panel) 92%, transparent)", backdropFilter: "blur(10px)", borderTop: "2px solid var(--board-border)" }}>
          <div className="max-w-xl mx-auto space-y-2.5">
            <InputTiles value={buffer} shake={shakeTiles} />
            <Keypad buffer={buffer} onDigit={pressDigit} onDelete={() => { soundEngine.playDelete(); setBuffer((b) => b.slice(0, -1)); }}
              disabled={false} scratch={false} scratchMarks={{}} autoOut={autoOut} />
            <button onClick={submit} disabled={buffer.length !== 4}
              className="btn-game btn-green w-full py-3.5 text-lg flex items-center justify-center gap-2">
              <Swords size={20} strokeWidth={2.7} /> GUESS!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
