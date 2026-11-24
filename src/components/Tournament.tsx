"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Coins, Copy, Dices, Gem, KeyRound, Loader2, Lock, Plus, Swords, Trophy, X, Network } from "lucide-react";
import { CharacterAvatar } from "./Character";
import { GuessRow, InputTiles, Keypad } from "./GameBoard";
import { generateRandomCode, isValidSecretCode } from "@/lib/game-engine";
import { fireWinEffect } from "@/lib/win-effects";
import { makeId } from "@/lib/session";
import { soundEngine } from "@/lib/sound-effects";
import type { BracketMatchView, GuessEntry, Player, TournamentView } from "@/lib/types";
import Credits from "@/components/Credits";

function guestKey(): string {
  try {
    let k = localStorage.getItem("cipherclash_guest_key");
    if (!k) {
      k = makeId("gk");
      localStorage.setItem("cipherclash_guest_key", k);
    }
    return k;
  } catch {
    return "guest-fallback";
  }
}

function timeLeft(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h >= 1) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export default function Tournament({
  me,
  token,
  onBack,
  showToast,
  onRefresh,
}: {
  me: Player;
  token: string | null;
  onBack: () => void;
  showToast: (m: string, k?: "ok" | "err") => void;
  onRefresh: () => void;
}) {
  const [list, setList] = useState<TournamentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [buffer, setBuffer] = useState("");
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [huntName, setHuntName] = useState("");
  const [huntSecret, setHuntSecret] = useState("");
  const [huntPrize, setHuntPrize] = useState(300);
  const [shakeTiles, setShakeTiles] = useState(false);
  const [mode, setMode] = useState<"hunts" | "brackets">("hunts");
  const [showBracketCreate, setShowBracketCreate] = useState(false);
  const [cupName, setCupName] = useState("");
  const [cupPot, setCupPot] = useState(1000);
  const aliveRef = useRef(true);

  const identityQs = useCallback(() => {
    const qs = new URLSearchParams();
    if (token) qs.set("token", token);
    else {
      qs.set("guestKey", guestKey());
      qs.set("name", me.username);
    }
    return qs;
  }, [token, me.username]);

  const load = useCallback(async (extraCode?: string) => {
    try {
      const qs = identityQs();
      if (extraCode) qs.set("code", extraCode);
      const res = await fetch(`/api/tournaments?${qs.toString()}`);
      if (!res.ok || !aliveRef.current) return;
      const data = await res.json();
      const arr: TournamentView[] = data.tournaments || [];
      setList(arr);
      setSelectedId((cur) => {
        if (cur && arr.some((t) => t.id === cur)) return cur;
        const live = arr.find((t) => t.status === "live");
        return (live || arr[0])?.id ?? null;
      });
    } catch {}
    if (aliveRef.current) setLoading(false);
  }, [identityQs]);

  useEffect(() => {
    aliveRef.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load + live hunt polling
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 6000);
    return () => { aliveRef.current = false; clearInterval(t); };
  }, [load]);

  const post = async (payload: Record<string, unknown>) => {
    const body: Record<string, unknown> = { ...payload };
    if (token) body.token = token;
    else {
      body.guestKey = guestKey();
      body.name = me.username;
      body.avatar = me.avatarConfig;
    }
    const res = await fetch("/api/tournaments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };

  const selected = list.find((t) => t.id === selectedId) || null;
  const myGuesses: GuessEntry[] = useMemo(
    () =>
      (selected?.mine?.guesses || []).map((g, i) => ({
        id: `h-${i}`, playerSlot: 1 as const, playerName: me.username, guess: g.guess,
        points: g.points, orders: g.orders, isTimeout: false, turnNumber: i + 1,
        timestamp: new Date().toISOString(),
      })),
    [selected, me.username]
  );
  const autoOut = useMemo(() => {
    const out = new Set<string>();
    for (const g of selected?.mine?.guesses || []) if (g.points === 0) for (const ch of g.guess) out.add(ch);
    return out;
  }, [selected]);

  const submitGuess = async () => {
    if (!selected || busy) return;
    if (!isValidSecretCode(buffer)) { setShakeTiles(true); setTimeout(() => setShakeTiles(false), 450); return; }
    setBusy(true);
    try {
      const { res, data } = await post({ action: "guess", tournamentId: selected.id, guess: buffer });
      if (data.tournament) {
        setList((prev) => prev.map((t) => (t.id === data.tournament.id ? data.tournament : t)));
        setBuffer("");
        if (data.result) soundEngine.playFeedback(data.result.points, data.result.orders);
        if (data.result?.isWin) {
          void fireWinEffect(me.effectId);
          soundEngine.playVictory();
          showToast(token ? `🏆 YOU CRACKED THE HUNT CODE! +${selected.prizeCoins} coins, +${selected.prizeGems} gems!` : "🏆 YOU CRACKED IT! (Create an account to claim hunt prizes next time!)");
          onRefresh();
        }
      }
      if (!res.ok && data.error) showToast(data.error, "err");
    } catch {
      showToast("Connection hiccup — try again!", "err");
    }
    setBusy(false);
  };

  const createHunt = async () => {
    if (!token) { showToast("Create a free account to host a hunt!", "err"); return; }
    if (!isValidSecretCode(huntSecret)) { showToast("Pick a secret: 4 different digits (1–9)", "err"); return; }
    setBusy(true);
    try {
      const { res, data } = await post({ action: "create_hunt", name: huntName.trim() || `${me.username}'s Hunt`, secret: huntSecret, prizeCoins: huntPrize });
      if (!res.ok) throw new Error(data.error || "Could not create hunt");
      setShowCreate(false);
      setHuntSecret("");
      soundEngine.playReward();
      showToast(`🏆 Hunt created! Share code ${data.tournament.inviteCode} with friends!`);
      await load();
      setSelectedId(data.tournament.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create hunt", "err");
    }
    setBusy(false);
  };

  const createBracket = async () => {
    if (!token) { showToast("Create a free account to host a Bracket Cup!", "err"); return; }
    setBusy(true);
    try {
      const { res, data } = await post({ action: "create_bracket", name: cupName.trim() || `${me.username}'s Bracket Cup`, prizeCoins: cupPot });
      if (!res.ok) throw new Error(data.error || "Could not create bracket");
      setShowBracketCreate(false);
      setCupName("");
      soundEngine.playReward();
      showToast(`⚔️ Bracket Cup created! Share code ${data.tournament.inviteCode} — 8 players, winner takes the pot!`);
      await load();
      setSelectedId(data.tournament.id);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create bracket", "err");
    }
    setBusy(false);
  };

  const joinBracket = async (t: TournamentView) => {
    setBusy(true);
    try {
      const { res, data } = await post({ action: "join_bracket", id: t.id });
      if (!res.ok) throw new Error(data.error || "Join failed");
      setList((prev) => prev.map((x) => (x.id === data.tournament.id ? data.tournament : x)));
      soundEngine.playJoin();
      showToast("⚔️ You're in the bracket! Good luck!");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Join failed", "err");
    }
    setBusy(false);
  };

  const setWinner = async (round: number, match: number, winnerKey: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      const { res, data } = await post({ action: "bracket_set_winner", id: selected.id, round, match, winnerKey });
      if (!res.ok) throw new Error(data.error || "Could not set result");
      setList((prev) => prev.map((x) => (x.id === data.tournament.id ? data.tournament : x)));
      soundEngine.playVictory();
      if (data.isFinal) {
        showToast(`🏆 ${data.championName} wins the cup — ${data.prizePaid > 0 ? `+${data.prizePaid} coins!` : "champion!"}`);
        void fireWinEffect(me.effectId);
      } else {
        showToast("Result saved — bracket advanced!");
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not set result", "err");
    }
    setBusy(false);
  };

  const findByCode = async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length < 4) return;
    setBusy(true);
    await load(code);
    setList((prev) => {
      const found = prev.find((t) => t.inviteCode === code);
      if (found) {
        setSelectedId(found.id);
        showToast(`Found "${found.name}"! Good hunting 🎯`);
      } else {
        showToast("No hunt with that code — double-check it!", "err");
      }
      return prev;
    });
    setBusy(false);
  };

  const copyInvite = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      showToast("📋 Invite code copied!");
    } catch {}
  };

  const pressDigit = (d: string, target: "guess" | "secret") => {
    const cur = target === "guess" ? buffer : huntSecret;
    if (cur.includes(d) || cur.length >= 4) { setShakeTiles(true); setTimeout(() => setShakeTiles(false), 450); return; }
    soundEngine.playTap(440 + Number(d) * 25);
    if (target === "guess") setBuffer(cur + d);
    else setHuntSecret(cur + d);
  };

  const huntCard = (t: TournamentView) => {
    const live = t.status === "live";
    return (
      <button key={t.id} onClick={() => { setSelectedId(t.id); soundEngine.playTap(520); }}
        className="card-game p-3 text-left flex items-center gap-3 w-full active:scale-[0.98] transition-transform"
        style={selectedId === t.id ? { borderColor: "var(--gold)", boxShadow: "0 0 0 2px var(--gold), var(--shadow-card)" } : undefined}>
        <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: live ? (t.type === "bracket_8" ? "linear-gradient(135deg,#A560E8,#1CB0F6)" : "linear-gradient(135deg,#E0A800,#FF7A18)") : "var(--border-strong)" }}>
          {t.type === "bracket_8" ? <Network size={21} strokeWidth={2.5} /> : <Trophy size={21} strokeWidth={2.5} />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="font-display font-semibold block leading-tight truncate">{t.name}</span>
          <span className="text-[11px] font-bold block" style={{ color: "var(--ink-faint)" }}>
            {live ? `🟢 Live · ${timeLeft(t.endsAt)}` : t.winnerName ? `🏆 Won by ${t.winnerName}` : "Finished"} · {t.leaderboard.length} hunters
            {t.isPrivate ? " · 🔒 private" : ""}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="font-black text-xs flex items-center gap-1 justify-end"><Coins size={13} style={{ color: "#E0A800" }} />{t.prizeCoins}</span>
          {t.prizeGems > 0 && <span className="font-black text-xs flex items-center gap-1 justify-end"><Gem size={13} style={{ color: "#1CB0F6" }} />{t.prizeGems}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 pb-tabbar animate-fade">
      <div className="flex items-center gap-2 py-3 sticky safe-top z-20" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)" }}>
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <h2 className="font-display font-bold text-2xl flex-1">Tournaments 🏆</h2>
        {token && mode === "hunts" && (
          <button onClick={() => { setShowBracketCreate(false); setShowCreate((v) => !v); }} className="btn-game btn-gold px-3 py-2 text-xs flex items-center gap-1">
            {showCreate ? <X size={14} strokeWidth={2.8} /> : <Plus size={14} strokeWidth={2.8} />} Host a hunt
          </button>
        )}
        {token && mode === "brackets" && (
          <button onClick={() => { setShowCreate(false); setShowBracketCreate((v) => !v); }} className="btn-game btn-purple px-3 py-2 text-xs flex items-center gap-1">
            {showBracketCreate ? <X size={14} strokeWidth={2.8} /> : <Plus size={14} strokeWidth={2.8} />} Host bracket
          </button>
        )}
      </div>

      {/* mode switch */}
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <button onClick={() => { setMode("hunts"); soundEngine.playTap(520); }} className={`btn-game py-2.5 flex items-center justify-center gap-1.5 ${mode === "hunts" ? "btn-gold" : "btn-ghost"}`}>
          <Trophy size={15} strokeWidth={2.6} /> Code Hunts
        </button>
        <button onClick={() => { setMode("brackets"); soundEngine.playTap(520); }} className={`btn-game py-2.5 flex items-center justify-center gap-1.5 ${mode === "brackets" ? "btn-purple" : "btn-ghost"}`}>
          <Network size={15} strokeWidth={2.6} /> Bracket Cups
        </button>
      </div>

      {mode === "hunts" ? (
        <p className="text-sm font-bold mb-3" style={{ color: "var(--ink-soft)" }}>
          🎯 <b>Mass Hunt:</b> one hidden code, EVERYONE races to crack it. First solver takes the prize pot!
        </p>
      ) : (
        <p className="text-sm font-bold mb-3" style={{ color: "var(--ink-soft)" }}>
          ⚔️ <b>Bracket Cup:</b> 8 players, single elimination. Play each round however you like (online duel, bots don&rsquo;t count!) — the host taps the winner. Champion takes the pot. Anyone can watch!
        </p>
      )}

      {/* join by code */}
      <div className="flex gap-2 mb-3">
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder={mode === "brackets" ? "CUP CODE" : "HUNT CODE"} className="input-game flex-1 px-3 py-2.5 font-display font-bold text-center tracking-[0.2em] uppercase" />
        <button onClick={findByCode} disabled={busy || joinCode.length < 4} className="btn-game btn-purple px-4 flex items-center gap-1.5">
          <KeyRound size={16} strokeWidth={2.6} /> Find
        </button>
      </div>

      {/* create hunt */}
      {showCreate && token && (
        <div className="card-game p-4 mb-3 animate-pop">
          <h3 className="font-display font-semibold text-lg">Host your own hunt 🎯</h3>
          <p className="text-xs font-bold mt-0.5" style={{ color: "var(--ink-soft)" }}>
            You pick the secret code (so you can&rsquo;t play in it). Friends join with your invite code — first to crack it wins the prize!
          </p>
          <input value={huntName} onChange={(e) => setHuntName(e.target.value)} maxLength={40}
            placeholder="Hunt name (e.g. Friday Night Hunt)" className="input-game w-full px-3.5 py-2.5 font-black mt-3" />
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <span className="text-[11px] font-black" style={{ color: "var(--ink-faint)" }}>PRIZE:</span>
            {[100, 300, 500, 1000].map((amt) => (
              <button key={amt} onClick={() => setHuntPrize(amt)} className={`btn-game px-3 py-1.5 text-xs flex items-center gap-1 ${huntPrize === amt ? "btn-gold" : "btn-ghost"}`}>
                <Coins size={12} /> {amt}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-black mt-3 mb-1.5" style={{ color: "var(--ink-faint)" }}>YOUR SECRET CODE:</p>
          <InputTiles value={huntSecret} secret shake={shakeTiles} />
          <div className="mt-2.5">
            <Keypad buffer={huntSecret} onDigit={(d) => pressDigit(d, "secret")} onDelete={() => setHuntSecret((v) => v.slice(0, -1))}
              disabled={busy} scratch={false} scratchMarks={{}} autoOut={new Set()} />
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setHuntSecret(generateRandomCode())} className="btn-game btn-ghost flex-1 py-3 flex items-center justify-center gap-2">
              <Dices size={17} strokeWidth={2.6} /> Random
            </button>
            <button onClick={createHunt} disabled={busy || huntSecret.length !== 4} className="btn-game btn-green flex-[2] py-3 flex items-center justify-center gap-2">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <Lock size={17} strokeWidth={2.7} />} Create hunt!
            </button>
          </div>
        </div>
      )}

      {/* create bracket cup */}
      {showBracketCreate && token && (
        <div className="card-game p-4 mb-3 animate-pop">
          <h3 className="font-display font-semibold text-lg">Host a Bracket Cup ⚔️</h3>
          <p className="text-xs font-bold mt-0.5" style={{ color: "var(--ink-soft)" }}>
            Up to 8 players join with your code. You are the host: after each duel, tap the winner to advance the bracket. Champion takes the pot (paid by the house)!
          </p>
          <input value={cupName} onChange={(e) => setCupName(e.target.value)} maxLength={30}
            placeholder={`Cup name (e.g. ${me.username}'s Bracket Cup)`} className="input-game w-full px-3.5 py-2.5 font-black mt-3" />
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            <span className="text-[11px] font-black" style={{ color: "var(--ink-faint)" }}>PRIZE POT:</span>
            {[500, 1000, 2000, 5000].map((amt) => (
              <button key={amt} onClick={() => setCupPot(amt)} className={`btn-game px-3 py-1.5 text-xs flex items-center gap-1 ${cupPot === amt ? "btn-gold" : "btn-ghost"}`}>
                <Coins size={12} /> {amt}
              </button>
            ))}
          </div>
          <button onClick={createBracket} disabled={busy} className="btn-game btn-green w-full py-3 mt-3 flex items-center justify-center gap-2">
            {busy ? <Loader2 className="animate-spin" size={18} /> : <Network size={17} strokeWidth={2.7} />} Create cup!
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-14">
          <Loader2 className="animate-spin" size={28} />
          <p className="font-black text-sm" style={{ color: "var(--ink-soft)" }}>Loading tournaments...</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 mb-4">
            {list
              .filter((t) => (mode === "brackets" ? t.type === "bracket_8" : t.type !== "bracket_8"))
              .map(huntCard)}
          </div>

          {selected && selected.type === "bracket_8" && (
            <BracketPanel
              t={selected}
              me={me}
              busy={busy}
              onCopy={copyInvite}
              onJoin={() => void joinBracket(selected)}
              onSetWinner={(r, m, k) => void setWinner(r, m, k)}
            />
          )}

          {selected && selected.type !== "bracket_8" && (
            <div className="board-theme rounded-3xl border-2 p-4 animate-pop" data-board={me.themeId} style={{ borderColor: "var(--board-border)", color: "var(--board-ink)" }}>
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="font-display font-bold text-xl leading-tight">{selected.name}</h3>
                  <p className="text-[11px] font-black" style={{ color: "var(--board-soft)" }}>
                    {selected.status === "live" ? `🟢 Live · ${timeLeft(selected.endsAt)}` : "Finished"}
                    {` · Prize ${selected.prizeCoins} coins${selected.prizeGems ? ` + ${selected.prizeGems} gems` : ""}`}
                    {selected.createdBy !== "system" ? ` · hosted by ${selected.createdBy}` : ""}
                  </p>
                </div>
                {selected.inviteCode && (
                  <button onClick={() => copyInvite(selected.inviteCode as string)} className="chip px-2.5 py-1.5 font-black text-xs flex items-center gap-1.5">
                    <Copy size={13} /> {selected.inviteCode}
                  </button>
                )}
              </div>

              {selected.status === "finished" && (
                <div className="rounded-2xl px-3.5 py-2.5 mt-3 text-center font-black" style={{ background: "rgba(255,200,0,0.18)", border: "2px solid #FFC800" }}>
                  {selected.winnerName ? `🏆 ${selected.winnerName} cracked it! The code was ${selected.secretCode}` : `⏰ Time's up — nobody cracked ${selected.secretCode}!`}
                </div>
              )}

              {/* leaderboard */}
              <h4 className="font-display font-semibold text-sm mt-4 mb-1.5">Hunters leaderboard</h4>
              {selected.leaderboard.length === 0 ? (
                <p className="text-sm font-bold py-2" style={{ color: "var(--board-soft)" }}>No hunters yet — be the first! 🎯</p>
              ) : (
                <div className="space-y-1">
                  {selected.leaderboard.map((h, i) => (
                    <div key={`${h.username}-${i}`} className="flex items-center gap-2 px-2 py-1.5 rounded-xl"
                      style={{ background: h.isMe ? "rgba(88,204,2,0.16)" : "var(--board-key)" }}>
                      <span className="font-display font-bold w-6 text-center">{i + 1}</span>
                      <CharacterAvatar config={h.avatar} frameId="frame_emerald" size={30} ringWidth={2} />
                      <span className="font-black text-sm flex-1 truncate">{h.username}{h.isMe ? " (you)" : ""}</span>
                      {h.solved ? (
                        <span className="font-black text-xs" style={{ color: "#E0A800" }}>🏆 CRACKED in {h.attempts}</span>
                      ) : (
                        <span className="text-[11px] font-black" style={{ color: "var(--board-soft)" }}>
                          best {h.bestOrders}/4 placed · {h.attempts} tries
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* my board */}
              {selected.status === "live" && selected.canPlay && (
                <div className="mt-4">
                  <div className="rounded-2xl p-3 mb-3" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
                    <div className="space-y-1.5">
                      {myGuesses.length === 0 && <p className="text-sm font-bold py-2 text-center" style={{ color: "var(--board-soft)" }}>Your guesses will appear here — 25 max!</p>}
                      {myGuesses.map((g, i) => <GuessRow key={g.id} g={g} highlight={i === myGuesses.length - 1} />)}
                    </div>
                  </div>
                  {selected.mine?.solved ? (
                    <p className="text-center font-black" style={{ color: "#46A302" }}>🎉 You cracked this hunt!</p>
                  ) : (
                    <div className="max-w-xl mx-auto space-y-2.5">
                      <InputTiles value={buffer} shake={shakeTiles} />
                      <Keypad buffer={buffer} onDigit={(d) => pressDigit(d, "guess")} onDelete={() => setBuffer((v) => v.slice(0, -1))}
                        disabled={busy} scratch={false} scratchMarks={{}} autoOut={autoOut} />
                      <button onClick={submitGuess} disabled={busy || buffer.length !== 4}
                        className="btn-game btn-green w-full py-3.5 text-lg flex items-center justify-center gap-2">
                        {busy ? <Loader2 className="animate-spin" size={19} /> : <Swords size={19} strokeWidth={2.7} />} HUNT!
                      </button>
                    </div>
                  )}
                </div>
              )}
              {!selected.canPlay && selected.status === "live" && (
                <p className="text-center font-black text-sm mt-4" style={{ color: "var(--board-soft)" }}>
                  🎩 You&rsquo;re hosting — your secret is {selected.secretCode}. Share the invite code and watch them hunt!
                </p>
              )}
            </div>
          )}
        </>
      )}

      <Credits />
    </div>
  );
}

/* ------------------------------ Bracket Cup panel ------------------------------ */

function BracketPanel({ t, me, busy, onCopy, onJoin, onSetWinner }: {
  t: TournamentView;
  me: Player;
  busy: boolean;
  onCopy: (code: string) => void;
  onJoin: () => void;
  onSetWinner: (round: number, match: number, winnerKey: string) => void;
}) {
  const bracket = t.bracket;
  return (
    <div className="board-theme rounded-3xl border-2 p-4 animate-pop" data-board={me.themeId} style={{ borderColor: "var(--board-border)", color: "var(--board-ink)" }}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-display font-bold text-xl leading-tight">⚔️ {t.name}</h3>
          <p className="text-[11px] font-black" style={{ color: "var(--board-soft)" }}>
            {t.status === "live" ? `🟢 Live · ${t.participantCount || 0}/8 joined` : "Finished"}
            {` · Pot ${t.prizeCoins} coins${t.prizeGems ? ` + ${t.prizeGems} gems` : ""}`}
            {` · hosted by ${t.createdBy}`}
          </p>
        </div>
        {t.inviteCode && (
          <button onClick={() => onCopy(t.inviteCode as string)} className="chip px-2.5 py-1.5 font-black text-xs flex items-center gap-1.5">
            <Copy size={13} /> {t.inviteCode}
          </button>
        )}
      </div>

      {t.status === "finished" && (
        <div className="rounded-2xl px-3.5 py-2.5 mt-3 text-center font-black" style={{ background: "rgba(255,200,0,0.18)", border: "2px solid #FFC800" }}>
          🏆 {bracket?.champion || t.winnerName || "—"} wins the cup!
        </div>
      )}

      {t.status === "live" && !t.joined && (t.participantCount || 0) < 8 && (
        <button onClick={onJoin} disabled={busy} className="btn-game btn-green w-full py-3 mt-3 flex items-center justify-center gap-2">
          <Swords size={17} strokeWidth={2.7} /> Join this cup ({t.participantCount || 0}/8)
        </button>
      )}
      {t.joined && t.status === "live" && (
        <p className="text-center text-xs font-black mt-3" style={{ color: "var(--board-soft)" }}>
          You&rsquo;re in! Play your duel when your pairing is set, then the host taps the winner. Watch live duels from the roster with the Watch button 👀
        </p>
      )}

      {bracket ? (
        <div className="mt-4 space-y-3">
          {bracket.rounds.map((round, ri) => (
            <div key={ri}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: "var(--board-soft)" }}>
                {ri === bracket.rounds.length - 1 ? "FINAL" : ri === bracket.rounds.length - 2 ? "SEMI-FINALS" : `ROUND ${ri + 1}`}
              </p>
              <div className="space-y-1.5">
                {round.map((m, mi) => (
                  <BracketMatchRow
                    key={`${ri}-${mi}`}
                    m={m}
                    round={ri}
                    idx={mi}
                    isHost={!!t.isHost && t.status === "live"}
                    busy={busy}
                    onSetWinner={onSetWinner}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm font-bold mt-3" style={{ color: "var(--board-soft)" }}>
          The bracket is seeded once players join. Share the code to fill it up!
        </p>
      )}
    </div>
  );
}

function BracketMatchRow({ m, round, idx, isHost, busy, onSetWinner }: {
  m: BracketMatchView;
  round: number;
  idx: number;
  isHost: boolean;
  busy: boolean;
  onSetWinner: (round: number, match: number, winnerKey: string) => void;
}) {
  const ready = Boolean(m.aKey && m.bKey);
  return (
    <div className="rounded-2xl px-3 py-2 flex items-center gap-2" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
      <div className="flex-1 min-w-0 text-sm font-black truncate">
        <span className={m.winnerKey && m.winnerKey === m.aKey ? "" : m.decided ? "opacity-50" : ""}>{m.a}</span>
        <span className="mx-1.5 font-display" style={{ color: "var(--board-soft)" }}>vs</span>
        <span className={m.winnerKey && m.winnerKey === m.bKey ? "" : m.decided ? "opacity-50" : ""}>{m.b}</span>
      </div>
      {m.decided ? (
        <span className="text-[10px] font-black px-2 py-1 rounded-lg text-white shrink-0" style={{ background: "#58CC02" }}>✔ {m.winner}</span>
      ) : ready && isHost ? (
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onSetWinner(round, idx, m.aKey as string)} disabled={busy}
            className="btn-game btn-ghost px-2 py-1 text-[10px]">{m.a} wins</button>
          <button onClick={() => onSetWinner(round, idx, m.bKey as string)} disabled={busy}
            className="btn-game btn-ghost px-2 py-1 text-[10px]">{m.b} wins</button>
        </div>
      ) : (
        <span className="text-[10px] font-black shrink-0" style={{ color: "var(--board-soft)" }}>{ready ? "awaiting result" : "pairing..."}</span>
      )}
    </div>
  );
}
