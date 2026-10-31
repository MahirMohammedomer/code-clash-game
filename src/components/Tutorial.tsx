"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight, Delete, GraduationCap, Home, Lightbulb, Lock, Play, Swords, X } from "lucide-react";
import { Character, SpeechBubble } from "./Character";
import { computeAINextGuess, evaluateGuess, generateRandomCode, isValidSecretCode, type BotMood } from "@/lib/game-engine";
import { soundEngine } from "@/lib/sound-effects";
import type { GuessEntry, Player } from "@/lib/types";

const COACH = { base: "owl", color: "midnight", accessory: "glasses" };

function KeypadMini({ value, onDigit, onDelete }: { value: string; onDigit: (d: string) => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-5 gap-2 touch-game max-w-md mx-auto w-full">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
        <button key={d} onClick={() => onDigit(d)} disabled={value.includes(d)}
          className={`key-btn h-12 text-xl ${value.includes(d) ? "key-used" : ""}`}>{d}</button>
      ))}
      <button onClick={onDelete} className="key-btn h-12 flex items-center justify-center" aria-label="Delete">
        <Delete size={20} />
      </button>
    </div>
  );
}

function Tiles({ value }: { value: string }) {
  return (
    <div className="flex gap-2 justify-center">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`digit-tile w-12 h-14 flex items-center justify-center text-2xl ${value[i] ? "animate-tile" : ""}`}
          style={value[i] ? { borderColor: "var(--blue)", background: "rgba(28,176,246,0.14)" } : undefined}>
          {value[i] || <span style={{ opacity: 0.4 }}>?</span>}
        </span>
      ))}
    </div>
  );
}

type Step = "welcome" | "secret" | "guess" | "race" | "done";

export default function Tutorial({
  me,
  onFinish,
  onSkip,
}: {
  me: Player;
  onFinish: (goTo: "bot" | "home") => void;
  onSkip: () => void;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [mood, setMood] = useState<BotMood>("happy");
  const [line, setLine] = useState(
    `Hello ${me.username}! I'm Professor Hoot. In Cipher Clash, you hide a secret 4-digit code — and race to crack your rival's code first!`
  );
  const [myCode, setMyCode] = useState("");
  const [coachSecret] = useState(() => generateRandomCode());
  const [buffer, setBuffer] = useState("");
  const [guesses, setGuesses] = useState<GuessEntry[]>([]);
  const [cracked, setCracked] = useState(false);

  const stepIndex = { welcome: 0, secret: 1, guess: 2, race: 3, done: 4 }[step];

  const say = (text: string, m: BotMood = "idle") => { setLine(text); setMood(m); };

  const deleteFor = (target: "code" | "guess") =>
    target === "code" ? setMyCode(myCode.slice(0, -1)) : setBuffer(buffer.slice(0, -1));

  const press = (d: string, target: "code" | "guess") => {
    const val = target === "code" ? myCode : buffer;
    const set = target === "code" ? setMyCode : setBuffer;
    if (val.includes(d) || val.length >= 4) return;
    soundEngine.playTap(440 + Number(d) * 25);
    set(val + d);
  };

  const hintGuess = useMemo(() => {
    if (guesses.length === 0) return "1234";
    try {
      return computeAINextGuess("Mastermind", guesses.map((g) => ({ guess: g.guess, points: g.points, orders: g.orders }))).guess;
    } catch { return generateRandomCode(); }
  }, [guesses]);

  const submitPracticeGuess = () => {
    if (!isValidSecretCode(buffer)) return;
    const res = evaluateGuess(coachSecret, buffer);
    const entry: GuessEntry = {
      id: `t-${Date.now()}`, playerSlot: 1, playerName: me.username, guess: buffer,
      points: res.points, orders: res.orders, isTimeout: false,
      turnNumber: guesses.length + 1, timestamp: new Date().toISOString(),
    };
    const next = [...guesses, entry];
    setGuesses(next);
    setBuffer("");
    soundEngine.playFeedback(res.points, res.orders);

    if (res.isWin) {
      setCracked(true);
      say(`CRACKED! My code was ${coachSecret.split("").join("-")}. You found it in ${next.length} ${next.length === 1 ? "guess" : "guesses"} — brilliant!`, "win");
      soundEngine.playVictory();
      setTimeout(() => setStep("race"), 1600);
      return;
    }
    if (next.length === 1) {
      say(
        `See the pegs? BLUE pegs (${res.points}) = correct digits in my code. GREEN pegs (${res.orders}) = digits in the EXACT right spot. Get 4 green to win!`,
        "think"
      );
    } else if (res.orders >= 2) {
      say("Ooh, you're getting VERY warm! Keep the green digits where they are and shuffle the rest.", "shocked");
    } else if (res.points === 0) {
      say("Zero pegs — actually great news! NONE of those 4 digits are in my code. Cross them off forever!", "happy");
    } else if (next.length >= 6) {
      say(`Wonderful effort! My code was ${coachSecret.split("").join("-")}. With practice you'll crack codes in 5 turns or less!`, "happy");
      setTimeout(() => setStep("race"), 1800);
    } else {
      say(`${res.points} of those digits are in my code, ${res.orders} in the perfect spot. Use the clues — guess again! (Need help? Tap the lightbulb!)`, "idle");
    }
  };



  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto" style={{ background: "var(--bg-grad)" }}>
      <div className="min-h-full flex flex-col max-w-2xl mx-auto px-4 py-4">
        {/* header */}
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: "var(--purple)" }}>
            <GraduationCap size={19} strokeWidth={2.6} />
          </span>
          <div className="flex-1 h-3.5 rounded-full overflow-hidden" style={{ background: "var(--surface-3)", border: "2px solid var(--border)" }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(stepIndex / 4) * 100}%`, background: "var(--brand)" }} />
          </div>
          <button onClick={onSkip} className="btn-game btn-ghost px-3 py-2 text-xs flex items-center gap-1">
            <X size={14} strokeWidth={2.8} /> Skip
          </button>
        </div>

        {/* coach */}
        <div className="flex items-start gap-1 mt-4">
          <div className="shrink-0 -ml-1">
            <Character config={COACH} mood={mood} size={118} />
          </div>
          <div className="pt-3">
            <SpeechBubble text={line} side="left" />
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center py-4">
          {step === "welcome" && (
            <div className="text-center animate-rise">
              <div className="flex justify-center items-end gap-3 mb-4">
                <Character config={me.avatarConfig} mood="happy" size={96} />
                <span className="font-display font-bold text-2xl pb-6" style={{ color: "var(--ink-faint)" }}>VS</span>
                <Character config={{ base: "fox", color: "lava", accessory: "shades" }} mood="idle" size={96} />
              </div>
              <div className="grid sm:grid-cols-3 gap-2 text-left max-w-lg mx-auto">
                {[
                  { n: "1", t: "Hide your code", d: "4 different digits, 1–9." },
                  { n: "2", t: "Guess theirs", d: "Pegs tell you how close you are." },
                  { n: "3", t: "Crack it first!", d: "4 green pegs = you win the duel." },
                ].map((c) => (
                  <div key={c.n} className="card-game p-3">
                    <span className="w-6 h-6 rounded-lg inline-flex items-center justify-center text-white font-black text-sm" style={{ background: "var(--blue)" }}>{c.n}</span>
                    <p className="font-display font-semibold mt-1">{c.t}</p>
                    <p className="text-xs font-bold" style={{ color: "var(--ink-soft)" }}>{c.d}</p>
                  </div>
                ))}
              </div>
              <button onClick={() => { setStep("secret"); say("First, hide YOUR code. Tap 4 different digits — make it sneaky! I'll never see it during a real match.", "idle"); }}
                className="btn-game btn-green px-8 py-4 text-lg mt-6 inline-flex items-center gap-2">
                Let&rsquo;s practice! <ArrowRight size={19} strokeWidth={2.8} />
              </button>
            </div>
          )}

          {step === "secret" && (
            <div className="board-theme rounded-3xl p-4 space-y-3 animate-rise" data-board={me.themeId}>
              <p className="text-center font-display font-semibold" style={{ color: "var(--board-ink)" }}>Your secret code</p>
              <Tiles value={myCode} />
              <KeypadMini value={myCode} onDigit={(d) => press(d, "code")} onDelete={() => deleteFor("code")} />
              <button disabled={myCode.length !== 4}
                onClick={() => { soundEngine.playReward(); setStep("guess"); say("Locked in! Now I hid MY code too. Try to crack it — tap 4 digits and hit GUESS. A great first guess is 1-2-3-4!", "happy"); setBuffer("1234"); }}
                className="btn-game btn-green w-full py-3.5 flex items-center justify-center gap-2 max-w-md mx-auto">
                <Lock size={18} strokeWidth={2.7} /> Lock my code
              </button>
            </div>
          )}

          {step === "guess" && (
            <div className="board-theme rounded-3xl p-4 space-y-3 animate-rise" data-board={me.themeId}>
              {guesses.length > 0 && (
                <div className="rounded-2xl p-3 space-y-1.5 max-h-44 overflow-y-auto pretty-scroll" style={{ background: "var(--board-panel)", border: "2px solid var(--board-border)" }}>
                  {guesses.map((g) => (
                    <div key={g.id} className="flex items-center gap-2">
                      <span className="flex gap-1">
                        {g.guess.split("").map((d, i) => <span key={i} className="digit-tile w-8 h-9 flex items-center justify-center text-base">{d}</span>)}
                      </span>
                      <span className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <span key={i} className="w-3.5 h-3.5 rounded-full border-2" style={{
                            borderColor: i < g.orders ? "#46A302" : i < g.points ? "#0E86C8" : "var(--board-border)",
                            background: i < g.orders ? "#58CC02" : i < g.points ? "#1CB0F6" : "transparent",
                          }} />
                        ))}
                      </span>
                      <span className="text-[10px] font-black" style={{ color: "var(--board-soft)" }}>{g.points} digits · {g.orders} placed</span>
                    </div>
                  ))}
                </div>
              )}
              <Tiles value={buffer} />
              <KeypadMini value={buffer} onDigit={(d) => press(d, "guess")} onDelete={() => deleteFor("guess")} />
              <div className="flex gap-2 max-w-md mx-auto">
                <button onClick={() => { setBuffer(hintGuess); say(`Psst — a clever next guess is ${hintGuess.split("").join("-")}. It fits every clue so far!`, "think"); soundEngine.playTap(880); }}
                  className="btn-game btn-gold px-4 py-3.5 flex items-center gap-1.5" title="Get a hint">
                  <Lightbulb size={18} strokeWidth={2.7} /> Hint
                </button>
                <button disabled={buffer.length !== 4 || cracked} onClick={submitPracticeGuess}
                  className="btn-game btn-green flex-1 py-3.5 text-lg flex items-center justify-center gap-2">
                  <Swords size={19} strokeWidth={2.7} /> GUESS!
                </button>
              </div>
              <button onClick={() => { say(`My code was ${coachSecret.split("").join("-")}! Let's talk about real battles.`, "happy"); setStep("race"); }}
                className="mx-auto block text-xs font-black underline" style={{ color: "var(--board-soft)" }}>
                I get it — move on
              </button>
            </div>
          )}

          {step === "race" && (
            <div className="text-center animate-rise">
              <div className="flex justify-center items-end gap-2 mb-3">
                <Character config={me.avatarConfig} mood="win" size={104} />
                <Character config={{ base: "chick", color: "sunny", accessory: "party" }} mood="shocked" size={88} />
              </div>
              <div className="card-game p-4 max-w-md mx-auto text-left space-y-2">
                <p className="font-bold text-sm"><b>It&rsquo;s a race!</b> In real duels your rival is cracking YOUR code at the same time. First to 4 green pegs wins.</p>
                <p className="font-bold text-sm"><b>Watch the clock.</b> Turns are timed — if time runs out, you lose that turn!</p>
                <p className="font-bold text-sm"><b>Earn &amp; shine.</b> Wins give coins, trophies and XP. Spend coins in the Shop to customize your character!</p>
              </div>
              <button onClick={() => { setStep("done"); say("You're ready, code breaker! Pip the chick is an easy first rival — or explore the arena. And here's +50 coins for graduating!", "win"); soundEngine.playReward(); }}
                className="btn-game btn-blue px-8 py-4 text-lg mt-5 inline-flex items-center gap-2">
                I&rsquo;m ready! <ArrowRight size={19} strokeWidth={2.8} />
              </button>
            </div>
          )}

          {step === "done" && (
            <div className="text-center animate-rise">
              <div className="flex justify-center mb-2">
                <Character config={me.avatarConfig} mood="win" size={132} />
              </div>
              <h3 className="font-display font-bold text-2xl">Graduated, {me.username}!</h3>
              <p className="font-bold text-sm" style={{ color: "var(--ink-soft)" }}>+50 coins added to your wallet.</p>
              <div className="flex flex-col sm:flex-row gap-2.5 justify-center mt-5">
                <button onClick={() => onFinish("bot")} className="btn-game btn-green px-7 py-4 text-lg inline-flex items-center justify-center gap-2">
                  <Play size={19} strokeWidth={2.8} /> Battle Pip (easy)
                </button>
                <button onClick={() => onFinish("home")} className="btn-game btn-ghost px-7 py-4 text-lg inline-flex items-center justify-center gap-2">
                  <Home size={19} strokeWidth={2.6} /> Explore home
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
