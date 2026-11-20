"use client";

export type SoundThemeId = "classic" | "retro" | "chill";

interface SoundTheme {
  wave: OscillatorType;
  accentWave: OscillatorType;
  gain: number; // multiplier
  pitch: number; // multiplier
}

const SOUND_THEMES: Record<SoundThemeId, SoundTheme> = {
  classic: { wave: "sine", accentWave: "triangle", gain: 1, pitch: 1 },
  retro: { wave: "square", accentWave: "square", gain: 0.62, pitch: 1.18 },
  chill: { wave: "triangle", accentWave: "sine", gain: 0.8, pitch: 0.86 },
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private theme: SoundTheme = SOUND_THEMES.classic;

  constructor() {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("code_clash_muted");
      if (saved === "true") this.muted = true;
      const savedTheme = window.localStorage.getItem("cipherclash_sound_theme");
      if (savedTheme && savedTheme in SOUND_THEMES) this.theme = SOUND_THEMES[savedTheme as SoundThemeId];
    }
  }

  /** Switch the global sound pack ("classic" | "retro" | "chill"). */
  public setTheme(id: string): void {
    if (id in SOUND_THEMES) this.theme = SOUND_THEMES[id as SoundThemeId];
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cipherclash_sound_theme", id);
    }
  }

  public getThemeId(): string {
    return (Object.keys(SOUND_THEMES) as SoundThemeId[]).find((k) => SOUND_THEMES[k] === this.theme) || "classic";
  }

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(val: boolean): void {
    this.muted = val;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("code_clash_muted", String(val));
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playTap(520);
    }
    return this.muted;
  }

  public playTap(freq = 440) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const f = freq * this.theme.pitch;
      osc.type = this.theme.wave;
      osc.frequency.setValueAtTime(f, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(f * 1.25, ctx.currentTime + 0.065);

      gain.gain.setValueAtTime(0.14 * this.theme.gain, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.075);
    } catch {
      // Ignore audio errors on restricted autoplay
    }
  }

  public playDelete() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(190, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.085);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
    } catch {}
  }

  public playFeedback(points: number, orders: number) {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      // Play ascending notes based on points & orders
      const baseNotes = [392, 440, 493.88, 587.33, 659.25, 783.99];
      const count = Math.max(1, points + orders);
      for (let i = 0; i < Math.min(count, 5); i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = orders > 0 ? this.theme.accentWave : this.theme.wave;
        const startTime = ctx.currentTime + i * 0.065;
        const freq = baseNotes[Math.min(i + (orders > 0 ? 1 : 0), baseNotes.length - 1)];
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.14);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.15);
      }
    } catch {}
  }

  public playTimeout() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const notes = [260, 195];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        const start = ctx.currentTime + idx * 0.14;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.17);
      });
    } catch {}
  }

  public playVictory() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      // Duolingo-inspired triumphant major arpeggio
      const melody = [523.25, 659.25, 783.99, 1046.5];
      melody.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = this.theme.accentWave;
        const start = ctx.currentTime + idx * 0.095;
        const duration = idx === melody.length - 1 ? 0.42 : 0.15;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + duration + 0.02);
      });
    } catch {}
  }

  public playReward() {
    const ctx = this.getContext();
    if (!ctx) return;
    try {
      const notes = [587.33, 880, 1174.66];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = ctx.currentTime + idx * 0.07;
        osc.type = this.theme.wave;
        osc.frequency.setValueAtTime(freq * this.theme.pitch, start);
        gain.gain.setValueAtTime(0.16 * this.theme.gain, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.24);
      });
    } catch {}
  }
  public playDefeat() {
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      [392, 330, 262].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, now + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.32);
      });
    } catch {}
  }

  public playJoin() {
    this.playTap(660);
    setTimeout(() => this.playTap(880), 90);
  }
}

export const soundEngine = new SoundEngine();
