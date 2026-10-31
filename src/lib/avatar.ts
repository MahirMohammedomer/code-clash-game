/**
 * Cipher Clash — Avatar & cosmetics visual registry.
 * Avatars are pure SVG (no emoji), so they render identically on every device.
 */

export interface AvatarConfig {
  base: string; // base id e.g. "owl"
  color: string; // color id e.g. "classic"
  accessory: string; // accessory id e.g. "none"
}

export const DEFAULT_AVATAR: AvatarConfig = {
  base: "owl",
  color: "classic",
  accessory: "none",
};

export function normalizeAvatar(raw: unknown): AvatarConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AVATAR };
  const r = raw as Partial<AvatarConfig>;
  return {
    base: AVATAR_BASES.some((b) => b.id === r.base) ? (r.base as string) : "owl",
    color: AVATAR_COLORS.some((c) => c.id === r.color) ? (r.color as string) : "classic",
    accessory: ACCESSORIES.some((a) => a.id === r.accessory) ? (r.accessory as string) : "none",
  };
}

export interface AvatarBaseDef {
  id: string;
  name: string;
  description: string;
}

export const AVATAR_BASES: AvatarBaseDef[] = [
  { id: "owl", name: "Hoot the Owl", description: "Wise, calm, and always watching." },
  { id: "cat", name: "Whiskers the Cat", description: "Quick paws, quicker brain." },
  { id: "fox", name: "Ember the Fox", description: "Sly, sneaky, dangerously clever." },
  { id: "chick", name: "Pip the Chick", description: "Small, loud, and fearless." },
  { id: "Pup", name: "Biscuit the Pup", description: "Loyal sniffer of secret digits." },
  { id: "panda", name: "Bamboo the Panda", description: "Chill outside, genius inside." },
  { id: "robot", name: "Bolt the Bot", description: "Calculates 3,024 codes per second." },
  { id: "dragon", name: "Drake the Dragon", description: "Legendary code-burning beast." },
];

export interface AvatarColorDef {
  id: string;
  name: string;
  body: string;
  belly: string;
  accent: string;
  cheek: string;
}

export const AVATAR_COLORS: AvatarColorDef[] = [
  { id: "classic", name: "Meadow Green", body: "#58CC02", belly: "#DDF7B8", accent: "#46A302", cheek: "#FFB3B3" },
  { id: "sky", name: "Sky Blue", body: "#1CB0F6", belly: "#D8F3FF", accent: "#0E86C8", cheek: "#FFB3C8" },
  { id: "grape", name: "Grape Soda", body: "#A560E8", belly: "#F0E2FF", accent: "#7F3FD1", cheek: "#FFC4D6" },
  { id: "coral", name: "Coral Pop", body: "#FF6B6B", belly: "#FFE3D3", accent: "#E74C3C", cheek: "#FFD93D" },
  { id: "sunny", name: "Sunny Side", body: "#FFC800", belly: "#FFF3C4", accent: "#E0A800", cheek: "#FF9F68" },
  { id: "rose", name: "Bubblegum", body: "#FF86D0", belly: "#FFE4F4", accent: "#E754B0", cheek: "#FF6B9D" },
  { id: "ocean", name: "Deep Ocean", body: "#14D4C5", belly: "#D2FBF6", accent: "#0AA79A", cheek: "#FFB3B3" },
  { id: "choco", name: "Cocoa", body: "#A9744F", belly: "#F3E2CE", accent: "#7D5233", cheek: "#FFB3B3" },
  { id: "lava", name: "Lava Glow", body: "#FF7A18", belly: "#FFE8C2", accent: "#E85D04", cheek: "#FFD93D" },
  { id: "midnight", name: "Midnight", body: "#4A4E8F", belly: "#C9CDF5", accent: "#2F3266", cheek: "#FF9EC4" },
  { id: "golden", name: "Golden Legend", body: "#F6C90E", belly: "#FFF7C9", accent: "#D9A400", cheek: "#FF9F68" },
  { id: "cosmic", name: "Cosmic Violet", body: "#7B5CFF", belly: "#E3DCFF", accent: "#5B3DF0", cheek: "#FFB3E2" },
];

export function getAvatarColor(id: string): AvatarColorDef {
  return AVATAR_COLORS.find((c) => c.id === id) || AVATAR_COLORS[0];
}

export interface AccessoryDef {
  id: string;
  name: string;
  description: string;
}

export const ACCESSORIES: AccessoryDef[] = [
  { id: "none", name: "No Accessory", description: "Clean and classic." },
  { id: "cap", name: "Sport Cap", description: "Ready for game day." },
  { id: "crown", name: "Royal Crown", description: "For code-breaking royalty." },
  { id: "party", name: "Party Hat", description: "Every guess is a party." },
  { id: "headphones", name: "Pro Headphones", description: "Locked in. Zero distractions." },
  { id: "glasses", name: "Smart Glasses", description: "+10 brain power." },
  { id: "shades", name: "Cool Shades", description: "Too cool to miscount." },
  { id: "bow", name: "Lucky Bow", description: "Cute AND deadly accurate." },
  { id: "wizard", name: "Wizard Hat", description: "Sees codes through magic." },
  { id: "halo", name: "Angel Halo", description: "Pure luck. Probably." },
];

/* ------------------------- Frames (avatar rings) ------------------------ */

export interface FrameDef {
  id: string;
  name: string;
  /** CSS background used for the ring wrapper */
  ring: string;
  glow: string;
}

export const FRAMES: FrameDef[] = [
  { id: "frame_emerald", name: "Emerald Sprout", ring: "linear-gradient(135deg,#58CC02,#46A302)", glow: "0 0 0 3px rgba(88,204,2,.35)" },
  { id: "frame_gold", name: "Solar Gold", ring: "linear-gradient(135deg,#FFD93D,#E0A800)", glow: "0 0 0 3px rgba(255,200,0,.4)" },
  { id: "frame_neon", name: "Cyber Neon", ring: "conic-gradient(from 0deg,#1CB0F6,#A560E8,#FF86D0,#1CB0F6)", glow: "0 0 12px 2px rgba(28,176,246,.55)" },
  { id: "frame_dragon", name: "Dragonfire", ring: "linear-gradient(135deg,#FF4B4B,#FF7A18)", glow: "0 0 12px 2px rgba(255,75,75,.5)" },
  { id: "frame_celestial", name: "Celestial Legend", ring: "conic-gradient(from 45deg,#7B5CFF,#F6C90E,#1CB0F6,#7B5CFF)", glow: "0 0 14px 3px rgba(167,96,232,.55)" },
  { id: "frame_obsidian", name: "Obsidian Edge", ring: "linear-gradient(135deg,#3A3F5C,#14161F)", glow: "0 0 0 3px rgba(20,22,31,.45)" },
  { id: "frame_aurora", name: "Aurora Borealis", ring: "conic-gradient(from 0deg,#14D4C5,#58CC02,#7B5CFF,#14D4C5)", glow: "0 0 12px 2px rgba(20,212,197,.5)" },
  { id: "frame_pixel", name: "8-Bit Pixel", ring: "repeating-conic-gradient(#E754B0 0% 12.5%,#7B5CFF 12.5% 25%)", glow: "0 0 0 3px rgba(231,84,176,.4)" },
  { id: "frame_hologram", name: "Hologram Prism", ring: "conic-gradient(from 180deg,#FF86D0,#FFD93D,#58CC02,#1CB0F6,#FF86D0)", glow: "0 0 14px 3px rgba(255,134,208,.5)" },
  { id: "frame_volcanic", name: "Volcanic Core", ring: "linear-gradient(135deg,#E85D04,#9D0208)", glow: "0 0 12px 3px rgba(232,93,4,.55)" },
];

export function getFrame(id: string): FrameDef {
  return FRAMES.find((f) => f.id === id) || FRAMES[0];
}

/* ----------------------- Board themes (game skins) ---------------------- */

export interface BoardThemeDef {
  id: string;
  name: string;
  /** small preview swatch (CSS background) */
  swatch: string;
  description: string;
}

export const BOARD_THEMES: BoardThemeDef[] = [
  { id: "theme_classic", name: "Warm Cream Arcade", swatch: "linear-gradient(135deg,#FFF9EC,#FFE9C4)", description: "The signature cozy board." },
  { id: "theme_cyber", name: "Neon Synth", swatch: "linear-gradient(135deg,#0F2B4C,#1CB0F6)", description: "Electric arcade nights." },
  { id: "theme_royal", name: "Royal Velvet", swatch: "linear-gradient(135deg,#3B1D6E,#A560E8)", description: "Fit for a cipher king." },
  { id: "theme_midnight", name: "Midnight Arena", swatch: "linear-gradient(135deg,#0B1026,#2F3266)", description: "Deep space focus mode." },
  { id: "theme_sunset", name: "Sunset Duel", swatch: "linear-gradient(135deg,#FF7A18,#FF4B7D)", description: "Golden-hour showdowns." },
  { id: "theme_forest", name: "Forest Cipher", swatch: "linear-gradient(135deg,#14532D,#58CC02)", description: "Calm woods, sharp mind." },
  { id: "theme_candy", name: "Candy Arena", swatch: "linear-gradient(135deg,#FF86D0,#FFB3E2)", description: "Sweet, bright, playful." },
  { id: "theme_ice", name: "Frozen Circuit", swatch: "linear-gradient(135deg,#BFE9FF,#5CC8FF)", description: "Ice-cold precision." },
  { id: "theme_volcano", name: "Volcano Pit", swatch: "linear-gradient(135deg,#3D0C02,#E85D04)", description: "Pressure makes diamonds." },
  { id: "theme_galaxy", name: "Galaxy Vault", swatch: "linear-gradient(135deg,#12002E,#7B5CFF)", description: "Codes among the stars." },
];

/* --------------------------- Win effects --------------------------- */

export const WIN_EFFECTS: { id: string; name: string; description: string }[] = [
  { id: "effect_confetti", name: "Party Confetti", description: "Classic confetti cannon blast." },
  { id: "effect_lightning", name: "Thunder Strike", description: "Gold & cyan electric fireworks." },
  { id: "effect_stars", name: "Supernova Starfall", description: "Golden stars rain down." },
  { id: "effect_fireworks", name: "Victory Fireworks", description: "Full-sky celebration show." },
  { id: "effect_matrix", name: "Matrix Rain", description: "Green code-rain cascade." },
  { id: "effect_sparkle", name: "Gold Sparkle", description: "Sparkling gold burst." },
  { id: "effect_shockwave", name: "Shockwave Ring", description: "A power ring blast." },
];
