export type AIDifficulty = "Rookie" | "Tactician" | "Mastermind" | "Oracle";

export type TurnTimerOption = 15 | 30 | 45 | 60 | 90 | 0; // 0 = Unlimited

export type DivisionName =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Master"
  | "Grandmaster"
  | "Legend";

export interface DivisionInfo {
  name: DivisionName;
  minTrophies: number;
  maxTrophies: number;
  color: string;
  bgGradient: string;
  borderColor: string;
  badgeEmoji: string;
  winRewardCoins: number;
}

export const DIVISIONS: DivisionInfo[] = [
  {
    name: "Bronze",
    minTrophies: 0,
    maxTrophies: 99,
    color: "#CD7F32",
    bgGradient: "from-amber-700 to-amber-900",
    borderColor: "#9A5B1A",
    badgeEmoji: "🥉",
    winRewardCoins: 35,
  },
  {
    name: "Silver",
    minTrophies: 100,
    maxTrophies: 249,
    color: "#94A3B8",
    bgGradient: "from-slate-400 to-slate-600",
    borderColor: "#64748B",
    badgeEmoji: "🥈",
    winRewardCoins: 50,
  },
  {
    name: "Gold",
    minTrophies: 250,
    maxTrophies: 449,
    color: "#FFC800",
    bgGradient: "from-yellow-400 to-amber-500",
    borderColor: "#D97706",
    badgeEmoji: "🥇",
    winRewardCoins: 70,
  },
  {
    name: "Platinum",
    minTrophies: 450,
    maxTrophies: 699,
    color: "#06B6D4",
    bgGradient: "from-cyan-400 to-teal-600",
    borderColor: "#0891B2",
    badgeEmoji: "💠",
    winRewardCoins: 95,
  },
  {
    name: "Diamond",
    minTrophies: 700,
    maxTrophies: 999,
    color: "#1CB0F6",
    bgGradient: "from-sky-400 to-blue-600",
    borderColor: "#0284C7",
    badgeEmoji: "💎",
    winRewardCoins: 120,
  },
  {
    name: "Master",
    minTrophies: 1000,
    maxTrophies: 1399,
    color: "#CE82FF",
    bgGradient: "from-purple-500 to-indigo-700",
    borderColor: "#7E22CE",
    badgeEmoji: "🔮",
    winRewardCoins: 155,
  },
  {
    name: "Grandmaster",
    minTrophies: 1400,
    maxTrophies: 1899,
    color: "#FF4B4B",
    bgGradient: "from-rose-500 to-red-700",
    borderColor: "#BE123C",
    badgeEmoji: "👑",
    winRewardCoins: 200,
  },
  {
    name: "Legend",
    minTrophies: 1900,
    maxTrophies: 99999,
    color: "#58CC02",
    bgGradient: "from-lime-400 via-emerald-500 to-teal-600",
    borderColor: "#15803D",
    badgeEmoji: "⚡",
    winRewardCoins: 280,
  },
];

export function getDivisionForTrophies(trophies: number): DivisionInfo {
  const safe = Math.max(0, trophies);
  for (let i = DIVISIONS.length - 1; i >= 0; i--) {
    if (safe >= DIVISIONS[i].minTrophies) {
      return DIVISIONS[i];
    }
  }
  return DIVISIONS[0];
}

/**
 * Validates that a code is strictly 4 unique digits from 1-9.
 */
export function isValidSecretCode(code: string): boolean {
  if (!code || code.length !== 4) return false;
  if (!/^[1-9]{4}$/.test(code)) return false;
  const unique = new Set(code.split(""));
  return unique.size === 4;
}

/**
 * Generates a random valid 4-digit secret code using unique digits 1-9.
 */
export function generateRandomCode(): string {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  for (let i = digits.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, 4).join("");
}

/**
 * Evaluates a 4-digit guess against a 4-digit secret code.
 * - Points: number of correct digits in ANY position (0-4)
 * - Orders: number of correct digits in the EXACT correct position (0-4)
 * First player to reach 4 Points + 4 Orders wins!
 */
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
    if (secretSet.has(guess[i])) {
      points++;
    }
    if (secret[i] === guess[i]) {
      orders++;
    }
  }

  return {
    points,
    orders,
    isWin: points === 4 && orders === 4,
  };
}

let cachedAllPermutations: string[] | null = null;

/**
 * Returns all 3,024 valid 4-digit codes (unique digits 1-9).
 */
export function getAllValidCodes(): string[] {
  if (cachedAllPermutations) return cachedAllPermutations;
  const results: string[] = [];
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  for (let a = 0; a < 9; a++) {
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
  }
  cachedAllPermutations = results;
  return results;
}

export interface PastGuessFeedback {
  guess: string;
  points: number;
  orders: number;
}

/**
 * AI Solver for the 4 Difficulty Levels:
 * - Rookie: Random untried valid 4-digit code.
 * - Tactician: Eliminates digits from 0-point guesses and matches the last turn's Points count.
 * - Mastermind: Filters all 3,024 candidates for full consistency with all past guesses.
 * - Oracle: Full constraint solver + information-gain (entropy/minimax) selection so it solves rapidly (4-6 turns) while remaining fair and beatable.
 */
export function computeAINextGuess(
  difficulty: AIDifficulty,
  aiPastGuesses: PastGuessFeedback[]
): { guess: string; candidateCount: number; thoughtText: string } {
  const allCodes = getAllValidCodes();
  const triedSet = new Set(aiPastGuesses.map((g) => g.guess));
  const validHistory = aiPastGuesses.filter((g) => isValidSecretCode(g.guess));

  // First turn opening move
  if (validHistory.length === 0) {
    const opener = generateRandomCode();
    return {
      guess: opener,
      candidateCount: 3024,
      thoughtText:
        difficulty === "Oracle"
          ? "Scanning 3,024 quantum permutations..."
          : difficulty === "Mastermind"
          ? "Deploying opening probe..."
          : "Picking a lucky 4-digit starter!",
    };
  }

  // 1. ROOKIE: Completely random untried code
  if (difficulty === "Rookie") {
    const untried = allCodes.filter((c) => !triedSet.has(c));
    const pick = untried[Math.floor(Math.random() * untried.length)] || generateRandomCode();
    return {
      guess: pick,
      candidateCount: untried.length,
      thoughtText: "Hmm, let me try these shiny numbers!",
    };
  }

  // 2. TACTICIAN: Avoids digits from 0-point guesses and checks consistency with only the latest guess
  if (difficulty === "Tactician") {
    const bannedDigits = new Set<string>();
    for (const h of validHistory) {
      if (h.points === 0) {
        for (const ch of h.guess) bannedDigits.add(ch);
      }
    }
    const last = validHistory[validHistory.length - 1];
    let pool = allCodes.filter((code) => {
      if (triedSet.has(code)) return false;
      for (const ch of code) {
        if (bannedDigits.has(ch)) return false;
      }
      const ev = evaluateGuess(code, last.guess);
      return ev.points === last.points;
    });

    if (pool.length === 0) {
      pool = allCodes.filter((c) => !triedSet.has(c));
    }
    const pick = pool[Math.floor(Math.random() * pool.length)] || generateRandomCode();
    return {
      guess: pick,
      candidateCount: pool.length,
      thoughtText: `Narrowed down to ~${pool.length} tactical patterns!`,
    };
  }

  // Full consistency filter for Mastermind & Oracle
  let consistentPool = allCodes.filter((candidate) => {
    if (triedSet.has(candidate)) return false;
    for (const h of validHistory) {
      const ev = evaluateGuess(candidate, h.guess);
      if (ev.points !== h.points || ev.orders !== h.orders) {
        return false;
      }
    }
    return true;
  });

  if (consistentPool.length === 0) {
    consistentPool = allCodes.filter((c) => !triedSet.has(c));
  }

  // 3. MASTERMIND: Picks randomly from strictly consistent candidates (with slight noise on turn 2)
  if (difficulty === "Mastermind") {
    if (validHistory.length === 1 && consistentPool.length > 20) {
      // Second probe tries to test unprobed digits while staying consistent
      const firstDigits = new Set(validHistory[0].guess.split(""));
      const diverse = consistentPool.filter((c) => {
        let overlap = 0;
        for (const ch of c) if (firstDigits.has(ch)) overlap++;
        return overlap === validHistory[0].points;
      });
      if (diverse.length > 0) consistentPool = diverse;
    }
    const pick =
      consistentPool[Math.floor(Math.random() * consistentPool.length)] ||
      generateRandomCode();
    return {
      guess: pick,
      candidateCount: consistentPool.length,
      thoughtText: `${consistentPool.length} viable codes remain in matrix.`,
    };
  }

  // 4. ORACLE: Information-gain entropy scoring over consistent candidates
  if (consistentPool.length === 1) {
    return {
      guess: consistentPool[0],
      candidateCount: 1,
      thoughtText: "Target lock acquired. 1 possibility left!",
    };
  }

  // Sample up to 65 candidates from consistentPool to evaluate partition entropy quickly
  const sampleSize = Math.min(consistentPool.length, 65);
  const step = Math.max(1, Math.floor(consistentPool.length / sampleSize));
  const sampledCandidates: string[] = [];
  for (let i = 0; i < consistentPool.length && sampledCandidates.length < sampleSize; i += step) {
    sampledCandidates.push(consistentPool[i]);
  }

  let bestCandidate = sampledCandidates[0];
  let bestScore = -1;

  for (const probe of sampledCandidates) {
    const buckets = new Map<string, number>();
    for (const target of sampledCandidates) {
      const ev = evaluateGuess(target, probe);
      const key = `${ev.points}-${ev.orders}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);
    }
    // Shannon entropy calculation: higher entropy = more balanced split of remaining possibilities
    let entropy = 0;
    for (const count of buckets.values()) {
      const p = count / sampledCandidates.length;
      entropy -= p * Math.log2(p);
    }
    if (entropy > bestScore) {
      bestScore = entropy;
      bestCandidate = probe;
    }
  }

  // To keep Oracle beatable (yet thrillingly smart), on turn 2 we allow a 20% chance of picking a random consistent candidate
  if (validHistory.length === 1 && Math.random() < 0.2 && consistentPool.length > 2) {
    bestCandidate = consistentPool[Math.floor(Math.random() * consistentPool.length)];
  }

  return {
    guess: bestCandidate,
    candidateCount: consistentPool.length,
    thoughtText: `Oracle entropy lock: ${consistentPool.length} possibilities left.`,
  };
}

export interface AIProfileConfig {
  difficulty: AIDifficulty;
  name: string;
  title: string;
  emoji: string;
  tagline: string;
  color: string;
  borderColor: string;
  rewardCoins: number;
  rewardXp: number;
  trophyDelta: number;
}

export const AI_PROFILES: Record<AIDifficulty, AIProfileConfig> = {
  Rookie: {
    difficulty: "Rookie",
    name: "Pip the Chick",
    title: "Rookie Bot",
    emoji: "🐣",
    tagline: "Playful & impulsive. Great for warming up!",
    color: "#58CC02",
    borderColor: "#46A302",
    rewardCoins: 45,
    rewardXp: 50,
    trophyDelta: 15,
  },
  Tactician: {
    difficulty: "Tactician",
    name: "Sly Fox",
    title: "Tactician Bot",
    emoji: "🦊",
    tagline: "Eliminates dead digits and tracks Points.",
    color: "#1CB0F6",
    borderColor: "#1899D6",
    rewardCoins: 80,
    rewardXp: 85,
    trophyDelta: 25,
  },
  Mastermind: {
    difficulty: "Mastermind",
    name: "Professor Hoot",
    title: "Mastermind Bot",
    emoji: "🦉",
    tagline: "Full logic solver. Every clue counts!",
    color: "#CE82FF",
    borderColor: "#A560E8",
    rewardCoins: 130,
    rewardXp: 140,
    trophyDelta: 35,
  },
  Oracle: {
    difficulty: "Oracle",
    name: "Aethelgard",
    title: "The Grand Oracle",
    emoji: "🔮",
    tagline: "Entropy-driven genius. Hard, thrilling & beatable!",
    color: "#FF4B4B",
    borderColor: "#EA2B2B",
    rewardCoins: 220,
    rewardXp: 250,
    trophyDelta: 50,
  },
};

export interface SeasonPassTier {
  tier: number;
  xpRequired: number;
  freeReward: {
    id: string;
    name: string;
    type: "coins" | "gems" | "frame" | "title" | "theme" | "effect";
    icon: string;
    amount?: number;
  };
  premiumReward: {
    id: string;
    name: string;
    type: "coins" | "gems" | "frame" | "title" | "theme" | "effect";
    icon: string;
    amount?: number;
  };
}

export const SEASON_PASS_TIERS: SeasonPassTier[] = [
  {
    tier: 1,
    xpRequired: 100,
    freeReward: { id: "coins_100", name: "150 Clash Coins", type: "coins", icon: "🪙", amount: 150 },
    premiumReward: { id: "frame_neon", name: "Cyber Neon Frame", type: "frame", icon: "⚡" },
  },
  {
    tier: 2,
    xpRequired: 300,
    freeReward: { id: "title_sleuth", name: "Title: Digit Sleuth", type: "title", icon: "🕵️" },
    premiumReward: { id: "gems_40", name: "40 Royal Gems", type: "gems", icon: "💎", amount: 40 },
  },
  {
    tier: 3,
    xpRequired: 600,
    freeReward: { id: "frame_solar", name: "Solar Flare Frame", type: "frame", icon: "☀️" },
    premiumReward: { id: "theme_cyber", name: "Cyber Arcade Theme", type: "theme", icon: "🕹️" },
  },
  {
    tier: 4,
    xpRequired: 1000,
    freeReward: { id: "gems_25", name: "25 Royal Gems", type: "gems", icon: "💎", amount: 25 },
    premiumReward: { id: "effect_lightning", name: "Thunder Strike Finish", type: "effect", icon: "🌩️" },
  },
  {
    tier: 5,
    xpRequired: 1500,
    freeReward: { id: "coins_300", name: "300 Clash Coins", type: "coins", icon: "🪙", amount: 300 },
    premiumReward: { id: "frame_dragon", name: "Dragonfire Aura Frame", type: "frame", icon: "🐉" },
  },
  {
    tier: 6,
    xpRequired: 2100,
    freeReward: { id: "theme_royal", name: "Royal Velvet Theme", type: "theme", icon: "👑" },
    premiumReward: { id: "title_oracle_slayer", name: "Title: Oracle Slayer", type: "title", icon: "🔮" },
  },
  {
    tier: 7,
    xpRequired: 2800,
    freeReward: { id: "effect_stars", name: "Supernova Burst", type: "effect", icon: "🌟" },
    premiumReward: { id: "frame_celestial", name: "Celestial Legend Frame", type: "frame", icon: "🌌" },
  },
];

export interface CosmeticItem {
  id: string;
  name: string;
  category: "frame" | "theme" | "effect" | "title";
  icon: string;
  description: string;
  priceCoins?: number;
  priceGems?: number;
  previewStyle: string;
}

export const COSMETIC_SHOP_ITEMS: CosmeticItem[] = [
  {
    id: "frame_emerald",
    name: "Emerald Sprout Frame",
    category: "frame",
    icon: "🌿",
    description: "Classic Duolingo-green victory ring.",
    priceCoins: 0,
    previewStyle: "ring-4 ring-[#58CC02] bg-lime-100",
  },
  {
    id: "frame_gold",
    name: "Solar Gold Crown",
    category: "frame",
    icon: "👑",
    description: "Gleaming gold ring for sharp tacticians.",
    priceCoins: 350,
    previewStyle: "ring-4 ring-[#FFC800] bg-amber-100",
  },
  {
    id: "frame_neon",
    name: "Cyber Neon Frame",
    category: "frame",
    icon: "⚡",
    description: "Electric blue & violet pulse border.",
    priceGems: 45,
    previewStyle: "ring-4 ring-[#1CB0F6] bg-sky-100",
  },
  {
    id: "frame_dragon",
    name: "Dragonfire Aura Frame",
    category: "frame",
    icon: "🐉",
    description: "Blazing crimson frame of Grandmasters.",
    priceGems: 80,
    previewStyle: "ring-4 ring-[#FF4B4B] bg-rose-100",
  },
  {
    id: "frame_celestial",
    name: "Celestial Legend Frame",
    category: "frame",
    icon: "🌌",
    description: "Cosmic amethyst & gold mythic border.",
    priceGems: 110,
    previewStyle: "ring-4 ring-[#CE82FF] bg-purple-100",
  },
  {
    id: "theme_classic",
    name: "Warm Cream Arcade",
    category: "theme",
    icon: "🎨",
    description: "Signature playful tactile cream board.",
    priceCoins: 0,
    previewStyle: "bg-[#FFFDF7] border-[#E5E0D5]",
  },
  {
    id: "theme_cyber",
    name: "Neon Synth Board",
    category: "theme",
    icon: "🕹️",
    description: "High-contrast sky & indigo vault styling.",
    priceCoins: 500,
    previewStyle: "bg-sky-50 border-sky-300",
  },
  {
    id: "theme_royal",
    name: "Royal Velvet Vault",
    category: "theme",
    icon: "👑",
    description: "Regal amethyst and gold accents.",
    priceGems: 60,
    previewStyle: "bg-purple-50 border-purple-300",
  },
  {
    id: "effect_confetti",
    name: "Party Confetti Cannon",
    category: "effect",
    icon: "🎉",
    description: "Explodes with vibrant confetti when you crack a code!",
    priceCoins: 0,
    previewStyle: "bg-lime-50",
  },
  {
    id: "effect_lightning",
    name: "Thunder Strike Finish",
    category: "effect",
    icon: "🌩️",
    description: "Electric gold & cyan sparks on victory.",
    priceCoins: 450,
    previewStyle: "bg-amber-50",
  },
  {
    id: "effect_stars",
    name: "Supernova Starfall",
    category: "effect",
    icon: "🌟",
    description: "Showers the arena with golden stars.",
    priceGems: 55,
    previewStyle: "bg-indigo-50",
  },
  {
    id: "title_breaker",
    name: "Code Breaker",
    category: "title",
    icon: "🔓",
    description: "Equipped profile title.",
    priceCoins: 0,
    previewStyle: "bg-slate-100",
  },
  {
    id: "title_grand_cipher",
    name: "Grand Cipher",
    category: "title",
    icon: "🧠",
    description: "Show opponents you see every permutation.",
    priceCoins: 400,
    previewStyle: "bg-amber-100",
  },
  {
    id: "title_oracle_slayer",
    name: "Oracle Slayer",
    category: "title",
    icon: "🔮",
    description: "Reserved for those who outsmart Aethelgard.",
    priceGems: 75,
    previewStyle: "bg-rose-100",
  },
];

export interface DailyQuestItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  target: number;
  rewardCoins: number;
  rewardXp: number;
  rewardGems?: number;
}

export const DAILY_QUESTS: DailyQuestItem[] = [
  {
    id: "quest_play_2",
    title: "Code Warmup",
    description: "Complete 2 matches in any mode",
    icon: "🎯",
    target: 2,
    rewardCoins: 120,
    rewardXp: 150,
  },
  {
    id: "quest_orders_8",
    title: "Precision Lock",
    description: "Score 8 total Orders (green hits) across matches",
    icon: "🟢",
    target: 8,
    rewardCoins: 180,
    rewardXp: 200,
  },
  {
    id: "quest_beat_ai",
    title: "Bot Hunter",
    description: "Defeat any AI opponent or win a 1v1 match",
    icon: "🤖",
    target: 1,
    rewardCoins: 200,
    rewardXp: 250,
    rewardGems: 15,
  },
  {
    id: "quest_fast_win",
    title: "Speed Cipher",
    description: "Crack an opponent's code in 6 turns or fewer",
    icon: "⚡",
    target: 1,
    rewardCoins: 250,
    rewardXp: 300,
    rewardGems: 25,
  },
];

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  rewardGems: number;
}

export const ACHIEVEMENTS: AchievementItem[] = [
  {
    id: "first_crack",
    title: "First Crack!",
    description: "Achieve 4 Points + 4 Orders for the first time.",
    icon: "🔓",
    rewardGems: 20,
  },
  {
    id: "streak_3",
    title: "On Fire!",
    description: "Maintain a 3+ day play streak.",
    icon: "🔥",
    rewardGems: 25,
  },
  {
    id: "mind_reader",
    title: "Mind Reader",
    description: "Crack a secret code in 4 turns or fewer.",
    icon: "🧠",
    rewardGems: 50,
  },
  {
    id: "oracle_slayer",
    title: "Oracle Slayer",
    description: "Defeat Aethelgard (Oracle AI) in a 1v1 duel.",
    icon: "🔮",
    rewardGems: 100,
  },
  {
    id: "social_butterfly",
    title: "Squad Builder",
    description: "Follow 3 rivals and join a Club.",
    icon: "🤝",
    rewardGems: 30,
  },
];

/** Extra cosmetics — richer customization */
export const EXTRA_COSMETICS: CosmeticItem[] = [
  {
    id: "frame_obsidian",
    name: "Obsidian Edge",
    category: "frame",
    icon: "⬛",
    description: "Sharp black frame for serious competitors.",
    priceCoins: 600,
    previewStyle: "ring-4 ring-slate-800 bg-slate-200",
  },
  {
    id: "frame_aurora",
    name: "Aurora Borealis",
    category: "frame",
    icon: "aurora",
    description: "Shifting teal-to-violet glow ring.",
    priceGems: 95,
    previewStyle: "ring-4 ring-teal-400 bg-gradient-to-br from-teal-100 to-violet-100",
  },
  {
    id: "frame_pixel",
    name: "8-Bit Pixel Frame",
    category: "frame",
    icon: "👾",
    description: "Retro arcade border for pixel legends.",
    priceCoins: 420,
    previewStyle: "ring-4 ring-fuchsia-500 bg-fuchsia-50",
  },
  {
    id: "theme_midnight",
    name: "Midnight Arena",
    category: "theme",
    icon: "🌙",
    description: "Deep navy board with soft glow accents.",
    priceCoins: 550,
    previewStyle: "bg-slate-900 border-slate-600",
  },
  {
    id: "theme_sunset",
    name: "Sunset Duel",
    category: "theme",
    icon: "🌅",
    description: "Warm orange-to-rose play surface.",
    priceGems: 50,
    previewStyle: "bg-orange-50 border-orange-300",
  },
  {
    id: "theme_forest",
    name: "Forest Cipher",
    category: "theme",
    icon: "🌲",
    description: "Calm green woods aesthetic.",
    priceCoins: 380,
    previewStyle: "bg-emerald-50 border-emerald-300",
  },
  {
    id: "effect_fireworks",
    name: "Victory Fireworks",
    category: "effect",
    icon: "🎆",
    description: "Full-screen fireworks on a win.",
    priceGems: 70,
    previewStyle: "bg-rose-50",
  },
  {
    id: "effect_matrix",
    name: "Matrix Rain",
    category: "effect",
    icon: "💻",
    description: "Green code rain cascade on finish.",
    priceCoins: 520,
    previewStyle: "bg-green-50",
  },
  {
    id: "title_digit_lord",
    name: "Digit Lord",
    category: "title",
    icon: "♟️",
    description: "Command the board like a grandmaster.",
    priceCoins: 700,
    previewStyle: "bg-indigo-100",
  },
  {
    id: "title_streak_king",
    name: "Streak King",
    category: "title",
    icon: "🔥",
    description: "For players who never break the chain.",
    priceGems: 40,
    previewStyle: "bg-orange-100",
  },
  {
    id: "title_night_owl",
    name: "Night Owl",
    category: "title",
    icon: "🦉",
    description: "Late-night code cracker badge.",
    priceCoins: 280,
    previewStyle: "bg-slate-100",
  },
  {
    id: "title_socialite",
    name: "Arena Socialite",
    category: "title",
    icon: "💬",
    description: "Chat, follow, and duel in style.",
    priceCoins: 320,
    previewStyle: "bg-pink-100",
  },
];

/** Merge shop lists */
export function getAllShopItems(): CosmeticItem[] {
  return getFullShopCatalog();
}

export const EXTRA_ACHIEVEMENTS: AchievementItem[] = [
  {
    id: "win_10",
    title: "Decade of Cracks",
    description: "Win 10 matches total.",
    icon: "🔟",
    rewardGems: 40,
  },
  {
    id: "win_50",
    title: "Half Century",
    description: "Win 50 matches total.",
    icon: "5️⃣0️⃣",
    rewardGems: 120,
  },
  {
    id: "trophies_100",
    title: "Silver Climber",
    description: "Reach 100 trophies (Silver division).",
    icon: "🥈",
    rewardGems: 35,
  },
  {
    id: "trophies_250",
    title: "Gold Standard",
    description: "Reach 250 trophies (Gold division).",
    icon: "🥇",
    rewardGems: 60,
  },
  {
    id: "trophies_700",
    title: "Diamond Mind",
    description: "Reach 700 trophies (Diamond).",
    icon: "💎",
    rewardGems: 100,
  },
  {
    id: "perfect_game",
    title: "Perfect Cipher",
    description: "Win in 3 turns or fewer.",
    icon: "✨",
    rewardGems: 80,
  },
  {
    id: "comeback",
    title: "Comeback Kid",
    description: "Win after being behind on Orders early.",
    icon: "📈",
    rewardGems: 45,
  },
  {
    id: "daily_3",
    title: "Daily Devotee",
    description: "Complete 3 daily challenges.",
    icon: "📅",
    rewardGems: 55,
  },
  {
    id: "chatty",
    title: "Loud and Proud",
    description: "Send 20 chat messages.",
    icon: "🗣️",
    rewardGems: 25,
  },
  {
    id: "mastermind_beat",
    title: "Out-Thought",
    description: "Defeat Mastermind AI.",
    icon: "🦉",
    rewardGems: 55,
  },
];

export function getAllAchievements(): AchievementItem[] {
  return getFullAchievements();
}

/** Daily Challenge — rules change by day of year */
export type DailyChallengeRule =
  | "classic"
  | "speed_30"
  | "no_orders_hint"
  | "three_guess_max"
  | "mirror_digits"
  | "hard_ai_only";

export interface DailyChallengeInfo {
  id: string;
  dateKey: string;
  title: string;
  description: string;
  rule: DailyChallengeRule;
  icon: string;
  bonusMultiplier: number;
}

export function getDailyChallenge(date = new Date()): DailyChallengeInfo {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const dateKey = date.toISOString().slice(0, 10);

  const pool: Omit<DailyChallengeInfo, "id" | "dateKey">[] = [
    {
      title: "Classic Cipher",
      description: "Standard rules. Win for a small daily bonus.",
      rule: "classic",
      icon: "🔓",
      bonusMultiplier: 1.25,
    },
    {
      title: "Speed Rush",
      description: "Every turn is limited to 30 seconds. Think fast!",
      rule: "speed_30",
      icon: "⏱️",
      bonusMultiplier: 1.5,
    },
    {
      title: "Blind Orders",
      description: "You only see Points — Orders are hidden until the end.",
      rule: "no_orders_hint",
      icon: "🙈",
      bonusMultiplier: 1.6,
    },
    {
      title: "Three Strikes",
      description: "You have only 3 guesses. Make them count.",
      rule: "three_guess_max",
      icon: "3️⃣",
      bonusMultiplier: 2.0,
    },
    {
      title: "Mirror Mode",
      description: "Secret codes never use consecutive ascending digits.",
      rule: "mirror_digits",
      icon: "🪞",
      bonusMultiplier: 1.4,
    },
    {
      title: "Oracle Gauntlet",
      description: "Face Mastermind or harder AI only. Big rewards.",
      rule: "hard_ai_only",
      icon: "🔮",
      bonusMultiplier: 1.8,
    },
  ];

  const pick = pool[day % pool.length];
  return {
    id: `daily_${dateKey}`,
    dateKey,
    ...pick,
  };
}

/** Harder trophy curve — smaller gains, ranks climb slower */
export function computeTrophyDelta(
  won: boolean,
  mode: string,
  aiDifficulty?: string,
  baseFromProfile?: number
): number {
  let base = baseFromProfile ?? 20;
  if (mode === "online_1v1") base = 28;
  else if (mode === "hotseat" || mode === "local_offline") base = 18;
  else if (mode === "ai") {
    if (aiDifficulty === "Oracle") base = 42;
    else if (aiDifficulty === "Mastermind") base = 30;
    else if (aiDifficulty === "Tactician") base = 22;
    else base = 14;
  }
  if (!won) return -Math.max(8, Math.floor(base * 0.45));
  return base;
}

/** More shop items for deep customization */
export const MEGA_COSMETICS: CosmeticItem[] = [
  {
    id: "frame_hologram",
    name: "Hologram Prism",
    category: "frame",
    icon: "💎",
    description: "Iridescent prism frame that shifts with light.",
    priceGems: 120,
    previewStyle: "ring-4 ring-cyan-300 bg-gradient-to-br from-cyan-50 to-pink-50",
  },
  {
    id: "frame_volcanic",
    name: "Volcanic Core",
    category: "frame",
    icon: "🌋",
    description: "Molten orange-red border for aggressive players.",
    priceCoins: 900,
    previewStyle: "ring-4 ring-orange-600 bg-orange-100",
  },
  {
    id: "theme_candy",
    name: "Candy Arena",
    category: "theme",
    icon: "🍬",
    description: "Playful pink candy board for cheerful duels.",
    priceCoins: 480,
    previewStyle: "bg-pink-50 border-pink-300",
  },
  {
    id: "theme_ice",
    name: "Frozen Circuit",
    category: "theme",
    icon: "❄️",
    description: "Icy blue minimalist surface.",
    priceGems: 55,
    previewStyle: "bg-sky-50 border-sky-300",
  },
  {
    id: "effect_sparkle",
    name: "Gold Sparkle Burst",
    category: "effect",
    icon: "✨",
    description: "Golden sparkles explode on every win.",
    priceCoins: 400,
    previewStyle: "bg-amber-50",
  },
  {
    id: "effect_shockwave",
    name: "Shockwave Ring",
    category: "effect",
    icon: "💥",
    description: "Ripple shockwave when you crack the code.",
    priceGems: 65,
    previewStyle: "bg-red-50",
  },
  {
    id: "title_cipher_ghost",
    name: "Cipher Ghost",
    category: "title",
    icon: "👻",
    description: "Silent, deadly, always three steps ahead.",
    priceGems: 75,
    previewStyle: "bg-violet-100",
  },
  {
    id: "title_bronze_survivor",
    name: "Bronze Survivor",
    category: "title",
    icon: "🛡️",
    description: "Climbed out of Bronze the hard way.",
    priceCoins: 150,
    previewStyle: "bg-amber-100",
  },
  {
    id: "title_legend_candidate",
    name: "Legend Candidate",
    category: "title",
    icon: "🏅",
    description: "One step from the top of the world.",
    priceGems: 150,
    previewStyle: "bg-lime-100",
  },
];

/** Extended achievements — harder to earn */
export const MEGA_ACHIEVEMENTS: AchievementItem[] = [
  {
    id: "win_100",
    title: "Century Club",
    description: "Win 100 matches total.",
    icon: "💯",
    rewardGems: 200,
  },
  {
    id: "trophies_1000",
    title: "Master Threshold",
    description: "Reach 1000 trophies (Master division).",
    icon: "🔮",
    rewardGems: 150,
  },
  {
    id: "trophies_1900",
    title: "Living Legend",
    description: "Reach 1900 trophies (Legend division).",
    icon: "⚡",
    rewardGems: 300,
  },
  {
    id: "fast_2",
    title: "Two-Turn Miracle",
    description: "Win a match in exactly 2 guesses.",
    icon: "🚀",
    rewardGems: 150,
  },
  {
    id: "streak_7",
    title: "Week Warrior",
    description: "Keep a 7-day login streak.",
    icon: "📅",
    rewardGems: 80,
  },
  {
    id: "no_timeout",
    title: "Never Late",
    description: "Win 5 matches without a single timeout.",
    icon: "⏰",
    rewardGems: 40,
  },
  {
    id: "social_10",
    title: "Networked",
    description: "Follow 10 different players.",
    icon: "🌐",
    rewardGems: 50,
  },
  {
    id: "daily_7",
    title: "Challenge Addict",
    description: "Complete 7 daily challenges.",
    icon: "🎯",
    rewardGems: 100,
  },
];

// Patch getAllShopItems / getAllAchievements if they exist as simple returns —
// callers should use these helpers:
export function getFullShopCatalog(): CosmeticItem[] {
  return [...COSMETIC_SHOP_ITEMS, ...EXTRA_COSMETICS, ...MEGA_COSMETICS];
}

export function getFullAchievements(): AchievementItem[] {
  return [...ACHIEVEMENTS, ...EXTRA_ACHIEVEMENTS, ...MEGA_ACHIEVEMENTS];
}
