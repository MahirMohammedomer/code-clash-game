/**
 * Cipher Clash — win celebration engine.
 * Every effect is a *different show*, not a recolor: different shapes,
 * physics (gravity/drag), origins, timing patterns and even a DOM shockwave.
 * canvas-confetti is lazy-loaded so it never weighs down the first paint.
 */

type ConfettiFn = (opts?: Record<string, unknown>) => Promise<null> | undefined;

let cached: ConfettiFn | null = null;
async function getConfetti(): Promise<ConfettiFn | null> {
  if (cached) return cached;
  try {
    const mod = await import("canvas-confetti");
    cached = (mod.default || mod) as unknown as ConfettiFn;
    return cached;
  } catch {
    return null;
  }
}

function textShape(confetti: ConfettiFn & { shapeFromText?: (o: { text: string; scalar?: number }) => unknown }, text: string, scalar = 2): unknown | undefined {
  try {
    return confetti.shapeFromText ? confetti.shapeFromText({ text, scalar }) : undefined;
  } catch {
    return undefined;
  }
}

function domRingBurst(): void {
  try {
    for (let i = 0; i < 3; i++) {
      const el = document.createElement("div");
      el.className = "win-ring";
      el.style.animationDelay = `${i * 0.16}s`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 1700 + i * 160);
    }
  } catch {}
}

const BASE = { zIndex: 9999, disableForReducedMotion: true };

export async function fireWinEffect(effectId: string): Promise<void> {
  const confetti = (await getConfetti()) as (ConfettiFn & { shapeFromText?: (o: { text: string; scalar?: number }) => unknown }) | null;
  if (!confetti) return;
  const fire = (opts: Record<string, unknown>) => {
    try { confetti({ ...BASE, ...opts }); } catch {}
  };

  try {
    switch (effectId) {
      /* ⚡ Lightning bolts crash down from the top of the sky */
      case "effect_lightning": {
        const bolt = textShape(confetti, "⚡", 2.2);
        const shapes = bolt ? [bolt, "square"] : ["square"];
        for (let i = 0; i < 5; i++) {
          setTimeout(() => fire({
            particleCount: 22, angle: 270, spread: 34, startVelocity: 62, gravity: 1.6, ticks: 130,
            origin: { x: 0.1 + Math.random() * 0.8, y: -0.05 }, shapes,
            colors: ["#FFD93D", "#FFF7C9", "#1CB0F6"], scalar: 1.15,
          }), i * 130);
        }
        break;
      }

      /* ⭐ Giant stars drift down slowly like a meteor shower of gold */
      case "effect_stars": {
        const star = textShape(confetti, "⭐", 2.4);
        const glyph = textShape(confetti, "★", 2.6);
        const shapes = [star, glyph].filter(Boolean) as unknown[];
        const end = Date.now() + 2100;
        const tick = () => {
          fire({
            particleCount: 7, angle: 270, spread: 60, startVelocity: 9, gravity: 0.42, drift: 0.6, ticks: 300,
            origin: { x: Math.random(), y: -0.05 }, shapes: shapes.length ? shapes : undefined,
            colors: ["#FFD93D", "#FFC800", "#FFF3C4"], scalar: 1.25,
          });
          if (Date.now() < end) setTimeout(tick, 160);
        };
        tick();
        break;
      }

      /* 🎆 Full fireworks show — randomized sky bursts for ~2.2s */
      case "effect_fireworks": {
        const end = Date.now() + 2200;
        const colors = [["#FF4B6E", "#FFD93D"], ["#1CB0F6", "#FFFFFF"], ["#58CC02", "#FFC800"], ["#A560E8", "#FF86D0"]];
        const frame = () => {
          fire({ particleCount: 38, angle: 60, spread: 62, startVelocity: 52, origin: { x: 0, y: 0.85 }, colors: colors[0] });
          fire({ particleCount: 38, angle: 120, spread: 62, startVelocity: 52, origin: { x: 1, y: 0.85 }, colors: colors[1] });
          fire({
            particleCount: 55, spread: 360, startVelocity: 26, gravity: 0.5, ticks: 170, scalar: 0.9,
            origin: { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.3 },
            colors: colors[Math.floor(Math.random() * colors.length)],
          });
          if (Date.now() < end) requestAnimationFrame(frame);
        };
        frame();
        break;
      }

      /* 🟩 Matrix code rain — digits pour straight down, fast */
      case "effect_matrix": {
        const one = textShape(confetti, "1", 2);
        const zero = textShape(confetti, "0", 2);
        const shapes = [one, zero, "square"].filter(Boolean) as unknown[];
        const end = Date.now() + 1600;
        const tick = () => {
          fire({
            particleCount: 16, angle: 270, spread: 22, startVelocity: 26, gravity: 1.5, ticks: 170,
            origin: { x: Math.random(), y: -0.05 }, shapes: shapes.length ? shapes : ["square"],
            colors: ["#00E676", "#58CC02", "#B9FFDB"], scalar: 0.95,
          });
          if (Date.now() < end) setTimeout(tick, 90);
        };
        tick();
        break;
      }

      /* ✨ Gold dust — tiny sparkles that hover and twinkle */
      case "effect_sparkle": {
        for (let i = 0; i < 4; i++) {
          setTimeout(() => fire({
            particleCount: 42, spread: 100, startVelocity: 18, gravity: 0.22, decay: 0.985, ticks: 320, scalar: 0.55,
            origin: { x: 0.2 + Math.random() * 0.6, y: 0.35 + Math.random() * 0.3 },
            colors: ["#FFD93D", "#FFF3C4", "#FFFFFF"], shapes: ["circle"],
          }), i * 220);
        }
        break;
      }

      /* 💥 Shockwave — expanding DOM rings + a 360° particle shock */
      case "effect_shockwave": {
        domRingBurst();
        fire({ particleCount: 150, spread: 360, startVelocity: 34, gravity: 0.28, decay: 0.96, ticks: 210, origin: { y: 0.5 }, colors: ["#FF4B4B", "#FF7A18", "#FFD93D"], scalar: 0.9 });
        setTimeout(() => fire({ particleCount: 80, spread: 360, startVelocity: 22, gravity: 0.2, ticks: 180, origin: { y: 0.5 }, colors: ["#FFFFFF", "#FFD93D"], scalar: 0.7 }), 180);
        break;
      }

      /* 🪙 Coin shower — gold coins rain from the top */
      case "effect_coins": {
        const coin = textShape(confetti, "🪙", 2.2);
        const shapes = coin ? [coin, "circle"] : ["circle"];
        const end = Date.now() + 1900;
        const tick = () => {
          fire({
            particleCount: 13, angle: 270, spread: 46, startVelocity: 12, gravity: 0.85, ticks: 280,
            origin: { x: Math.random(), y: -0.05 }, shapes,
            colors: ["#F6C90E", "#FFD93D", "#E0A800"], scalar: 1.1,
          });
          if (Date.now() < end) setTimeout(tick, 120);
        };
        tick();
        break;
      }

      /* 🫧 Bubbles — pastel bubbles RISE from the bottom (negative gravity) */
      case "effect_bubbles": {
        const end = Date.now() + 2300;
        const tick = () => {
          fire({
            particleCount: 10, angle: 90, spread: 40, startVelocity: 14, gravity: -0.32, drift: Math.random() * 1.4 - 0.7,
            ticks: 340, origin: { x: Math.random(), y: 1.05 }, shapes: ["circle"],
            colors: ["#BFE9FF", "#FFD6F2", "#D8F3FF", "#FFF3C4"], scalar: 0.9 + Math.random() * 0.9,
          });
          if (Date.now() < end) setTimeout(tick, 150);
        };
        tick();
        break;
      }

      /* 🔫 Neon lasers — tight pulsed beams from both bottom corners */
      case "effect_laser": {
        const neon = ["#FF2E93", "#00E5FF", "#B6FF00", "#FFEA00"];
        for (let i = 0; i < 4; i++) {
          setTimeout(() => {
            fire({ particleCount: 34, angle: 58, spread: 20, startVelocity: 74, gravity: 0.55, ticks: 150, origin: { x: 0, y: 1 }, colors: [neon[i % 4], "#FFFFFF"], scalar: 0.75 });
            fire({ particleCount: 34, angle: 122, spread: 20, startVelocity: 74, gravity: 0.55, ticks: 150, origin: { x: 1, y: 1 }, colors: [neon[(i + 1) % 4], "#FFFFFF"], scalar: 0.75 });
          }, i * 210);
        }
        break;
      }

      /* ❄️ Snowfall — slow, peaceful, long-lasting flakes */
      case "effect_snow": {
        const flake = textShape(confetti, "❄", 2);
        const shapes = flake ? [flake, "circle"] : ["circle"];
        const end = Date.now() + 3400;
        const tick = () => {
          fire({
            particleCount: 5, angle: 270, spread: 30, startVelocity: 4, gravity: 0.16, drift: Math.random() * 1.2 - 0.6,
            ticks: 420, origin: { x: Math.random(), y: -0.05 }, shapes,
            colors: ["#FFFFFF", "#E8F6FF", "#BFE9FF"], scalar: 0.8 + Math.random() * 0.5,
          });
          if (Date.now() < end) setTimeout(tick, 130);
        };
        tick();
        break;
      }

      /* 🎉 Emoji party — a chaotic mix of celebration glyphs */
      case "effect_emoji": {
        const glyphs = ["🎉", "🏆", "⭐", "🔥", "💎", "🚀"].map((g) => textShape(confetti, g, 2.3)).filter(Boolean) as unknown[];
        fire({ particleCount: 70, spread: 110, startVelocity: 42, origin: { y: 0.65 }, shapes: glyphs.length ? glyphs : undefined, scalar: 1.3, ticks: 260 });
        setTimeout(() => fire({ particleCount: 40, angle: 60, spread: 70, origin: { x: 0, y: 0.9 }, shapes: glyphs.length ? glyphs : undefined, scalar: 1.2 }), 220);
        setTimeout(() => fire({ particleCount: 40, angle: 120, spread: 70, origin: { x: 1, y: 0.9 }, shapes: glyphs.length ? glyphs : undefined, scalar: 1.2 }), 380);
        break;
      }

      /* 👑 Champion's crowns — big crowns & trophies, slow and royal */
      case "effect_crown": {
        const crown = textShape(confetti, "👑", 2.8);
        const trophy = textShape(confetti, "🏆", 2.6);
        const shapes = [crown, trophy].filter(Boolean) as unknown[];
        fire({ particleCount: 26, spread: 80, startVelocity: 34, gravity: 0.55, ticks: 300, origin: { y: 0.6 }, shapes: shapes.length ? shapes : undefined, scalar: 1.5 });
        setTimeout(() => fire({ particleCount: 60, spread: 120, startVelocity: 26, gravity: 0.5, origin: { y: 0.5 }, colors: ["#FFD93D", "#F6C90E", "#FFF3C4"], shapes: ["circle"], scalar: 0.7, ticks: 280 }), 200);
        setTimeout(() => fire({ particleCount: 18, spread: 60, startVelocity: 28, gravity: 0.5, ticks: 300, origin: { y: 0.55 }, shapes: shapes.length ? shapes : undefined, scalar: 1.6 }), 480);
        break;
      }

      /* 🎊 Party Confetti (default) — the classic, done properly */
      default: {
        fire({ particleCount: 110, spread: 85, startVelocity: 44, origin: { y: 0.7 } });
        fire({ particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.8 } });
        fire({ particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.8 } });
      }
    }
  } catch {}
}
