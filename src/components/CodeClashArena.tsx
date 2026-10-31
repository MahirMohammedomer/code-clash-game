"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import confetti from "canvas-confetti";
import {
  AIDifficulty,
  AI_PROFILES,
  TurnTimerOption,
  evaluateGuess,
  generateRandomCode,
  isValidSecretCode,
  computeAINextGuess,
  computeTrophyDelta,
} from "@/lib/game-engine";
import { soundEngine } from "@/lib/sound-effects";
import { MatchGuessEntry } from "@/db/schema";
import {
  Clock,
  Shuffle,
  Delete,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  Eye,
  EyeOff,
  ArrowLeft,
  Trophy,
  RotateCcw,
  Wifi,
  Smartphone,
  HelpCircle,
  Copy,
  Check,
  Lightbulb,
} from "lucide-react";
import MatchReplay from "@/components/MatchReplay";
import MatchSideChat from "@/components/MatchSideChat";

export type ActiveGameMode =
  | "ai"
  | "hotseat"
  | "online_1v1"
  | "local_offline"
  | "mass_hunt";

interface CodeClashArenaProps {
  mode: ActiveGameMode;
  aiDifficulty?: AIDifficulty;
  timerOption: TurnTimerOption;
  player1Id?: number;
  player1Name: string;
  player1Avatar: string;
  player2Name?: string;
  player2Avatar?: string;
  roomCode?: string;
  isPlayer2Seat?: boolean;
  tournamentId?: number;
  tournamentName?: string;
  tournamentSecret?: string;
  themeId?: string;
  onMatchComplete: (result: {
    won: boolean;
    turnsTaken: number;
    trophyDelta: number;
    coinsEarned: number;
    xpEarned: number;
    aiDifficulty?: AIDifficulty;
  }) => void;
  onExitArena: () => void;
}

type ScratchpadState = Record<string, "neutral" | "eliminated" | "confirmed">;

export default function CodeClashArena({
  mode,
  aiDifficulty = "Rookie",
  timerOption,
  player1Id,
  player1Name,
  player1Avatar,
  player2Name = "Opponent",
  player2Avatar = "⚔️",
  roomCode,
  isPlayer2Seat = false,
  tournamentId,
  tournamentName,
  tournamentSecret,
  themeId = "theme_classic",
  onMatchComplete,
  onExitArena,
}: CodeClashArenaProps) {
  const aiProfile = AI_PROFILES[aiDifficulty];
  const [liveOpponentName, setLiveOpponentName] = useState<string>(
    mode === "ai"
      ? `${aiProfile.name} (${aiDifficulty})`
      : mode === "mass_hunt"
      ? tournamentName || "Vault Target"
      : player2Name
  );
  const [liveOpponentAvatar, setLiveOpponentAvatar] = useState<string>(
    mode === "ai" ? aiProfile.emoji : mode === "mass_hunt" ? "🏦" : player2Avatar
  );

  // Phase: 'setup_p1' | 'setup_p2' | 'waiting_opponent' | 'pass_curtain' | 'playing' | 'finished'
  const [phase, setPhase] = useState<
    | "setup_p1"
    | "setup_p2"
    | "waiting_opponent"
    | "pass_curtain"
    | "playing"
    | "finished"
  >(mode === "mass_hunt" ? "playing" : "setup_p1");

  const [p1Secret, setP1Secret] = useState<string>(() => generateRandomCode());
  const [p2Secret, setP2Secret] = useState<string>(() =>
    mode === "mass_hunt" && tournamentSecret
      ? tournamentSecret
      : generateRandomCode()
  );

  const [setupBuffer, setSetupBuffer] = useState<string>("");
  const [guessBuffer, setGuessBuffer] = useState<string>("");
  const [showMySecret, setShowMySecret] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  const [currentTurn, setCurrentTurn] = useState<1 | 2>(1);
  const [guesses, setGuesses] = useState<MatchGuessEntry[]>([]);
  const [winnerSlot, setWinnerSlot] = useState<1 | 2 | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [aiThinking, setAiThinking] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<"my_attacks" | "opp_attacks">(
    "my_attacks"
  );

  const [scratchpadMode, setScratchpadMode] = useState<boolean>(false);
  const [scratchpad, setScratchpad] = useState<ScratchpadState>({});
  const [showRulesHelp, setShowRulesHelp] = useState<boolean>(false);

  const [secondsLeft, setSecondsLeft] = useState<number>(
    timerOption > 0 ? timerOption : 0
  );
  const matchStartRef = useRef<number>(Date.now());
  const rewardReportedRef = useRef<boolean>(false);

  const themeSurface =
    themeId === "theme_cyber"
      ? "bg-sky-50/90 border-sky-200"
      : themeId === "theme_royal"
      ? "bg-purple-50/90 border-purple-200"
      : "bg-[#FFFDF7] border-[#E5E0D5]";

  const triggerConfetti = useCallback(() => {
    try {
      confetti({
        particleCount: 95,
        spread: 75,
        origin: { y: 0.6 },
        colors: ["#58CC02", "#FFC800", "#1CB0F6", "#CE82FF", "#FF4B4B"],
      });
    } catch {}
  }, []);

  const finalizeMatch = useCallback(
    (winningSlot: 1 | 2, allGuesses: MatchGuessEntry[]) => {
      setWinnerSlot(winningSlot);
      setPhase("finished");
      const mySlot = isPlayer2Seat ? 2 : 1;
      const won = winningSlot === mySlot;

      if (won) {
        soundEngine.playVictory();
        triggerConfetti();
      } else {
        soundEngine.playTimeout();
      }

      if (!rewardReportedRef.current) {
        rewardReportedRef.current = true;
        const myTurns = Math.max(
          1,
          allGuesses.filter((g) => g.playerSlot === mySlot).length
        );
        const trophyDelta = Math.abs(
          computeTrophyDelta(
            true,
            mode,
            mode === "ai" ? aiDifficulty : undefined,
            mode === "ai" ? aiProfile.trophyDelta : undefined
          )
        );
        const coinsEarned = won
          ? mode === "ai"
            ? aiProfile.rewardCoins
            : 110
          : 25;
        const xpEarned = won
          ? mode === "ai"
            ? aiProfile.rewardXp
            : 140
          : 40;

        onMatchComplete({
          won,
          turnsTaken: myTurns,
          trophyDelta,
          coinsEarned,
          xpEarned,
          aiDifficulty: mode === "ai" ? aiDifficulty : undefined,
        });
      }
    },
    [
      aiDifficulty,
      aiProfile,
      isPlayer2Seat,
      mode,
      onMatchComplete,
      triggerConfetti,
    ]
  );

  // Real-time room polling for Online 1v1 & Local 2-Phone rooms
  useEffect(() => {
    if (
      (mode !== "online_1v1" && mode !== "local_offline") ||
      !roomCode ||
      (phase !== "playing" && phase !== "waiting_opponent")
    ) {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/matches?roomCode=${roomCode}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.match) {
          const m = data.match;
          if (!isPlayer2Seat && m.player2Name) {
            setLiveOpponentName(m.player2Name);
            setLiveOpponentAvatar(m.player2Avatar || "🦊");
          } else if (isPlayer2Seat && m.player1Name) {
            setLiveOpponentName(m.player1Name);
            setLiveOpponentAvatar(m.player1Avatar || "🦉");
          }

          if (m.player1Secret) setP1Secret(m.player1Secret);
          if (m.player2Secret) setP2Secret(m.player2Secret);

          // Transition from waiting_opponent -> playing once both secrets are locked in
          if (
            phase === "waiting_opponent" &&
            isValidSecretCode(m.player1Secret) &&
            isValidSecretCode(m.player2Secret)
          ) {
            setPhase("playing");
            if (timerOption > 0) setSecondsLeft(timerOption);
          }

          const serverGuesses: MatchGuessEntry[] = Array.isArray(m.guesses)
            ? m.guesses
            : [];
          if (serverGuesses.length !== guesses.length) {
            setGuesses(serverGuesses);
          }
          if (m.currentTurn !== currentTurn) {
            setCurrentTurn(m.currentTurn === 2 ? 2 : 1);
            if (timerOption > 0) setSecondsLeft(timerOption);
          }
          if (m.status === "finished" && m.winnerSlot) {
            finalizeMatch(m.winnerSlot === 2 ? 2 : 1, serverGuesses);
          }
        }
      } catch {}
    }, 1500);

    return () => clearInterval(interval);
  }, [
    mode,
    roomCode,
    phase,
    isPlayer2Seat,
    guesses.length,
    currentTurn,
    timerOption,
    finalizeMatch,
  ]);

  // Turn Timer Countdown
  useEffect(() => {
    if (phase !== "playing" || timerOption === 0) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) return 0;
        if (prev <= 6) soundEngine.playTap(300);
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, timerOption, currentTurn]);

  // Timeout Auto-Skip
  useEffect(() => {
    if (phase !== "playing" || timerOption === 0 || secondsLeft > 0) return;

    soundEngine.playTimeout();
    const timedOutSlot = currentTurn;
    const turnCount =
      guesses.filter((g) => g.playerSlot === timedOutSlot).length + 1;

    const timeoutEntry: MatchGuessEntry = {
      id: `timeout-${Date.now()}`,
      playerSlot: timedOutSlot,
      playerName: timedOutSlot === 1 ? player1Name : liveOpponentName,
      guess: "TIMEOUT",
      points: 0,
      orders: 0,
      isTimeout: true,
      turnNumber: turnCount,
      timestamp: new Date().toISOString(),
    };

    const updated = [...guesses, timeoutEntry];
    setGuesses(updated);
    setGuessBuffer("");

    if (mode === "mass_hunt") {
      setSecondsLeft(timerOption);
      return;
    }

    const nextSlot: 1 | 2 = timedOutSlot === 1 ? 2 : 1;
    setCurrentTurn(nextSlot);
    setSecondsLeft(timerOption);

    if (mode === "hotseat") {
      setPhase("pass_curtain");
    }
  }, [
    secondsLeft,
    phase,
    timerOption,
    currentTurn,
    guesses,
    player1Name,
    liveOpponentName,
    mode,
  ]);

  // AI Turn Execution
  useEffect(() => {
    if (mode !== "ai" || phase !== "playing" || currentTurn !== 2) return;

    const aiPast = guesses
      .filter((g) => g.playerSlot === 2 && !g.isTimeout)
      .map((g) => ({
        guess: g.guess,
        points: g.points,
        orders: g.orders,
      }));

    const aiDecision = computeAINextGuess(aiDifficulty, aiPast);
    setAiThinking(aiDecision.thoughtText);

    const delay = setTimeout(() => {
      const evalRes = evaluateGuess(p1Secret, aiDecision.guess);
      const aiEntry: MatchGuessEntry = {
        id: `ai-${Date.now()}`,
        playerSlot: 2,
        playerName: liveOpponentName,
        guess: aiDecision.guess,
        points: evalRes.points,
        orders: evalRes.orders,
        isTimeout: false,
        turnNumber: aiPast.length + 1,
        timestamp: new Date().toISOString(),
      };

      soundEngine.playFeedback(evalRes.points, evalRes.orders);
      const nextGuesses = [...guesses, aiEntry];
      setGuesses(nextGuesses);
      setAiThinking(null);

      if (evalRes.isWin) {
        finalizeMatch(2, nextGuesses);
      } else {
        setCurrentTurn(1);
        if (timerOption > 0) setSecondsLeft(timerOption);
      }
    }, 1100);

    return () => clearTimeout(delay);
  }, [
    mode,
    phase,
    currentTurn,
    aiDifficulty,
    guesses,
    p1Secret,
    liveOpponentName,
    timerOption,
    finalizeMatch,
  ]);

  const handleDigitPress = (digit: string) => {
    if (scratchpadMode && phase === "playing") {
      soundEngine.playTap(460);
      setScratchpad((prev) => {
        const cur = prev[digit] || "neutral";
        const next =
          cur === "neutral"
            ? "eliminated"
            : cur === "eliminated"
            ? "confirmed"
            : "neutral";
        return { ...prev, [digit]: next };
      });
      return;
    }

    if (phase === "setup_p1" || phase === "setup_p2") {
      if (setupBuffer.includes(digit) || setupBuffer.length >= 4) return;
      soundEngine.playTap(440 + Number(digit) * 25);
      setSetupBuffer((prev) => prev + digit);
      return;
    }

    if (phase === "playing") {
      if (mode === "ai" && currentTurn === 2) return;
      if (
        (mode === "online_1v1" || mode === "local_offline") &&
        roomCode &&
        ((!isPlayer2Seat && currentTurn !== 1) ||
          (isPlayer2Seat && currentTurn !== 2))
      ) {
        return;
      }

      if (guessBuffer.includes(digit) || guessBuffer.length >= 4) return;
      soundEngine.playTap(440 + Number(digit) * 25);
      setGuessBuffer((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    soundEngine.playDelete();
    if (phase === "setup_p1" || phase === "setup_p2") {
      setSetupBuffer((prev) => prev.slice(0, -1));
    } else if (phase === "playing") {
      setGuessBuffer((prev) => prev.slice(0, -1));
    }
  };

  // Lock in Secret Code
  const handleConfirmSecret = async () => {
    const chosen = isValidSecretCode(setupBuffer)
      ? setupBuffer
      : generateRandomCode();
    soundEngine.playReward();

    if (phase === "setup_p1") {
      if (isPlayer2Seat) {
        setP2Secret(chosen);
      } else {
        setP1Secret(chosen);
      }
      setSetupBuffer("");

      if (mode === "hotseat") {
        setPhase("setup_p2");
        return;
      }

      if ((mode === "online_1v1" || mode === "local_offline") && roomCode) {
        try {
          const res = await fetch("/api/matches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "set_secret",
              roomCode,
              playerSlot: isPlayer2Seat ? 2 : 1,
              secret: chosen,
            }),
          });
          const data = await res.json();
          if (
            data.match &&
            isValidSecretCode(data.match.player1Secret) &&
            isValidSecretCode(data.match.player2Secret)
          ) {
            setP1Secret(data.match.player1Secret);
            setP2Secret(data.match.player2Secret);
            setPhase("playing");
            if (timerOption > 0) setSecondsLeft(timerOption);
            matchStartRef.current = Date.now();
          } else {
            setPhase("waiting_opponent");
          }
          return;
        } catch {
          setPhase("playing");
        }
      }

      setPhase("playing");
      if (timerOption > 0) setSecondsLeft(timerOption);
      matchStartRef.current = Date.now();
    } else if (phase === "setup_p2") {
      setP2Secret(chosen);
      setSetupBuffer("");
      setPhase("playing");
      if (timerOption > 0) setSecondsLeft(timerOption);
      matchStartRef.current = Date.now();
    }
  };

  // Submit 4-digit Guess
  const handleSubmitGuess = async () => {
    if (!isValidSecretCode(guessBuffer)) return;

    const currentGuess = guessBuffer;
    setGuessBuffer("");
    setRoomError(null);

    // 1. Mass Code Hunt Mode
    if (mode === "mass_hunt" && tournamentId) {
      const elapsedSec = Math.max(
        3,
        Math.round((Date.now() - matchStartRef.current) / 1000)
      );
      const res = evaluateGuess(p2Secret, currentGuess);
      soundEngine.playFeedback(res.points, res.orders);

      const newEntry: MatchGuessEntry = {
        id: `hunt-${Date.now()}`,
        playerSlot: 1,
        playerName: player1Name,
        guess: currentGuess,
        points: res.points,
        orders: res.orders,
        isTimeout: false,
        turnNumber: guesses.length + 1,
        timestamp: new Date().toISOString(),
      };
      const updatedGuesses = [...guesses, newEntry];
      setGuesses(updatedGuesses);

      try {
        await fetch("/api/tournaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_hunt_guess",
            tournamentId,
            playerId: player1Id,
            username: player1Name,
            avatarEmoji: player1Avatar,
            guess: currentGuess,
            elapsedSeconds: elapsedSec,
          }),
        });
      } catch {}

      if (res.isWin) {
        finalizeMatch(1, updatedGuesses);
      } else if (timerOption > 0) {
        setSecondsLeft(timerOption);
      }
      return;
    }

    // 2. Real Online 1v1 or Local 2-Phone Room
    if ((mode === "online_1v1" || mode === "local_offline") && roomCode) {
      const mySlot: 1 | 2 = isPlayer2Seat ? 2 : 1;
      try {
        const res = await fetch("/api/matches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit_turn",
            roomCode,
            playerSlot: mySlot,
            guess: currentGuess,
          }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setRoomError(data.error || "Waiting for opponent...");
          return;
        }
        if (data.match) {
          const updatedServerGuesses: MatchGuessEntry[] =
            data.match.guesses || [];
          const myLatest = updatedServerGuesses
            .filter((g) => g.playerSlot === mySlot)
            .slice(-1)[0];
          if (myLatest) {
            soundEngine.playFeedback(myLatest.points, myLatest.orders);
          }
          setGuesses(updatedServerGuesses);
          setCurrentTurn(data.match.currentTurn === 2 ? 2 : 1);
          if (timerOption > 0) setSecondsLeft(timerOption);

          if (data.match.status === "finished" && data.match.winnerSlot) {
            finalizeMatch(
              data.match.winnerSlot === 2 ? 2 : 1,
              updatedServerGuesses
            );
          }
          return;
        }
      } catch {
        setRoomError("Connection error — please try again.");
        return;
      }
    }

    // 3. Local Evaluation (vs AI or Hotseat)
    const activeSlot = currentTurn;
    const targetSecret = activeSlot === 1 ? p2Secret : p1Secret;
    const evalRes = evaluateGuess(targetSecret, currentGuess);
    soundEngine.playFeedback(evalRes.points, evalRes.orders);

    const turnNum =
      guesses.filter((g) => g.playerSlot === activeSlot).length + 1;
    const newEntry: MatchGuessEntry = {
      id: `turn-${Date.now()}`,
      playerSlot: activeSlot,
      playerName: activeSlot === 1 ? player1Name : liveOpponentName,
      guess: currentGuess,
      points: evalRes.points,
      orders: evalRes.orders,
      isTimeout: false,
      turnNumber: turnNum,
      timestamp: new Date().toISOString(),
    };

    const nextGuesses = [...guesses, newEntry];
    setGuesses(nextGuesses);

    if (evalRes.isWin) {
      finalizeMatch(activeSlot, nextGuesses);
      return;
    }

    const nextSlot: 1 | 2 = activeSlot === 1 ? 2 : 1;
    setCurrentTurn(nextSlot);
    if (timerOption > 0) setSecondsLeft(timerOption);

    if (mode === "hotseat") {
      setLogFilter(nextSlot === 1 ? "my_attacks" : "opp_attacks");
      setPhase("pass_curtain");
    }
  };

  const handleRematch = () => {
    soundEngine.playTap(560);
    rewardReportedRef.current = false;
    setGuesses([]);
    setWinnerSlot(null);
    setCurrentTurn(1);
    setScratchpad({});
    setP1Secret(generateRandomCode());
    setP2Secret(generateRandomCode());
    setSetupBuffer("");
    setGuessBuffer("");
    setPhase(mode === "mass_hunt" ? "playing" : "setup_p1");
    if (timerOption > 0) setSecondsLeft(timerOption);
  };

  const mySlot: 1 | 2 = isPlayer2Seat ? 2 : 1;
  const myAttacks = guesses.filter((g) => g.playerSlot === mySlot);
  const oppAttacks = guesses.filter((g) => g.playerSlot !== mySlot);
  const displayedGuesses =
    mode === "hotseat"
      ? guesses.filter((g) => g.playerSlot === currentTurn)
      : logFilter === "my_attacks"
      ? myAttacks
      : oppAttacks;

  const latestMyGuess = myAttacks.filter((g) => !g.isTimeout).slice(-1)[0];
  const activeBuffer =
    phase === "setup_p1" || phase === "setup_p2" ? setupBuffer : guessBuffer;

  const isMyTurnInRoom =
    mode === "online_1v1" || mode === "local_offline"
      ? currentTurn === mySlot
      : mode === "ai"
      ? currentTurn === 1
      : true;

  return (
    <div
      className={`rounded-3xl border-2 border-b-[6px] p-4 shadow-lg transition-all ${themeSurface}`}
    >
      {/* Top Arena Header */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b-2 border-[#E5E0D5]">
        <button
          onClick={() => {
            soundEngine.playTap(380);
            onExitArena();
          }}
          className="px-3 py-1.5 rounded-xl bg-[#F3F0E6] hover:bg-[#E5E0D5] text-xs font-extrabold text-[#2B2D42] flex items-center gap-1 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Hub
        </button>

        <div className="flex items-center gap-2">
          {roomCode && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(roomCode);
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              className="px-2.5 py-1 rounded-xl bg-sky-100 border border-sky-300 text-[#1899D6] font-code text-xs font-extrabold flex items-center gap-1"
              title="Tap to copy room code"
            >
              {mode === "local_offline" ? (
                <Smartphone className="w-3.5 h-3.5" />
              ) : (
                <Wifi className="w-3.5 h-3.5" />
              )}
              <span>{roomCode}</span>
              {copiedCode ? (
                <Check className="w-3 h-3 text-[#58CC02]" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
            </button>
          )}

          {/* Turn Timer Pill */}
          <div
            className={`px-3 py-1 rounded-xl font-code text-xs font-extrabold flex items-center gap-1.5 border-2 ${
              timerOption === 0
                ? "bg-[#F3F0E6] border-[#E5E0D5] text-[#2B2D42]"
                : secondsLeft <= 10 && phase === "playing"
                ? "bg-[#FF4B4B] border-[#EA2B2B] text-white animate-urgent"
                : "bg-amber-50 border-[#FFC800] text-[#2B2D42]"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{timerOption === 0 ? "∞ NO LIMIT" : `${secondsLeft}s`}</span>
          </div>

          <button
            onClick={() => setShowRulesHelp(!showRulesHelp)}
            className="w-8 h-8 rounded-xl bg-[#F3F0E6] hover:bg-[#E5E0D5] flex items-center justify-center text-[#2B2D42]"
            title="How Points & Orders work"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* STEP-BY-STEP GUIDED COACH BANNER */}
      <div className="mb-3 px-3.5 py-2.5 rounded-2xl bg-lime-50 border-2 border-[#58CC02]/40 flex items-start gap-2.5">
        <Lightbulb className="w-4 h-4 text-[#58CC02] shrink-0 mt-0.5" />
        <div className="text-xs font-bold text-[#2B2D42] leading-snug">
          {phase === "setup_p1" || phase === "setup_p2" ? (
            <span>
              <strong>Step 1 of 2 — Create Your Secret Code:</strong> Pick 4 unique digits from 1–9 (or tap Randomize), then tap{" "}
              <span className="text-[#46A302] font-black">Lock Secret Code</span>.
            </span>
          ) : phase === "waiting_opponent" ? (
            <span>
              <strong>Step 2 of 2 — Waiting for Opponent:</strong> Share room code{" "}
              <span className="font-code font-black text-[#1899D6]">{roomCode}</span>{" "}
              with Player 2. The duel begins automatically once they join and lock their code!
            </span>
          ) : phase === "playing" && !isMyTurnInRoom ? (
            <span>
              <strong>Opponent&apos;s Turn:</strong> Waiting for {liveOpponentName} to submit their 4-digit guess...
            </span>
          ) : phase === "playing" && latestMyGuess ? (
            <span>
              <strong>Clue Breakdown ({latestMyGuess.guess}):</strong> You got{" "}
              <span className="px-1.5 py-0.2 rounded bg-[#FFC800] text-[#2B2D42] font-black">
                {latestMyGuess.points} Points
              </span>{" "}
              ({latestMyGuess.points} of those digits exist in the secret code) and{" "}
              <span className="px-1.5 py-0.2 rounded bg-[#58CC02] text-white font-black">
                {latestMyGuess.orders} Orders
              </span>{" "}
              ({latestMyGuess.orders} in the exact right spot). Reach 4P + 4O to win!
            </span>
          ) : (
            <span>
              <strong>Your Turn to Guess:</strong> Enter 4 unique digits (1–9) below to test {liveOpponentName}&apos;s secret code. Reach{" "}
              <span className="text-[#46A302] font-black">4 Points + 4 Orders</span> first to win!
            </span>
          )}
        </div>
      </div>

      {/* Collapsible Rules Quick-Guide */}
      {showRulesHelp && (
        <div className="mb-3 p-3.5 rounded-2xl bg-amber-50 border-2 border-[#FFC800] text-xs space-y-1.5 animate-pop-in">
          <div className="font-display font-bold text-sm text-[#2B2D42]">
            🎯 Quick Rules Guide:
          </div>
          <p className="font-semibold text-[#2B2D42]">
            • Every secret code has <strong>4 unique digits from 1–9</strong> (no 0, no repeats).
          </p>
          <p className="font-semibold text-[#2B2D42]">
            • <span className="px-1.5 py-0.5 rounded-md bg-[#FFC800] text-[#2B2D42] font-black">POINTS (PTS)</span> = How many digits in your guess are part of the secret code (any position).
          </p>
          <p className="font-semibold text-[#2B2D42]">
            • <span className="px-1.5 py-0.5 rounded-md bg-[#58CC02] text-white font-black">ORDERS (ORD)</span> = How many digits in your guess are in the exact right spot.
          </p>
          <p className="font-bold text-[#46A302]">
            🏆 Example: If the secret is <strong>4829</strong> and you guess <strong>4279</strong> → <strong>3 Points</strong> (4, 2, 9 are in the code) & <strong>2 Orders</strong> (4 and 9 are in the exact spot).
          </p>
        </div>
      )}

      {/* Dual Player VS Banner */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <div
          className={`p-3 rounded-2xl border-2 transition-all flex items-center gap-2.5 ${
            phase === "playing" && currentTurn === mySlot
              ? "bg-lime-50 border-[#58CC02] ring-2 ring-[#58CC02]/30"
              : "bg-[#F3F0E6]/70 border-[#E5E0D5]"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-white border-2 border-[#58CC02] flex items-center justify-center text-xl shrink-0">
            {player1Avatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-extrabold text-[#2B2D42] truncate">
              {player1Name} (You)
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {phase === "playing" && currentTurn === mySlot ? (
                <span className="px-1.5 py-0.5 rounded-md bg-[#58CC02] text-white text-[10px] font-black uppercase">
                  YOUR TURN
                </span>
              ) : (
                <span className="text-[10px] font-bold text-[#6C757D]">
                  {myAttacks.length} turns
                </span>
              )}
              {mode !== "mass_hunt" && phase === "playing" && (
                <button
                  onClick={() => setShowMySecret(!showMySecret)}
                  className="ml-auto text-[10px] font-code font-bold text-[#6C757D] hover:text-[#2B2D42] flex items-center gap-0.5"
                  title="Show/Hide your secret code"
                >
                  {showMySecret ? (
                    <>
                      <EyeOff className="w-3 h-3" />{" "}
                      {isPlayer2Seat ? p2Secret : p1Secret}
                    </>
                  ) : (
                    <>
                      <Eye className="w-3 h-3" /> ••••
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          className={`p-3 rounded-2xl border-2 transition-all flex items-center gap-2.5 ${
            phase === "playing" && currentTurn !== mySlot
              ? "bg-sky-50 border-[#1CB0F6] ring-2 ring-[#1CB0F6]/30"
              : "bg-[#F3F0E6]/70 border-[#E5E0D5]"
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-white border-2 border-[#1CB0F6] flex items-center justify-center text-xl shrink-0">
            {liveOpponentAvatar}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-extrabold text-[#2B2D42] truncate">
              {liveOpponentName}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              {phase === "playing" && currentTurn !== mySlot ? (
                <span className="px-1.5 py-0.5 rounded-md bg-[#1CB0F6] text-white text-[10px] font-black uppercase animate-pulse">
                  THINKING...
                </span>
              ) : (
                <span className="text-[10px] font-bold text-[#6C757D]">
                  {mode === "mass_hunt"
                    ? "Vault Code"
                    : `${oppAttacks.length} turns`}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* PHASE: SECRET CODE VAULT SETUP */}
      {(phase === "setup_p1" || phase === "setup_p2") && (
        <div className="bg-[#F3F0E6] rounded-3xl p-5 border-2 border-[#E5E0D5] text-center space-y-4 animate-pop-in">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#58CC02]/15 text-[#46A302] text-xs font-black uppercase">
            🔒 Step 1: Set Your Secret 4-Digit Code
          </div>
          <h3 className="text-xl font-display font-bold text-[#2B2D42]">
            {phase === "setup_p1"
              ? `${player1Name}, Choose Your 4 Secret Digits`
              : `${liveOpponentName}, Choose Your 4 Secret Digits`}
          </h3>
          <p className="text-xs font-semibold text-[#6C757D]">
            Tap 4 unique numbers below (1–9) or tap <strong>Randomize</strong>.
          </p>

          <div className="flex justify-center gap-3 py-2">
            {[0, 1, 2, 3].map((idx) => {
              const char = setupBuffer[idx];
              return (
                <div
                  key={idx}
                  className={`w-14 h-16 rounded-2xl font-code text-2xl font-extrabold flex items-center justify-center border-2 border-b-4 transition-all ${
                    char
                      ? "bg-white border-[#58CC02] text-[#2B2D42] scale-105 shadow-xs"
                      : "bg-white/60 border-[#D6CFC0] text-[#6C757D]"
                  }`}
                >
                  {char || "•"}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2.5 justify-center">
            <button
              onClick={() => {
                soundEngine.playTap(520);
                setSetupBuffer(generateRandomCode());
              }}
              className="px-4 py-2.5 rounded-2xl bg-white border-2 border-[#E5E0D5] border-b-4 text-xs font-extrabold text-[#2B2D42] btn-tactile flex items-center gap-1.5"
            >
              <Shuffle className="w-4 h-4 text-[#1CB0F6]" /> Randomize
            </button>
            <button
              onClick={handleConfirmSecret}
              className="px-5 py-2.5 rounded-2xl bg-[#58CC02] text-white border-b-4 border-[#46A302] font-display font-bold text-sm btn-tactile flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />{" "}
              {setupBuffer.length === 4
                ? "Lock Secret Code"
                : "Randomize & Lock"}
            </button>
          </div>
        </div>
      )}

      {/* PHASE: WAITING FOR REAL OPPONENT TO JOIN & LOCK SECRET */}
      {phase === "waiting_opponent" && (
        <div className="bg-sky-50 rounded-3xl p-6 border-2 border-sky-200 text-center space-y-4 animate-pop-in my-2">
          <div className="text-4xl animate-bounce">📡</div>
          <h3 className="text-xl font-display font-bold text-[#2B2D42]">
            Your Secret Code is Locked! Waiting for Player 2...
          </h3>
          <p className="text-xs font-semibold text-[#6C757D] max-w-sm mx-auto">
            Ask your opponent to open Code Clash, choose{" "}
            <strong>{mode === "local_offline" ? "2-Phone Local" : "Online 1v1"}</strong>, and enter this Room Code:
          </p>
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border-2 border-[#1CB0F6] font-code text-2xl font-black text-[#1899D6]">
            <span>{roomCode}</span>
            <button
              onClick={() => {
                if (roomCode) navigator.clipboard?.writeText(roomCode);
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
              }}
              className="px-3 py-1 rounded-xl bg-[#1CB0F6] text-white font-sans text-xs font-bold"
            >
              {copiedCode ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* HOTSEAT PASS-THE-PHONE PRIVACY CURTAIN */}
      {phase === "pass_curtain" && (
        <div className="bg-gradient-to-b from-[#1CB0F6] to-[#1899D6] text-white rounded-3xl p-6 text-center space-y-4 animate-pop-in my-2">
          <div className="text-4xl">📱🤝</div>
          <h3 className="text-2xl font-display font-bold">
            Pass Phone to {currentTurn === 1 ? player1Name : liveOpponentName}!
          </h3>
          <p className="text-sm font-semibold text-white/90">
            Secret codes are hidden. Ready for Turn #
            {guesses.filter((g) => g.playerSlot === currentTurn).length + 1}?
          </p>
          <button
            onClick={() => {
              soundEngine.playTap(540);
              setPhase("playing");
              if (timerOption > 0) setSecondsLeft(timerOption);
            }}
            className="w-full py-3.5 rounded-2xl bg-[#FFC800] text-[#2B2D42] font-display font-bold text-base border-b-4 border-[#E5B400] btn-tactile"
          >
            I Have the Phone — Start My Turn!
          </button>
        </div>
      )}

      {/* ACTIVE GAMEPLAY PHASE */}
      {phase === "playing" && (
        <div className="space-y-3">
          {mode === "ai" && aiThinking && (
            <div className="px-3.5 py-2 rounded-2xl bg-purple-50 border-2 border-purple-200 text-xs font-extrabold text-purple-800 flex items-center gap-2 animate-pulse">
              <span>{aiProfile.emoji}</span>
              <span>{aiThinking}</span>
            </div>
          )}

          {roomError && (
            <div className="px-3.5 py-2 rounded-2xl bg-rose-50 border-2 border-rose-200 text-xs font-extrabold text-[#FF4B4B]">
              {roomError}
            </div>
          )}

          {/* Attack Log Switcher */}
          {mode !== "mass_hunt" && mode !== "hotseat" && (
            <div className="flex bg-[#F3F0E6] p-1 rounded-2xl border border-[#E5E0D5]">
              <button
                onClick={() => {
                  soundEngine.playTap(460);
                  setLogFilter("my_attacks");
                }}
                className={`flex-1 py-1.5 rounded-xl text-xs font-extrabold transition ${
                  logFilter === "my_attacks"
                    ? "bg-white text-[#2B2D42] shadow-xs"
                    : "text-[#6C757D]"
                }`}
              >
                🎯 Your Guesses ({myAttacks.length})
              </button>
              <button
                onClick={() => {
                  soundEngine.playTap(480);
                  setLogFilter("opp_attacks");
                }}
                className={`flex-1 py-1.5 rounded-xl text-xs font-extrabold transition ${
                  logFilter === "opp_attacks"
                    ? "bg-white text-[#2B2D42] shadow-xs"
                    : "text-[#6C757D]"
                }`}
              >
                🛡️ {liveOpponentName.split(" ")[0]}&apos;s Guesses ({oppAttacks.length})
              </button>
            </div>
          )}

          {/* Guess History List */}
          <div className="bg-[#F3F0E6] rounded-2xl p-3 border-2 border-[#E5E0D5] min-h-[165px] max-h-[235px] overflow-y-auto space-y-2">
            {displayedGuesses.length === 0 ? (
              <div className="h-[145px] flex flex-col items-center justify-center text-center text-[#6C757D] px-4">
                <div className="text-2xl mb-1">🔐</div>
                <div className="text-xs font-extrabold text-[#2B2D42]">
                  No guesses yet!
                </div>
                <div className="text-[11px] font-semibold">
                  Tap 4 unique numbers below (1–9) and press <strong>SUBMIT GUESS</strong>.
                </div>
              </div>
            ) : (
              displayedGuesses.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl px-3.5 py-2.5 border-2 border-[#E5E0D5] flex items-center justify-between animate-pop-in"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-[#F3F0E6] font-code text-[11px] font-extrabold text-[#6C757D] flex items-center justify-center">
                      #{item.turnNumber}
                    </span>

                    {item.isTimeout ? (
                      <span className="px-2.5 py-1 rounded-xl bg-rose-100 text-[#FF4B4B] font-display font-bold text-xs flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" /> TIMEOUT — SKIPPED
                      </span>
                    ) : (
                      <div className="flex gap-1.5">
                        {item.guess.split("").map((d, idx) => (
                          <span
                            key={idx}
                            className="w-8 h-9 rounded-xl bg-[#F3F0E6] border border-[#D6CFC0] font-code text-base font-extrabold text-[#2B2D42] flex items-center justify-center"
                          >
                            {d}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {!item.isTimeout && (
                    <div className="flex items-center gap-1.5">
                      <div
                        className="px-2.5 py-1 rounded-xl bg-[#FFC800] border-b-2 border-[#E5B400] text-[#2B2D42] font-code text-xs font-extrabold flex items-center gap-1"
                        title="Points: Correct digits in any spot"
                      >
                        <span>{item.points}</span>
                        <span className="text-[10px] font-sans font-black uppercase">
                          PTS
                        </span>
                      </div>
                      <div
                        className="px-2.5 py-1 rounded-xl bg-[#58CC02] border-b-2 border-[#46A302] text-white font-code text-xs font-extrabold flex items-center gap-1"
                        title="Orders: Correct digits in the exact spot"
                      >
                        <span>{item.orders}</span>
                        <span className="text-[10px] font-sans font-black uppercase">
                          ORD
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 4-Slot Guess Input Bar */}
          <div className="bg-white rounded-2xl p-3 border-2 border-[#E5E0D5] flex items-center justify-between gap-2">
            <div className="flex gap-2">
              {[0, 1, 2, 3].map((idx) => {
                const digit = guessBuffer[idx];
                return (
                  <div
                    key={idx}
                    className={`w-12 h-13 rounded-2xl font-code text-xl font-extrabold flex items-center justify-center border-2 border-b-4 transition-all ${
                      digit
                        ? "bg-amber-50 border-[#FFC800] text-[#2B2D42] scale-105"
                        : "bg-[#F3F0E6] border-[#D6CFC0] text-[#6C757D]"
                    }`}
                  >
                    {digit || "?"}
                  </div>
                );
              })}
            </div>

            <button
              disabled={guessBuffer.length !== 4 || !isMyTurnInRoom}
              onClick={handleSubmitGuess}
              className={`flex-1 py-3.5 px-4 rounded-2xl font-display font-bold text-sm border-b-4 btn-tactile flex items-center justify-center gap-1.5 ${
                guessBuffer.length === 4 && isMyTurnInRoom
                  ? "bg-[#58CC02] text-white border-[#46A302]"
                  : "bg-[#E5E0D5] text-[#6C757D] border-[#D6CFC0] cursor-not-allowed"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>{isMyTurnInRoom ? "SUBMIT GUESS" : "OPPONENT TURN"}</span>
            </button>
          </div>
        </div>
      )}

      {/* In-match reactions + private chat */}
      {phase === "playing" && (mode === "online_1v1" || mode === "local_offline" || mode === "hotseat") && (
        <MatchSideChat
          roomCode={roomCode || "LOCAL"}
          playerId={player1Id ?? null}
          playerName={isPlayer2Seat ? liveOpponentName : player1Name}
          opponentId={null}
          opponentName={isPlayer2Seat ? player1Name : liveOpponentName}
        />
      )}

      {/* TACTILE 1-9 NUMPAD */}
      {(phase === "setup_p1" || phase === "setup_p2" || phase === "playing") && (
        <div className="mt-3 space-y-2">
          {phase === "playing" && (
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-extrabold text-[#6C757D] uppercase">
                {scratchpadMode
                  ? "🧠 Tap numbers to cross out or highlight clues"
                  : "Tap 4 Unique Digits (1–9)"}
              </span>
              <button
                onClick={() => {
                  soundEngine.playTap(500);
                  setScratchpadMode(!scratchpadMode);
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition ${
                  scratchpadMode
                    ? "bg-[#CE82FF] text-white border-[#A560E8]"
                    : "bg-[#F3F0E6] text-[#2B2D42] border-[#E5E0D5]"
                }`}
              >
                {scratchpadMode ? "✓ Done Notes" : "🧠 Note Mode"}
              </button>
            </div>
          )}

          <div className="grid grid-cols-5 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => {
              const alreadyInBuffer = activeBuffer.includes(digit);
              const noteStatus = scratchpad[digit] || "neutral";

              return (
                <button
                  key={digit}
                  disabled={!scratchpadMode && alreadyInBuffer}
                  onClick={() => handleDigitPress(digit)}
                  className={`h-13 rounded-2xl font-code text-xl font-extrabold border-2 border-b-4 btn-tactile relative flex items-center justify-center ${
                    alreadyInBuffer && !scratchpadMode
                      ? "bg-[#E5E0D5] border-[#D6CFC0] text-[#6C757D] opacity-50"
                      : noteStatus === "eliminated"
                      ? "bg-rose-50 border-rose-300 text-rose-400 line-through"
                      : noteStatus === "confirmed"
                      ? "bg-lime-100 border-[#58CC02] text-[#2B2D42]"
                      : "bg-white border-[#D6CFC0] text-[#2B2D42] hover:border-[#1CB0F6]"
                  }`}
                >
                  {digit}
                  {noteStatus === "confirmed" && (
                    <span className="absolute top-1 right-1.5 text-[9px] text-[#58CC02]">
                      ●
                    </span>
                  )}
                </button>
              );
            })}

            <button
              onClick={handleDelete}
              className="h-13 rounded-2xl bg-rose-50 border-2 border-b-4 border-rose-300 text-[#FF4B4B] font-display font-bold text-xs btn-tactile flex items-center justify-center"
              title="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* VICTORY / MATCH COMPLETE SCREEN */}
      {phase === "finished" && (
        <div className="bg-gradient-to-b from-lime-50 to-amber-50 rounded-3xl p-5 border-2 border-[#58CC02] text-center space-y-4 animate-pop-in mt-2">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#FFC800] border-b-4 border-[#E5B400] flex items-center justify-center text-3xl shadow-md">
            🏆
          </div>

          <div>
            <span className="px-3 py-1 rounded-full bg-[#58CC02] text-white text-xs font-black uppercase tracking-wider">
              4 POINTS + 4 ORDERS CRACKED!
            </span>
            <h3 className="text-2xl font-display font-bold text-[#2B2D42] mt-2">
              {winnerSlot === mySlot
                ? "🎉 VICTORY! YOU CRACKED THE CODE!"
                : `${
                    winnerSlot === 1 ? player1Name : liveOpponentName
                  } Cracked the Code!`}
            </h3>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-2xl border-2 border-[#E5E0D5]">
              <div className="text-[11px] font-extrabold text-[#6C757D] uppercase">
                {player1Name}&apos;s Secret
              </div>
              <div className="font-code text-xl font-extrabold text-[#2B2D42] tracking-widest mt-1">
                {p1Secret}
              </div>
            </div>
            <div className="bg-white p-3 rounded-2xl border-2 border-[#E5E0D5]">
              <div className="text-[11px] font-extrabold text-[#6C757D] uppercase">
                {liveOpponentName.split(" ")[0]}&apos;s Secret
              </div>
              <div className="font-code text-xl font-extrabold text-[#58CC02] tracking-widest mt-1">
                {p2Secret}
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-2.5 flex-wrap">
            <div className="px-3.5 py-2 rounded-2xl bg-white border-2 border-[#FFC800] text-xs font-extrabold text-[#2B2D42] flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-[#FFC800]" />
              <span>
                {winnerSlot === mySlot
                  ? `+${mode === "ai" ? aiProfile.trophyDelta : 35} Trophies`
                  : "Match Complete"}
              </span>
            </div>
            <div className="px-3.5 py-2 rounded-2xl bg-white border-2 border-[#58CC02] text-xs font-extrabold text-[#2B2D42]">
              🪙 +{winnerSlot === mySlot ? (mode === "ai" ? aiProfile.rewardCoins : 110) : 25} Coins
            </div>
            <div className="px-3.5 py-2 rounded-2xl bg-white border-2 border-[#CE82FF] text-xs font-extrabold text-[#2B2D42]">
              ⚡ +{winnerSlot === mySlot ? (mode === "ai" ? aiProfile.rewardXp : 140) : 40} Season XP
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={() => setShowReplay(true)}
              className="w-full py-3 rounded-2xl bg-white text-[#2B2D42] font-display font-bold text-sm border-2 border-[#E5E0D5] btn-tactile"
            >
              📼 Watch Replay
            </button>
            <div className="flex gap-3">
              <button
                onClick={handleRematch}
                className="flex-1 py-3.5 rounded-2xl bg-[#58CC02] text-white font-display font-bold text-sm border-b-4 border-[#46A302] btn-tactile flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Play Again
              </button>
              <button
                onClick={onExitArena}
                className="flex-1 py-3.5 rounded-2xl bg-[#1CB0F6] text-white font-display font-bold text-sm border-b-4 border-[#1899D6] btn-tactile"
              >
                Back to Hub
              </button>
            </div>
          </div>
        </div>
      )}

      <MatchReplay
        open={showReplay}
        onClose={() => setShowReplay(false)}
        guesses={guesses as any}
        player1Name={player1Name}
        player2Name={liveOpponentName}
        winnerName={
          winnerSlot === 1 ? player1Name : winnerSlot === 2 ? liveOpponentName : null
        }
        yourSlot={mySlot}
      />
    </div>
  );
}
