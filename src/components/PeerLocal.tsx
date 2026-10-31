"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Camera, Copy, Dices, Eye, Flag, Loader2, Lock, MessageCircle, Pencil,
  QrCode, ScanLine, Swords, Wifi, WifiOff, X,
} from "lucide-react";
import { CharacterAvatar } from "./Character";
import { GuessRow, HeaderBar, InputTiles, Keypad, ResultOverlay, Stage, TimerRing, type GameConfig, type GameOutcome } from "./GameBoard";
import { MatchChatPanel, ReactionsBar, type Floater } from "./MatchChat";
import { evaluateGuess, generateRandomCode, isValidSecretCode, type BotMood } from "@/lib/game-engine";
import { DEFAULT_AVATAR, normalizeAvatar, type AvatarConfig } from "@/lib/avatar";
import { createGuest, createHost, peerSupported, type HostSession, type PeerConn, type PeerMessage } from "@/lib/peer";
import { fireWinEffect } from "@/lib/win-effects";
import { newHistoryId } from "@/lib/history";
import { makeId } from "@/lib/session";
import { soundEngine } from "@/lib/sound-effects";
import type { GuessEntry, MatchChatMessage, Player } from "@/lib/types";

type Phase = "choose" | "host_show" | "join_scan" | "join_show" | "setup" | "waiting_ready" | "playing" | "finished";

/* ------------------------------ QR scanner ------------------------------ */

function QrScanner({ onScan, onCancel }: { onScan: (text: string) => void; onCancel: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    (async () => {
      try {
        const jsQR = (await import("jsqr")).default;
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const loop = () => {
          if (stopped) return;
          if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(img.data, img.width, img.height);
            if (found && found.data) {
              onScan(found.data);
              return;
            }
          }
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        setError("Camera unavailable — paste the code text instead (below the QR on the other phone).");
      }
    })();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 animate-fade" onClick={onCancel} />
      <div className="relative card-game w-full max-w-sm p-4 text-center animate-pop">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display font-bold text-lg flex items-center gap-2"><ScanLine size={19} /> Scan the QR code</h3>
          <button onClick={onCancel} className="btn-game btn-ghost w-9 h-9 !rounded-xl flex items-center justify-center" aria-label="Close scanner"><X size={17} strokeWidth={2.8} /></button>
        </div>
        {error ? (
          <p className="font-bold text-sm py-6" style={{ color: "var(--ink-soft)" }}>{error}</p>
        ) : (
          <>
            <video ref={videoRef} playsInline muted className="w-full rounded-2xl aspect-square object-cover" style={{ border: "3px solid var(--brand)" }} />
            <p className="text-xs font-bold mt-2 flex items-center justify-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
              <Camera size={14} /> Point at the other phone&rsquo;s QR code...
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- QR image ------------------------------- */

function QrImage({ code }: { code: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const QRCode = (await import("qrcode")).default;
        const url = await QRCode.toDataURL(code, { width: 320, margin: 1, errorCorrectionLevel: "M" });
        if (alive) setSrc(url);
      } catch {}
    })();
    return () => { alive = false; };
  }, [code]);
  if (!src) return <div className="w-[260px] h-[260px] flex items-center justify-center"><Loader2 className="animate-spin" size={28} /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Connection QR code" className="w-[260px] h-[260px] rounded-2xl" style={{ border: "3px solid var(--border)" }} />;
}

/* --------------------------------- game --------------------------------- */

export default function PeerLocal({
  me,
  config,
  onExit,
  onResult,
  showToast,
}: {
  me: Player;
  config: GameConfig;
  onExit: () => void;
  onResult: (outcome: GameOutcome) => void;
  showToast: (m: string, k?: "ok" | "err") => void;
}) {
  const timerTotal = config.timerSeconds;
  const [phase, setPhase] = useState<Phase>("choose");
  const [isHost, setIsHost] = useState(true);
  const [offerCode, setOfferCode] = useState("");
  const [answerCode, setAnswerCode] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connLost, setConnLost] = useState(false);

  const [oppName, setOppName] = useState("Friend");
  const [oppAvatar, setOppAvatar] = useState<AvatarConfig>({ base: "cat", color: "sky", accessory: "cap" });
  const [oppFrame, setOppFrame] = useState("frame_neon");

  const [secret, setSecret] = useState("");
  const [setupBuffer, setSetupBuffer] = useState("");
  const [buffer, setBuffer] = useState("");
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [turn, setTurn] = useState<"me" | "them">("me");
  const [secondsLeft, setSecondsLeft] = useState(timerTotal);
  const [winner, setWinner] = useState<"me" | "them" | null>(null);
  const [endReasonUi, setEndReasonUi] = useState("");
  const [myMood, setMyMood] = useState<BotMood>("idle");
  const [oppMood, setOppMood] = useState<BotMood>("idle");
  const [scratch, setScratch] = useState(false);
  const [marks, setMarks] = useState<Record<string, "eliminated" | "confirmed" | undefined>>({});
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [shakeTiles, setShakeTiles] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<MatchChatMessage[]>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const [rematchState, setRematchState] = useState<"idle" | "sent" | "offered">("idle");

  const connRef = useRef<PeerConn | null>(null);
  const hostRef = useRef<HostSession | null>(null);
  const awaitingRef = useRef(false);
  const oppReadyRef = useRef(false);
  const recordedRef = useRef(false);
  const finishedRef = useRef(false);
  const oppSecretRef = useRef("");
  const endReasonRef = useRef("cracked");
  const chatOpenRef = useRef(false);

  const mySlot: 1 | 2 = isHost ? 1 : 2;
  const oppSlot: 1 | 2 = isHost ? 2 : 1;

  const stRef = useRef({ phase, turn, secret, guesses, winner, oppName });
  // eslint-disable-next-line react-hooks/refs
  stRef.current = { phase, turn, secret, guesses, winner, oppName };

  const pushFloater = useCallback((reaction: string, fromOpponent: boolean) => {
    const key = `${Date.now()}-${Math.random()}`;
    setFloaters((f) => [...f.slice(-5), { key, reaction, fromOpponent }]);
    setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 2300);
  }, []);

  const myGuesses = guesses.filter((g) => g.playerSlot === mySlot);
  const oppGuesses = guesses.filter((g) => g.playerSlot === oppSlot);
  const best = (list: GuessEntry[]) => list.reduce((mx, g) => Math.max(mx, g.orders), 0);
  const autoOut = React.useMemo(() => {
    const out = new Set<string>();
    for (const g of myGuesses) if (!g.isTimeout && g.points === 0) for (const ch of g.guess) out.add(ch);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guesses]);

  /* ------------------------------ recording ------------------------------ */
  const tryRecord = useCallback((force = false) => {
    if (recordedRef.current || !finishedRef.current) return;
    if (!oppSecretRef.current && !force) return;
    recordedRef.current = true;
    const st = stRef.current;
    const iWon = st.winner === "me";
    const mine = st.guesses.filter((g) => g.playerSlot === (isHost ? 1 : 2));
    onResult({
      won: iWon,
      mode: "peer",
      turnsTaken: Math.max(1, mine.filter((g) => !g.isTimeout).length),
      ordersTotal: mine.reduce((sum, g) => sum + g.orders, 0),
      trophyDelta: 0,
      coinsEarned: iWon ? 30 : 12,
      xpEarned: iWon ? 60 : 35,
      endReason: endReasonRef.current,
      winnerName: iWon ? me.username : st.oppName,
      myName: me.username,
      oppName: st.oppName,
      history: {
        historyId: newHistoryId(),
        mode: "peer",
        result: iWon ? "win" : "loss",
        myName: me.username,
        myAvatar: me.avatarConfig,
        oppName: st.oppName,
        oppAvatar: oppAvatar,
        oppPlayerId: null,
        mySecret: st.secret,
        oppSecret: oppSecretRef.current,
        guesses: st.guesses,
        endReason: endReasonRef.current,
        turnsTaken: Math.max(1, mine.filter((g) => !g.isTimeout).length),
        createdAt: new Date().toISOString(),
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.username, me.avatarConfig, isHost, onResult]);

  const finish = useCallback((w: "me" | "them", reason: string) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    endReasonRef.current = reason;
    setEndReasonUi(reason);
    setWinner(w);
    setPhase("finished");
    setMyMood(w === "me" ? "win" : "lose");
    setOppMood(w === "me" ? "lose" : "win");
    if (w === "me") { void fireWinEffect(me.effectId); soundEngine.playVictory(); }
    else soundEngine.playDefeat();
    // give the reveal message a moment to arrive so the replay has both codes
    setTimeout(() => tryRecord(true), 1300);
    tryRecord(false);
  }, [me.effectId, tryRecord]);

  const resetForRematch = useCallback(() => {
    recordedRef.current = false;
    finishedRef.current = false;
    oppSecretRef.current = "";
    awaitingRef.current = false;
    oppReadyRef.current = false;
    setSecret("");
    setSetupBuffer("");
    setBuffer("");
    setGuesses([]);
    setWinner(null);
    setEndReasonUi("");
    setMyMood("idle");
    setOppMood("idle");
    setRematchState("idle");
    setPhase("setup");
    soundEngine.playJoin();
  }, []);

  /* ---------------------------- message handler ---------------------------- */
  const handleMessage = useCallback((msg: PeerMessage) => {
    const st = stRef.current;
    const mySl: 1 | 2 = isHost ? 1 : 2;
    const theirSl: 1 | 2 = isHost ? 2 : 1;
    switch (msg.t) {
      case "hello": {
        setOppName(msg.name || "Friend");
        setOppAvatar(normalizeAvatar(msg.avatar || DEFAULT_AVATAR));
        if (msg.frame) setOppFrame(msg.frame);
        break;
      }
      case "ready": {
        if (st.phase === "waiting_ready") {
          setPhase("playing");
          setTurn(isHost ? "me" : "them");
          setSecondsLeft(timerTotal);
          soundEngine.playJoin();
        } else if (st.phase === "setup") {
          showToast(`${st.oppName} locked their code! Your turn to hide yours 🔒`);
          // remember they're ready: checked when I confirm mine
          oppReadyRef.current = true;
        }
        break;
      }
      case "guess": {
        if (st.phase !== "playing" || finishedRef.current) return;
        const res = evaluateGuess(st.secret, msg.guess);
        connRef.current?.send({ t: "feedback", id: msg.id, guess: msg.guess, points: res.points, orders: res.orders, win: res.isWin });
        const entry: GuessEntry = {
          id: msg.id, playerSlot: theirSl, playerName: st.oppName, guess: msg.guess,
          points: res.points, orders: res.orders, isTimeout: false,
          turnNumber: st.guesses.filter((g) => g.playerSlot === theirSl).length + 1,
          timestamp: new Date().toISOString(),
        };
        setGuesses((prev) => [...prev, entry]);
        soundEngine.playFeedback(res.points, res.orders);
        if (res.isWin) {
          connRef.current?.send({ t: "reveal", secret: st.secret });
          finish("them", "cracked");
        } else {
          setTurn("me");
          setSecondsLeft(timerTotal);
          if (res.orders >= 3) setMyMood("shocked");
          else if (res.points === 0) setMyMood("happy");
        }
        break;
      }
      case "feedback": {
        if (finishedRef.current) return;
        awaitingRef.current = false;
        const entry: GuessEntry = {
          id: msg.id, playerSlot: mySl, playerName: me.username, guess: msg.guess,
          points: msg.points, orders: msg.orders, isTimeout: false,
          turnNumber: st.guesses.filter((g) => g.playerSlot === mySl).length + 1,
          timestamp: new Date().toISOString(),
        };
        setGuesses((prev) => [...prev, entry]);
        soundEngine.playFeedback(msg.points, msg.orders);
        if (msg.win) {
          oppSecretRef.current = msg.guess; // the winning guess IS their secret
          connRef.current?.send({ t: "reveal", secret: st.secret });
          finish("me", "cracked");
        } else {
          setTurn("them");
          if (msg.orders >= 2 || msg.points >= 3) { setMyMood("happy"); setOppMood("shocked"); }
          else if (msg.points === 0) setMyMood("sad");
        }
        break;
      }
      case "timeout": {
        if (st.phase !== "playing" || finishedRef.current) return;
        const entry: GuessEntry = {
          id: makeId("to"), playerSlot: theirSl, playerName: st.oppName, guess: "TIMEOUT",
          points: 0, orders: 0, isTimeout: true,
          turnNumber: st.guesses.filter((g) => g.playerSlot === theirSl).length + 1,
          timestamp: new Date().toISOString(),
        };
        setGuesses((prev) => [...prev, entry]);
        soundEngine.playTimeout();
        setTurn("me");
        setSecondsLeft(timerTotal);
        break;
      }
      case "chat": {
        setMessages((prev) => [...prev, { id: Date.now(), senderSlot: 2, senderName: st.oppName, content: msg.text, createdAt: new Date().toISOString() }]);
        if (!chatOpenRef.current) setChatUnread((u) => u + 1);
        soundEngine.playTap(980);
        break;
      }
      case "reaction": {
        pushFloater(msg.id, true);
        break;
      }
      case "forfeit": {
        if (!finishedRef.current) {
          showToast(`${st.oppName} left the duel.`);
          finish("me", "forfeit");
        }
        break;
      }
      case "reveal": {
        oppSecretRef.current = msg.secret;
        tryRecord(false);
        break;
      }
      case "rematch": {
        setRematchState((cur) => {
          if (cur === "sent") {
            // both want it — reset (handled by effect below via state "go")
            setTimeout(() => resetForRematch(), 50);
            return "idle";
          }
          return "offered";
        });
        break;
      }
      case "rematch_no": {
        setRematchState("idle");
        showToast(`${st.oppName} declined the rematch.`);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, me.username, timerTotal, finish, tryRecord, pushFloater, showToast]);

  const wireConn = useCallback((conn: PeerConn) => {
    connRef.current = conn;
    conn.onMessage(handleMessage);
    conn.onState((s) => {
      if (s === "failed" || s === "disconnected" || s === "closed") {
        if (!finishedRef.current) setConnLost(true);
      } else if (s === "connected") {
        setConnLost(false);
      }
    });
    conn.send({ t: "hello", name: me.username, avatar: me.avatarConfig, frame: me.frameId });
  }, [handleMessage, me.username, me.avatarConfig, me.frameId]);

  /* ------------------------------ pairing flows ------------------------------ */
  const startHost = async () => {
    if (!peerSupported()) { showToast("This browser can't do direct WiFi play 😕", "err"); return; }
    setBusy(true);
    setIsHost(true);
    try {
      const host = await createHost();
      hostRef.current = host;
      setOfferCode(host.offerCode);
      setPhase("host_show");
    } catch {
      showToast("Could not start hosting — try again", "err");
    }
    setBusy(false);
  };

  const hostAccept = async (code: string) => {
    if (!hostRef.current || busy) return;
    setBusy(true);
    setScanning(false);
    try {
      const conn = await hostRef.current.acceptAnswer(code);
      wireConn(conn);
      setPhase("setup");
      soundEngine.playJoin();
      showToast("📶 Connected! Hide your code!");
    } catch {
      showToast("That answer code didn't work — scan it again", "err");
    }
    setBusy(false);
  };

  const joinWithOffer = async (code: string) => {
    if (busy) return;
    setBusy(true);
    setScanning(false);
    setIsHost(false);
    try {
      const guest = await createGuest(code);
      setAnswerCode(guest.answerCode);
      setPhase("join_show");
      guest.whenOpen.then(() => {
        wireConn(guest.conn);
        setPhase("setup");
        soundEngine.playJoin();
        showToast("📶 Connected! Hide your code!");
      });
    } catch {
      showToast("That invite code didn't work — scan it again", "err");
    }
    setBusy(false);
  };

  /* -------------------------------- timer -------------------------------- */
  useEffect(() => {
    if (phase !== "playing" || turn !== "me" || timerTotal === 0 || winner) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(t);
          setTimeout(() => {
            const st = stRef.current;
            if (st.phase !== "playing" || st.turn !== "me" || finishedRef.current) return;
            connRef.current?.send({ t: "timeout" });
            const mySl: 1 | 2 = isHost ? 1 : 2;
            setGuesses((prev) => [...prev, {
              id: makeId("to"), playerSlot: mySl, playerName: me.username, guess: "TIMEOUT",
              points: 0, orders: 0, isTimeout: true,
              turnNumber: prev.filter((g) => g.playerSlot === mySl).length + 1,
              timestamp: new Date().toISOString(),
            }]);
            soundEngine.playTimeout();
            setTurn("them");
            setBuffer("");
          }, 0);
          return timerTotal;
        }
        if (s <= 6) soundEngine.playTap(300);
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn, timerTotal, winner, guesses.length]);

  /* ------------------------------ game actions ------------------------------ */
  const confirmSecret = () => {
    const code = isValidSecretCode(setupBuffer) ? setupBuffer : generateRandomCode();
    setSecret(code);
    soundEngine.playReward();
    connRef.current?.send({ t: "ready" });
    const oppReady = oppReadyRef.current;
    if (oppReady) {
      setPhase("playing");
      setTurn(isHost ? "me" : "them");
      setSecondsLeft(timerTotal);
    } else {
      setPhase("waiting_ready");
    }
  };

  const submitGuess = () => {
    if (turn !== "me" || awaitingRef.current || !isValidSecretCode(buffer)) {
      setShakeTiles(true);
      setTimeout(() => setShakeTiles(false), 450);
      return;
    }
    awaitingRef.current = true;
    connRef.current?.send({ t: "guess", id: makeId("g"), guess: buffer });
    setBuffer("");
    soundEngine.playTap(700);
  };

  const pressDigit = (d: string) => {
    const isSetup = phase === "setup" || phase === "waiting_ready";
    if (scratch && phase === "playing") {
      soundEngine.playTap(460);
      setMarks((m) => ({ ...m, [d]: m[d] === undefined ? "eliminated" : m[d] === "eliminated" ? "confirmed" : undefined }));
      return;
    }
    const buf = isSetup ? setupBuffer : buffer;
    if (!isSetup && turn !== "me") return;
    if (isSetup && phase === "waiting_ready") return;
    if (buf.includes(d) || buf.length >= 4) { setShakeTiles(true); setTimeout(() => setShakeTiles(false), 450); return; }
    soundEngine.playTap(440 + Number(d) * 25);
    if (isSetup) setSetupBuffer(buf + d);
    else setBuffer(buf + d);
  };
  const pressDelete = () => {
    soundEngine.playDelete();
    if (phase === "setup") setSetupBuffer((b) => b.slice(0, -1));
    else setBuffer((b) => b.slice(0, -1));
  };

  const leaveGame = () => {
    if (phase === "playing" && !finishedRef.current) {
      connRef.current?.send({ t: "forfeit" });
      connRef.current?.send({ t: "reveal", secret });
      finish("them", "forfeit");
      return; // show result overlay; Home button exits
    }
    connRef.current?.close();
    onExit();
  };

  const claimDisconnect = () => {
    finish("me", "disconnect");
  };

  const sendChat = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    connRef.current?.send({ t: "chat", text: trimmed });
    setMessages((prev) => [...prev, { id: Date.now(), senderSlot: 1, senderName: "You", content: trimmed, createdAt: new Date().toISOString() }]);
    soundEngine.playTap(720);
  };

  const sendReaction = (id: string) => {
    pushFloater(id, false);
    connRef.current?.send({ t: "reaction", id });
    soundEngine.playTap(840);
  };

  const rematchAction = () => {
    if (!connRef.current?.isOpen()) { onExit(); return; }
    if (rematchState === "offered") {
      connRef.current.send({ t: "rematch" });
      resetForRematch();
    } else if (rematchState === "idle") {
      connRef.current.send({ t: "rematch" });
      setRematchState("sent");
      soundEngine.playTap(660);
    }
  };

  const copyText = async (text: string) => {
    try { await navigator.clipboard.writeText(text); showToast("📋 Code copied!"); } catch {}
  };

  useEffect(() => () => { connRef.current?.close(); hostRef.current?.cancel(); }, []);

  /* ------------------------------ pairing UI ------------------------------ */
  if (phase === "choose" || phase === "host_show" || phase === "join_scan" || phase === "join_show") {
    return (
      <div className="board-theme min-h-[100dvh] flex flex-col" data-board={me.themeId}>
        <div className="max-w-xl w-full mx-auto px-4 py-5 flex-1 flex flex-col">
          <div className="flex items-center gap-2">
            <button onClick={() => { hostRef.current?.cancel(); onExit(); }} className="btn-game w-10 h-10 !rounded-xl flex items-center justify-center"
              style={{ background: "var(--board-key)", color: "var(--board-ink)", border: "2px solid var(--board-border)", boxShadow: "0 3px 0 var(--board-border)" }} aria-label="Back">
              <ArrowLeft size={19} strokeWidth={2.8} />
            </button>
            <h2 className="font-display font-bold text-2xl" style={{ color: "var(--board-ink)" }}>📶 Local WiFi Duel</h2>
          </div>

          <div className="card-game p-3.5 mt-3 flex items-start gap-2.5">
            <Wifi size={22} className="shrink-0 mt-0.5" style={{ color: "#58CC02" }} />
            <p className="text-[13px] font-bold" style={{ color: "var(--ink-soft)" }}>
              No internet needed! Connect both phones to the <b>same WiFi or hotspot</b>, then pair with QR codes. Your phones talk directly to each other. (Keep this screen open on both phones.)
            </p>
          </div>

          {phase === "choose" && (
            <div className="space-y-2.5 mt-4">
              <button onClick={startHost} disabled={busy} className="w-full card-game p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform">
                <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#58CC02,#14D4C5)" }}>
                  <QrCode size={26} strokeWidth={2.4} />
                </span>
                <span className="flex-1">
                  <span className="font-display font-semibold text-lg block leading-tight">Host a duel</span>
                  <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>Show a QR code — your friend scans it to join you.</span>
                </span>
                {busy && <Loader2 className="animate-spin" size={20} />}
              </button>
              <button onClick={() => { setIsHost(false); setPhase("join_scan"); }} className="w-full card-game p-4 flex items-center gap-3 text-left active:scale-[0.98] transition-transform">
                <span className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white shrink-0" style={{ background: "linear-gradient(135deg,#A560E8,#1CB0F6)" }}>
                  <ScanLine size={26} strokeWidth={2.4} />
                </span>
                <span className="flex-1">
                  <span className="font-display font-semibold text-lg block leading-tight">Join a duel</span>
                  <span className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>Scan your friend&rsquo;s QR code to connect.</span>
                </span>
              </button>
              {!peerSupported() && (
                <p className="text-center text-sm font-black rounded-xl px-3 py-2" style={{ background: "rgba(255,75,75,0.14)", color: "#D33131" }}>
                  This browser doesn&rsquo;t support direct connections. Try Chrome/Safari latest.
                </p>
              )}
            </div>
          )}

          {phase === "host_show" && (
            <div className="card-game p-4 mt-4 text-center animate-pop">
              <p className="font-display font-semibold">Step 1: your friend scans this 👇</p>
              <div className="flex justify-center my-3"><QrImage code={offerCode} /></div>
              <button onClick={() => copyText(offerCode)} className="btn-game btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 mx-auto">
                <Copy size={14} /> Copy as text instead
              </button>
              <p className="font-display font-semibold mt-5">Step 2: scan THEIR answer code</p>
              <button onClick={() => setScanning(true)} disabled={busy} className="btn-game btn-green w-full py-3.5 mt-2 flex items-center justify-center gap-2">
                {busy ? <Loader2 className="animate-spin" size={19} /> : <Camera size={19} strokeWidth={2.6} />} Scan answer QR
              </button>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={2}
                placeholder="...or paste their answer code here" className="input-game w-full px-3 py-2.5 font-bold text-xs mt-2" />
              <button onClick={() => hostAccept(pasteText)} disabled={busy || pasteText.trim().length < 20} className="btn-game btn-blue w-full py-3 mt-2">
                Connect with pasted code
              </button>
            </div>
          )}

          {phase === "join_scan" && (
            <div className="card-game p-4 mt-4 text-center animate-pop">
              <p className="font-display font-semibold">Scan your friend&rsquo;s invite QR 👇</p>
              <button onClick={() => setScanning(true)} disabled={busy} className="btn-game btn-green w-full py-4 mt-3 flex items-center justify-center gap-2 text-lg">
                {busy ? <Loader2 className="animate-spin" size={20} /> : <Camera size={20} strokeWidth={2.6} />} Open scanner
              </button>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={2}
                placeholder="...or paste their invite code here" className="input-game w-full px-3 py-2.5 font-bold text-xs mt-2" />
              <button onClick={() => joinWithOffer(pasteText)} disabled={busy || pasteText.trim().length < 20} className="btn-game btn-blue w-full py-3 mt-2">
                Continue with pasted code
              </button>
            </div>
          )}

          {phase === "join_show" && (
            <div className="card-game p-4 mt-4 text-center animate-pop">
              <p className="font-display font-semibold">Almost there! Your friend scans THIS answer code 👇</p>
              <div className="flex justify-center my-3"><QrImage code={answerCode} /></div>
              <button onClick={() => copyText(answerCode)} className="btn-game btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 mx-auto">
                <Copy size={14} /> Copy as text instead
              </button>
              <p className="text-xs font-bold mt-3 flex items-center justify-center gap-1.5" style={{ color: "var(--ink-soft)" }}>
                <Loader2 className="animate-spin" size={14} /> Waiting for them to connect...
              </p>
            </div>
          )}
        </div>

        {scanning && (
          <QrScanner
            onScan={(text) => { if (phase === "host_show") void hostAccept(text); else void joinWithOffer(text); }}
            onCancel={() => setScanning(false)}
          />
        )}
      </div>
    );
  }

  /* -------------------------------- game UI -------------------------------- */
  const iWon = winner === "me";
  const isSetup = phase === "setup" || phase === "waiting_ready";

  return (
    <div className="board-theme min-h-[100dvh] flex flex-col" data-board={me.themeId}>
      <HeaderBar
        onBack={leaveGame}
        backTitle="Leave duel"
        left={
          <Stage name={me.username} title="You" config={me.avatarConfig} frameId={me.frameId}
            mood={phase === "finished" ? myMood : myMood} isTurn={phase === "playing" && turn === "me"}
            scoreLabel={`${myGuesses.length} guesses · best ${best(myGuesses)}/4`} floaters={floaters} align="left" />
        }
        center={
          <div className="flex flex-col items-center gap-1.5">
            <TimerRing secondsLeft={secondsLeft} total={timerTotal} active={phase === "playing" && turn === "me"} />
            <button onClick={() => { setChatOpen(true); chatOpenRef.current = true; setChatUnread(0); }} className="btn-game relative w-10 h-10 !rounded-full flex items-center justify-center"
              style={{ background: "var(--board-key)", color: "var(--board-ink)", border: "2px solid var(--board-border)", boxShadow: "0 3px 0 var(--board-border)" }} title="Chat">
              <MessageCircle size={18} strokeWidth={2.6} />
              {chatUnread > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-[#FF4B4B] text-white text-[10px] font-black flex items-center justify-center animate-pop">
                  {chatUnread}
                </span>
              )}
            </button>
          </div>
        }
        right={
          <Stage name={oppName} title="Local rival 📶" config={oppAvatar} frameId={oppFrame}
            mood={oppMood} isTurn={phase === "playing" && turn === "them"}
            scoreLabel={`${oppGuesses.length} guesses · best ${best(oppGuesses)}/4`} floaters={floaters} align="right" />
        }
      />

      <div className="max-w-5xl w-full mx-auto px-3 sm:px-5 mt-2 space-y-2">
        {connLost && phase !== "finished" && (
          <div className="rounded-2xl px-4 py-2.5 flex items-center justify-center gap-2 font-black text-sm" style={{ background: "#FF4B4B", color: "#fff" }}>
            <WifiOff size={16} /> Connection to {oppName} dropped!
            {phase === "playing" && (
              <button onClick={claimDisconnect} className="btn-game px-3 py-1.5 text-xs ml-1" style={{ background: "#fff", color: "#D33131" }}>
                <Flag size={13} className="inline mr-1" />Claim win
              </button>
            )}
          </div>
        )}
        <div className="rounded-2xl px-4 py-2 text-center font-display font-semibold text-sm sm:text-base"
          style={{ background: "var(--board-panel)", color: "var(--board-ink)", border: "2px solid var(--board-border)" }}>
          {phase === "setup" && "Hide your secret code!"}
          {phase === "waiting_ready" && `Locked in! Waiting for ${oppName} to hide their code...`}
          {phase === "playing" && (turn === "me" ? "Your turn — crack their code!" : `${oppName} is guessing...`)}
          {phase === "finished" && "Match over!"}
        </div>
      </div>

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
      </div>

      {(phase === "playing" || isSetup) && (
        <div className="sticky bottom-0 z-30 px-3 sm:px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2"
          style={{ background: "color-mix(in srgb, var(--board-panel) 92%, transparent)", backdropFilter: "blur(10px)", borderTop: "2px solid var(--board-border)" }}>
          <div className="max-w-xl mx-auto space-y-2.5">
            {isSetup ? (
              phase === "setup" ? (
                <>
                  <p className="text-center text-xs font-black" style={{ color: "var(--board-soft)" }}>Pick 4 DIFFERENT digits (1–9)</p>
                  <InputTiles value={setupBuffer} secret shake={shakeTiles} />
                  <Keypad buffer={setupBuffer} onDigit={pressDigit} onDelete={pressDelete} disabled={false} scratch={false} scratchMarks={{}} autoOut={new Set()} />
                  <div className="flex gap-2">
                    <button onClick={() => setSetupBuffer(generateRandomCode())} className="btn-game btn-ghost flex-1 py-3 flex items-center justify-center gap-2">
                      <Dices size={18} strokeWidth={2.6} /> Random
                    </button>
                    <button onClick={confirmSecret} disabled={setupBuffer.length !== 4} className="btn-game btn-green flex-[2] py-3 flex items-center justify-center gap-2 text-lg">
                      <Lock size={19} strokeWidth={2.7} /> Lock it in!
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-center font-black py-4 flex items-center justify-center gap-2" style={{ color: "var(--board-soft)" }}>
                  <Loader2 className="animate-spin" size={18} /> Waiting for {oppName}...
                </p>
              )
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <ReactionsBar onReact={sendReaction} compact />
                  <button onClick={() => { setScratch((v) => !v); soundEngine.playTap(520); }}
                    className={`btn-game px-3 py-1.5 text-xs flex items-center gap-1.5 ${scratch ? "btn-purple" : "btn-ghost"}`}>
                    <Pencil size={14} strokeWidth={2.7} /> {scratch ? "Marking..." : "Notes"}
                  </button>
                </div>
                <InputTiles value={buffer} shake={shakeTiles} />
                <Keypad buffer={buffer} onDigit={pressDigit} onDelete={pressDelete} disabled={turn !== "me" && !scratch} scratch={scratch} scratchMarks={marks} autoOut={autoOut} />
                <button onClick={submitGuess} disabled={turn !== "me" || buffer.length !== 4 || scratch}
                  className="btn-game btn-green w-full py-3.5 text-lg flex items-center justify-center gap-2">
                  <Swords size={20} strokeWidth={2.7} /> {scratch ? "Tap digits to mark them" : turn === "me" ? "GUESS!" : `Waiting for ${oppName}...`}
                </button>
                <p className="text-center text-[11px] font-bold flex items-center justify-center gap-1.5" style={{ color: "var(--board-soft)" }}>
                  <Eye size={12} /> Your secret code: <span className="font-display tracking-[0.3em]" style={{ color: "var(--board-ink)" }}>{secret}</span>
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {phase === "finished" && winner && (
        <ResultOverlay
          title={iWon ? "YOU CRACKED IT! 🎉" : `${oppName} wins this one`}
          subtitle={
            endReasonUi === "forfeit" ? (iWon ? "Your rival left the duel." : "You left the duel.")
            : endReasonUi === "disconnect" ? "Connection dropped — win by default!"
            : iWon ? "Local legend status: confirmed! 📶" : "Great duel — rematch?"
          }
          winnerConfig={iWon ? me.avatarConfig : oppAvatar}
          loserConfig={iWon ? oppAvatar : me.avatarConfig}
          winnerFrame={iWon ? me.frameId : oppFrame}
          rewards={{ coins: iWon ? 30 : 12, xp: iWon ? 60 : 35, trophies: 0 }}
          turns={(iWon ? myGuesses : oppGuesses).filter((g) => !g.isTimeout).length}
          onPlayAgain={rematchAction}
          onHome={() => { connRef.current?.close(); onExit(); }}
          playAgainLabel={connLost ? "Exit" : rematchState === "offered" ? "Accept rematch!" : rematchState === "sent" ? "Waiting..." : "Rematch!"}
          extra={rematchState === "offered" ? (
            <p className="text-center font-black text-sm mt-4 animate-pop" style={{ color: "#A560E8" }}>↩️ {oppName} wants a rematch!</p>
          ) : undefined}
        />
      )}

      <MatchChatPanel
        open={chatOpen}
        onClose={() => { setChatOpen(false); chatOpenRef.current = false; setChatUnread(0); }}
        opponentName={oppName}
        mySlot={1}
        messages={messages}
        onSend={sendChat}
        onPhrase={sendChat}
      />
    </div>
  );
}
