"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  ArrowLeft, Delete, Dices, Lock, Pencil, Play, Home, Trophy, Coins, Zap,
  MessageCircle, Copy, Check, WifiOff, Flag, Clock, Lightbulb, Eye, EyeOff,
  Swords, TimerOff, Share2, Hourglass, Crown,
} from "lucide-react";
import {
  AI_BOTS, computeAINextGuess, computeTrophyDelta, evaluateGuess, generateRandomCode,
  isValidSecretCode, pickLine, type AIDifficulty, type BotMood, type DailyChallengeRule,
} from "@/lib/game-engine";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/avatar";
import { Character, CharacterAvatar, SpeechBubble } from "./Character";
import { MatchChatPanel, ReactionsBar, ReactionFloaters, useMatchSocial, type Floater } from "./MatchChat";
import { soundEngine } from "@/lib/sound-effects";
import { makeId, saveRoomSession, loadRoomSession } from "@/lib/session";
import type { GuessEntry, MatchView, Player } from "@/lib/types";

export interface GameConfig {
  mode: "ai" | "online" | "hotseat";
  aiDifficulty?: AIDifficulty;
  roomCode?: string;
  slot?: 1 | 2;
  token?: string;
  timerSeconds: number;
  dailyRule?: DailyChallengeRule;
  dailyChallengeId?: string;
  isRematchSearch?: boolean;
}

export interface GameOutcome {
  won: boolean;
  mode: string; // "ai" | "online_1v1" | "hotseat"
  turnsTaken: number;
  ordersTotal: number;
  aiDifficulty?: string;
  trophyDelta: number;
  coinsEarned: number;
  xpEarned: number;
  dailyChallengeId?: string;
  endReason?: string;
  winnerName: string;
  myName: string;
  oppName: string;
}

interface BoardProps {
  me: Player;
  config: GameConfig;
  onExit: () => void;
  onResult: (outcome: GameOutcome) => void;
  onPlayAgainOnline?: () => void;
  showToast: (msg: string, kind?: "ok" | "err") => void;
}

/* ============================ shared UI bits ============================ */

function Pegs({ points, orders, hideOrders }: { points: number; orders: number; hideOrders?: boolean }) {
  if (hideOrders) {
    return (
      <span className="flex gap-1" title="Orders hidden (Blind Orders)">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center text-[8px] font-black"
            style={{ borderColor: "var(--board-border)", background: i < points ? "var(--blue)" : "transparent", color: "#fff" }}>
            {i < points ? "" : ""}
          </span>
        ))}
        <span className="text-[10px] font-black ml-1" style={{ color: "var(--board-soft)" }}>{points} digits · orders hidden</span>
      </span>
    );
  }
  return (
    <span className="flex gap-1 items-center">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-3.5 h-3.5 rounded-full border-2"
          style={{
            borderColor: i < orders ? "#46A302" : i < points ? "#0E86C8" : "var(--board-border)",
            background: i < orders ? "#58CC02" : i < points ? "#1CB0F6" : "transparent",
          }}
        />
      ))}
    </span>
  );
}

export function GuessRow({ g, hideOrders, highlight }: { g: GuessEntry; hideOrders?: boolean; highlight?: boolean }) {
  if (g.isTimeout) {
    return (
      <div className="flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 border-dashed animate-rise"
        style={{ borderColor: "var(--board-border)", color: "var(--board-soft)" }}>
        <TimerOff size={15} />
        <span className="text-xs font-black tracking-wide">TIME OUT — turn skipped</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-xl animate-rise ${highlight ? "animate-tile" : ""}`}
      style={{ background: highlight ? "rgba(88,204,2,0.14)" : "transparent" }}>
      <span className="flex gap-1">
        {g.guess.split("").map((d, i) => (
          <span key={i} className="digit-tile w-8 h-9 flex items-center justify-center text-lg">{d}</span>
        ))}
      </span>
      <Pegs points={g.points} orders={g.orders} hideOrders={hideOrders} />
      {!hideOrders && (
        <span className="text-[10px] font-black leading-tight" style={{ color: "var(--board-soft)" }}>
          {g.points} digits<br />{g.orders} placed
        </span>
      )}
    </div>
  );
}

function TimerRing({ secondsLeft, total, active }: { secondsLeft: number; total: number; active: boolean }) {
  if (total === 0) {
    return (
      <div className="w-[68px] h-[68px] rounded-full flex flex-col items-center justify-center border-[3px]"
        style={{ background: "var(--board-panel)", borderColor: "var(--board-border)", color: "var(--board-ink)" }}>
        <Clock size={20} />
        <span className="text-[9px] font-black">NO LIMIT</span>
      </div>
    );
  }
  const frac = Math.max(0, Math.min(1, secondsLeft / total));
  const r = 29;
  const c = 2 * Math.PI * r;
  const danger = secondsLeft <= 6 && active;
  const color = danger ? "#FF4B4B" : frac <= 0.35 ? "#FF7A18" : "#58CC02";
  return (
    <div className={`relative w-[68px] h-[68px] ${danger ? "animate-shake" : ""}`}>
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="var(--board-panel)" stroke="var(--board-border)" strokeWidth="5" />
        <circle
          cx="34" cy="34" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)}
          transform="rotate(-90 34 34)" style={{ transition: "stroke-dashoffset .3s linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ color: danger ? "#FF4B4B" : "var(--board-ink)" }}>
        <span className="font-display font-bold text-xl leading-none">{Math.max(0, Math.ceil(secondsLeft))}</span>
        <span className="text-[8px] font-black tracking-widest">SEC</span>
      </div>
    </div>
  );
}

function Stage({
  name, title, config, frameId, mood, line, isTurn, scoreLabel, floaters, align = "left", isBotThinking,
}: {
  name: string; title?: string; config: AvatarConfig; frameId: string; mood: BotMood;
  line?: string; isTurn: boolean; scoreLabel?: string; floaters?: Floater[];
  align?: "left" | "right"; isBotThinking?: boolean;
}) {
  return (
    <div className={`relative flex flex-col ${align === "left" ? "items-start" : "items-end"} min-w-0`}>
      <div className="h-[52px] flex items-end mb-1">
        {line ? <SpeechBubble text={line} side={align === "left" ? "left" : "right"} /> : null}
      </div>
      <div className="relative">
        {floaters && <ReactionFloaters floaters={floaters} side={align === "left" ? "mine" : "opp"} />}
        <div className={isTurn ? "animate-pulse-ring rounded-full" : ""}>
          <CharacterAvatar config={config} frameId={frameId} mood={mood} size={86} ringWidth={4} />
        </div>
        {isBotThinking && (
          <span className="absolute -bottom-1 -right-1 chip px-2 py-0.5 text-[10px] font-black flex items-center gap-1" style={{ color: "var(--ink)" }}>
            <Hourglass size={11} className="animate-spin" style={{ animationDuration: "1.6s" }} /> thinking
          </span>
        )}
      </div>
      <p className="font-display font-semibold leading-tight mt-1 max-w-[130px] truncate" style={{ color: "var(--board-ink)" }}>{name}</p>
      {title && <p className="text-[10px] font-black uppercase tracking-wide" style={{ color: "var(--board-soft)" }}>{title}</p>}
      {scoreLabel && <p className="text-[11px] font-extrabold" style={{ color: "var(--board-soft)" }}>{scoreLabel}</p>}
    </div>
  );
}

function Keypad({
  buffer, onDigit, onDelete, disabled, scratch, scratchMarks, autoOut,
}: {
  buffer: string;
  onDigit: (d: string) => void;
  onDelete: () => void;
  disabled: boolean;
  scratch: boolean;
  scratchMarks: Record<string, "eliminated" | "confirmed" | undefined>;
  autoOut: Set<string>;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 touch-game">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => {
        const mark = scratchMarks[d];
        const used = buffer.includes(d);
        const cls = mark === "eliminated" ? "key-eliminated" : mark === "confirmed" ? "key-confirmed" : used && !scratch ? "key-used" : "";
        return (
          <button
            key={d}
            onClick={() => onDigit(d)}
            disabled={disabled || (!scratch && used)}
            className={`key-btn h-12 text-xl relative ${cls}`}
            aria-label={`Digit ${d}`}
          >
            {d}
            {!mark && autoOut.has(d) && !used && (
              <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="block w-8 h-[3px] rounded bg-red-400 rotate-[-24deg] opacity-80" />
              </span>
            )}
          </button>
        );
      })}
      <button onClick={onDelete} disabled={disabled || scratch} className="key-btn h-12 flex items-center justify-center" aria-label="Delete digit">
        <Delete size={21} strokeWidth={2.5} />
      </button>
    </div>
  );
}

function InputTiles({ value, secret = false, shake }: { value: string; secret?: boolean; shake?: boolean }) {
  return (
    <div className={`flex gap-2 justify-center ${shake ? "animate-shake" : ""}`}>
      {[0, 1, 2, 3].map((i) => {
        const ch = value[i];
        return (
          <span
            key={i}
            className={`digit-tile w-12 h-14 sm:w-14 sm:h-16 flex items-center justify-center text-3xl ${ch ? "animate-tile" : ""}`}
            style={ch ? { borderColor: "var(--blue)", background: "rgba(28,176,246,0.14)" } : undefined}
          >
            {ch ? (secret ? ch : ch) : <span style={{ color: "var(--board-soft)", opacity: 0.5 }}>?</span>}
          </span>
        );
      })}
    </div>
  );
}

function fireWinEffect(effectId: string) {
  const end = Date.now() + 1600;
  const defaults = { origin: { y: 0.7 }, zIndex: 9999, disableForReducedMotion: true };
  try {
    switch (effectId) {
      case "effect_lightning":
        confetti({ ...defaults, particleCount: 130, spread: 100, colors: ["#FFD93D", "#1CB0F6", "#FFFFFF"], scalar: 0.9 });
        confetti({ ...defaults, particleCount: 60, angle: 60, spread: 60, origin: { x: 0 }, colors: ["#FFD93D", "#1CB0F6"] });
        confetti({ ...defaults, particleCount: 60, angle: 120, spread: 60, origin: { x: 1 }, colors: ["#FFD93D", "#1CB0F6"] });
        break;
      case "effect_stars": {
        const star = confetti.shapeFromText ? confetti.shapeFromText({ text: "★", scalar: 2 }) : undefined;
        confetti({ ...defaults, particleCount: 90, spread: 120, shapes: star ? [star] : undefined, colors: ["#FFD93D", "#FFC800", "#FFF3C4"], gravity: 0.7, scalar: 1.1 });
        break;
      }
      case "effect_fireworks": {
        const frame = () => {
          confetti({ ...defaults, particleCount: 45, angle: 60, spread: 60, origin: { x: 0, y: 0.8 } });
          confetti({ ...defaults, particleCount: 45, angle: 120, spread: 60, origin: { x: 1, y: 0.8 } });
          confetti({ ...defaults, particleCount: 60, spread: 100, startVelocity: 42, origin: { x: Math.random(), y: 0.4 } });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
        break;
      }
      case "effect_matrix":
        confetti({ ...defaults, particleCount: 160, spread: 130, colors: ["#00E676", "#58CC02", "#0B3D1E"], shapes: ["square"], gravity: 1.4, scalar: 0.8, ticks: 240 });
        break;
      case "effect_sparkle":
        confetti({ ...defaults, particleCount: 110, spread: 90, colors: ["#FFD93D", "#FFF3C4", "#FFFFFF"], scalar: 0.75, gravity: 0.6, ticks: 260 });
        break;
      case "effect_shockwave":
        confetti({ ...defaults, particleCount: 140, spread: 360, startVelocity: 32, gravity: 0.35, origin: { y: 0.5 }, colors: ["#FF4B4B", "#FF7A18", "#FFD93D"], ticks: 200 });
        break;
      default:
        confetti({ ...defaults, particleCount: 120, spread: 85 });
        confetti({ ...defaults, particleCount: 50, angle: 60, spread: 60, origin: { x: 0 } });
        confetti({ ...defaults, particleCount: 50, angle: 120, spread: 60, origin: { x: 1 } });
    }
  } catch {}
}

function ResultOverlay({
  title, subtitle, winnerConfig, loserConfig, winnerFrame, rewards, turns, onPlayAgain, onHome, playAgainLabel,
}: {
  title: string; subtitle: string;
  winnerConfig: AvatarConfig; loserConfig: AvatarConfig; winnerFrame: string;
  rewards?: { coins: number; xp: number; trophies: number } | null;
  turns: number;
  onPlayAgain: () => void; onHome: () => void; playAgainLabel: string;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px] animate-fade" />
      <div className="relative card-game w-full max-w-md p-6 text-center animate-pop overflow-hidden">
        <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full opacity-20" style={{ background: "var(--gold)" }} />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full opacity-15" style={{ background: "var(--brand)" }} />
        <div className="relative flex items-end justify-center gap-2 mb-1">
          <Character config={loserConfig} mood="lose" size={74} />
          <div className="relative">
            <CharacterAvatar config={winnerConfig} frameId={winnerFrame} mood="win" size={128} ringWidth={5} />
            <span className="absolute -top-3 -right-2 w-10 h-10 rounded-full flex items-center justify-center text-white rotate-12 shadow-lg" style={{ background: "var(--gold)", color: "#5c4200" }}>
              <Crown size={21} strokeWidth={2.6} />
            </span>
          </div>
        </div>
        <h2 className="font-display font-bold text-3xl mt-2">{title}</h2>
        <p className="font-bold text-sm" style={{ color: "var(--ink-soft)" }}>{subtitle}</p>
        <p className="text-xs font-black mt-1" style={{ color: "var(--ink-faint)" }}>Code cracked in {turns} {turns === 1 ? "turn" : "turns"}</p>

        {rewards && (
          <div className="flex justify-center gap-2 mt-4">
            <span className="chip px-3 py-1.5 font-black text-sm flex items-center gap-1.5"><Coins size={16} style={{ color: "#E0A800" }} /> +{rewards.coins}</span>
            <span className="chip px-3 py-1.5 font-black text-sm flex items-center gap-1.5"><Zap size={16} style={{ color: "#A560E8" }} /> +{rewards.xp} XP</span>
            <span className="chip px-3 py-1.5 font-black text-sm flex items-center gap-1.5">
              <Trophy size={16} style={{ color: rewards.trophies >= 0 ? "#58CC02" : "#FF4B4B" }} />
              {rewards.trophies >= 0 ? `+${rewards.trophies}` : rewards.trophies}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 mt-5">
          <button onClick={onHome} className="btn-game btn-ghost py-3.5 flex items-center justify-center gap-2">
            <Home size={18} strokeWidth={2.6} /> Home
          </button>
          <button onClick={onPlayAgain} className="btn-game btn-green py-3.5 flex items-center justify-center gap-2">
            <Play size={18} strokeWidth={2.8} /> {playAgainLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const TIPS = [
  "Start with 4 spread-out digits like 1-3-5-7 to learn a lot fast.",
  "Green peg = right digit AND right place. Blue peg = right digit, wrong place.",
  "A guess with 0 pegs is great news — none of those digits are in the code!",
  "Swap two digits at a time to test positions without wasting a turn.",
  "Use the pencil button to mark digits you're sure about.",
  "Watch your rival's pegs — they hint how close THEY are to your code!",
];

function HeaderBar({
  left, center, right, onBack, backTitle,
}: {
  left: React.ReactNode; center: React.ReactNode; right: React.ReactNode;
  onBack: () => void; backTitle: string;
}) {
  return (
    <div className="sticky top-0 z-30 px-3 sm:px-5 pt-3 pb-2" style={{ background: "color-mix(in srgb, var(--board-panel) 88%, transparent)", backdropFilter: "blur(10px)", borderBottom: "2px solid var(--board-border)" }}>
      <div className="max-w-5xl mx-auto flex items-start gap-2">
        <button onClick={onBack} title={backTitle} className="btn-game mt-8 w-10 h-10 !rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--board-key)", color: "var(--board-ink)", border: "2px solid var(--board-border)", boxShadow: "0 3px 0 var(--board-border)" }}>
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <div className="flex-1 flex items-start justify-between gap-2 min-w-0">
          {left}
          <div className="flex flex-col items-center pt-12 shrink-0">{center}</div>
          {right}
        </div>
      </div>
    </div>
  );
}

/* ============================== LOCAL GAME ============================= */

function LocalGame({ me, config, onExit, onResult, showToast }: BoardProps) {
  const isAI = config.mode === "ai";
  const bot = isAI ? AI_BOTS[config.aiDifficulty || "Rookie"] : null;
  const timerTotal = config.dailyRule === "speed_30" ? 30 : config.timerSeconds;
  const hideOrders = config.dailyRule === "no_orders_hint";

  const p2Name = bot ? bot.name : "Player 2";
  const p2Config: AvatarConfig = bot ? bot.avatar : { base: "cat", color: "sky", accessory: "cap" };
  const p2Frame = bot ? bot.frameId : "frame_neon";

  type Phase = "setup1" | "curtain_setup2" | "setup2" | "curtain_turn" | "playing" | "finished";
  const [phase, setPhase] = useState<Phase>("setup1");
  const [round, setRound] = useState(0);
  const [p1Secret, setP1Secret] = useState("");
  const [p2Secret, setP2Secret] = useState(() => (isAI ? generateRandomCode() : ""));
  const [setupBuffer, setSetupBuffer] = useState("");
  const [buffer, setBuffer] = useState("");
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [secondsLeft, setSecondsLeft] = useState(timerTotal);
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const [myMood, setMyMood] = useState<BotMood>("idle");
  const [oppMood, setOppMood] = useState<BotMood>("idle");
  const [botLine, setBotLine] = useState(() => (bot ? pickLine(bot.lines.start) : ""));
  const [botThinking, setBotThinking] = useState(false);
  const [scratch, setScratch] = useState(false);
  const [marks, setMarks] = useState<Record<string, "eliminated" | "confirmed" | undefined>>({});
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [shakeTiles, setShakeTiles] = useState(false);

  const recordedRef = useRef(false);
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line react-hooks/purity -- ref timestamp init is intentional
  const turnStartedRef = useRef(Date.now());

  const G = useRef({ phase, currentTurn, guesses, p1Secret, p2Secret, winner });
  // Latest-state mirror read by timers/watchdog (prevents stale closures & bot stalls).
  // eslint-disable-next-line react-hooks/refs
  G.current = { phase, currentTurn, guesses, p1Secret, p2Secret, winner };

  const myGuesses = useMemo(() => guesses.filter((g) => g.playerSlot === 1), [guesses]);
  const oppGuesses = useMemo(() => guesses.filter((g) => g.playerSlot === 2), [guesses]);

  const autoOut = useMemo(() => {
    const out = new Set<string>();
    const mine = currentTurn === 1 ? myGuesses : oppGuesses;
    for (const g of mine) if (!g.isTimeout && g.points === 0) for (const ch of g.guess) out.add(ch);
    return out;
  }, [myGuesses, oppGuesses, currentTurn]);

  const pushFloater = useCallback((reaction: string, fromOpponent: boolean) => {
    const key = `${Date.now()}-${Math.random()}`;
    setFloaters((f) => [...f.slice(-5), { key, reaction, fromOpponent }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 2300);
  }, []);

  const finalize = useCallback((winnerSlot: 1 | 2, finalGuesses: GuessEntry[]) => {
    setWinner(winnerSlot);
    setPhase("finished");
    setBotThinking(false);
    const iWon = winnerSlot === 1;
    setMyMood(iWon ? "win" : "lose");
    setOppMood(iWon ? "lose" : "win");
    if (bot) setBotLine(pickLine(iWon ? bot.lines.botLose : bot.lines.botWin));
    if (iWon || !isAI) { fireWinEffect(me.effectId); soundEngine.playVictory(); }
    else soundEngine.playDefeat();

    if (recordedRef.current) return;
    recordedRef.current = true;
    const myTurns = finalGuesses.filter((g) => g.playerSlot === 1 && !g.isTimeout).length;
    const ordersTotal = finalGuesses.filter((g) => g.playerSlot === 1).reduce((s, g) => s + g.orders, 0);
    let coins = 15, xp = 40, trophies = 0;
    if (isAI && bot) {
      coins = iWon ? bot.rewardCoins : 15;
      xp = iWon ? bot.rewardXp : 40;
      trophies = computeTrophyDelta(iWon, "ai", bot.difficulty);
    } else {
      coins = iWon ? 30 : 12;
      xp = iWon ? 60 : 35;
      trophies = 0;
    }
    onResult({
      won: iWon,
      mode: isAI ? "ai" : "hotseat",
      turnsTaken: Math.max(1, myTurns),
      ordersTotal,
      aiDifficulty: bot?.difficulty,
      trophyDelta: trophies,
      coinsEarned: coins,
      xpEarned: xp,
      dailyChallengeId: config.dailyChallengeId,
      endReason: "cracked",
      winnerName: iWon ? me.username : p2Name,
      myName: me.username,
      oppName: p2Name,
    });
  }, [bot, config.dailyChallengeId, isAI, me.effectId, me.username, onResult, p2Name]);

  const applyGuess = useCallback((slot: 1 | 2, guessStr: string, isTimeout: boolean) => {
    const st = G.current;
    if (st.phase !== "playing" || st.winner) return;
    const target = slot === 1 ? st.p2Secret : st.p1Secret;
    const res = isTimeout ? { points: 0, orders: 0, isWin: false } : evaluateGuess(target, guessStr);
    const entry: GuessEntry = {
      id: makeId("g"),
      playerSlot: slot,
      playerName: slot === 1 ? me.username : p2Name,
      guess: isTimeout ? "TIMEOUT" : guessStr,
      points: res.points,
      orders: res.orders,
      isTimeout,
      turnNumber: st.guesses.filter((g) => g.playerSlot === slot).length + 1,
      timestamp: new Date().toISOString(),
    };
    const next = [...st.guesses, entry];
    setGuesses(next);
    setBuffer("");
    if (!isTimeout) soundEngine.playFeedback(res.points, res.orders);
    else soundEngine.playTimeout();

    // reactions / moods / bot lines
    if (bot) {
      if (slot === 1) {
        if (isTimeout) { setBotLine(pickLine(bot.lines.playerTimeout)); setOppMood("happy"); setMyMood("sad"); }
        else if (res.points >= 3 || res.orders >= 2) { setBotLine(pickLine(bot.lines.playerClose)); setOppMood("shocked"); setMyMood("happy"); }
        else if (res.points === 0) { setBotLine(pickLine(bot.lines.playerBad)); setOppMood("happy"); setMyMood("sad"); }
        else { setOppMood("think"); setMyMood("idle"); }
      } else {
        if (res.points >= 3 || res.orders >= 2) { setBotLine(pickLine(bot.lines.goodGuess)); setOppMood("happy"); setMyMood("shocked"); }
        else if (res.points === 0) { setBotLine(pickLine(bot.lines.badGuess)); setOppMood("sad"); setMyMood("happy"); }
        else { setOppMood("idle"); setMyMood("idle"); }
      }
    } else {
      if (res.orders >= 3) { setMyMood(slot === 1 ? "happy" : "shocked"); setOppMood(slot === 2 ? "happy" : "shocked"); }
    }

    if (res.isWin) { finalize(slot, next); return; }

    const nextSlot: 1 | 2 = slot === 1 ? 2 : 1;
    setCurrentTurn(nextSlot);
    turnStartedRef.current = Date.now();
    if (timerTotal > 0) setSecondsLeft(timerTotal);
    if (!isAI) setPhase("curtain_turn");
  }, [bot, finalize, isAI, me.username, p2Name, timerTotal]);

  /* ------------------------------ bot engine ------------------------------ */
  const executeBotMove = useCallback(() => {
    const st = G.current;
    if (!bot || st.phase !== "playing" || st.currentTurn !== 2 || st.winner) return;
    const past = st.guesses.filter((g) => g.playerSlot === 2 && !g.isTimeout)
      .map((g) => ({ guess: g.guess, points: g.points, orders: g.orders }));
    let decision;
    try {
      decision = computeAINextGuess(bot.difficulty, past);
    } catch {
      decision = { guess: generateRandomCode(), candidateCount: 0, thoughtText: "" };
    }
    setBotThinking(false);
    applyGuess(2, decision.guess, false);
  }, [applyGuess, bot]);

  useEffect(() => {
    if (!isAI || phase !== "playing" || currentTurn !== 2 || winner) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bot turn state machine
    setBotThinking(true);
    setOppMood("think");
    if (bot) setBotLine(pickLine(bot.lines.thinking));
    const delay = bot ? bot.thinkMinMs + Math.random() * (bot.thinkMaxMs - bot.thinkMinMs) : 900;
    botTimer.current = setTimeout(executeBotMove, delay);
    return () => { if (botTimer.current) clearTimeout(botTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAI, phase, currentTurn, winner, round]);

  // Watchdog: the bot can NEVER stall the game.
  useEffect(() => {
    if (!isAI) return;
    const t = setInterval(() => {
      const st = G.current;
      if (st.phase === "playing" && st.currentTurn === 2 && !st.winner && Date.now() - turnStartedRef.current > 3500) {
        executeBotMove();
      }
    }, 600);
    return () => clearInterval(t);
  }, [isAI, executeBotMove]);

  /* -------------------------------- timer -------------------------------- */
  useEffect(() => {
    if (phase !== "playing" || timerTotal === 0 || winner) return;
    if (isAI && currentTurn === 2) return; // pause while bot thinks (fixes old bug)
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          const slot = G.current.currentTurn;
          setTimeout(() => applyGuess(slot, "", true), 0);
          return timerTotal;
        }
        if (s <= 6) soundEngine.playTap(300);
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, currentTurn, timerTotal, isAI, winner, applyGuess]);

  /* ------------------------------ input ---------------------------------- */
  const isSetupPhase = phase === "setup1" || phase === "setup2";
  const activeBuffer = isSetupPhase ? setupBuffer : buffer;
  const setActiveBuffer = isSetupPhase ? setSetupBuffer : setBuffer;
  const humanTurn = phase === "playing" && (!isAI || currentTurn === 1);

  const pressDigit = (d: string) => {
    if (scratch && phase === "playing") {
      soundEngine.playTap(460);
      setMarks((m) => {
        const cur = m[d];
        const next = cur === undefined ? "eliminated" : cur === "eliminated" ? "confirmed" : undefined;
        return { ...m, [d]: next };
      });
      return;
    }
    if (!isSetupPhase && !humanTurn) return;
    if (activeBuffer.includes(d) || activeBuffer.length >= 4) {
      setShakeTiles(true); setTimeout(() => setShakeTiles(false), 450);
      return;
    }
    soundEngine.playTap(440 + Number(d) * 25);
    setActiveBuffer(activeBuffer + d);
  };

  const pressDelete = () => { soundEngine.playDelete(); setActiveBuffer(activeBuffer.slice(0, -1)); };

  const submitGuess = () => {
    if (!isValidSecretCode(buffer)) { setShakeTiles(true); setTimeout(() => setShakeTiles(false), 450); return; }
    applyGuess(currentTurn, buffer, false);
  };

  const confirmSecret = () => {
    const code = isValidSecretCode(setupBuffer) ? setupBuffer : generateRandomCode();
    soundEngine.playReward();
    if (phase === "setup1") {
      setP1Secret(code);
      setSetupBuffer("");
      if (isAI) { setPhase("playing"); turnStartedRef.current = Date.now(); if (timerTotal > 0) setSecondsLeft(timerTotal); }
      else setPhase("curtain_setup2");
    } else if (phase === "setup2") {
      setP2Secret(code);
      setSetupBuffer("");
      setPhase("curtain_turn");
      setCurrentTurn(1);
    }
  };

  const resetGame = () => {
    recordedRef.current = false;
    setRound((r) => r + 1);
    setP1Secret(""); setSetupBuffer(""); setBuffer("");
    setP2Secret(isAI ? generateRandomCode() : "");
    setGuesses([]); setCurrentTurn(1); setWinner(null);
    setMyMood("idle"); setOppMood("idle"); setMarks({});
    setBotLine(bot ? pickLine(bot.lines.start) : "");
    setSecondsLeft(timerTotal);
    setPhase("setup1");
  };

  // desktop keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key >= "1" && e.key <= "9") pressDigit(e.key);
      else if (e.key === "Backspace") { e.preventDefault(); pressDelete(); }
      else if (e.key === "Enter") { if (isSetupPhase) confirmSecret(); else if (humanTurn) submitGuess(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const onReactLocal = (id: string) => {
    pushFloater(id, false);
    if (bot && phase === "playing" && Math.random() < 0.65) {
      setTimeout(() => {
        pushFloater(["thumbs_up", "fire", "laugh", "wow"][Math.floor(Math.random() * 4)], true);
        setOppMood("happy");
        setTimeout(() => setOppMood((m) => (m === "happy" ? "idle" : m)), 1400);
      }, 650);
    }
  };

  const best = (list: GuessEntry[]) => list.reduce((mx, g) => Math.max(mx, g.orders), 0);

  return (
    <div className="board-theme min-h-[100dvh] flex flex-col" data-board={me.themeId}>
      <HeaderBar
        onBack={() => { if (phase === "playing") { showToast("Match left — no rewards recorded."); } onExit(); }}
        backTitle="Leave match"
        left={
          <Stage name={me.username} title={isAI ? "You" : "Player 1"} config={me.avatarConfig} frameId={me.frameId}
            mood={phase === "finished" ? myMood : myMood} isTurn={phase === "playing" && currentTurn === 1}
            scoreLabel={`${myGuesses.length} guesses · best ${best(myGuesses)}/4 placed`} floaters={floaters} align="left" />
        }
        center={<TimerRing secondsLeft={secondsLeft} total={timerTotal} active={phase === "playing" && humanTurn} />}
        right={
          <Stage name={p2Name} title={bot ? bot.title : "Player 2"} config={p2Config} frameId={p2Frame}
            mood={oppMood} line={botLine} isTurn={phase === "playing" && currentTurn === 2}
            scoreLabel={`${oppGuesses.length} guesses · best ${best(oppGuesses)}/4 placed`} floaters={floaters} align="right"
            isBotThinking={botThinking} />
        }
      />

      {/* turn banner */}
      <div className="max-w-5xl w-full mx-auto px-3 sm:px-5 mt-2">
        <div className="rounded-2xl px-4 py-2 text-center font-display font-semibold text-sm sm:text-base"
          style={{ background: "var(--board-panel)", color: "var(--board-ink)", border: "2px solid var(--board-border)" }}>
          {phase === "setup1" && `${me.username}, hide your secret code!`}
          {phase === "setup2" && `${p2Name}, hide your secret code!`}
          {(phase === "curtain_setup2" || phase === "curtain_turn") && "Pass the device..."}
          {phase === "playing" && (isAI
            ? currentTurn === 1 ? "Your turn — crack their code!" : `${p2Name} is thinking...`
            : currentTurn === 1 ? `${me.username}'s turn!` : `${p2Name}'s turn!`)}
          {phase === "finished" && "Match over!"}
        </div>
      </div>

      {/* history */}
      <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-5 py-3 grid sm:grid-cols-2 gap-3 content-start overflow-y-auto pretty-scroll">
        <div className="rounded-2xl p-3" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
          <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--board-soft)" }}>
            {me.username}&rsquo;s guesses → cracking {p2Name}
          </p>
          <div className="space-y-1.5">
            {myGuesses.length === 0 && <p className="text-sm font-bold py-3 text-center" style={{ color: "var(--board-soft)" }}>No guesses yet</p>}
            {myGuesses.map((g, i) => <GuessRow key={g.id} g={g} hideOrders={hideOrders && phase !== "finished"} highlight={i === myGuesses.length - 1} />)}
          </div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
          <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--board-soft)" }}>
            {p2Name}&rsquo;s guesses → cracking {me.username}
          </p>
          <div className="space-y-1.5">
            {oppGuesses.length === 0 && <p className="text-sm font-bold py-3 text-center" style={{ color: "var(--board-soft)" }}>No guesses yet</p>}
            {oppGuesses.map((g, i) => <GuessRow key={g.id} g={g} highlight={i === oppGuesses.length - 1} />)}
          </div>
        </div>
        <p className="sm:col-span-2 text-center text-[11px] font-bold" style={{ color: "var(--board-soft)" }}>
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#58CC02] border border-[#46A302] align-middle" /> right digit + right place&nbsp;&nbsp;
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#1CB0F6] border border-[#0E86C8] align-middle" /> right digit, wrong place
        </p>
      </div>

      {/* bottom dock */}
      {(phase === "playing" || isSetupPhase) && (
        <div className="sticky bottom-0 z-30 px-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          style={{ background: "color-mix(in srgb, var(--board-panel) 92%, transparent)", backdropFilter: "blur(10px)", borderTop: "2px solid var(--board-border)" }}>
          <div className="max-w-xl mx-auto space-y-2.5">
            {isSetupPhase ? (
              <>
                <p className="text-center text-xs font-black" style={{ color: "var(--board-soft)" }}>
                  Pick 4 DIFFERENT digits (1–9). This is the code your rival must crack!
                </p>
                <InputTiles value={setupBuffer} secret shake={shakeTiles} />
                <Keypad buffer={setupBuffer} onDigit={pressDigit} onDelete={pressDelete} disabled={false} scratch={false} scratchMarks={{}} autoOut={new Set()} />
                <div className="flex gap-2">
                  <button onClick={() => { setSetupBuffer(generateRandomCode()); soundEngine.playTap(600); }} className="btn-game btn-ghost flex-1 py-3 flex items-center justify-center gap-2">
                    <Dices size={18} strokeWidth={2.6} /> Random
                  </button>
                  <button onClick={confirmSecret} disabled={setupBuffer.length !== 4} className="btn-game btn-green flex-[2] py-3 flex items-center justify-center gap-2 text-lg">
                    <Lock size={19} strokeWidth={2.7} /> Lock it in!
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <ReactionsBar onReact={onReactLocal} compact />
                  <button
                    onClick={() => { setScratch((s) => !s); soundEngine.playTap(520); }}
                    className={`btn-game px-3 py-1.5 text-xs flex items-center gap-1.5 ${scratch ? "btn-purple" : "btn-ghost"}`}
                    title="Scratchpad: tap digits to mark them out (red) or sure (green)"
                  >
                    <Pencil size={14} strokeWidth={2.7} /> {scratch ? "Marking..." : "Notes"}
                  </button>
                </div>
                <InputTiles value={buffer} shake={shakeTiles} />
                <Keypad buffer={buffer} onDigit={pressDigit} onDelete={pressDelete} disabled={!humanTurn && !scratch} scratch={scratch} scratchMarks={marks} autoOut={autoOut} />
                <button onClick={submitGuess} disabled={!humanTurn || buffer.length !== 4 || scratch}
                  className="btn-game btn-green w-full py-3.5 text-lg flex items-center justify-center gap-2">
                  <Swords size={20} strokeWidth={2.7} />
                  {scratch ? "Tap digits to mark them" : humanTurn ? "GUESS!" : isAI ? `${p2Name} is thinking...` : "Waiting..."}
                </button>
                <p className="text-center text-[11px] font-bold flex items-center justify-center gap-1.5" style={{ color: "var(--board-soft)" }}>
                  <EyeOff size={12} /> Your secret: <span className="font-display tracking-[0.3em]" style={{ color: "var(--board-ink)" }}>{currentTurn === 2 && !isAI ? p2Secret : p1Secret}</span>
                  <span className="opacity-70">(only the current player should look!)</span>
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* pass-device curtain */}
      {(phase === "curtain_setup2" || phase === "curtain_turn") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5" style={{ background: "rgba(18,20,31,0.92)" }}>
          <div className="text-center animate-pop max-w-sm">
            <CharacterAvatar config={phase === "curtain_setup2" || currentTurn === 2 ? p2Config : me.avatarConfig}
              frameId={phase === "curtain_setup2" || currentTurn === 2 ? p2Frame : me.frameId} mood="idle" size={120} />
            <h3 className="font-display font-bold text-2xl text-white mt-3">
              Pass to {phase === "curtain_setup2" ? p2Name : currentTurn === 2 ? p2Name : me.username}!
            </h3>
            <p className="text-white/70 font-bold text-sm mt-1">No peeking at the other player&rsquo;s screen.</p>
            <button
              onClick={() => {
                soundEngine.playTap(700);
                if (phase === "curtain_setup2") setPhase("setup2");
                else { setPhase("playing"); turnStartedRef.current = Date.now(); if (timerTotal > 0) setSecondsLeft(timerTotal); }
              }}
              className="btn-game btn-green px-8 py-3.5 mt-5 text-lg"
            >
              I&rsquo;m ready!
            </button>
          </div>
        </div>
      )}

      {phase === "finished" && winner && (
        <ResultOverlay
          title={winner === 1 ? (isAI ? "YOU CRACKED IT!" : `${me.username} WINS!`) : isAI ? `${p2Name} cracked your code!` : `${p2Name} WINS!`}
          subtitle={winner === 1 ? "Victory tastes sweet. Great detective work!" : "So close! Study the pegs and strike back."}
          winnerConfig={winner === 1 ? me.avatarConfig : p2Config}
          loserConfig={winner === 1 ? p2Config : me.avatarConfig}
          winnerFrame={winner === 1 ? me.frameId : p2Frame}
          rewards={{
            coins: isAI && bot ? (winner === 1 ? bot.rewardCoins : 15) : winner === 1 ? 30 : 12,
            xp: isAI && bot ? (winner === 1 ? bot.rewardXp : 40) : winner === 1 ? 60 : 35,
            trophies: isAI && bot ? computeTrophyDelta(winner === 1, "ai", bot.difficulty) : 0,
          }}
          turns={guesses.filter((g) => g.playerSlot === winner && !g.isTimeout).length}
          onPlayAgain={resetGame}
          onHome={onExit}
          playAgainLabel="Play again"
        />
      )}
    </div>
  );
}

/* ============================== ONLINE GAME ============================= */

function OnlineGame({ me, config, onExit, onResult, onPlayAgainOnline, showToast }: BoardProps) {
  const roomCode = config.roomCode!;
  const mySlot: 1 | 2 = config.slot || 1;
  const token = config.token || "";
  const oppSlot: 1 | 2 = mySlot === 1 ? 2 : 1;

  const [match, setMatch] = useState<MatchView | null>(null);
  const [buffer, setBuffer] = useState("");
  const [setupBuffer, setSetupBuffer] = useState("");
  const [mySecret, setMySecret] = useState(() => loadRoomSession()?.secret || "");
  const [submitting, setSubmitting] = useState(false);
  const [connFails, setConnFails] = useState(0);
  const [presence, setPresence] = useState<{ p1: string | null; p2: string | null }>({ p1: null, p2: null });
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scratch, setScratch] = useState(false);
  const [marks, setMarks] = useState<Record<string, "eliminated" | "confirmed" | undefined>>({});
  const [myMood, setMyMood] = useState<BotMood>("idle");
  const [oppMood, setOppMood] = useState<BotMood>("idle");
  const [shakeTiles, setShakeTiles] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);

  const versionRef = useRef(0);
  const [serverOffset, setServerOffset] = useState(0);
  const recordedRef = useRef(false);
  const prevGuessCount = useRef(0);
  const timeoutAttempted = useRef("");
  const aliveRef = useRef(true);

  const social = useMatchSocial(roomCode, token, mySlot);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomCode, token, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }, [roomCode, token]);

  const applyMatch = useCallback((m: MatchView) => {
    if (m.serverNow) setServerOffset(new Date(m.serverNow).getTime() - Date.now());
    versionRef.current = m.version;
    setPresence({ p1: m.p1SeenAt || null, p2: m.p2SeenAt || null });
    if ((m as unknown as { yourSecret?: string }).yourSecret) {
      const s = (m as unknown as { yourSecret?: string }).yourSecret as string;
      if (isValidSecretCode(s)) setMySecret(s);
    }
    const newCount = m.guesses.length;
    if (newCount > prevGuessCount.current) {
      const last = m.guesses[newCount - 1];
      if (last && last.playerSlot !== mySlot) {
        if (!last.isTimeout) soundEngine.playFeedback(last.points, last.orders);
        if (last.orders >= 3) setMyMood("shocked");
        else if (last.points === 0) setMyMood("happy");
        setTimeout(() => setMyMood((mm) => (mm === "win" || mm === "lose" ? mm : "idle")), 1600);
      } else if (last) {
        if (last.orders >= 2 || last.points >= 3) setOppMood("shocked");
        else if (last.points === 0) setOppMood("happy");
        setTimeout(() => setOppMood((mm) => (mm === "win" || mm === "lose" ? mm : "idle")), 1600);
      }
      prevGuessCount.current = newCount;
    }
    setMatch(m);
  }, [mySlot]);

  /* polling loop — 1s, version-aware, self-healing */
  useEffect(() => {
    aliveRef.current = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(`/api/matches?roomCode=${roomCode}&token=${token}&v=${versionRef.current}`);
        if (!aliveRef.current) return;
        if (!res.ok) throw new Error("poll");
        const data = await res.json();
        setConnFails(0);
        if (data.presence) {
          setServerOffset(new Date(data.presence.serverNow).getTime() - Date.now());
          setPresence({ p1: data.presence.p1SeenAt, p2: data.presence.p2SeenAt });
        } else if (data.match && !data.match.unchanged) {
          applyMatch(data.match);
        }
      } catch {
        if (aliveRef.current) setConnFails((c) => c + 1);
      }
      if (aliveRef.current) timer = setTimeout(poll, 1000);
    };
    poll();
    return () => { aliveRef.current = false; clearTimeout(timer); };
  }, [roomCode, token, applyMatch]);

  /* 4x/sec clock for smooth timer + presence */
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setTipIdx((i) => (i + 1) % TIPS.length), 4200);
    return () => clearInterval(t);
  }, []);

  const serverNow = nowTick + serverOffset;
  const timerTotal = match?.timerSeconds ?? config.timerSeconds;
  const secondsLeft = useMemo(() => {
    if (!match || timerTotal === 0) return timerTotal;
    const started = new Date(match.turnStartedAt).getTime();
    return Math.max(0, timerTotal - (serverNow - started) / 1000);
  }, [match, timerTotal, serverNow]);

  const phase: "loading" | "waiting" | "setup" | "waiting_secret" | "playing" | "finished" | "abandoned" = useMemo(() => {
    if (!match) return "loading";
    if (match.status === "abandoned") return "abandoned";
    if (match.status === "finished") return "finished";
    if (!match.hasPlayer2) return "waiting";
    const mineSet = mySlot === 1 ? match.hasSecret1 : match.hasSecret2;
    if (match.status !== "playing") return mineSet ? "waiting_secret" : "setup";
    return "playing";
  }, [match, mySlot]);

  const myTurn = phase === "playing" && match?.currentTurn === mySlot;

  /* auto-submit expired turn (server validates real elapsed time) */
  useEffect(() => {
    if (phase !== "playing" || !match || timerTotal === 0) return;
    if (secondsLeft > 0) return;
    const key = `${match.turnStartedAt}-${match.currentTurn}-${match.guesses.length}`;
    if (timeoutAttempted.current === key) return;
    timeoutAttempted.current = key;
    post({ action: "submit_turn", isTimeout: true, guessId: makeId("to"), version: match.version })
      .then(({ data }) => { if (data.match && aliveRef.current) applyMatch(data.match); })
      .catch(() => { timeoutAttempted.current = ""; });
  }, [secondsLeft, phase, match, timerTotal, post, applyMatch]);

  /* record result once */
  useEffect(() => {
    if (phase !== "finished" || !match || recordedRef.current) return;
    recordedRef.current = true;
    const won = match.winnerSlot === mySlot;
    setMyMood(won ? "win" : "lose");
    setOppMood(won ? "lose" : "win");
    if (won) { fireWinEffect(me.effectId); soundEngine.playVictory(); } else soundEngine.playDefeat();
    saveRoomSession(null);
    const mine = match.guesses.filter((g) => g.playerSlot === mySlot);
    onResult({
      won,
      mode: "online_1v1",
      turnsTaken: Math.max(1, mine.filter((g) => !g.isTimeout).length),
      ordersTotal: mine.reduce((s, g) => s + g.orders, 0),
      trophyDelta: computeTrophyDelta(won, "online_1v1"),
      coinsEarned: won ? 90 : 25,
      xpEarned: won ? 130 : 55,
      endReason: match.endReason || "cracked",
      winnerName: match.winnerName || "",
      myName: mySlot === 1 ? match.player1Name : match.player2Name,
      oppName: mySlot === 1 ? match.player2Name : match.player1Name,
    });
  }, [phase, match, mySlot, me.effectId, onResult]);

  const myGuesses = match?.guesses.filter((g) => g.playerSlot === mySlot) || [];
  const oppGuesses = match?.guesses.filter((g) => g.playerSlot === oppSlot) || [];
  const oppName = match ? (mySlot === 1 ? match.player2Name : match.player1Name) : "Rival";
  const oppAvatar: AvatarConfig = match ? (mySlot === 1 ? match.player2Avatar : match.player1Avatar) : DEFAULT_AVATAR;
  const oppFrame = match ? (mySlot === 1 ? match.player2Frame : match.player1Frame) || "frame_emerald" : "frame_emerald";
  const oppDivision = match ? (mySlot === 1 ? match.player2Division : match.player1Division) : "Bronze";

  const oppSeenRaw = mySlot === 1 ? presence.p2 : presence.p1;
  const oppGoneSec = match?.hasPlayer2
    ? oppSeenRaw ? Math.max(0, (serverNow - new Date(oppSeenRaw).getTime()) / 1000) : 999
    : 0;
  const oppOffline = oppGoneSec > 10;
  const canClaimWin = phase === "playing" && oppGoneSec >= 25;

  const autoOut = useMemo(() => {
    const out = new Set<string>();
    for (const g of myGuesses) if (!g.isTimeout && g.points === 0) for (const ch of g.guess) out.add(ch);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  const pressDigit = (d: string) => {
    const isSetup = phase === "setup";
    if (scratch && phase === "playing") {
      soundEngine.playTap(460);
      setMarks((m) => ({ ...m, [d]: m[d] === undefined ? "eliminated" : m[d] === "eliminated" ? "confirmed" : undefined }));
      return;
    }
    const buf = isSetup ? setupBuffer : buffer;
    const setBuf = isSetup ? setSetupBuffer : setBuffer;
    if (!isSetup && !myTurn) return;
    if (buf.includes(d) || buf.length >= 4) { setShakeTiles(true); setTimeout(() => setShakeTiles(false), 450); return; }
    soundEngine.playTap(440 + Number(d) * 25);
    setBuf(buf + d);
  };
  const pressDelete = () => {
    soundEngine.playDelete();
    if (phase === "setup") setSetupBuffer((b) => b.slice(0, -1)); else setBuffer((b) => b.slice(0, -1));
  };

  const submitGuess = async () => {
    if (!match || submitting || !isValidSecretCode(buffer)) return;
    setSubmitting(true);
    const guessId = makeId("g");
    const guess = buffer;
    try {
      const { res, data } = await post({ action: "submit_turn", guess, guessId, version: match.version });
      if (data.match) {
        applyMatch(data.match);
        setBuffer("");
        if (!res.ok && data.error) showToast("Synced with rival — your guess is in!", "ok");
      } else if (data.error) {
        showToast(data.error, "err");
      }
    } catch {
      showToast("Connection hiccup — tap GUESS again!", "err");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmSecret = async () => {
    const code = isValidSecretCode(setupBuffer) ? setupBuffer : generateRandomCode();
    setSubmitting(true);
    try {
      const { data } = await post({ action: "set_secret", secret: code });
      if (data.match) {
        setMySecret(code);
        const rs = loadRoomSession();
        if (rs) saveRoomSession({ ...rs, secret: code, savedAt: Date.now() });
        applyMatch(data.match);
        soundEngine.playReward();
      }
    } catch { showToast("Couldn't save your code — try again", "err"); }
    setSubmitting(false);
  };

  const leaveMatch = async () => {
    try {
      const { data } = await post({ action: "forfeit" });
      const m = data.match as MatchView | undefined;
      // Leaving a live match counts as a loss — record it before exiting.
      if (m && m.status === "finished" && m.winnerSlot === oppSlot && !recordedRef.current) {
        recordedRef.current = true;
        const mine = m.guesses.filter((g) => g.playerSlot === mySlot);
        onResult({
          won: false,
          mode: "online_1v1",
          turnsTaken: Math.max(1, mine.filter((g) => !g.isTimeout).length),
          ordersTotal: mine.reduce((s, g) => s + g.orders, 0),
          trophyDelta: computeTrophyDelta(false, "online_1v1"),
          coinsEarned: 10,
          xpEarned: 25,
          endReason: "forfeit",
          winnerName: m.winnerName || "",
          myName: mySlot === 1 ? m.player1Name : m.player2Name,
          oppName: mySlot === 1 ? m.player2Name : m.player1Name,
        });
      }
    } catch {}
    saveRoomSession(null);
    onExit();
  };

  const claimWin = async () => {
    try {
      const { data } = await post({ action: "claim_disconnect_win" });
      if (data.match) applyMatch(data.match);
      else if (data.error) showToast(data.error, "err");
    } catch { showToast("Try again in a second", "err"); }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (chatOpen) return;
      if (e.key >= "1" && e.key <= "9") pressDigit(e.key);
      else if (e.key === "Backspace") { e.preventDefault(); pressDelete(); }
      else if (e.key === "Enter") { if (phase === "setup") confirmSecret(); else if (myTurn) submitGuess(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const copyCode = async () => {
    try { await navigator.clipboard.writeText(roomCode); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  };
  const shareCode = async () => {
    const text = `Join my Cipher Clash duel! Room code: ${roomCode}`;
    try {
      if (navigator.share) await navigator.share({ title: "Cipher Clash", text });
      else await copyCode();
    } catch {}
  };

  const best = (list: GuessEntry[]) => list.reduce((mx, g) => Math.max(mx, g.orders), 0);
  const iWon = match?.winnerSlot === mySlot;

  return (
    <div className="board-theme min-h-[100dvh] flex flex-col" data-board={me.themeId}>
      <HeaderBar
        onBack={() => setConfirmLeave(true)}
        backTitle="Leave match"
        left={
          <Stage name={me.username} title={`You · P${mySlot}`} config={me.avatarConfig} frameId={me.frameId}
            mood={phase === "finished" ? myMood : myMood} isTurn={!!myTurn}
            scoreLabel={`${myGuesses.length} guesses · best ${best(myGuesses)}/4`} floaters={social.floaters} align="left" />
        }
        center={
          <div className="flex flex-col items-center gap-1.5">
            <TimerRing secondsLeft={secondsLeft} total={timerTotal} active={phase === "playing"} />
            <button onClick={() => { setChatOpen(true); social.markRead(true); }} className="btn-game relative w-10 h-10 !rounded-full flex items-center justify-center"
              style={{ background: "var(--board-key)", color: "var(--board-ink)", border: "2px solid var(--board-border)", boxShadow: "0 3px 0 var(--board-border)" }} title="Chat with rival">
              <MessageCircle size={18} strokeWidth={2.6} />
              {social.unread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#FF4B4B] text-white text-[10px] font-black flex items-center justify-center animate-pop">
                  {social.unread}
                </span>
              )}
            </button>
          </div>
        }
        right={
          <Stage name={oppName} title={`${oppDivision} · P${oppSlot}`} config={oppAvatar} frameId={oppFrame}
            mood={oppMood} isTurn={phase === "playing" && !myTurn}
            scoreLabel={match?.hasPlayer2 ? `${oppGuesses.length} guesses · best ${best(oppGuesses)}/4` : "waiting..."}
            floaters={social.floaters} align="right" />
        }
      />

      {/* status banners */}
      <div className="max-w-5xl w-full mx-auto px-3 sm:px-5 mt-2 space-y-2">
        {connFails >= 2 && (
          <div className="rounded-2xl px-4 py-2 flex items-center justify-center gap-2 font-black text-sm animate-pulse"
            style={{ background: "#FF4B4B", color: "#fff" }}>
            <WifiOff size={16} /> Reconnecting... your game is safe, hang tight!
          </div>
        )}
        <div className="rounded-2xl px-4 py-2 text-center font-display font-semibold text-sm sm:text-base"
          style={{ background: "var(--board-panel)", color: "var(--board-ink)", border: "2px solid var(--board-border)" }}>
          {phase === "loading" && "Connecting to your match..."}
          {phase === "waiting" && "Waiting for a rival to join..."}
          {phase === "setup" && "Hide your secret code!"}
          {phase === "waiting_secret" && (oppOffline ? `${oppName} seems to be away...` : `Locked in! Waiting for ${oppName} to hide their code...`)}
          {phase === "playing" && (myTurn ? "Your turn — crack their code!" : oppOffline ? `${oppName} may have disconnected...` : `${oppName} is guessing...`)}
          {phase === "finished" && "Match over!"}
          {phase === "abandoned" && "This match was closed."}
        </div>

        {phase === "waiting" && (
          <div className="rounded-2xl p-4 text-center animate-rise" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)", color: "var(--board-ink)" }}>
            <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: "var(--board-soft)" }}>Room code — share it with a friend!</p>
            <div className="flex items-center justify-center gap-2 mt-1.5">
              <span className="font-display font-bold text-4xl tracking-[0.18em]">{roomCode}</span>
              <button onClick={copyCode} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" title="Copy code">
                {copied ? <Check size={18} style={{ color: "#58CC02" }} /> : <Copy size={18} />}
              </button>
              <button onClick={shareCode} className="btn-game btn-blue w-10 h-10 !rounded-xl flex items-center justify-center" title="Share invite">
                <Share2 size={18} />
              </button>
            </div>
            <div className="flex items-start justify-center gap-2 mt-3 text-left max-w-md mx-auto">
              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FFF3C4", color: "#E0A800" }}>
                <Lightbulb size={15} strokeWidth={2.6} />
              </span>
              <p key={tipIdx} className="text-[13px] font-bold animate-fade" style={{ color: "var(--board-soft)" }}>{TIPS[tipIdx]}</p>
            </div>
          </div>
        )}

        {(canClaimWin || (oppOffline && phase === "waiting_secret")) && (
          <button onClick={claimWin} className="btn-game btn-gold w-full py-3 flex items-center justify-center gap-2 animate-pop">
            <Flag size={17} strokeWidth={2.7} /> {phase === "playing" ? "Rival is gone — claim your win!" : "Rival never showed — close this room"}
          </button>
        )}
      </div>

      {/* history */}
      <div className="flex-1 w-full max-w-5xl mx-auto px-3 sm:px-5 py-3 grid sm:grid-cols-2 gap-3 content-start overflow-y-auto pretty-scroll">
        <div className="rounded-2xl p-3" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
          <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--board-soft)" }}>Your guesses → cracking {oppName}</p>
          <div className="space-y-1.5">
            {myGuesses.length === 0 && <p className="text-sm font-bold py-3 text-center" style={{ color: "var(--board-soft)" }}>No guesses yet</p>}
            {myGuesses.map((g, i) => <GuessRow key={g.id} g={g} highlight={i === myGuesses.length - 1} />)}
          </div>
        </div>
        <div className="rounded-2xl p-3" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
          <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: "var(--board-soft)" }}>{oppName}&rsquo;s guesses → cracking you</p>
          <div className="space-y-1.5">
            {oppGuesses.length === 0 && <p className="text-sm font-bold py-3 text-center" style={{ color: "var(--board-soft)" }}>No guesses yet</p>}
            {oppGuesses.map((g, i) => <GuessRow key={g.id} g={g} highlight={i === oppGuesses.length - 1} />)}
          </div>
        </div>
        <p className="sm:col-span-2 text-center text-[11px] font-bold" style={{ color: "var(--board-soft)" }}>
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#58CC02] border border-[#46A302] align-middle" /> right digit + right place&nbsp;&nbsp;
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#1CB0F6] border border-[#0E86C8] align-middle" /> right digit, wrong place
        </p>
      </div>

      {/* bottom dock */}
      {(phase === "setup" || phase === "playing") && (
        <div className="sticky bottom-0 z-30 px-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          style={{ background: "color-mix(in srgb, var(--board-panel) 92%, transparent)", backdropFilter: "blur(10px)", borderTop: "2px solid var(--board-border)" }}>
          <div className="max-w-xl mx-auto space-y-2.5">
            {phase === "setup" ? (
              <>
                <p className="text-center text-xs font-black" style={{ color: "var(--board-soft)" }}>
                  Pick 4 DIFFERENT digits (1–9)
                  {(mySlot === 1 ? match?.hasSecret2 : match?.hasSecret1) && <span className="ml-1" style={{ color: "#58CC02" }}>· {oppName} is ready!</span>}
                </p>
                <InputTiles value={setupBuffer} secret shake={shakeTiles} />
                <Keypad buffer={setupBuffer} onDigit={pressDigit} onDelete={pressDelete} disabled={submitting} scratch={false} scratchMarks={{}} autoOut={new Set()} />
                <div className="flex gap-2">
                  <button onClick={() => setSetupBuffer(generateRandomCode())} className="btn-game btn-ghost flex-1 py-3 flex items-center justify-center gap-2">
                    <Dices size={18} strokeWidth={2.6} /> Random
                  </button>
                  <button onClick={confirmSecret} disabled={setupBuffer.length !== 4 || submitting} className="btn-game btn-green flex-[2] py-3 flex items-center justify-center gap-2 text-lg">
                    <Lock size={19} strokeWidth={2.7} /> Lock it in!
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <ReactionsBar onReact={social.sendReaction} compact />
                  <button onClick={() => { setScratch((s) => !s); soundEngine.playTap(520); }}
                    className={`btn-game px-3 py-1.5 text-xs flex items-center gap-1.5 ${scratch ? "btn-purple" : "btn-ghost"}`}>
                    <Pencil size={14} strokeWidth={2.7} /> {scratch ? "Marking..." : "Notes"}
                  </button>
                </div>
                <InputTiles value={buffer} shake={shakeTiles} />
                <Keypad buffer={buffer} onDigit={pressDigit} onDelete={pressDelete} disabled={(!myTurn || submitting) && !scratch} scratch={scratch} scratchMarks={marks} autoOut={autoOut} />
                <button onClick={submitGuess} disabled={!myTurn || buffer.length !== 4 || submitting || scratch}
                  className="btn-game btn-green w-full py-3.5 text-lg flex items-center justify-center gap-2">
                  <Swords size={20} strokeWidth={2.7} />
                  {submitting ? "Sending..." : scratch ? "Tap digits to mark them" : myTurn ? "GUESS!" : `Waiting for ${oppName}...`}
                </button>
                {mySecret && (
                  <p className="text-center text-[11px] font-bold flex items-center justify-center gap-1.5" style={{ color: "var(--board-soft)" }}>
                    <Eye size={12} /> Your secret code: <span className="font-display tracking-[0.3em]" style={{ color: "var(--board-ink)" }}>{mySecret}</span>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* leave confirm */}
      {confirmLeave && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 animate-fade" onClick={() => setConfirmLeave(false)} />
          <div className="relative card-game p-5 w-full max-w-sm text-center animate-pop">
            <h3 className="font-display font-bold text-xl">Leave this match?</h3>
            <p className="text-sm font-bold mt-1" style={{ color: "var(--ink-soft)" }}>
              {phase === "playing" ? "Leaving now counts as a loss and your rival wins." : "The room will be closed."}
            </p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <button onClick={() => setConfirmLeave(false)} className="btn-game btn-ghost py-3">Stay</button>
              <button onClick={leaveMatch} className="btn-game btn-red py-3">Leave</button>
            </div>
          </div>
        </div>
      )}

      {phase === "finished" && match && (
        <ResultOverlay
          title={iWon ? "YOU CRACKED IT!" : `${oppName} wins this one`}
          subtitle={
            match.endReason === "disconnect" ? (iWon ? "Your rival disconnected — victory is yours!" : "You were disconnected for too long.")
            : match.endReason === "forfeit" ? (iWon ? "Your rival left the match." : "You left the match.")
            : match.endReason === "afk" ? (iWon ? "Your rival ran out of turns (AFK)." : "Too many timeouts — stay in the game!")
            : iWon ? "Brilliant detective work!" : "Great duel — run it back!"
          }
          winnerConfig={iWon ? me.avatarConfig : oppAvatar}
          loserConfig={iWon ? oppAvatar : me.avatarConfig}
          winnerFrame={iWon ? me.frameId : oppFrame}
          rewards={{ coins: iWon ? 90 : 25, xp: iWon ? 130 : 55, trophies: computeTrophyDelta(iWon, "online_1v1") }}
          turns={match.guesses.filter((g) => g.playerSlot === match.winnerSlot && !g.isTimeout).length}
          onPlayAgain={() => (onPlayAgainOnline ? onPlayAgainOnline() : onExit())}
          onHome={onExit}
          playAgainLabel="Find new rival"
        />
      )}

      {phase === "abandoned" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 animate-fade" />
          <div className="relative card-game p-6 w-full max-w-sm text-center animate-pop">
            <Character config={me.avatarConfig} mood="sleepy" size={110} />
            <h3 className="font-display font-bold text-xl mt-2">Match closed</h3>
            <p className="text-sm font-bold mt-1" style={{ color: "var(--ink-soft)" }}>No winner this time — no stats changed.</p>
            <button onClick={() => { saveRoomSession(null); onExit(); }} className="btn-game btn-green w-full py-3 mt-4">Back to Home</button>
          </div>
        </div>
      )}

      <MatchChatPanel
        open={chatOpen}
        onClose={() => { setChatOpen(false); social.markRead(false); }}
        opponentName={oppName}
        mySlot={mySlot}
        messages={social.messages}
        onSend={social.sendMessage}
        onPhrase={social.sendPhrase}
      />
    </div>
  );
}

export default function GameBoard(props: BoardProps) {
  if (props.config.mode === "online") return <OnlineGame {...props} />;
  return <LocalGame {...props} />;
}
