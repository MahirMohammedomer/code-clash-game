"use client";

import React from "react";
import { getAvatarColor, getFrame, type AvatarConfig } from "@/lib/avatar";
import type { BotMood } from "@/lib/game-engine";

export type Mood = BotMood;

/* ------------------------------ face parts ------------------------------ */

function Eyes({ mood, base }: { mood: Mood; base: string }) {
  const cy = 94;
  const lx = 76, rx = 124;

  if (base === "robot") {
    // LED eyes
    if (mood === "happy" || mood === "win") {
      return (
        <g stroke="#5FF5E0" strokeWidth="7" strokeLinecap="round" fill="none">
          <path d={`M ${lx - 12} ${cy + 4} Q ${lx} ${cy - 10} ${lx + 12} ${cy + 4}`} />
          <path d={`M ${rx - 12} ${cy + 4} Q ${rx} ${cy - 10} ${rx + 12} ${cy + 4}`} />
        </g>
      );
    }
    if (mood === "lose") {
      return (
        <g stroke="#FF6B6B" strokeWidth="6" strokeLinecap="round">
          <path d={`M ${lx - 10} ${cy - 9} L ${lx + 10} ${cy + 9} M ${lx + 10} ${cy - 9} L ${lx - 10} ${cy + 9}`} />
          <path d={`M ${rx - 10} ${cy - 9} L ${rx + 10} ${cy + 9} M ${rx + 10} ${cy - 9} L ${rx - 10} ${cy + 9}`} />
        </g>
      );
    }
    if (mood === "sleepy") {
      return (
        <g stroke="#5FF5E0" strokeWidth="6" strokeLinecap="round">
          <path d={`M ${lx - 11} ${cy} L ${lx + 11} ${cy}`} />
          <path d={`M ${rx - 11} ${cy} L ${rx + 11} ${cy}`} />
        </g>
      );
    }
    return (
      <g className="char-blink">
        <circle cx={lx} cy={cy} r="9" fill="#5FF5E0" />
        <circle cx={rx} cy={cy} r="9" fill="#5FF5E0" />
      </g>
    );
  }

  if (mood === "happy" || mood === "win") {
    return (
      <g stroke="#26283B" strokeWidth="6.5" strokeLinecap="round" fill="none">
        <path d={`M ${lx - 13} ${cy + 4} Q ${lx} ${cy - 12} ${lx + 13} ${cy + 4}`} />
        <path d={`M ${rx - 13} ${cy + 4} Q ${rx} ${cy - 12} ${rx + 13} ${cy + 4}`} />
      </g>
    );
  }
  if (mood === "lose") {
    return (
      <g stroke="#26283B" strokeWidth="6" strokeLinecap="round" fill="none">
        <path d={`M ${lx - 11} ${cy - 10} L ${lx + 11} ${cy + 10} M ${lx + 11} ${cy - 10} L ${lx - 11} ${cy + 10}`} />
        <path d={`M ${rx - 11} ${cy - 10} L ${rx + 11} ${cy + 10} M ${rx + 11} ${cy - 10} L ${rx - 11} ${cy + 10}`} />
      </g>
    );
  }
  if (mood === "sleepy") {
    return (
      <g stroke="#26283B" strokeWidth="6" strokeLinecap="round" fill="none">
        <path d={`M ${lx - 12} ${cy + 2} Q ${lx} ${cy + 9} ${lx + 12} ${cy + 2}`} />
        <path d={`M ${rx - 12} ${cy + 2} Q ${rx} ${cy + 9} ${rx + 12} ${cy + 2}`} />
      </g>
    );
  }

  const pupilR = mood === "shocked" ? 4.5 : 7;
  const eyeR = mood === "shocked" ? 15 : 13;
  const lookX = mood === "think" ? 4.5 : 0;
  const lookY = mood === "think" ? -4.5 : mood === "sad" ? 2.5 : 0;

  return (
    <g>
      {mood === "sad" && (
        <g stroke="#26283B" strokeWidth="5" strokeLinecap="round">
          <path d={`M ${lx - 13} ${cy - 20} L ${lx + 11} ${cy - 13}`} />
          <path d={`M ${rx + 13} ${cy - 20} L ${rx - 11} ${cy - 13}`} />
        </g>
      )}
      <g className="char-blink">
        <circle cx={lx} cy={cy} r={eyeR} fill="#FFFFFF" />
        <circle cx={rx} cy={cy} r={eyeR} fill="#FFFFFF" />
        <circle cx={lx + lookX} cy={cy + lookY} r={pupilR} fill="#26283B" />
        <circle cx={rx + lookX} cy={cy + lookY} r={pupilR} fill="#26283B" />
        {mood !== "shocked" && (
          <>
            <circle cx={lx + lookX + 2.5} cy={cy + lookY - 2.5} r="2.2" fill="#FFFFFF" />
            <circle cx={rx + lookX + 2.5} cy={cy + lookY - 2.5} r="2.2" fill="#FFFFFF" />
          </>
        )}
      </g>
    </g>
  );
}

function Mouth({ mood, base }: { mood: Mood; base: string }) {
  const cx = 100, cy = 122;

  if (base === "owl" || base === "chick" || base === "penguin") {
    const open = mood === "happy" || mood === "win" || mood === "shocked";
    return (
      <g>
        <path d={`M ${cx - 11} ${cy - 4} L ${cx + 11} ${cy - 4} L ${cx} ${cy + (open ? 12 : 7)} Z`} fill="#FF9F1A" stroke="#E07B00" strokeWidth="2" strokeLinejoin="round" />
        {open && <ellipse cx={cx} cy={cy + 8} rx="5" ry="3" fill="#C2431B" />}
        {mood === "sad" && <path d={`M ${cx - 11} ${cy - 7} L ${cx + 11} ${cy - 7} L ${cx} ${cy + 4} Z`} fill="#E07B00" />}
      </g>
    );
  }

  if (base === "robot") {
    if (mood === "happy" || mood === "win")
      return <path d={`M ${cx - 16} ${cy} Q ${cx} ${cy + 16} ${cx + 16} ${cy}`} stroke="#5FF5E0" strokeWidth="6" strokeLinecap="round" fill="none" />;
    if (mood === "sad" || mood === "lose")
      return <path d={`M ${cx - 14} ${cy + 10} Q ${cx} ${cy - 4} ${cx + 14} ${cy + 10}`} stroke="#FF6B6B" strokeWidth="6" strokeLinecap="round" fill="none" />;
    return (
      <g stroke="#5FF5E0" strokeWidth="4" strokeLinecap="round">
        <path d={`M ${cx - 16} ${cy + 4} L ${cx + 16} ${cy + 4}`} />
        <path d={`M ${cx - 8} ${cy} L ${cx - 8} ${cy + 8} M ${cx} ${cy} L ${cx} ${cy + 8} M ${cx + 8} ${cy} L ${cx + 8} ${cy + 8}`} strokeWidth="3" />
      </g>
    );
  }

  switch (mood) {
    case "win":
    case "happy":
      return (
        <g>
          <path d={`M ${cx - 18} ${cy - 2} Q ${cx} ${cy + 24} ${cx + 18} ${cy - 2} Q ${cx} ${cy + 8} ${cx - 18} ${cy - 2} Z`} fill="#7A2E2E" />
          <ellipse cx={cx} cy={cy + 12} rx="9" ry="5.5" fill="#FF8FA3" />
        </g>
      );
    case "sad":
    case "lose":
      return <path d={`M ${cx - 13} ${cy + 12} Q ${cx} ${cy - 2} ${cx + 13} ${cy + 12}`} stroke="#26283B" strokeWidth="5.5" strokeLinecap="round" fill="none" />;
    case "shocked":
      return <ellipse cx={cx} cy={cy + 6} rx="8" ry="11" fill="#7A2E2E" />;
    case "think":
      return <path d={`M ${cx - 6} ${cy + 8} L ${cx + 14} ${cy + 4}`} stroke="#26283B" strokeWidth="5.5" strokeLinecap="round" />;
    case "sleepy":
      return <path d={`M ${cx - 9} ${cy + 7} Q ${cx} ${cy + 12} ${cx + 9} ${cy + 7}`} stroke="#26283B" strokeWidth="5" strokeLinecap="round" fill="none" />;
    default:
      return <path d={`M ${cx - 14} ${cy + 1} Q ${cx} ${cy + 15} ${cx + 14} ${cy + 1}`} stroke="#26283B" strokeWidth="5.5" strokeLinecap="round" fill="none" />;
  }
}

/* --------------------------- base decorations --------------------------- */

function BaseDecor({ base, body, belly, accent }: { base: string; body: string; belly: string; accent: string }) {
  switch (base) {
    case "owl":
      return (
        <g>
          <path d="M52 44 L40 16 L74 28 Z" fill={accent} stroke={accent} strokeWidth="6" strokeLinejoin="round" />
          <path d="M148 44 L160 16 L126 28 Z" fill={accent} stroke={accent} strokeWidth="6" strokeLinejoin="round" />
          <ellipse cx="34" cy="122" rx="12" ry="22" fill={accent} transform="rotate(18 34 122)" />
          <ellipse cx="166" cy="122" rx="12" ry="22" fill={accent} transform="rotate(-18 166 122)" />
          <circle cx="76" cy="94" r="21" fill={belly} opacity="0.85" />
          <circle cx="124" cy="94" r="21" fill={belly} opacity="0.85" />
        </g>
      );
    case "cat":
      return (
        <g>
          <path d="M50 48 L38 8 L82 26 Z" fill={body} stroke={accent} strokeWidth="5" strokeLinejoin="round" />
          <path d="M150 48 L162 8 L118 26 Z" fill={body} stroke={accent} strokeWidth="5" strokeLinejoin="round" />
          <path d="M52 38 L47 20 L68 30 Z" fill="#FFB3C8" />
          <path d="M148 38 L153 20 L132 30 Z" fill="#FFB3C8" />
          <g stroke="#26283B" strokeWidth="2.6" strokeLinecap="round" opacity="0.55">
            <path d="M30 112 L56 114 M32 124 L56 121" />
            <path d="M170 112 L144 114 M168 124 L144 121" />
          </g>
          <path d="M94 112 L106 112 L100 119 Z" fill="#FF6B9D" />
        </g>
      );
    case "fox":
      return (
        <g>
          <path d="M48 50 L34 4 L86 26 Z" fill={body} stroke={accent} strokeWidth="5" strokeLinejoin="round" />
          <path d="M152 50 L166 4 L114 26 Z" fill={body} stroke={accent} strokeWidth="5" strokeLinejoin="round" />
          <path d="M50 38 L43 16 L70 29 Z" fill="#3A2A28" />
          <path d="M150 38 L157 16 L130 29 Z" fill="#3A2A28" />
          <ellipse cx="100" cy="130" rx="34" ry="24" fill={belly} />
          <ellipse cx="100" cy="114" rx="9" ry="6.5" fill="#26283B" />
        </g>
      );
    case "chick":
      return (
        <g>
          <g stroke={accent} strokeWidth="6" strokeLinecap="round" fill="none">
            <path d="M100 30 Q96 14 84 10" />
            <path d="M102 29 Q104 12 114 6" />
          </g>
          <ellipse cx="30" cy="120" rx="11" ry="20" fill={accent} transform="rotate(22 30 120)" />
          <ellipse cx="170" cy="120" rx="11" ry="20" fill={accent} transform="rotate(-22 170 120)" />
        </g>
      );
    case "Pup":
      return (
        <g>
          <ellipse cx="34" cy="86" rx="16" ry="34" fill={accent} transform="rotate(14 34 86)" />
          <ellipse cx="166" cy="86" rx="16" ry="34" fill={accent} transform="rotate(-14 166 86)" />
          <ellipse cx="100" cy="128" rx="36" ry="25" fill={belly} />
          <ellipse cx="100" cy="114" rx="11" ry="7.5" fill="#26283B" />
          <ellipse cx="97" cy="111.5" rx="3.5" ry="2.2" fill="#FFFFFF" opacity="0.7" />
        </g>
      );
    case "panda":
      return (
        <g>
          <circle cx="46" cy="40" r="20" fill="#26283B" />
          <circle cx="154" cy="40" r="20" fill="#26283B" />
          <ellipse cx="76" cy="94" rx="17" ry="20" fill="#26283B" transform="rotate(-16 76 94)" />
          <ellipse cx="124" cy="94" rx="17" ry="20" fill="#26283B" transform="rotate(16 124 94)" />
          <ellipse cx="100" cy="113" rx="7" ry="5" fill="#26283B" />
        </g>
      );
    case "dragon":
      return (
        <g>
          <path d="M54 40 Q34 8 22 14 Q36 30 40 54 Z" fill="#F6C90E" stroke="#D9A400" strokeWidth="3" strokeLinejoin="round" />
          <path d="M146 40 Q166 8 178 14 Q164 30 160 54 Z" fill="#F6C90E" stroke="#D9A400" strokeWidth="3" strokeLinejoin="round" />
          <path d="M100 26 L92 8 L108 8 Z" fill={accent} />
          <ellipse cx="28" cy="104" rx="12" ry="18" fill={accent} transform="rotate(20 28 104)" />
          <ellipse cx="172" cy="104" rx="12" ry="18" fill={accent} transform="rotate(-20 172 104)" />
          <ellipse cx="100" cy="126" rx="32" ry="22" fill={belly} />
          <circle cx="90" cy="118" r="3.4" fill="#26283B" />
          <circle cx="110" cy="118" r="3.4" fill="#26283B" />
          <path d="M84 132 L89 132 L86.5 139 Z M111 132 L116 132 L113.5 139 Z" fill="#FFFFFF" />
        </g>
      );
    case "robot":
      return (
        <g>
          <path d="M100 40 L100 18" stroke={accent} strokeWidth="7" strokeLinecap="round" />
          <circle cx="100" cy="13" r="9" fill="#5FF5E0" stroke={accent} strokeWidth="4" />
          <rect x="24" y="88" width="14" height="30" rx="7" fill={accent} />
          <rect x="162" y="88" width="14" height="30" rx="7" fill={accent} />
          <rect x="52" y="62" width="96" height="78" rx="18" fill="#1E2235" />
        </g>
      );
    case "penguin":
      return (
        <g>
          <ellipse cx="28" cy="124" rx="11" ry="24" fill={accent} transform="rotate(24 28 124)" />
          <ellipse cx="172" cy="124" rx="11" ry="24" fill={accent} transform="rotate(-24 172 124)" />
          <ellipse cx="100" cy="108" rx="47" ry="50" fill="#FFFFFF" opacity="0.96" />
          <g stroke={accent} strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M96 30 Q94 18 86 14" />
            <path d="M104 30 Q106 18 114 14" />
          </g>
        </g>
      );
    case "bunny":
      return (
        <g>
          <ellipse cx="66" cy="0" rx="13" ry="37" fill={body} stroke={accent} strokeWidth="4" transform="rotate(-9 66 0)" />
          <ellipse cx="66" cy="4" rx="6.5" ry="25" fill="#FFB3C8" transform="rotate(-9 66 4)" />
          <ellipse cx="134" cy="0" rx="13" ry="37" fill={body} stroke={accent} strokeWidth="4" transform="rotate(9 134 0)" />
          <ellipse cx="134" cy="4" rx="6.5" ry="25" fill="#FFB3C8" transform="rotate(9 134 4)" />
          <ellipse cx="100" cy="112" rx="5.5" ry="4" fill="#FF6B9D" />
          <rect x="93.5" y="126" width="13" height="12" rx="3.5" fill="#FFFFFF" stroke="#D8DEE9" strokeWidth="2" />
          <path d="M100 127 L100 137" stroke="#D8DEE9" strokeWidth="2" />
          <g fill={accent} opacity="0.55">
            <circle cx="58" cy="110" r="1.8" /><circle cx="52" cy="116" r="1.8" /><circle cx="60" cy="118" r="1.8" />
            <circle cx="142" cy="110" r="1.8" /><circle cx="148" cy="116" r="1.8" /><circle cx="140" cy="118" r="1.8" />
          </g>
        </g>
      );
    case "bear":
      return (
        <g>
          <circle cx="48" cy="40" r="18" fill={body} stroke={accent} strokeWidth="4" />
          <circle cx="48" cy="40" r="9" fill={belly} />
          <circle cx="152" cy="40" r="18" fill={body} stroke={accent} strokeWidth="4" />
          <circle cx="152" cy="40" r="9" fill={belly} />
          <ellipse cx="100" cy="126" rx="27" ry="19" fill={belly} />
          <ellipse cx="100" cy="115" rx="9.5" ry="6.5" fill="#26283B" />
          <ellipse cx="97" cy="112.5" rx="3" ry="2" fill="#FFFFFF" opacity="0.7" />
        </g>
      );
    case "monkey":
      return (
        <g>
          <circle cx="28" cy="94" r="15" fill={body} stroke={accent} strokeWidth="4" />
          <circle cx="28" cy="94" r="8" fill={belly} />
          <circle cx="172" cy="94" r="15" fill={body} stroke={accent} strokeWidth="4" />
          <circle cx="172" cy="94" r="8" fill={belly} />
          <ellipse cx="100" cy="104" rx="47" ry="41" fill={belly} />
          <path d="M86 32 Q98 16 112 28" stroke={accent} strokeWidth="6" strokeLinecap="round" fill="none" />
          <circle cx="94" cy="116" r="2.6" fill="#26283B" opacity="0.65" />
          <circle cx="106" cy="116" r="2.6" fill="#26283B" opacity="0.65" />
        </g>
      );
    case "tiger":
      return (
        <g>
          <circle cx="50" cy="42" r="15" fill={body} stroke={accent} strokeWidth="4" />
          <circle cx="50" cy="42" r="7" fill="#FFB3C8" />
          <circle cx="150" cy="42" r="15" fill={body} stroke={accent} strokeWidth="4" />
          <circle cx="150" cy="42" r="7" fill="#FFB3C8" />
          <g stroke={accent} strokeWidth="5" strokeLinecap="round" fill="none">
            <path d="M82 32 Q84 42 83 50" />
            <path d="M100 28 Q101 40 100 50" />
            <path d="M118 32 Q116 42 117 50" />
            <path d="M36 98 L50 103 M38 114 L51 115" />
            <path d="M164 98 L150 103 M162 114 L149 115" />
          </g>
          <ellipse cx="100" cy="127" rx="25" ry="17" fill={belly} />
          <ellipse cx="100" cy="116" rx="8" ry="5.5" fill="#C2431B" />
        </g>
      );
    case "koala":
      return (
        <g>
          <circle cx="30" cy="72" r="21" fill={accent} />
          <circle cx="30" cy="72" r="12" fill="#FFFFFF" opacity="0.85" />
          <circle cx="170" cy="72" r="21" fill={accent} />
          <circle cx="170" cy="72" r="12" fill="#FFFFFF" opacity="0.85" />
          <ellipse cx="100" cy="112" rx="13" ry="17" fill="#3A3F5C" />
          <ellipse cx="95" cy="104" rx="4" ry="6" fill="#FFFFFF" opacity="0.35" />
        </g>
      );
    case "wolf":
      return (
        <g>
          <path d="M48 50 L36 2 L86 26 Z" fill={body} stroke={accent} strokeWidth="5" strokeLinejoin="round" />
          <path d="M152 50 L164 2 L114 26 Z" fill={body} stroke={accent} strokeWidth="5" strokeLinejoin="round" />
          <path d="M50 38 L44 15 L69 29 Z" fill="#E4EAF3" />
          <path d="M150 38 L156 15 L131 29 Z" fill="#E4EAF3" />
          <path d="M36 106 l15 9 -13 5 14 8 -18 2 z" fill={body} />
          <path d="M164 106 l-15 9 13 5 -14 8 18 2 z" fill={body} />
          <path d="M88 30 l6 -11 6 9 6 -9 6 11 z" fill={accent} />
          <ellipse cx="100" cy="128" rx="32" ry="22" fill={belly} />
          <ellipse cx="100" cy="114" rx="9" ry="6.5" fill="#26283B" />
        </g>
      );
    case "ghost":
      return (
        <g>
          <ellipse cx="25" cy="118" rx="10" ry="17" fill={body} stroke={accent} strokeWidth="4" transform="rotate(26 25 118)" />
          <ellipse cx="175" cy="118" rx="10" ry="17" fill={body} stroke={accent} strokeWidth="4" transform="rotate(-26 175 118)" />
          <path d="M42 44 l2.2 5.8 5.8 2.2 -5.8 2.2 -2.2 5.8 -2.2 -5.8 -5.8 -2.2 5.8 -2.2 Z" fill={belly} />
          <path d="M160 34 l1.8 4.6 4.6 1.8 -4.6 1.8 -1.8 4.6 -1.8 -4.6 -4.6 -1.8 4.6 -1.8 Z" fill={belly} />
        </g>
      );
    default:
      return null;
  }
}

/* ------------------------------ accessories ----------------------------- */

function Accessory({ id, accent }: { id: string; accent: string }) {
  switch (id) {
    case "cap":
      return (
        <g>
          <path d="M48 52 Q100 -6 152 52 L152 58 L48 58 Z" fill="#FF4B6E" />
          <path d="M120 52 L182 62 Q184 74 168 73 L118 64 Z" fill="#E23D5C" />
          <circle cx="100" cy="18" r="7" fill="#E23D5C" />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M58 44 L52 8 L82 28 L100 2 L118 28 L148 8 L142 44 Z" fill="#FFD93D" stroke="#E0A800" strokeWidth="3.5" strokeLinejoin="round" />
          <circle cx="76" cy="32" r="4.5" fill="#FF4B6E" />
          <circle cx="100" cy="26" r="5.5" fill="#1CB0F6" />
          <circle cx="124" cy="32" r="4.5" fill="#58CC02" />
          <rect x="58" y="40" width="84" height="8" rx="4" fill="#E0A800" />
        </g>
      );
    case "party":
      return (
        <g transform="rotate(-12 128 40)">
          <path d="M106 58 L128 -16 L150 58 Z" fill="#A560E8" />
          <path d="M114 30 L142 30 L138 44 L118 44 Z" fill="#FFD93D" />
          <circle cx="128" cy="-18" r="10" fill="#FF86D0" />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M38 96 Q34 22 100 20 Q166 22 162 96" stroke="#26283B" strokeWidth="11" fill="none" strokeLinecap="round" />
          <rect x="22" y="86" width="26" height="44" rx="12" fill="#26283B" />
          <rect x="152" y="86" width="26" height="44" rx="12" fill="#26283B" />
          <rect x="29" y="96" width="12" height="24" rx="6" fill="#FFD93D" />
          <rect x="159" y="96" width="12" height="24" rx="6" fill="#FFD93D" />
        </g>
      );
    case "glasses":
      return (
        <g stroke="#26283B" strokeWidth="5" fill="rgba(255,255,255,0.14)">
          <circle cx="76" cy="94" r="21" />
          <circle cx="124" cy="94" r="21" />
          <path d="M97 90 Q100 84 103 90" fill="none" />
          <path d="M55 88 L38 80 M145 88 L162 80" fill="none" strokeLinecap="round" />
        </g>
      );
    case "shades":
      return (
        <g>
          <rect x="50" y="78" width="46" height="30" rx="13" fill="#14161F" />
          <rect x="104" y="78" width="46" height="30" rx="13" fill="#14161F" />
          <path d="M96 86 L104 86" stroke="#14161F" strokeWidth="7" />
          <rect x="57" y="83" width="18" height="7" rx="3.5" fill="#FFFFFF" opacity="0.35" transform="rotate(-8 66 86)" />
          <rect x="111" y="83" width="18" height="7" rx="3.5" fill="#FFFFFF" opacity="0.35" transform="rotate(-8 120 86)" />
        </g>
      );
    case "bow":
      return (
        <g transform="translate(136 30) rotate(18)">
          <path d="M0 0 L-26 -13 Q-32 0 -26 13 Z" fill="#FF4B6E" />
          <path d="M0 0 L26 -13 Q32 0 26 13 Z" fill="#FF4B6E" />
          <circle cx="0" cy="0" r="7.5" fill="#E23D5C" />
        </g>
      );
    case "wizard":
      return (
        <g>
          <path d="M100 -34 Q124 6 140 44 L60 44 Q82 -4 100 -34 Z" fill="#4A3FD1" />
          <ellipse cx="100" cy="48" rx="58" ry="11" fill="#372DA3" />
          <path d="M96 4 l2.6 5.4 5.9.8 -4.3 4.1 1 5.8 -5.2-2.8 -5.2 2.8 1-5.8 -4.3-4.1 5.9-.8 Z" fill="#FFD93D" />
          <circle cx="112" cy="26" r="3" fill="#FFD93D" />
          <circle cx="86" cy="28" r="2.4" fill="#FFD93D" />
        </g>
      );
    case "halo":
      return <ellipse cx="100" cy="2" rx="34" ry="10" fill="none" stroke="#FFD93D" strokeWidth="7" opacity="0.95" />;
    case "flower":
      return (
        <g transform="translate(140 36)">
          <g fill="#FF86D0">
            <circle cx="0" cy="-11" r="7.5" /><circle cx="10.5" cy="-3.5" r="7.5" /><circle cx="6.5" cy="9" r="7.5" />
            <circle cx="-6.5" cy="9" r="7.5" /><circle cx="-10.5" cy="-3.5" r="7.5" />
          </g>
          <circle cx="0" cy="0" r="6" fill="#FFD93D" />
          <path d="M8 10 Q20 12 22 22 Q12 22 8 14 Z" fill="#58CC02" />
        </g>
      );
    case "beanie":
      return (
        <g>
          <path d="M52 48 Q100 -10 148 48 L148 52 L52 52 Z" fill="#FF4B6E" />
          <path d="M70 22 Q100 6 130 22" stroke="#FFFFFF" strokeWidth="6" fill="none" opacity="0.55" strokeLinecap="round" />
          <rect x="45" y="44" width="110" height="15" rx="7.5" fill="#E23D5C" />
          <circle cx="100" cy="0" r="10" fill="#FFFFFF" />
        </g>
      );
    case "bandana":
      return (
        <g>
          <path d="M150 62 Q176 66 182 88 M148 70 Q168 80 168 100" stroke="#E23D3D" strokeWidth="8" fill="none" strokeLinecap="round" />
          <path d="M43 56 Q100 38 157 56 L157 74 Q100 56 43 74 Z" fill="#FF4B4B" />
          <g fill="#FFFFFF" opacity="0.85">
            <circle cx="70" cy="58" r="3" /><circle cx="100" cy="54" r="3" /><circle cx="130" cy="58" r="3" />
          </g>
        </g>
      );
    case "monocle":
      return (
        <g>
          <circle cx="124" cy="94" r="22" fill="rgba(255,217,61,0.14)" stroke="#E0A800" strokeWidth="5" />
          <path d="M140 110 Q154 138 142 166" stroke="#E0A800" strokeWidth="3" strokeDasharray="4 4" fill="none" strokeLinecap="round" />
          <circle cx="142" cy="168" r="4" fill="#E0A800" />
        </g>
      );
    default:
      return null;
  }
}

/* ------------------------------- patterns ------------------------------- */

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")} Z`;
}

function heartPath(cx: number, cy: number, s: number): string {
  return `M ${cx} ${cy + s * 0.85} C ${cx - s * 1.3} ${cy - s * 0.1} ${cx - s * 0.7} ${cy - s * 1.05} ${cx} ${cy - s * 0.35} C ${cx + s * 0.7} ${cy - s * 1.05} ${cx + s * 1.3} ${cy - s * 0.1} ${cx} ${cy + s * 0.85} Z`;
}

function PatternOverlay({ pattern, belly, accent, clipId }: { pattern?: string; belly: string; accent: string; clipId: string }) {
  if (!pattern || pattern === "none") return null;
  const clip = `url(#${clipId})`;
  switch (pattern) {
    case "spots":
      return (
        <g clipPath={clip} fill={belly} opacity="0.5">
          <circle cx="52" cy="58" r="7" /><circle cx="146" cy="52" r="9" /><circle cx="40" cy="140" r="10" />
          <circle cx="160" cy="138" r="8" /><circle cx="66" cy="168" r="9" /><circle cx="136" cy="166" r="7" />
          <circle cx="100" cy="40" r="6" />
        </g>
      );
    case "stripes":
      return (
        <g clipPath={clip} opacity="0.32">
          <g transform="rotate(-24 100 110)" fill={accent}>
            <rect x="0" y="46" width="200" height="15" />
            <rect x="0" y="82" width="200" height="15" />
            <rect x="0" y="118" width="200" height="15" />
            <rect x="0" y="154" width="200" height="15" />
          </g>
        </g>
      );
    case "grid":
      return (
        <g clipPath={clip} stroke={belly} strokeWidth="5" opacity="0.35">
          <path d="M55 20 L55 185 M80 20 L80 185 M105 20 L105 185 M130 20 L130 185 M155 20 L155 185" />
          <path d="M25 55 L175 55 M25 85 L175 85 M25 115 L175 115 M25 145 L175 145" />
        </g>
      );
    case "stars":
      return (
        <g clipPath={clip} fill={belly} opacity="0.75">
          <path d={starPath(56, 64, 8)} /><path d={starPath(148, 58, 9)} /><path d={starPath(44, 140, 8)} />
          <path d={starPath(158, 132, 7)} /><path d={starPath(100, 164, 8)} />
        </g>
      );
    case "hearts":
      return (
        <g clipPath={clip} fill={belly} opacity="0.8">
          <path d={heartPath(54, 68, 9)} /><path d={heartPath(150, 82, 8)} /><path d={heartPath(100, 158, 10)} />
          <path d={heartPath(146, 148, 7)} />
        </g>
      );
    default:
      return null;
  }
}

/* ------------------------------- character ------------------------------ */

const MOOD_ANIM: Record<Mood, string> = {
  idle: "char-idle",
  think: "char-think",
  happy: "char-happy",
  sad: "char-sad",
  shocked: "char-shocked",
  win: "char-win",
  lose: "char-lose",
  sleepy: "char-idle",
};

export const Character = React.memo(function Character({
  config,
  mood = "idle",
  size = 120,
  className = "",
}: {
  config: AvatarConfig;
  mood?: Mood;
  size?: number;
  className?: string;
}) {
  const palette = getAvatarColor(config.color);
  const { base } = config;
  const isRobot = base === "robot";
  const clipId = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const bodyPath =
    base === "ghost"
      ? "M100 26 C147 26 170 66 170 112 C170 140 168 156 166 170 Q155 184 144 170 Q133 156 122 170 Q111 184 100 170 Q89 156 78 170 Q67 184 56 170 Q45 156 34 170 C32 156 30 140 30 112 C30 66 53 26 100 26 Z"
      : "M100 26 C147 26 170 66 170 112 C170 156 141 180 100 180 C59 180 30 156 30 112 C30 66 53 26 100 26 Z";

  return (
    <svg
      viewBox="-10 -42 220 232"
      width={size}
      height={size}
      className={`${MOOD_ANIM[mood]} ${className}`}
      role="img"
      aria-label="character"
      style={{ overflow: "visible" }}
    >
      <defs>
        <clipPath id={clipId}>
          {isRobot ? <rect x="38" y="40" width="124" height="118" rx="30" /> : <path d={bodyPath} />}
        </clipPath>
      </defs>
      {/* shadow */}
      <ellipse cx="100" cy="184" rx="52" ry="9" fill="rgba(20,20,40,0.16)" className="char-shadow" />
      <g className="char-body-g">
        {/* body */}
        {isRobot ? (
          <rect x="38" y="40" width="124" height="118" rx="30" fill={palette.body} stroke={palette.accent} strokeWidth="5" />
        ) : (
          <path
            d={bodyPath}
            fill={palette.body}
            stroke={palette.accent}
            strokeWidth="5"
          />
        )}
        {/* belly */}
        {!isRobot && base !== "dragon" && base !== "ghost" && (
          <ellipse cx="100" cy="146" rx="36" ry="28" fill={palette.belly} opacity="0.9" />
        )}
        {base === "dragon" && (
          <g fill={palette.belly} opacity="0.95">
            <ellipse cx="100" cy="150" rx="30" ry="24" />
            <path d="M78 142 Q100 150 122 142 M80 156 Q100 164 120 156" stroke={palette.accent} strokeWidth="3" fill="none" opacity="0.5" />
          </g>
        )}

        <PatternOverlay pattern={config.pattern} belly={palette.belly} accent={palette.accent} clipId={clipId} />

        <BaseDecor base={base} body={palette.body} belly={palette.belly} accent={palette.accent} />

        {/* cheeks */}
        {!isRobot && (
          <g fill={palette.cheek} opacity="0.55">
            <ellipse cx="52" cy="112" rx="10" ry="6.5" />
            <ellipse cx="148" cy="112" rx="10" ry="6.5" />
          </g>
        )}

        <Eyes mood={mood} base={base} />
        <Mouth mood={mood} base={base} />

        {/* Pup tongue on happy */}
        {base === "Pup" && (mood === "happy" || mood === "win") && (
          <path d="M92 136 Q100 156 108 136 Q100 142 92 136 Z" fill="#FF8FA3" stroke="#E75480" strokeWidth="2" />
        )}

        {/* sweat drop when shocked / nervous */}
        {mood === "shocked" && (
          <path d="M162 58 Q170 72 162 78 Q154 72 162 58 Z" fill="#5CC8FF" className="char-sweat" />
        )}
        {/* sleep Zzz */}
        {mood === "sleepy" && (
          <g fill="#8A97AD" fontFamily="Fredoka, sans-serif" fontWeight="700" className="char-zzz">
            <text x="152" y="34" fontSize="20">z</text>
            <text x="166" y="16" fontSize="26">Z</text>
          </g>
        )}

        <Accessory id={config.accessory} accent={palette.accent} />
      </g>
    </svg>
  );
});

/* ------------------------- framed avatar (profile) ------------------------ */

export const CharacterAvatar = React.memo(function CharacterAvatar({
  config,
  frameId = "frame_emerald",
  mood = "idle",
  size = 64,
  ringWidth = 4,
}: {
  config: AvatarConfig;
  frameId?: string;
  mood?: Mood;
  size?: number;
  ringWidth?: number;
}) {
  const frame = getFrame(frameId);
  const palette = getAvatarColor(config.color);
  return (
    <div
      className="relative shrink-0 rounded-full"
      style={{
        width: size,
        height: size,
        padding: ringWidth,
        background: frame.ring,
        boxShadow: frame.glow,
      }}
    >
      <div
        className="w-full h-full rounded-full overflow-hidden flex items-end justify-center"
        style={{ background: `linear-gradient(160deg, ${palette.belly}, #ffffff 130%)` }}
      >
        <Character config={config} mood={mood} size={size * 0.92} />
      </div>
    </div>
  );
});

/* ------------------------------ speech bubble ----------------------------- */

export function SpeechBubble({ text, side = "right" }: { text: string; side?: "left" | "right" }) {
  if (!text) return null;
  return (
    <div key={text} className="speech-bubble animate-pop">
      <p className="text-[13px] leading-snug font-extrabold">{text}</p>
      <span className={`speech-tail ${side === "left" ? "speech-tail-left" : "speech-tail-right"}`} />
    </div>
  );
}
