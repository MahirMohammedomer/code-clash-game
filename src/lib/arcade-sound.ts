/**
 * Tiny WebAudio synth for the arcade remakes — juicy retro sound effects
 * generated on the fly, no audio files needed. Original implementation.
 */

let ctx: AudioContext | null = null;
let muted = false;

try {
  muted = typeof localStorage !== "undefined" && localStorage.getItem("arcade_muted") === "1";
} catch {}

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function arcadeMuted(): boolean {
  return muted;
}

export function setArcadeMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem("arcade_muted", m ? "1" : "0");
  } catch {}
}

function tone(freq: number, dur = 0.12, type: OscillatorType = "sine", vol = 0.16, slideTo?: number, delay = 0): void {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur = 0.15, vol = 0.12, freq = 1200, delay = 0): void {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buffer = a.createBuffer(1, len, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = freq;
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start(t0);
}

export const sfx = {
  click: () => tone(620, 0.06, "triangle", 0.12),
  slide: () => tone(240, 0.07, "sine", 0.05, 340),
  merge: (pitch = 1) => {
    tone(340 * pitch, 0.1, "triangle", 0.16, 520 * pitch);
    tone(680 * pitch, 0.12, "sine", 0.1, undefined, 0.03);
  },
  pop: (pitch = 1) => tone(520 * pitch, 0.09, "square", 0.08, 880 * pitch),
  eat: () => {
    tone(660, 0.08, "triangle", 0.16, 990);
    tone(990, 0.1, "sine", 0.1, undefined, 0.05);
  },
  golden: () => {
    [880, 1174, 1568].forEach((f, i) => tone(f, 0.12, "triangle", 0.13, undefined, i * 0.06));
  },
  flap: () => noise(0.09, 0.07, 900),
  score: () => {
    tone(988, 0.09, "sine", 0.14);
    tone(1318, 0.16, "sine", 0.14, undefined, 0.07);
  },
  hit: () => {
    noise(0.18, 0.2, 700);
    tone(180, 0.2, "sawtooth", 0.12, 60);
  },
  bounce: () => tone(300, 0.06, "sine", 0.1, 420),
  spring: () => tone(300, 0.22, "sine", 0.16, 1200),
  brick: (pitch = 1) => {
    tone(740 * pitch, 0.07, "square", 0.1, 980 * pitch);
    noise(0.06, 0.06, 2600);
  },
  paddle: () => tone(220, 0.06, "triangle", 0.14, 300),
  power: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, "triangle", 0.12, undefined, i * 0.05));
  },
  swap: () => tone(420, 0.08, "sine", 0.08, 560),
  badSwap: () => tone(200, 0.12, "sawtooth", 0.06, 140),
  explosion: () => {
    noise(0.35, 0.22, 500);
    tone(120, 0.35, "sawtooth", 0.14, 40);
  },
  fever: () => {
    [659, 784, 988, 1318].forEach((f, i) => tone(f, 0.14, "square", 0.09, undefined, i * 0.07));
  },
  gameover: () => {
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, "triangle", 0.14, undefined, i * 0.15));
  },
  win: () => {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, "triangle", 0.13, undefined, i * 0.09));
  },
  newBest: () => {
    [784, 988, 1174, 1568].forEach((f, i) => tone(f, 0.16, "triangle", 0.13, undefined, i * 0.08));
  },
};
