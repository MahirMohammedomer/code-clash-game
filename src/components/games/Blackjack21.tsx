"use client";

/**
 * Blackjack 21 — original from-scratch casino card game.
 * 4-deck shoe, chip betting, doubles, 3:2 blackjack payouts, a persistent
 * bankroll, win-streak flames and a peak-balance best score. Dealer stands
 * on all 17s. All cards are drawn with CSS — no images.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArcadeShell } from "./Shell";
import { bumpPlays, getBest, submitScore } from "@/lib/arcade";
import { sfx } from "@/lib/arcade-sound";

type Suit = "♠" | "♥" | "♦" | "♣";
interface CardT { suit: Suit; rank: string; id: number }

let cardId = 1;
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const CHIP_VALUES = [10, 25, 50, 100, 500];
const CHIP_COLORS: Record<number, string> = {
  10: "#38BDF8", 25: "#4ADE80", 50: "#F87171", 100: "#2B2F3A", 500: "#A560E8",
};

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

function buildShoe(): CardT[] {
  const cards: CardT[] = [];
  for (let d = 0; d < 4; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) cards.push({ suit, rank, id: cardId++ });
    }
  }
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function handValue(hand: CardT[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of hand) {
    if (c.rank === "A") { total += 11; aces++; }
    else if (["K", "Q", "J"].includes(c.rank)) total += 10;
    else total += Number(c.rank);
  }
  let soft = aces > 0;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
    if (aces === 0) soft = false;
  }
  return { total, soft: soft && total !== 21 };
}

function loadBalance(): number {
  try {
    const v = Number(localStorage.getItem("arcade_blackjack_balance") ?? 1000);
    return Number.isFinite(v) && v >= 0 ? v : 1000;
  } catch { return 1000; }
}

type Phase = "betting" | "dealing" | "player" | "dealer" | "settled";

export default function Blackjack21({ onBack }: { onBack: () => void }) {
  const [balance, setBalanceState] = useState<number>(() => loadBalance());
  const [bet, setBetState] = useState(0);
  const [playerHand, setPlayerHand] = useState<CardT[]>([]);
  const [dealerHand, setDealerHand] = useState<CardT[]>([]);
  const [holeHidden, setHoleHidden] = useState(true);
  const [phase, setPhase] = useState<Phase>("betting");
  const [message, setMessage] = useState("Place your bet!");
  const [lastWin, setLastWin] = useState(0);
  const [streak, setStreak] = useState(0);
  const [stats, setStats] = useState({ hands: 0, won: 0, blackjacks: 0 });
  const [best, setBest] = useState(() => getBest("blackjack"));

  const shoeRef = useRef<CardT[]>(buildShoe());
  const balanceRef = useRef(balance);
  const betRef = useRef(0);
  const wagerRef = useRef(0); // total wagered this hand (bet, or 2×bet after double)
  const playerRef = useRef<CardT[]>([]);
  const dealerRef = useRef<CardT[]>([]);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const streakRef = useRef(0);

  useEffect(() => {
    bumpPlays("blackjack");
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const setBalance = useCallback((v: number) => {
    balanceRef.current = v;
    setBalanceState(v);
    try { localStorage.setItem("arcade_blackjack_balance", String(v)); } catch {}
    if (v > getBest("blackjack")) {
      const res = submitScore("blackjack", v);
      setBest(res.best);
    }
  }, []);

  const setBet = useCallback((v: number) => {
    betRef.current = v;
    setBetState(v);
  }, []);

  const draw = useCallback((): CardT => {
    if (shoeRef.current.length < 15) shoeRef.current = buildShoe();
    return shoeRef.current.pop()!;
  }, []);

  const settle = useCallback(async (result: "blackjack" | "win" | "lose" | "push" | "bust" | "dealerBust") => {
    const wager = wagerRef.current;
    let payout = 0;
    let msg = "";
    if (result === "blackjack") {
      payout = wager + Math.floor(wager * 1.5);
      msg = "BLACKJACK! Pays 3:2 🎉";
      setStats((s) => ({ ...s, won: s.won + 1, blackjacks: s.blackjacks + 1 }));
      sfx.golden();
    } else if (result === "win" || result === "dealerBust") {
      payout = wager * 2;
      msg = result === "win" ? "You win! 🎉" : "Dealer busts — you win! 🎉";
      setStats((s) => ({ ...s, won: s.won + 1 }));
      sfx.win();
    } else if (result === "push") {
      payout = wager;
      msg = "Push — bet returned 🤝";
      sfx.click();
    } else {
      msg = result === "bust" ? "Bust! Over 21 💥" : "Dealer wins 😞";
      sfx.hit();
    }

    const net = payout - wager;
    setLastWin(net);
    if (net > 0) {
      streakRef.current++;
    } else if (net < 0) {
      streakRef.current = 0;
    }
    setStreak(streakRef.current);

    if (payout > 0) {
      // little count-up feel
      const from = balanceRef.current;
      const steps = 10;
      for (let i = 1; i <= steps; i++) {
        if (!mountedRef.current) return;
        setBalance(from + Math.round((payout / steps) * i));
        await sleep(36);
      }
    }
    setMessage(msg);
    setPhase("settled");
    busyRef.current = false;
  }, [setBalance]);

  const dealerPlay = useCallback(async () => {
    setPhase("dealer");
    setMessage("Dealer plays…");
    setHoleHidden(false);
    sfx.flap();
    await sleep(620);
    if (!mountedRef.current) return;

    let dHand = dealerRef.current;
    while (handValue(dHand).total < 17) {
      const c = draw();
      dHand = [...dHand, c];
      dealerRef.current = dHand;
      setDealerHand(dHand);
      sfx.flap();
      await sleep(560);
      if (!mountedRef.current) return;
    }

    const dTotal = handValue(dHand).total;
    const pTotal = handValue(playerRef.current).total;
    if (dTotal > 21) void settle("dealerBust");
    else if (pTotal > dTotal) void settle("win");
    else if (pTotal < dTotal) void settle("lose");
    else void settle("push");
  }, [draw, settle]);

  const deal = useCallback(async () => {
    if (busyRef.current || betRef.current <= 0) return;
    if (shoeRef.current.length < 52) {
      shoeRef.current = buildShoe();
      setMessage("Shuffling a fresh shoe… 🃏");
      await sleep(650);
      if (!mountedRef.current) return;
    }
    busyRef.current = true;
    setPhase("dealing");
    setLastWin(0);
    setBalance(balanceRef.current - betRef.current);
    wagerRef.current = betRef.current;
    setStats((s) => ({ ...s, hands: s.hands + 1 }));

    let p: CardT[] = [];
    let d: CardT[] = [];
    playerRef.current = p;
    dealerRef.current = d;
    setPlayerHand(p);
    setDealerHand(d);
    setHoleHidden(true);
    setMessage("Dealing…");

    const dealTo = async (who: "p" | "d") => {
      const c = draw();
      if (who === "p") {
        p = [...p, c];
        playerRef.current = p;
        setPlayerHand(p);
      } else {
        d = [...d, c];
        dealerRef.current = d;
        setDealerHand(d);
      }
      sfx.flap();
      await sleep(330);
    };

    await dealTo("p");
    if (!mountedRef.current) return;
    await dealTo("d");
    if (!mountedRef.current) return;
    await dealTo("p");
    if (!mountedRef.current) return;
    await dealTo("d");
    if (!mountedRef.current) return;

    const pVal = handValue(p);
    const dVal = handValue(d);
    if (pVal.total === 21 || dVal.total === 21) {
      setHoleHidden(false);
      await sleep(500);
      if (!mountedRef.current) return;
      if (pVal.total === 21 && dVal.total === 21) void settle("push");
      else if (pVal.total === 21) void settle("blackjack");
      else void settle("lose");
      return;
    }

    setPhase("player");
    setMessage("Your move — hit, stand or double?");
    busyRef.current = false;
  }, [draw, settle, setBalance]);

  const hit = useCallback(async () => {
    if (busyRef.current || phase !== "player") return;
    busyRef.current = true;
    const c = draw();
    const p = [...playerRef.current, c];
    playerRef.current = p;
    setPlayerHand(p);
    sfx.flap();
    await sleep(360);
    if (!mountedRef.current) return;
    const v = handValue(p);
    if (v.total > 21) {
      setHoleHidden(false);
      void settle("bust");
    } else if (v.total === 21) {
      void dealerPlay();
    } else {
      busyRef.current = false;
    }
  }, [phase, draw, settle, dealerPlay]);

  const stand = useCallback(() => {
    if (busyRef.current || phase !== "player") return;
    busyRef.current = true;
    void dealerPlay();
  }, [phase, dealerPlay]);

  const doubleDown = useCallback(async () => {
    if (busyRef.current || phase !== "player") return;
    if (playerRef.current.length !== 2 || balanceRef.current < betRef.current) return;
    busyRef.current = true;
    setBalance(balanceRef.current - betRef.current);
    wagerRef.current = betRef.current * 2;
    setBet(betRef.current * 2);
    sfx.golden();
    const c = draw();
    const p = [...playerRef.current, c];
    playerRef.current = p;
    setPlayerHand(p);
    sfx.flap();
    await sleep(480);
    if (!mountedRef.current) return;
    const v = handValue(p);
    if (v.total > 21) {
      setHoleHidden(false);
      void settle("bust");
    } else {
      void dealerPlay();
    }
  }, [phase, draw, settle, dealerPlay, setBalance, setBet]);

  const addChip = (v: number) => {
    if (phase !== "betting" && phase !== "settled") return;
    if (phase === "settled") {
      // start a fresh betting round
      setPlayerHand([]);
      setDealerHand([]);
      playerRef.current = [];
      dealerRef.current = [];
      setPhase("betting");
      setBet(0);
      wagerRef.current = 0;
    }
    const next = Math.min(balanceRef.current, betRef.current + v);
    if (next !== betRef.current) {
      setBet(next);
      sfx.click();
    }
  };

  const newBettingRound = (rebet: boolean) => {
    setPlayerHand([]);
    setDealerHand([]);
    playerRef.current = [];
    dealerRef.current = [];
    setHoleHidden(true);
    setPhase("betting");
    setMessage("Place your bet!");
    if (!rebet) setBet(0);
    else setBet(Math.min(wagerRef.current > 0 ? (wagerRef.current === betRef.current * 2 ? betRef.current / 2 : betRef.current) : 0, balanceRef.current));
    wagerRef.current = 0;
  };

  const restart = useCallback(() => {
    if (busyRef.current && (phase === "dealing" || phase === "dealer")) return;
    shoeRef.current = buildShoe();
    setBalance(1000);
    setBet(0);
    wagerRef.current = 0;
    playerRef.current = [];
    dealerRef.current = [];
    setPlayerHand([]);
    setDealerHand([]);
    setHoleHidden(true);
    setPhase("betting");
    setMessage("Fresh bankroll — place your bet!");
    setLastWin(0);
    streakRef.current = 0;
    setStreak(0);
    setStats({ hands: 0, won: 0, blackjacks: 0 });
  }, [phase, setBalance, setBet]);

  const pVal = handValue(playerHand);
  const dVal = handValue(dealerHand);
  const dShownVal = dealerHand.length > 0 ? handValue([dealerHand[0]]) : { total: 0, soft: false };
  const canDouble = phase === "player" && playerHand.length === 2 && balance >= bet && bet > 0;
  const broke = balance < 10 && bet === 0 && (phase === "betting" || phase === "settled");

  return (
    <ArcadeShell
      title="Blackjack 21"
      emoji="🃏"
      color="linear-gradient(135deg,#0E7C66,#14532D)"
      score={balance}
      scoreLabel="Bankroll 🪙"
      best={best}
      onBack={onBack}
      onRestart={restart}
    >
      <div className="w-full max-w-3xl mx-auto px-3 flex flex-col items-center my-auto w-full">
        {/* table */}
        <div
          className="w-full rounded-[28px] px-4 py-4 sm:px-8 relative overflow-hidden"
          style={{
            background: "radial-gradient(ellipse at 50% 32%, #1E9E5A 0%, #177A46 55%, #0E5C33 100%)",
            border: "3px solid #6B4423",
            boxShadow: "0 18px 44px rgba(0,0,0,0.5), inset 0 0 60px rgba(0,0,0,0.35)",
          }}
        >
          <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 font-display font-bold pointer-events-none select-none whitespace-nowrap" style={{ color: "rgba(255,255,255,0.10)", fontSize: "clamp(20px,5vw,34px)", letterSpacing: "0.08em" }}>
            BLACKJACK PAYS 3:2
          </p>

          {/* dealer */}
          <div className="relative flex flex-col items-center min-h-[118px]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.35)", color: "#BFF3D9" }}>
                Dealer {dealerHand.length > 0 && (holeHidden ? `· ${dShownVal.total} + ?` : `· ${dVal.total}`)}
              </span>
            </div>
            <div className="flex justify-center" style={{ minHeight: 96 }}>
              {dealerHand.map((card, i) => (
                <PlayingCard key={card.id} card={card} faceDown={holeHidden && i === 1} index={i} />
              ))}
              {dealerHand.length === 0 && <EmptySlots n={2} />}
            </div>
          </div>

          {/* message */}
          <div className="relative flex justify-center py-2">
            <p key={message} className="banner-pop font-display font-bold text-white text-lg sm:text-xl px-4 py-1.5 rounded-full text-center" style={{ background: "rgba(0,0,0,0.38)", textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
              {message}
              {phase === "settled" && lastWin !== 0 && (
                <span style={{ color: lastWin > 0 ? "#FFE27A" : "#FF9D9D" }}> {lastWin > 0 ? `+${lastWin.toLocaleString()} 🪙` : `${lastWin.toLocaleString()} 🪙`}</span>
              )}
              {streak >= 3 && <span> 🔥{streak}</span>}
            </p>
          </div>

          {/* player */}
          <div className="relative flex flex-col items-center min-h-[118px]">
            <div className="flex justify-center" style={{ minHeight: 96 }}>
              {playerHand.map((card, i) => (
                <PlayingCard key={card.id} card={card} index={i} />
              ))}
              {playerHand.length === 0 && <EmptySlots n={2} />}
            </div>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(0,0,0,0.35)", color: "#FFE9B8" }}>
                You {playerHand.length > 0 && `· ${pVal.soft ? `${pVal.total - 10}/${pVal.total}` : pVal.total}${pVal.total === 21 && playerHand.length === 2 ? " BJ!" : ""}`}
              </span>
              {bet > 0 && phase !== "betting" && (
                <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: "rgba(255,200,0,0.3)", color: "#FFE27A" }}>
                  Bet {bet.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* controls */}
        <div className="w-full mt-3 flex flex-col items-center gap-2.5 min-h-[104px]">
          {(phase === "betting" || phase === "settled") && !broke && (
            <>
              <div className="flex items-end justify-center gap-2 flex-wrap">
                {CHIP_VALUES.map((v) => (
                  <button
                    key={v}
                    onClick={() => addChip(v)}
                    disabled={bet + v > balance && balance <= bet}
                    className="rounded-full font-black text-white flex items-center justify-center active:scale-90 transition-transform disabled:opacity-35"
                    style={{
                      width: 52, height: 52,
                      background: CHIP_COLORS[v],
                      border: "3.5px dashed rgba(255,255,255,0.85)",
                      boxShadow: "0 4px 0 rgba(0,0,0,0.4), inset 0 0 0 3px rgba(0,0,0,0.15)",
                      fontSize: 13,
                      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
                    }}
                    aria-label={`Bet ${v}`}
                  >
                    {v}
                  </button>
                ))}
                <div className="flex flex-col items-center ml-1">
                  <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.55)" }}>Bet</span>
                  <span className="font-display font-bold text-xl text-white tabular-nums">{bet.toLocaleString()} 🪙</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                {phase === "settled" ? (
                  <>
                    <button onClick={() => { newBettingRound(true); }} className="btn-game px-4 py-2.5 text-sm" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "2px solid rgba(255,255,255,0.25)" }}>
                      ↺ Rebet
                    </button>
                    <button onClick={() => newBettingRound(false)} className="btn-game btn-green px-5 py-2.5 text-sm">
                      New bet
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => { setBet(0); sfx.click(); }} disabled={bet === 0} className="btn-game px-4 py-2.5 text-sm disabled:opacity-40" style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "2px solid rgba(255,255,255,0.25)" }}>
                      Clear
                    </button>
                    <button onClick={() => { setBet(balance); sfx.click(); }} disabled={balance <= 0} className="btn-game px-4 py-2.5 text-sm disabled:opacity-40" style={{ background: "rgba(255,200,0,0.22)", color: "#FFE27A", border: "2px solid rgba(255,200,0,0.45)" }}>
                      All in
                    </button>
                    <button onClick={() => void deal()} disabled={bet <= 0} className="btn-game btn-green px-7 py-2.5 text-base disabled:opacity-40">
                      DEAL 🃏
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {broke && (
            <div className="text-center">
              <p className="font-display font-semibold text-white mb-2">Out of chips! The house spots you a fresh stack 💸</p>
              <button
                onClick={() => { setBalance(balanceRef.current + 1000); setPhase("betting"); setMessage("Place your bet!"); sfx.golden(); }}
                className="btn-game btn-orange px-6 py-3 text-base"
              >
                +1,000 🪙 free rebuy
              </button>
            </div>
          )}

          {phase === "player" && (
            <div className="flex gap-2 flex-wrap justify-center pt-2">
              <button onClick={() => void hit()} className="btn-game btn-green px-7 py-3.5 text-base">Hit</button>
              <button onClick={stand} className="btn-game btn-red px-7 py-3.5 text-base">Stand</button>
              <button onClick={() => void doubleDown()} disabled={!canDouble} className="btn-game px-6 py-3.5 text-base disabled:opacity-40" style={{ background: "linear-gradient(120deg,#FFC800,#FF7A18)", color: "#4A2A00", border: "2px solid rgba(255,255,255,0.4)" }}>
                Double ⬇
              </button>
            </div>
          )}

          {(phase === "dealing" || phase === "dealer") && (
            <p className="font-display font-semibold pt-4 animate-pulse" style={{ color: "rgba(255,255,255,0.7)" }}>…</p>
          )}
        </div>

        <p className="text-[11px] font-bold mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
          🎴 {stats.hands} hands · 🏆 {stats.won} won · ♠️ {stats.blackjacks} blackjacks · Dealer stands on all 17s · virtual coins only, just for fun!
        </p>
      </div>
    </ArcadeShell>
  );
}

function EmptySlots({ n }: { n: number }) {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className="block rounded-lg"
          style={{
            width: "clamp(52px,13vw,78px)",
            aspectRatio: "5/7",
            border: "2px dashed rgba(255,255,255,0.25)",
            marginLeft: i > 0 ? -18 : 0,
            background: "rgba(0,0,0,0.14)",
          }}
          aria-hidden
        />
      ))}
    </>
  );
}

function PlayingCard({ card, faceDown = false, index }: { card: CardT; faceDown?: boolean; index: number }) {
  const red = card.suit === "♥" || card.suit === "♦";
  const w = "clamp(52px,13vw,78px)";
  return (
    <span
      className="card-in block relative shrink-0"
      style={{
        width: w,
        aspectRatio: "5/7",
        marginLeft: index > 0 ? -18 : 0,
        zIndex: index + 1,
        perspective: 500,
      }}
      aria-hidden
    >
      <span
        className="absolute inset-0 block"
        style={{
          transformStyle: "preserve-3d",
          transition: "transform 0.45s ease",
          transform: faceDown ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* front */}
        <span
          className="absolute inset-0 block rounded-lg overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            background: "linear-gradient(160deg,#FFFFFF,#EEF1F6)",
            border: "1.5px solid rgba(0,0,0,0.18)",
            boxShadow: "0 4px 10px rgba(0,0,0,0.35)",
            color: red ? "#D92B1F" : "#23262E",
          }}
        >
          <span className="absolute font-black leading-none text-center" style={{ top: "5%", left: "7%", fontSize: "clamp(13px,3.4vw,20px)" }}>
            {card.rank}
            <span className="block" style={{ fontSize: "clamp(10px,2.6vw,15px)" }}>{card.suit}</span>
          </span>
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 leading-none" style={{ fontSize: "clamp(26px,6.5vw,40px)" }}>
            {card.suit}
          </span>
          <span className="absolute font-black leading-none text-center" style={{ bottom: "5%", right: "7%", fontSize: "clamp(13px,3.4vw,20px)", transform: "rotate(180deg)" }}>
            {card.rank}
            <span className="block" style={{ fontSize: "clamp(10px,2.6vw,15px)" }}>{card.suit}</span>
          </span>
        </span>
        {/* back */}
        <span
          className="absolute inset-0 block rounded-lg overflow-hidden"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "repeating-linear-gradient(45deg,#2B3A8F 0 7px,#3D55C4 7px 14px)",
            border: "1.5px solid rgba(0,0,0,0.25)",
            boxShadow: "0 4px 10px rgba(0,0,0,0.35), inset 0 0 0 4px rgba(255,255,255,0.85), inset 0 0 0 6px rgba(43,58,143,0.6)",
          }}
        />
      </span>
    </span>
  );
}
