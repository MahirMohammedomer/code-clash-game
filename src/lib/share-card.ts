"use client";

/**
 * Shareable result cards — renders a tidy branded summary onto a canvas and
 * shares it via the Web Share API (image when supported), falling back to
 * clipboard text. 100% client-side, works offline.
 */

export interface ShareInfo {
  title: string; // e.g. "YOU CRACKED IT!"
  subtitle?: string; // e.g. "Cracked in 4 turns"
  mode: string; // "vs Pip (Rookie)" | "Online 1v1" | "Daily Code"
  stats?: { label: string; value: string }[];
}

function drawCard(info: ShareInfo): HTMLCanvasElement {
  const W = 1000;
  const H = 620;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  // background
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "#12141F");
  grad.addColorStop(0.55, "#1C1D3D");
  grad.addColorStop(1, "#2456E6");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // decorative circles
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = "#58CC02";
  ctx.beginPath();
  ctx.arc(880, 90, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#FFC800";
  ctx.beginPath();
  ctx.arc(90, 560, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // brand pill
  ctx.fillStyle = "#58CC02";
  const pillY = 64;
  roundRect(ctx, 60, pillY, 330, 58, 29);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "900 26px system-ui, sans-serif";
  ctx.fillText("⚔️ CIPHER CLASH", 88, pillY + 38);

  // title
  ctx.fillStyle = "#fff";
  ctx.font = "900 72px system-ui, sans-serif";
  ctx.fillText(info.title.slice(0, 24), 60, 220);

  // subtitle + mode
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = "700 30px system-ui, sans-serif";
  if (info.subtitle) ctx.fillText(info.subtitle.slice(0, 48), 62, 272);
  ctx.fillStyle = "#14D4C5";
  ctx.font = "800 26px system-ui, sans-serif";
  ctx.fillText(info.mode.slice(0, 44), 62, 318);

  // stat chips
  let x = 60;
  for (const s of (info.stats || []).slice(0, 4)) {
    const w = Math.max(150, 24 + s.value.length * 20 + s.label.length * 10);
    ctx.fillStyle = "rgba(255,255,255,0.10)";
    roundRect(ctx, x, 360, w, 92, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 3;
    roundRect(ctx, x, 360, w, 92, 20);
    ctx.stroke();
    ctx.fillStyle = "#FFC800";
    ctx.font = "900 34px system-ui, sans-serif";
    ctx.fillText(s.value, x + 20, 406);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "800 18px system-ui, sans-serif";
    ctx.fillText(s.label.toUpperCase(), x + 20, 436);
    x += w + 16;
  }

  // footer
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText("Hide your code. Crack theirs first!", 60, 540);
  ctx.fillStyle = "#14D4C5";
  ctx.font = "800 24px system-ui, sans-serif";
  ctx.fillText(`${typeof window !== "undefined" ? window.location.origin : ""}`, 60, 578);
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function shareText(info: ShareInfo): string {
  const lines = [
    `⚔️ CIPHER CLASH — ${info.title}`,
    info.subtitle ? `${info.subtitle}` : "",
    `${info.mode}`,
    ...(info.stats || []).map((s) => `${s.label}: ${s.value}`),
    `Can you beat me? ${typeof window !== "undefined" ? window.location.origin : ""}`,
  ].filter(Boolean);
  return lines.join("\n");
}

/** Renders + shares the card. Returns the method used (for a toast). */
export async function shareResult(info: ShareInfo): Promise<"image" | "text" | "downloaded"> {
  const text = shareText(info);
  try {
    const canvas = drawCard(info);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/png"));
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (blob && nav.share && nav.canShare) {
      const file = new File([blob], "cipher-clash.png", { type: "image/png" });
      const data = { files: [file], text };
      if (nav.canShare(data)) {
        await nav.share(data);
        return "image";
      }
    }
    if (nav.share) {
      await nav.share({ text });
      return "text";
    }
    // no Web Share: download the image + copy text
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cipher-clash-result.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    await navigator.clipboard?.writeText(text).catch(() => {});
    return "downloaded";
  } catch {
    await navigator.clipboard?.writeText(text).catch(() => {});
    return "text";
  }
}
