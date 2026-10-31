"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Coins, Copy, Dices, Gem, KeyRound, Loader2, Lock, Plus, Swords, Trophy, X } from "lucide-react";
import { CharacterAvatar } from "./Character";
import { GuessRow, InputTiles, Keypad } from "./GameBoard";
import { generateRandomCode, isValidSecretCode } from "@/lib/game-engine";
import { fireWinEffect } from "@/lib/win-effects";
import { makeId } from "@/lib/session";
import { soundEngine } from "@/lib/sound-effects";
import type { GuessEntry, Player, TournamentView } from "@/lib/types";

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
        <span className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0" style={{ background: live ? "linear-gradient(135deg,#E0A800,#FF7A18)" : "var(--border-strong)" }}>
          <Trophy size={21} strokeWidth={2.5} />
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
    <div className="max-w-3xl mx-auto px-3 sm:px-5 pb-16 animate-fade">
      <div className="flex items-center gap-2 py-3 sticky top-0 z-20" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)" }}>
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <h2 className="font-display font-bold text-2xl flex-1">Tournaments 🏆</h2>
        {token && (
          <button onClick={() => setShowCreate((v) => !v)} className="btn-game btn-gold px-3 py-2 text-xs flex items-center gap-1">
            {showCreate ? <X size={14} strokeWidth={2.8} /> : <Plus size={14} strokeWidth={2.8} />} Host a hunt
          </button>
        )}
      </div>

      <p className="text-sm font-bold mb-3" style={{ color: "var(--ink-soft)" }}>
        🎯 <b>Mass Hunt:</b> one hidden code, EVERYONE races to crack it. First solver takes the prize pot!
      </p>

      {/* join by code */}
      <div className="flex gap-2 mb-3">
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="HUNT CODE" className="input-game flex-1 px-3 py-2.5 font-display font-bold text-center tracking-[0.2em] uppercase" />
        <button onClick={findByCode} disabled={busy || joinCode.length < 4} className="btn-game btn-purple px-4 flex items-center gap-1.5">
          <KeyRound size={16} strokeWidth={2.6} /> Find hunt
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

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-14">
          <Loader2 className="animate-spin" size={28} />
          <p className="font-black text-sm" style={{ color: "var(--ink-soft)" }}>Loading hunts...</p>
        </div>
      ) : (
        <>
          <div className="space-y-1.5 mb-4">{list.map(huntCard)}</div>

          {selected && (
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
    </div>
  );
}
