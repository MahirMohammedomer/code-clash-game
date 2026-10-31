import type { AvatarConfig } from "./avatar";

export type AIDifficulty = "Rookie" | "Tactician" | "Mastermind" | "Oracle";
export type TurnTimerOption = 15 | 30 | 45 | 60 | 90 | 0;

export type DivisionName =
  | "Bronze" | "Silver" | "Gold" | "Platinum"
  | "Diamond" | "Master" | "Grandmaster" | "Legend";

export interface DivisionInfo {
  name: DivisionName;
  minTrophies: number;
  maxTrophies: number;
  color: string;
  gradient: string; // css background for badges
  winRewardCoins: number;
}

export const DIVISIONS: DivisionInfo[] = [
  { name: "Bronze", minTrophies: 0, maxTrophies: 99, color: "#B0703C", gradient: "linear-gradient(135deg,#D99A5B,#9A5B1A)", winRewardCoins: 35 },
  { name: "Silver", minTrophies: 100, maxTrophies: 249, color: "#8A97AD", gradient: "linear-gradient(135deg,#C7D2E4,#7A8CA6)", winRewardCoins: 50 },
  { name: "Gold", minTrophies: 250, maxTrophies: 449, color: "#E0A800", gradient: "linear-gradient(135deg,#FFD93D,#E0A800)", winRewardCoins: 70 },
  { name: "Platinum", minTrophies: 450, maxTrophies: 699, color: "#0AA79A", gradient: "linear-gradient(135deg,#4FE3D0,#0E86C8)", winRewardCoins: 95 },
  { name: "Diamond", minTrophies: 700, maxTrophies: 999, color: "#0284C7", gradient: "linear-gradient(135deg,#5CC8FF,#2456E6)", winRewardCoins: 120 },
  { name: "Master", minTrophies: 1000, maxTrophies: 1399, color: "#7F3FD1", gradient: "linear-gradient(135deg,#C39BFF,#6D28D9)", winRewardCoins: 155 },
  { name: "Grandmaster", minTrophies: 1400, maxTrophies: 1899, color: "#E23D3D", gradient: "linear-gradient(135deg,#FF7A7A,#C81E1E)", winRewardCoins: 200 },
  { name: "Legend", minTrophies: 1900, maxTrophies: 99999, color: "#46A302", gradient: "linear-gradient(135deg,#A6F750,#0AA79A)", winRewardCoins: 280 },
];

export function getDivisionForTrophies(trophies: number): DivisionInfo {
  const safe = Math.max(0, trophies);
  for (let i = DIVISIONS.length - 1; i >= 0; i--) {
    if (safe >= DIVISIONS[i].minTrophies) return DIVISIONS[i];
  }
  return DIVISIONS[0];
}

export function nextDivision(trophies: number): DivisionInfo | null {
  const cur = getDivisionForTrophies(trophies);
  const idx = DIVISIONS.findIndex((d) => d.name === cur.name);
  return idx < DIVISIONS.length - 1 ? DIVISIONS[idx + 1] : null;
}

/* ------------------------------- Core rules ------------------------------ */

export function isValidSecretCode(code: string): boolean {
  if (!code || code.length !== 4) return false;
  if (!/^[1-9]{4}$/.test(code)) return false;
  return new Set(code.split("")).size === 4;
}

export function generateRandomCode(): string {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, 4).join("");
}

export function evaluateGuess(
  secret: string,
  guess: string
): { points: number; orders: number; isWin: boolean } {
  if (!isValidSecretCode(secret) || !isValidSecretCode(guess)) {
    return { points: 0, orders: 0, isWin: false };
  }
  let points = 0;
  let orders = 0;
  const secretSet = new Set(secret.split(""));
  for (let i = 0; i < 4; i++) {
    if (secretSet.has(guess[i])) points++;
    if (secret[i] === guess[i]) orders++;
  }
  return { points, orders, isWin: orders === 4 };
}

let cachedAll: string[] | null = null;
export function getAllValidCodes(): string[] {
  if (cachedAll) return cachedAll;
  const results: string[] = [];
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let a = 0; a < 9; a++)
    for (let b = 0; b < 9; b++) {
      if (b === a) continue;
      for (let c = 0; c < 9; c++) {
        if (c === a || c === b) continue;
        for (let d = 0; d < 9; d++) {
          if (d === a || d === b || d === c) continue;
          results.push(digits[a] + digits[b] + digits[c] + digits[d]);
        }
      }
    }
  cachedAll = results;
  return results;
}

export interface PastGuessFeedback {
  guess: string;
  points: number;
  orders: number;
}

export function computeAINextGuess(
  difficulty: AIDifficulty,
  aiPastGuesses: PastGuessFeedback[]
): { guess: string; candidateCount: number; thoughtText: string } {
  const allCodes = getAllValidCodes();
  const triedSet = new Set(aiPastGuesses.map((g) => g.guess));
  const validHistory = aiPastGuesses.filter((g) => isValidSecretCode(g.guess));

  if (validHistory.length === 0) {
    return {
      guess: generateRandomCode(),
      candidateCount: 3024,
      thoughtText:
        difficulty === "Oracle"
          ? "Scanning 3,024 quantum permutations..."
          : difficulty === "Mastermind"
          ? "Deploying opening probe..."
          : "Picking a lucky starter!",
    };
  }

  if (difficulty === "Rookie") {
    const untried = allCodes.filter((c) => !triedSet.has(c));
    const pick = untried[Math.floor(Math.random() * untried.length)] || generateRandomCode();
    return { guess: pick, candidateCount: untried.length, thoughtText: "Hmm, shiny numbers!" };
  }

  if (difficulty === "Tactician") {
    // Sly deduces from Points across ALL past guesses (but ignores Orders),
    // which makes him a real threat while staying clearly beatable.
    let pool = allCodes.filter((code) => {
      if (triedSet.has(code)) return false;
      for (const h of validHistory) {
        if (evaluateGuess(code, h.guess).points !== h.points) return false;
      }
      return true;
    });
    if (pool.length === 0) pool = allCodes.filter((c) => !triedSet.has(c));
    // Occasional fox blunder (~1 in 5 turns) gives the player breathing room.
    if (Math.random() < 0.2 && pool.length > 3) {
      const slipPool = allCodes.filter((c) => !triedSet.has(c));
      const slip = slipPool[Math.floor(Math.random() * slipPool.length)];
      return { guess: slip || pool[0], candidateCount: pool.length, thoughtText: "Just a hunch..." };
    }
    const pick = pool[Math.floor(Math.random() * pool.length)] || generateRandomCode();
    return { guess: pick, candidateCount: pool.length, thoughtText: `~${pool.length} tactical patterns left` };
  }

  let consistent = allCodes.filter((candidate) => {
    if (triedSet.has(candidate)) return false;
    for (const h of validHistory) {
      const ev = evaluateGuess(candidate, h.guess);
      if (ev.points !== h.points || ev.orders !== h.orders) return false;
    }
    return true;
  });
  if (consistent.length === 0) consistent = allCodes.filter((c) => !triedSet.has(c));

  if (difficulty === "Mastermind") {
    const pick = consistent[Math.floor(Math.random() * consistent.length)] || generateRandomCode();
    return { guess: pick, candidateCount: consistent.length, thoughtText: `${consistent.length} viable codes remain` };
  }

  // Oracle — entropy maximization over a sample of consistent candidates
  if (consistent.length === 1) {
    return { guess: consistent[0], candidateCount: 1, thoughtText: "Target lock acquired!" };
  }
  const sampleSize = Math.min(consistent.length, 65);
  const step = Math.max(1, Math.floor(consistent.length / sampleSize));
  const sample: string[] = [];
  for (let i = 0; i < consistent.length && sample.length < sampleSize; i += step) sample.push(consistent[i]);
  let best = sample[0];
  let bestScore = -1;
  for (const probe of sample) {
    const buckets = new Map<string, number>();
    for (const target of sample) {
      const ev = evaluateGuess(target, probe);
      const key = `${ev.points}-${ev.orders}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    let entropy = 0;
    for (const count of buckets.values()) {
      const p = count / sample.length;
      entropy -= p * Math.log2(p);
    }
    if (entropy > bestScore) { bestScore = entropy; best = probe; }
  }
  if (validHistory.length === 1 && Math.random() < 0.2 && consistent.length > 2) {
    best = consistent[Math.floor(Math.random() * consistent.length)];
  }
  return { guess: best, candidateCount: consistent.length, thoughtText: `Entropy lock: ${consistent.length} possibilities` };
}

/* --------------------------- Bot personalities --------------------------- */

export type BotMood = "idle" | "think" | "happy" | "sad" | "shocked" | "win" | "lose" | "sleepy";

export interface AIBotProfile {
  difficulty: AIDifficulty;
  name: string;
  title: string;
  tagline: string;
  avatar: AvatarConfig;
  frameId: string;
  accent: string;
  rewardCoins: number;
  rewardXp: number;
  trophyDelta: number;
  thinkMinMs: number;
  thinkMaxMs: number;
  lines: {
    start: string[];
    thinking: string[];
    goodGuess: string[];   // bot scored 3-4 points
    badGuess: string[];    // bot scored 0 points
    playerClose: string[]; // player scored 3-4 points / high orders
    playerBad: string[];   // player scored 0
    botWin: string[];
    botLose: string[];
    playerTimeout: string[];
  };
}

export const AI_BOTS: Record<AIDifficulty, AIBotProfile> = {
  Rookie: {
    difficulty: "Rookie",
    name: "Pip",
    title: "Rookie Chick",
    tagline: "Playful & random. Perfect first rival!",
    avatar: { base: "chick", color: "sunny", accessory: "party" },
    frameId: "frame_emerald",
    accent: "#58CC02",
    rewardCoins: 45, rewardXp: 50, trophyDelta: 14,
    thinkMinMs: 600, thinkMaxMs: 1100,
    lines: {
      start: ["Yay! Let's play! I hid 4 super-secret numbers!", "Peep peep! Bet you can't crack my code!"],
      thinking: ["Hmm... eeny meeny...", "Ooh, shiny numbers!", "Let me think... snack first?"],
      goodGuess: ["Whoa, I'm getting warmer!", "Hehe, I smell your code!"],
      badGuess: ["Oopsie! None of those?", "Peck peck... nope!"],
      playerClose: ["Eek! You're close!", "No no no, stay away from my code!"],
      playerBad: ["Hehe, totally wrong!", "Peep! Zero! My code is safe!"],
      botWin: ["I DID IT! Happy dance!", "Peep peep, champion!"],
      botLose: ["You cracked it! Again again!", "Wow, you're smart! One more?"],
      playerTimeout: ["Too slow! Peep peep!", "Tick tock, time's up!"],
    },
  },
  Tactician: {
    difficulty: "Tactician",
    name: "Sly",
    title: "Tactician Fox",
    tagline: "Tracks your digits. Eliminates fast.",
    avatar: { base: "fox", color: "lava", accessory: "shades" },
    frameId: "frame_neon",
    accent: "#FF7A18",
    rewardCoins: 80, rewardXp: 85, trophyDelta: 22,
    thinkMinMs: 800, thinkMaxMs: 1400,
    lines: {
      start: ["A new challenger. Let's see what you've got.", "My code? Buried deep. Good luck."],
      thinking: ["Calculating your habits...", "Interesting pattern...", "Cross-referencing digits..."],
      goodGuess: ["Your trail is getting warm...", "Three of your digits. Noted."],
      badGuess: ["Eliminated. That's data too.", "A dead end — for now."],
      playerClose: ["Hmph. Lucky hit.", "You won't keep that pace."],
      playerBad: ["Wasted move, friend.", "Zero. How embarrassing."],
      botWin: ["Outfoxed. As expected.", "Too easy. Come back sharper."],
      botLose: ["...Impressive. You read me well.", "Defeated by a clever one. Rare."],
      playerTimeout: ["Hesitation loses games.", "The clock is my ally."],
    },
  },
  Mastermind: {
    difficulty: "Mastermind",
    name: "Professor Hoot",
    title: "Mastermind Owl",
    tagline: "Full logic solver. Every clue counts.",
    avatar: { base: "owl", color: "midnight", accessory: "glasses" },
    frameId: "frame_celestial",
    accent: "#7B5CFF",
    rewardCoins: 130, rewardXp: 140, trophyDelta: 30,
    thinkMinMs: 1000, thinkMaxMs: 1700,
    lines: {
      start: ["Ah, a student of logic. Class is in session.", "Every code breaks. Even yours."],
      thinking: ["Filtering possibilities...", "Deduction in progress...", "A fascinating puzzle..."],
      goodGuess: ["The solution space narrows nicely.", "Precisely as predicted."],
      badGuess: ["Fascinating. A full elimination.", "Even failures teach us."],
      playerClose: ["A sharp student indeed...", "You learn quickly. Concerning."],
      playerBad: ["Elementary mistake, I'm afraid.", "Study the clues, young one."],
      botWin: ["Q.E.D. The code is cracked.", "Another successful lecture."],
      botLose: ["Remarkable! You surpassed the master.", "I shall... revise my theorems."],
      playerTimeout: ["Deep thought takes time — too much.", "Punctuality matters in logic."],
    },
  },
  Oracle: {
    difficulty: "Oracle",
    name: "Aethelgard",
    title: "The Grand Oracle",
    tagline: "Sees every future. Nearly unbeatable.",
    avatar: { base: "dragon", color: "cosmic", accessory: "wizard" },
    frameId: "frame_volcanic",
    accent: "#E85D04",
    rewardCoins: 220, rewardXp: 250, trophyDelta: 42,
    thinkMinMs: 1100, thinkMaxMs: 1900,
    lines: {
      start: ["I have foreseen this duel... and its end.", "Your code whispers to me already."],
      thinking: ["Reading the threads of fate...", "3,024 futures... collapsing.", "The stars align..."],
      goodGuess: ["The prophecy unfolds.", "Your digits reveal themselves."],
      badGuess: ["A future erased. Good riddance.", "Even voids have meaning."],
      playerClose: ["You disturb the timeline...", "Bold. The fates watch you."],
      playerBad: ["The void answers your guess.", "Blindly you wander."],
      botWin: ["As it was written. Victory.", "No mortal outruns destiny."],
      botLose: ["IMPOSSIBLE... You rewrote fate itself!", "The prophecy... shattered. Well played, mortal."],
      playerTimeout: ["Time devours the hesitant.", "Even eternity ran out for you."],
    },
  },
};

export function pickLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

/* ------------------------------ Shop catalog ----------------------------- */

export type CosmeticCategory =
  | "avatar_base" | "avatar_color" | "avatar_accessory" | "avatar_pattern"
  | "frame" | "theme" | "effect" | "title";

export type Rarity = "common" | "rare" | "epic" | "legendary";

export interface CosmeticItem {
  id: string;
  name: string;
  category: CosmeticCategory;
  description: string;
  priceCoins?: number;
  priceGems?: number;
  rarity: Rarity;
  /** base/color/accessory/frame/theme/effect id, or title text */
  meta: string;
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common: "#8A97AD",
  rare: "#1CB0F6",
  epic: "#A560E8",
  legendary: "#E0A800",
};

export const SHOP_ITEMS: CosmeticItem[] = [
  // Character bases
  { id: "base_owl", name: "Hoot the Owl", category: "avatar_base", description: "Wise, calm, always watching.", priceCoins: 0, rarity: "common", meta: "owl" },
  { id: "base_chick", name: "Pip the Chick", category: "avatar_base", description: "Small, loud, fearless.", priceCoins: 150, rarity: "common", meta: "chick" },
  { id: "base_cat", name: "Whiskers the Cat", category: "avatar_base", description: "Quick paws, quicker brain.", priceCoins: 300, rarity: "common", meta: "cat" },
  { id: "base_Pup", name: "Biscuit the Pup", category: "avatar_base", description: "Sniffs out secret digits.", priceCoins: 350, rarity: "rare", meta: "Pup" },
  { id: "base_fox", name: "Ember the Fox", category: "avatar_base", description: "Sly and dangerously clever.", priceCoins: 500, rarity: "rare", meta: "fox" },
  { id: "base_panda", name: "Bamboo the Panda", category: "avatar_base", description: "Chill outside, genius inside.", priceGems: 40, rarity: "epic", meta: "panda" },
  { id: "base_robot", name: "Bolt the Bot", category: "avatar_base", description: "3,024 codes per second.", priceGems: 60, rarity: "epic", meta: "robot" },
  { id: "base_dragon", name: "Drake the Dragon", category: "avatar_base", description: "Legendary code-burning beast.", priceGems: 120, rarity: "legendary", meta: "dragon" },
  { id: "base_penguin", name: "Waddles the Penguin", category: "avatar_base", description: "Ice-cold focus, warm heart.", priceCoins: 250, rarity: "common", meta: "penguin" },
  { id: "base_bunny", name: "Clover the Bunny", category: "avatar_base", description: "Hops straight to the answer.", priceCoins: 300, rarity: "common", meta: "bunny" },
  { id: "base_bear", name: "Honey the Bear", category: "avatar_base", description: "Big hugs, bigger brain.", priceCoins: 400, rarity: "rare", meta: "bear" },
  { id: "base_monkey", name: "Bananas the Monkey", category: "avatar_base", description: "Wild guesses, weirdly right.", priceCoins: 450, rarity: "rare", meta: "monkey" },
  { id: "base_tiger", name: "Raja the Tiger", category: "avatar_base", description: "Stripes of a champion hunter.", priceCoins: 550, rarity: "rare", meta: "tiger" },
  { id: "base_koala", name: "Eucalyptus the Koala", category: "avatar_base", description: "Sleepy outside, solver inside.", priceGems: 45, rarity: "epic", meta: "koala" },
  { id: "base_wolf", name: "Luna the Wolf", category: "avatar_base", description: "Hunts codes by moonlight.", priceGems: 55, rarity: "epic", meta: "wolf" },
  { id: "base_ghost", name: "Boo the Ghost", category: "avatar_base", description: "You never see the win coming.", priceGems: 70, rarity: "epic", meta: "ghost" },
  // Colors
  { id: "color_classic", name: "Meadow Green", category: "avatar_color", description: "The original clash green.", priceCoins: 0, rarity: "common", meta: "classic" },
  { id: "color_sky", name: "Sky Blue", category: "avatar_color", description: "Fresh and fearless.", priceCoins: 120, rarity: "common", meta: "sky" },
  { id: "color_sunny", name: "Sunny Side", category: "avatar_color", description: "Pure sunshine energy.", priceCoins: 120, rarity: "common", meta: "sunny" },
  { id: "color_coral", name: "Coral Pop", category: "avatar_color", description: "Warm and bold.", priceCoins: 200, rarity: "common", meta: "coral" },
  { id: "color_ocean", name: "Deep Ocean", category: "avatar_color", description: "Calm under pressure.", priceCoins: 250, rarity: "rare", meta: "ocean" },
  { id: "color_rose", name: "Bubblegum", category: "avatar_color", description: "Sweet but deadly.", priceCoins: 250, rarity: "rare", meta: "rose" },
  { id: "color_choco", name: "Cocoa", category: "avatar_color", description: "Cozy and confident.", priceCoins: 300, rarity: "rare", meta: "choco" },
  { id: "color_lava", name: "Lava Glow", category: "avatar_color", description: "Hot streaks guaranteed.", priceCoins: 400, rarity: "rare", meta: "lava" },
  { id: "color_grape", name: "Grape Soda", category: "avatar_color", description: "Fizzy purple power.", priceGems: 25, rarity: "epic", meta: "grape" },
  { id: "color_midnight", name: "Midnight", category: "avatar_color", description: "Strikes after dark.", priceGems: 35, rarity: "epic", meta: "midnight" },
  { id: "color_cosmic", name: "Cosmic Violet", category: "avatar_color", description: "From another galaxy.", priceGems: 55, rarity: "epic", meta: "cosmic" },
  { id: "color_golden", name: "Golden Legend", category: "avatar_color", description: "Pure championship shine.", priceGems: 90, rarity: "legendary", meta: "golden" },
  { id: "color_mint", name: "Minty Fresh", category: "avatar_color", description: "Cool, calm, collected.", priceCoins: 150, rarity: "common", meta: "mint" },
  { id: "color_peach", name: "Peach Sorbet", category: "avatar_color", description: "Soft serve sweetness.", priceCoins: 180, rarity: "common", meta: "peach" },
  { id: "color_cream", name: "Vanilla Cream", category: "avatar_color", description: "Smooth operator.", priceCoins: 220, rarity: "rare", meta: "cream" },
  { id: "color_slate", name: "Storm Slate", category: "avatar_color", description: "Serious storm energy.", priceCoins: 320, rarity: "rare", meta: "slate" },
  { id: "color_berry", name: "Berry Blast", category: "avatar_color", description: "Explosively pink.", priceGems: 30, rarity: "epic", meta: "berry" },
  { id: "color_neon", name: "Neon Lime", category: "avatar_color", description: "Glows under pressure.", priceGems: 45, rarity: "epic", meta: "neon" },
  // Accessories
  { id: "acc_none", name: "No Accessory", category: "avatar_accessory", description: "Clean and classic.", priceCoins: 0, rarity: "common", meta: "none" },
  { id: "acc_cap", name: "Sport Cap", category: "avatar_accessory", description: "Game day ready.", priceCoins: 180, rarity: "common", meta: "cap" },
  { id: "acc_bow", name: "Lucky Bow", category: "avatar_accessory", description: "Cute and accurate.", priceCoins: 220, rarity: "common", meta: "bow" },
  { id: "acc_glasses", name: "Smart Glasses", category: "avatar_accessory", description: "+10 brain power.", priceCoins: 300, rarity: "rare", meta: "glasses" },
  { id: "acc_party", name: "Party Hat", category: "avatar_accessory", description: "Every guess is a party.", priceCoins: 320, rarity: "rare", meta: "party" },
  { id: "acc_headphones", name: "Pro Headphones", category: "avatar_accessory", description: "Zero distractions.", priceCoins: 420, rarity: "rare", meta: "headphones" },
  { id: "acc_shades", name: "Cool Shades", category: "avatar_accessory", description: "Too cool to miscount.", priceGems: 30, rarity: "epic", meta: "shades" },
  { id: "acc_crown", name: "Royal Crown", category: "avatar_accessory", description: "Code-breaking royalty.", priceGems: 70, rarity: "legendary", meta: "crown" },
  { id: "acc_wizard", name: "Wizard Hat", category: "avatar_accessory", description: "Sees codes through magic.", priceGems: 60, rarity: "epic", meta: "wizard" },
  { id: "acc_halo", name: "Angel Halo", category: "avatar_accessory", description: "Pure luck. Probably.", priceGems: 50, rarity: "epic", meta: "halo" },
  { id: "acc_flower", name: "Daisy Flower", category: "avatar_accessory", description: "Fresh-picked good vibes.", priceCoins: 200, rarity: "common", meta: "flower" },
  { id: "acc_beanie", name: "Cozy Beanie", category: "avatar_accessory", description: "Warm head, cool logic.", priceCoins: 260, rarity: "rare", meta: "beanie" },
  { id: "acc_bandana", name: "Ninja Bandana", category: "avatar_accessory", description: "Silent. Swift. Correct.", priceCoins: 380, rarity: "rare", meta: "bandana" },
  { id: "acc_monocle", name: "Fancy Monocle", category: "avatar_accessory", description: "For distinguished detectives.", priceGems: 45, rarity: "epic", meta: "monocle" },
  // Patterns
  { id: "pat_none", name: "No Pattern", category: "avatar_pattern", description: "Clean solid color.", priceCoins: 0, rarity: "common", meta: "none" },
  { id: "pat_spots", name: "Polka Spots", category: "avatar_pattern", description: "Playful dotted fur.", priceCoins: 220, rarity: "common", meta: "spots" },
  { id: "pat_stripes", name: "Racer Stripes", category: "avatar_pattern", description: "Built for speed.", priceCoins: 260, rarity: "rare", meta: "stripes" },
  { id: "pat_grid", name: "Arcade Grid", category: "avatar_pattern", description: "Retro checker vibes.", priceCoins: 300, rarity: "rare", meta: "grid" },
  { id: "pat_stars", name: "Star Sparkle", category: "avatar_pattern", description: "Tiny stars, big dreams.", priceGems: 30, rarity: "epic", meta: "stars" },
  { id: "pat_hearts", name: "Sweet Hearts", category: "avatar_pattern", description: "Win with love.", priceGems: 35, rarity: "epic", meta: "hearts" },
  // Frames
  { id: "frame_emerald", name: "Emerald Sprout Frame", category: "frame", description: "Classic victory green ring.", priceCoins: 0, rarity: "common", meta: "frame_emerald" },
  { id: "frame_gold", name: "Solar Gold Frame", category: "frame", description: "Gleaming champion gold.", priceCoins: 350, rarity: "rare", meta: "frame_gold" },
  { id: "frame_obsidian", name: "Obsidian Edge Frame", category: "frame", description: "Sharp and serious.", priceCoins: 600, rarity: "rare", meta: "frame_obsidian" },
  { id: "frame_pixel", name: "8-Bit Pixel Frame", category: "frame", description: "Retro arcade border.", priceCoins: 420, rarity: "rare", meta: "frame_pixel" },
  { id: "frame_volcanic", name: "Volcanic Core Frame", category: "frame", description: "Molten and aggressive.", priceCoins: 900, rarity: "epic", meta: "frame_volcanic" },
  { id: "frame_neon", name: "Cyber Neon Frame", category: "frame", description: "Electric rainbow pulse.", priceGems: 45, rarity: "epic", meta: "frame_neon" },
  { id: "frame_dragon", name: "Dragonfire Frame", category: "frame", description: "Blazing crimson aura.", priceGems: 80, rarity: "epic", meta: "frame_dragon" },
  { id: "frame_aurora", name: "Aurora Borealis Frame", category: "frame", description: "Shifting northern lights.", priceGems: 95, rarity: "legendary", meta: "frame_aurora" },
  { id: "frame_hologram", name: "Hologram Prism Frame", category: "frame", description: "Iridescent light prism.", priceGems: 120, rarity: "legendary", meta: "frame_hologram" },
  { id: "frame_celestial", name: "Celestial Legend Frame", category: "frame", description: "Mythic cosmic border.", priceGems: 110, rarity: "legendary", meta: "frame_celestial" },
  // Board themes
  { id: "theme_classic", name: "Warm Cream Arcade", category: "theme", description: "Signature cozy board.", priceCoins: 0, rarity: "common", meta: "theme_classic" },
  { id: "theme_forest", name: "Forest Cipher", category: "theme", description: "Calm green woods.", priceCoins: 380, rarity: "common", meta: "theme_forest" },
  { id: "theme_candy", name: "Candy Arena", category: "theme", description: "Playful pink board.", priceCoins: 480, rarity: "rare", meta: "theme_candy" },
  { id: "theme_cyber", name: "Neon Synth Board", category: "theme", description: "Electric arcade nights.", priceCoins: 500, rarity: "rare", meta: "theme_cyber" },
  { id: "theme_midnight", name: "Midnight Arena", category: "theme", description: "Deep navy focus mode.", priceCoins: 550, rarity: "rare", meta: "theme_midnight" },
  { id: "theme_ice", name: "Frozen Circuit", category: "theme", description: "Ice-cold precision.", priceGems: 55, rarity: "epic", meta: "theme_ice" },
  { id: "theme_sunset", name: "Sunset Duel", category: "theme", description: "Golden-hour showdowns.", priceGems: 50, rarity: "epic", meta: "theme_sunset" },
  { id: "theme_royal", name: "Royal Velvet Vault", category: "theme", description: "Regal amethyst & gold.", priceGems: 60, rarity: "epic", meta: "theme_royal" },
  { id: "theme_volcano", name: "Volcano Pit", category: "theme", description: "Pressure makes diamonds.", priceGems: 75, rarity: "legendary", meta: "theme_volcano" },
  { id: "theme_galaxy", name: "Galaxy Vault", category: "theme", description: "Codes among the stars.", priceGems: 85, rarity: "legendary", meta: "theme_galaxy" },
  // Win effects
  { id: "effect_confetti", name: "Party Confetti", category: "effect", description: "Confetti cannon blast.", priceCoins: 0, rarity: "common", meta: "effect_confetti" },
  { id: "effect_sparkle", name: "Gold Sparkle", category: "effect", description: "Twinkling gold dust floats.", priceCoins: 400, rarity: "rare", meta: "effect_sparkle" },
  { id: "effect_lightning", name: "Thunder Strike", category: "effect", description: "Lightning bolts crash down!", priceCoins: 450, rarity: "rare", meta: "effect_lightning" },
  { id: "effect_matrix", name: "Matrix Rain", category: "effect", description: "Green code digits pour down.", priceCoins: 520, rarity: "rare", meta: "effect_matrix" },
  { id: "effect_stars", name: "Supernova Starfall", category: "effect", description: "Giant golden stars drift down.", priceGems: 55, rarity: "epic", meta: "effect_stars" },
  { id: "effect_shockwave", name: "Shockwave Ring", category: "effect", description: "A power ring blasts outward!", priceGems: 65, rarity: "epic", meta: "effect_shockwave" },
  { id: "effect_fireworks", name: "Victory Fireworks", category: "effect", description: "Full-sky fireworks show.", priceGems: 70, rarity: "legendary", meta: "effect_fireworks" },
  { id: "effect_bubbles", name: "Bubble Rise", category: "effect", description: "Dreamy bubbles float up.", priceCoins: 420, rarity: "rare", meta: "effect_bubbles" },
  { id: "effect_coins", name: "Coin Shower", category: "effect", description: "Gold coins rain from above!", priceCoins: 480, rarity: "rare", meta: "effect_coins" },
  { id: "effect_snow", name: "Snowfall", category: "effect", description: "Peaceful sparkling snow.", priceGems: 55, rarity: "epic", meta: "effect_snow" },
  { id: "effect_laser", name: "Neon Lasers", category: "effect", description: "Twin neon laser cannons!", priceGems: 60, rarity: "epic", meta: "effect_laser" },
  { id: "effect_emoji", name: "Emoji Party", category: "effect", description: "Trophies, stars & fire explode!", priceGems: 65, rarity: "epic", meta: "effect_emoji" },
  { id: "effect_crown", name: "Champion's Crowns", category: "effect", description: "Crowns rain for legends.", priceGems: 100, rarity: "legendary", meta: "effect_crown" },
  // Titles
  { id: "title_breaker", name: "Code Breaker", category: "title", description: "The classic badge.", priceCoins: 0, rarity: "common", meta: "Code Breaker" },
  { id: "title_sleuth", name: "Digit Sleuth", category: "title", description: "Finds every clue.", priceCoins: 200, rarity: "common", meta: "Digit Sleuth" },
  { id: "title_night_owl", name: "Night Owl", category: "title", description: "Late-night cracker.", priceCoins: 280, rarity: "common", meta: "Night Owl" },
  { id: "title_grand_cipher", name: "Grand Cipher", category: "title", description: "Sees every permutation.", priceCoins: 400, rarity: "rare", meta: "Grand Cipher" },
  { id: "title_digit_lord", name: "Digit Lord", category: "title", description: "Commands the board.", priceCoins: 700, rarity: "rare", meta: "Digit Lord" },
  { id: "title_streak_king", name: "Streak King", category: "title", description: "Never breaks the chain.", priceGems: 40, rarity: "epic", meta: "Streak King" },
  { id: "title_cipher_ghost", name: "Cipher Ghost", category: "title", description: "Silent and three steps ahead.", priceGems: 75, rarity: "epic", meta: "Cipher Ghost" },
  { id: "title_oracle_slayer", name: "Oracle Slayer", category: "title", description: "Outsmarted Aethelgard.", priceGems: 75, rarity: "epic", meta: "Oracle Slayer" },
  { id: "title_legend_candidate", name: "Legend Candidate", category: "title", description: "One step from the top.", priceGems: 150, rarity: "legendary", meta: "Legend Candidate" },
];

export function getShopItem(id: string): CosmeticItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id);
}

export const STARTER_OWNED = [
  "base_owl", "color_classic", "acc_none", "pat_none",
  "frame_emerald", "theme_classic", "effect_confetti", "title_breaker",
];

/* ------------------------------- Economy -------------------------------- */

export function computeTrophyDelta(won: boolean, mode: string, aiDifficulty?: string): number {
  let base = 20;
  if (mode === "online_1v1") base = 28;
  else if (mode === "online_race") base = 24;
  else if (mode === "hotseat" || mode === "local_offline" || mode === "peer" || mode === "tournament" || mode === "daily_code") base = 0; // friendly / solo, no trophies
  else if (mode === "ai") {
    if (aiDifficulty === "Oracle") base = 42;
    else if (aiDifficulty === "Mastermind") base = 30;
    else if (aiDifficulty === "Tactician") base = 22;
    else base = 14;
  }
  if (!won) return base === 0 ? 0 : -Math.max(8, Math.floor(base * 0.45));
  return base;
}

/* ---------------------------- Daily quests ------------------------------ */

export interface DailyQuestItem {
  id: string;
  title: string;
  description: string;
  target: number;
  statKey: "games" | "orders" | "wins" | "fastWins";
  rewardCoins: number;
  rewardXp: number;
  rewardGems?: number;
}

export const DAILY_QUESTS: DailyQuestItem[] = [
  { id: "quest_play_2", title: "Code Warmup", description: "Play 2 matches today", target: 2, statKey: "games", rewardCoins: 120, rewardXp: 150 },
  { id: "quest_orders_8", title: "Precision Lock", description: "Score 8 Orders (green hits) today", target: 8, statKey: "orders", rewardCoins: 180, rewardXp: 200 },
  { id: "quest_win_1", title: "Cracker of the Day", description: "Win 1 match today", target: 1, statKey: "wins", rewardCoins: 200, rewardXp: 250, rewardGems: 15 },
  { id: "quest_fast_win", title: "Speed Cipher", description: "Win a match in 6 turns or fewer", target: 1, statKey: "fastWins", rewardCoins: 250, rewardXp: 300, rewardGems: 25 },
];

export interface DailyStats {
  date: string;
  games: number;
  wins: number;
  orders: number;
  fastWins: number;
}

export function emptyDailyStats(date: string): DailyStats {
  return { date, games: 0, wins: 0, orders: 0, fastWins: 0 };
}

/* --------------------------- Daily challenge ---------------------------- */

export type DailyChallengeRule = "classic" | "speed_30" | "no_orders_hint" | "three_guess_max" | "hard_ai_only";

export interface DailyChallengeInfo {
  id: string;
  dateKey: string;
  title: string;
  description: string;
  rule: DailyChallengeRule;
  bonusMultiplier: number;
}

export function getDailyChallenge(date = new Date()): DailyChallengeInfo {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const dateKey = date.toISOString().slice(0, 10);
  const pool: Omit<DailyChallengeInfo, "id" | "dateKey">[] = [
    { title: "Classic Cipher", description: "Standard rules with a daily bonus.", rule: "classic", bonusMultiplier: 1.25 },
    { title: "Speed Rush", description: "30 seconds per turn. Think fast!", rule: "speed_30", bonusMultiplier: 1.5 },
    { title: "Blind Orders", description: "Orders hidden — Points only until you win.", rule: "no_orders_hint", bonusMultiplier: 1.6 },
    { title: "Blitz Duel", description: "Fast 30-second turns against Professor Hoot.", rule: "speed_30", bonusMultiplier: 1.7 },
    { title: "Oracle Gauntlet", description: "Face Mastermind or harder. Big rewards.", rule: "hard_ai_only", bonusMultiplier: 1.8 },
  ];
  const pick = pool[day % pool.length];
  return { id: `daily_${dateKey}`, dateKey, ...pick };
}

/* ----------------------------- Achievements ----------------------------- */

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
  rewardGems: number;
}

export const ACHIEVEMENTS: AchievementItem[] = [
  { id: "first_crack", title: "First Crack!", description: "Win your first match.", rewardGems: 20 },
  { id: "win_10", title: "Decade of Cracks", description: "Win 10 matches.", rewardGems: 40 },
  { id: "win_50", title: "Half Century", description: "Win 50 matches.", rewardGems: 120 },
  { id: "win_100", title: "Century Club", description: "Win 100 matches.", rewardGems: 200 },
  { id: "mind_reader", title: "Mind Reader", description: "Win in 4 turns or fewer.", rewardGems: 50 },
  { id: "perfect_game", title: "Perfect Cipher", description: "Win in 3 turns or fewer.", rewardGems: 80 },
  { id: "fast_2", title: "Two-Turn Miracle", description: "Win in exactly 2 guesses.", rewardGems: 150 },
  { id: "mastermind_beat", title: "Out-Thought", description: "Defeat Professor Hoot.", rewardGems: 55 },
  { id: "oracle_slayer", title: "Oracle Slayer", description: "Defeat Aethelgard, the Grand Oracle.", rewardGems: 100 },
  { id: "trophies_100", title: "Silver Climber", description: "Reach 100 trophies.", rewardGems: 35 },
  { id: "trophies_250", title: "Gold Standard", description: "Reach 250 trophies.", rewardGems: 60 },
  { id: "trophies_700", title: "Diamond Mind", description: "Reach 700 trophies.", rewardGems: 100 },
  { id: "trophies_1000", title: "Master Threshold", description: "Reach 1,000 trophies.", rewardGems: 150 },
  { id: "trophies_1900", title: "Living Legend", description: "Reach 1,900 trophies.", rewardGems: 300 },
  { id: "streak_3", title: "On Fire!", description: "Reach a 3-day streak.", rewardGems: 25 },
  { id: "streak_7", title: "Week Warrior", description: "Reach a 7-day streak.", rewardGems: 80 },
];

/* ------------------------------ Reactions ------------------------------- */

/** Quick reactions: classic icon set + a playful emoji set (rendered big & bouncy). */
export const REACTION_IDS = [
  "thumbs_up", "fire", "laugh", "wow", "rocket", "target", "heart", "star",
  "joy", "clap", "mindblown", "party", "muscle", "eyes",
] as const;

/** Emoji glyphs for the playful reaction ids. */
export const REACTION_EMOJI: Record<string, string> = {
  joy: "😂",
  clap: "👏",
  mindblown: "🤯",
  party: "🎉",
  muscle: "💪",
  eyes: "👀",
};
export type ReactionId = (typeof REACTION_IDS)[number];

export const QUICK_PHRASES = [
  "Good luck! 🍀",
  "Nice try! 😏",
  "So close! 😱",
  "Oops! 🙈",
  "Bring it on! 🔥",
  "Great game! 🎉",
  "Rematch? ↩️",
  "I'm coming for that code! 🕵️",
  "Too slow! 🐢",
  "Brain = ON 🧠",
];

/* ------------------------- Solver helpers / coach ------------------------ */

/** All codes still consistent with a feedback history (points+orders). */
export function filterCandidates(history: PastGuessFeedback[]): string[] {
  const valid = history.filter((h) => isValidSecretCode(h.guess));
  if (valid.length === 0) return getAllValidCodes();
  return getAllValidCodes().filter((candidate) => {
    for (const h of valid) {
      const ev = evaluateGuess(candidate, h.guess);
      if (ev.points !== h.points || ev.orders !== h.orders) return false;
    }
    return true;
  });
}

export interface CoachNote {
  guessIndex: number; // 0-based index into the player's own guesses
  kind: "great" | "wasted" | "missedWin" | "info";
  text: string;
}

export interface CoachReport {
  notes: CoachNote[];
  grade: string;
  wasted: number;
  missedWins: number;
}

/**
 * Professor Hoot's post-game analysis of one player's guessing.
 * Flags guesses that ignored earlier clues and turns where the code was forced.
 */
export function analyzeGuesses(rawGuesses: PastGuessFeedback[]): CoachReport {
  const guesses = rawGuesses.filter((g) => isValidSecretCode(g.guess));
  const notes: CoachNote[] = [];
  let wasted = 0;
  let missedWins = 0;

  for (let i = 0; i < guesses.length; i++) {
    const before = filterCandidates(guesses.slice(0, i));
    const g = guesses[i];
    if (before.length === 1 && g.guess !== before[0]) {
      missedWins++;
      notes.push({
        guessIndex: i,
        kind: "missedWin",
        text: `Turn ${i + 1}: the code was already forced to be ${before[0]} — every clue pointed there! 🎯`,
      });
    } else if (i > 0 && !before.includes(g.guess)) {
      wasted++;
      notes.push({
        guessIndex: i,
        kind: "wasted",
        text: `Turn ${i + 1}: ${g.guess} was already ruled out by your earlier clues. Check your pegs before guessing! 🧐`,
      });
    } else if (g.points === 0 && i < 3) {
      notes.push({
        guessIndex: i,
        kind: "great",
        text: `Turn ${i + 1}: zero hits is great news early — four digits eliminated in one move! 💡`,
      });
    } else if (g.orders >= 3) {
      notes.push({
        guessIndex: i,
        kind: "great",
        text: `Turn ${i + 1}: three digits locked in place — surgical precision! 🔥`,
      });
    }
  }

  let grade: string;
  if (guesses.length === 0) grade = "No guesses to grade yet!";
  else if (missedWins === 0 && wasted === 0 && guesses.length <= 5) grade = "Grandmaster brain 🧠✨ — flawless logic!";
  else if (missedWins === 0 && wasted <= 1) grade = "Sharp detective work 🕵️ — very efficient!";
  else if (wasted <= 2) grade = "Good instincts! A little peg-checking would make you deadly. 📈";
  else grade = "Brave guessing! Slow down and let the clues talk. 🦉";

  return { notes, grade, wasted, missedWins };
}

/* ------------------------------ Daily Code ------------------------------- */

function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Same secret for every player on a given date (YYYY-MM-DD). */
export function getDailyCodeSecret(dateKey: string): string {
  const rand = mulberry32(hashSeed("cipherclash-daily-" + dateKey));
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, 4).join("");
}

export const DAILY_CODE_MAX = 8;

/** Wordle-style share text with an emoji peg grid. */
export function dailyCodeShareText(dateKey: string, feedback: { points: number; orders: number }[], won: boolean): string {
  const grid = feedback
    .map((f) => {
      const cells = ["⬜", "⬜", "⬜", "⬜"];
      for (let i = 0; i < f.orders; i++) cells[i] = "🟢";
      for (let i = f.orders; i < f.points; i++) cells[i] = "🔵";
      return cells.join("");
    })
    .join("\n");
  const score = won ? `${feedback.length}/${DAILY_CODE_MAX}` : `X/${DAILY_CODE_MAX}`;
  return `🧩 Cipher Clash — Daily Code ${dateKey}\nCracked in ${score} guesses!\n${grid}\nCan you beat me? Play free: npo.pro.et`;
}

/* ------------------------------ Seasons ---------------------------------- */

export function currentSeasonId(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function seasonLabel(seasonId: string): string {
  const [y, m] = seasonId.split("-").map(Number);
  const name = new Date(y, (m || 1) - 1, 1).toLocaleString("en-US", { month: "long" });
  return `${name} ${y}`;
}

export function seasonDaysLeft(d = new Date()): number {
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return Math.max(0, Math.ceil((end.getTime() - d.getTime()) / 86400000));
}

/** End-of-season payout based on the division you reached at your peak. */
export const SEASON_REWARDS: Record<DivisionName, { coins: number; gems: number }> = {
  Bronze: { coins: 100, gems: 0 },
  Silver: { coins: 200, gems: 15 },
  Gold: { coins: 350, gems: 30 },
  Platinum: { coins: 550, gems: 50 },
  Diamond: { coins: 800, gems: 80 },
  Master: { coins: 1100, gems: 120 },
  Grandmaster: { coins: 1500, gems: 170 },
  Legend: { coins: 2200, gems: 250 },
};
