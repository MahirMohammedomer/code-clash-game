"use client";

/**
 * Career Mode — a 20-stage offline ladder vs the four bots with one-time
 * rewards. Works fully offline (progress saved on-device per username);
 * accounts sync claimed rewards to the server (deduped server-side).
 */

import React, { useState } from "react";
import { ArrowLeft, Check, Coins, Gem, Loader2, Lock, Play, Star, Trophy } from "lucide-react";
import { CharacterAvatar } from "./Character";
import { AI_BOTS, emptyDailyStats } from "@/lib/game-engine";
import { CAREER_STAGES, careerStageUnlocked, isStageRewarded, loadCareerProgress, markStageRewarded, recordStageWin, type CareerStage } from "@/lib/career";
import { soundEngine } from "@/lib/sound-effects";
import { fetchT } from "@/lib/fetch-t";
import { queuePendingResult } from "@/lib/session";
import type { Player } from "@/lib/types";

export default function Career({ me, token, onBack, showToast, onPlayerUpdate, onStartStage }: {
  me: Player;
  token: string | null;
  onBack: () => void;
  showToast: (m: string, k?: "ok" | "err") => void;
  onPlayerUpdate: (p: Player) => void;
  /** Launch the GameBoard for this stage (parent wires the actual match). */
  onStartStage: (stage: CareerStage) => void;
}) {
  const [progress, setProgress] = useState(() => loadCareerProgress(me.username));
  const [busy, setBusy] = useState("");
  const refreshProgress = () => setProgress(loadCareerProgress(me.username));

  const totalStars = Object.values(progress.stars).reduce((s, v) => s + v, 0);
  const completed = progress.claimed.length;

  /** Grant a stage's reward. Guests: instant local credit. Accounts: server claim. */
  const claim = async (stage: CareerStage) => {
    setBusy(stage.id);
    if (token) {
      try {
        const res = await fetchT("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "career_claim", token, stageId: stage.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Claim failed");
        if (data.player && !data.already) {
          onPlayerUpdate({ ...data.player, avatarConfig: me.avatarConfig });
          showToast(`+${stage.coins} coins${stage.gems ? ` +${stage.gems} gems` : ""} — stage cleared! 🏅`);
        } else if (!data.already) {
          showToast("Reward synced!");
        }
      } catch {
        // Offline: queue the claim — it's flushed + deduped on next launch.
        queuePendingResult({ action: "career_claim", stageId: stage.id, resultId: `career_${stage.id}` });
        showToast("Offline — reward syncs on your next launch! 📶");
      }
    } else {
      if (isStageRewarded(me.username, stage.id)) { setBusy(""); return; } // already granted
      const today = new Date().toLocaleDateString("en-CA");
      const newXp = me.xp + 60;
      onPlayerUpdate({
        ...me,
        coins: me.coins + stage.coins,
        gems: me.gems + (stage.gems || 0),
        xp: newXp,
        level: Math.max(me.level, Math.floor(newXp / 200) + 1),
        dailyStats: me.dailyStats?.date === today ? me.dailyStats : emptyDailyStats(today),
      });
      markStageRewarded(me.username, stage.id);
      showToast(`+${stage.coins} coins${stage.gems ? ` +${stage.gems} gems` : ""} — stage cleared! 🏅`);
    }
    soundEngine.playReward();
    refreshProgress();
    setBusy("");
  };

  const serverClaimed = me.careerClaimed || [];

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-5 pb-32 animate-fade">
      <div className="flex items-center gap-2 py-3 sticky top-0 z-20" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)", backdropFilter: "blur(10px)" }}>
        <button onClick={onBack} className="btn-game btn-ghost w-10 h-10 !rounded-xl flex items-center justify-center" aria-label="Back">
          <ArrowLeft size={19} strokeWidth={2.8} />
        </button>
        <h2 className="font-display font-bold text-2xl flex-1">Career Mode 🎯</h2>
        <span className="chip px-2.5 py-1.5 text-xs font-black flex items-center gap-1">
          <Trophy size={13} style={{ color: "#E0A800" }} /> {completed}/{CAREER_STAGES.length}
        </span>
        <span className="chip px-2.5 py-1.5 text-xs font-black flex items-center gap-1">
          <Star size={13} fill="#FFC800" style={{ color: "#FFC800" }} /> {totalStars}/{CAREER_STAGES.length * 3}
        </span>
      </div>

      <div className="card-game p-3.5 mb-3 flex items-center gap-3" style={{ background: "linear-gradient(135deg, rgba(255,122,24,0.16), rgba(255,75,110,0.12))" }}>
        <span className="text-[28px] leading-none" aria-hidden>🎖️</span>
        <p className="text-xs font-bold flex-1" style={{ color: "var(--ink-soft)" }}>
          Beat all 20 stages to become a <b>Cipher Master</b>. Every stage pays one-time coins &amp; gems — and the whole ladder works <b>offline</b>.
        </p>
      </div>

      <div className="space-y-2">
        {CAREER_STAGES.map((stage, i) => {
          const unlocked = careerStageUnlocked(i, progress.claimed);
          const beaten = progress.claimed.includes(stage.id);
          const rewardClaimed = token ? serverClaimed.includes(stage.id) : isStageRewarded(me.username, stage.id);
          const stars = progress.stars[stage.id] || 0;
          const bot = AI_BOTS[stage.bot];
          return (
            <div key={stage.id} className="card-game p-3.5 flex items-center gap-3" style={{ opacity: unlocked ? 1 : 0.6, borderColor: beaten ? "#58CC02" : undefined }}>
              <CharacterAvatar config={bot.avatar} frameId={bot.frameId} size={52} ringWidth={3} mood={beaten ? "happy" : "idle"} />
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold leading-tight flex items-center gap-1.5">
                  Stage {i + 1}: {stage.name}
                  {beaten && <Check size={15} strokeWidth={3} style={{ color: "#58CC02" }} />}
                </p>
                <p className="text-[11px] font-bold" style={{ color: "var(--ink-soft)" }}>{stage.desc}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="flex gap-0.5">
                    {[0, 1, 2].map((s) => (
                      <Star key={s} size={11} fill={s < stars ? "#FFC800" : "none"} style={{ color: s < stars ? "#FFC800" : "var(--border-strong)" }} />
                    ))}
                  </span>
                  <span className="text-[10px] font-black flex items-center gap-0.5" style={{ color: "#E0A800" }}>
                    +{stage.coins}<Coins size={10} />{stage.gems ? <>+{stage.gems}<Gem size={10} /></> : null}
                  </span>
                </div>
              </div>
              {beaten && !rewardClaimed ? (
                <button onClick={() => void claim(stage)} disabled={busy === stage.id}
                  className="btn-game btn-gold px-3.5 py-2.5 text-xs shrink-0 flex items-center gap-1">
                  {busy === stage.id ? <Loader2 className="animate-spin" size={14} /> : <Coins size={14} />} Claim
                </button>
              ) : beaten ? (
                <span className="btn-game btn-ghost px-3 py-2 text-xs shrink-0 flex items-center gap-1">
                  <Check size={13} style={{ color: "#58CC02" }} /> Cleared
                </span>
              ) : unlocked ? (
                <button onClick={() => { soundEngine.playTap(700); onStartStage(stage); }}
                  className="btn-game btn-green px-4 py-2.5 text-sm shrink-0 flex items-center gap-1.5">
                  <Play size={15} fill="#fff" /> Play
                </button>
              ) : (
                <span className="btn-game btn-ghost px-3 py-2 text-xs shrink-0 flex items-center gap-1" style={{ opacity: 0.6 }}>
                  <Lock size={13} /> Locked
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
