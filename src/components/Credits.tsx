"use client";

import React from "react";

/**
 * Credits footer — shown on EVERY page of the app (including the login page,
 * all four main tabs, secondary screens and game-over screens).
 *
 *   Built by Imad Mohammed (Instagram: @imad_infocus)
 *   Supported & inspired by Aymen, Ismael, Abubakar & more
 *   Powered by Firstform — web development agency (https://firstform.pro.et/)
 */

export const INSTAGRAM_URL = "https://www.instagram.com/imad_infocus";
export const FIRSTFORM_URL = "https://firstform.pro.et/";

function InstagramGlyph({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false">
      <path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.22 1 .48 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.4-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4 1.3-.1 1.7-.1 4.9-.1Zm0 1.8c-3.1 0-3.5 0-4.8.1-1.1 0-1.5.2-1.8.3-.4.2-.7.4-1 .7-.3.3-.5.6-.7 1-.1.3-.3.7-.3 1.8-.1 1.3-.1 1.7-.1 4.8s0 3.5.1 4.8c0 1.1.2 1.5.3 1.8.2.4.4.7.7 1 .3.3.6.5 1 .7.3.1.7.3 1.8.3 1.3.1 1.7.1 4.8.1s3.5 0 4.8-.1c1.1 0 1.5-.2 1.8-.3.4-.2.7-.4 1-.7.3-.3.5-.6.7-1 .1-.3.3-.7.3-1.8.1-1.3.1-1.7.1-4.8s0-3.5-.1-4.8c0-1.1-.2-1.5-.3-1.8-.2-.4-.4-.7-.7-1-.3-.3-.6-.5-1-.7-.3-.1-.7-.3-1.8-.3-1.3-.1-1.7-.1-4.8-.1Zm0 3a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4Zm5.2-3.1a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4Z" />
    </svg>
  );
}

/**
 * The one true credits footer.
 * `compact` — smaller version used inside game screens & overlays.
 * `dark`    — light text for dark fullscreen surfaces (Arcade etc.).
 */
export default function Credits({ compact = false, dark = false }: { compact?: boolean; dark?: boolean }) {
  const ink = dark ? "rgba(255,255,255,0.55)" : "var(--ink-faint)";
  const linkA = dark ? "#B9A0FF" : "var(--purple)";
  const linkB = dark ? "#7FD0FF" : "var(--blue)";
  const soft = dark ? "rgba(255,255,255,0.68)" : "var(--ink-soft)";
  if (compact) {
    return (
      <p className="text-center text-[10px] font-bold leading-relaxed" style={{ color: dark ? soft : ink }}>
        Built by{" "}
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted font-black" style={{ color: linkA }}>
          Imad Mohammed
        </a>{" "}
        · inspired by Aymen, Ismael, Abubakar &amp; more · Powered by{" "}
        <a href={FIRSTFORM_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted font-black" style={{ color: linkB }}>
          Firstform
        </a>
      </p>
    );
  }
  return (
    <footer className="text-center px-3 pt-3" style={{ paddingBottom: dark ? "18px" : "max(14px,env(safe-area-inset-bottom))" }}>
      <p className="font-display font-semibold text-[13px] leading-relaxed" style={{ color: dark ? "#fff" : undefined }}>
        Built by{" "}
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-bold active:opacity-70 transition-opacity"
          style={{ color: linkA }} title="@imad_infocus on Instagram">
          Imad Mohammed <InstagramGlyph />
        </a>
        <span style={{ color: soft }}> — supported &amp; inspired by</span>{" "}
        <span className="font-bold">Aymen, Ismael, Abubakar &amp; more</span>
      </p>
      <p className="text-[12px] font-bold mt-1 leading-relaxed" style={{ color: soft }}>
        Powered by{" "}
        <a href={FIRSTFORM_URL} target="_blank" rel="noopener noreferrer"
          className="font-black underline decoration-2 underline-offset-2 active:opacity-70 transition-opacity"
          style={{ color: linkB }} title="firstform.pro.et">
          Firstform
        </a>{" "}
        — Web Development Agency
      </p>
    </footer>
  );
}
