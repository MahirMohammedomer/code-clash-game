/**
 * Catalog for the "More Games" arcade.
 * The games themselves are community open-source mini-games bundled as static
 * files under /public/games/<slug>/ (each with its own README/attribution).
 * They run fully offline once loaded.
 */

export type MoreGameCategory = "Arcade" | "Puzzle" | "Cards & Board" | "Classics";

export interface MoreGame {
  slug: string;
  title: string;
  emoji: string;
  color: string; // gradient for the tile
  category: MoreGameCategory;
  blurb: string;
  /** "touch" = great on phones, "both" = touch + keyboard, "keyboard" = desktop best */
  controls: "touch" | "both" | "keyboard";
  /** Set for our six premium from-scratch remakes — opens a native game instead of an iframe. */
  native?:
    | "g2048" | "snake" | "flappy" | "gems" | "breakout" | "hopper"
    | "dino" | "defender" | "mole" | "mines" | "connect4" | "blackjack";
  /** Illustrated thumbnail under /public/arcade/. */
  thumb?: string;
  /** Shown big in the "Featured Remakes" rail. */
  featured?: boolean;
}

export const MORE_GAME_CATEGORIES: ("All" | MoreGameCategory)[] = [
  "All",
  "Arcade",
  "Puzzle",
  "Cards & Board",
  "Classics",
];

export const MORE_GAMES: MoreGame[] = [
  { slug: "2048", title: "2048 Merge", emoji: "🔢", color: "linear-gradient(135deg,#FFC800,#FF7A18)", category: "Puzzle", blurb: "REMAKE ★ Slide & merge to 2048 — smooth moves, undo, score pops!", controls: "both", native: "g2048", thumb: "/arcade/2048.jpg", featured: true },
  { slug: "snake", title: "Snake", emoji: "🐍", color: "linear-gradient(135deg,#58CC02,#1F9D55)", category: "Classics", blurb: "REMAKE ★ Silky-smooth snake, golden apples worth +50!", controls: "both", native: "snake", thumb: "/arcade/snake.jpg", featured: true },
  { slug: "flappy-bird", title: "Flappy Wings", emoji: "🐤", color: "linear-gradient(135deg,#1CB0F6,#7B5CFF)", category: "Arcade", blurb: "REMAKE ★ One-tap flying with medals to earn. Brutal & beautiful!", controls: "both", native: "flappy", thumb: "/arcade/flappy.jpg", featured: true },
  { slug: "candy-crush", title: "Gem Crush", emoji: "💎", color: "linear-gradient(135deg,#FF4B6E,#A560E8)", category: "Puzzle", blurb: "REMAKE ★ 60-second match-3 blitz with combos & FEVER mode!", controls: "both", native: "gems", thumb: "/arcade/gems.jpg", featured: true },
  { slug: "doodle-jump", title: "Sky Hopper", emoji: "🐸", color: "linear-gradient(135deg,#2EE6A8,#1CB0F6)", category: "Arcade", blurb: "REMAKE ★ Bounce to space! Springs, jetpacks & stompable blobs.", controls: "both", native: "hopper", thumb: "/arcade/hopper.jpg", featured: true },
  { slug: "dino-run", title: "Dino Dash", emoji: "🦖", color: "linear-gradient(135deg,#8A97AD,#5B6ABF)", category: "Arcade", blurb: "REMAKE ★ Endless desert sprint — leap cacti, duck pterodactyls!", controls: "both", native: "dino", thumb: "/arcade/dino.jpg", featured: true },
  { slug: "breakout", title: "Neon Breakout", emoji: "🧱", color: "linear-gradient(135deg,#FF7A18,#FF4B4B)", category: "Arcade", blurb: "REMAKE ★ Brick-smashing with levels, power-ups & multi-ball!", controls: "both", native: "breakout", thumb: "/arcade/breakout.jpg", featured: true },
  { slug: "space-invaders", title: "Star Defender", emoji: "👾", color: "linear-gradient(135deg,#7B5CFF,#26283B)", category: "Arcade", blurb: "REMAKE ★ Blast alien waves, grab power-ups, hunt the mothership!", controls: "both", native: "defender", thumb: "/arcade/defender.jpg", featured: true },
  { slug: "fighting-game", title: "Samurai Fighting", emoji: "🥋", color: "linear-gradient(135deg,#E85D04,#9D0208)", category: "Arcade", blurb: "2-player sword fighting on one keyboard.", controls: "keyboard" },
  { slug: "tower-defense", title: "Tower Defense", emoji: "🏰", color: "linear-gradient(135deg,#1899D6,#0B5FFF)", category: "Arcade", blurb: "Build towers and stop the enemy waves.", controls: "both" },
  { slug: "whac-a-mole", title: "Mole Mania", emoji: "🔨", color: "linear-gradient(135deg,#B0703C,#7C4A21)", category: "Arcade", blurb: "REMAKE ★ 45-second bonk frenzy — combos, golden moles, bombs!", controls: "both", native: "mole", thumb: "/arcade/mole.jpg", featured: true },
  { slug: "dash", title: "Dash Racer", emoji: "🏎️", color: "linear-gradient(135deg,#14D4C5,#0E7C66)", category: "Arcade", blurb: "Retro racer — dodge the trees and go for distance.", controls: "keyboard" },
  { slug: "wordle", title: "Wordle", emoji: "🟩", color: "linear-gradient(135deg,#58CC02,#B8A11A)", category: "Puzzle", blurb: "Guess the hidden 5-letter word in 6 tries.", controls: "keyboard" },
  { slug: "minesweeper", title: "Mine Sweeper", emoji: "💣", color: "linear-gradient(135deg,#5B8DEF,#8A97AD)", category: "Puzzle", blurb: "REMAKE ★ The classic, perfected — safe first tap, flags, best times.", controls: "both", native: "mines", thumb: "/arcade/mines.jpg", featured: true },
  { slug: "sudoku", title: "Sudoku", emoji: "🧮", color: "linear-gradient(135deg,#4C6FFF,#1CB0F6)", category: "Puzzle", blurb: "Fill the grid — every row, column and box 1–9.", controls: "touch" },
  { slug: "puzzle-game", title: "Jigsaw Puzzle", emoji: "🧩", color: "linear-gradient(135deg,#A560E8,#FF4B6E)", category: "Puzzle", blurb: "Drag the pieces to rebuild the picture.", controls: "touch" },
  { slug: "slide-puzzle", title: "Slide Puzzle", emoji: "🖼️", color: "linear-gradient(135deg,#F59E0B,#EF4444)", category: "Puzzle", blurb: "Slide the tiles into the right order.", controls: "touch" },
  { slug: "blackjack", title: "Blackjack 21", emoji: "🃏", color: "linear-gradient(135deg,#0E7C66,#14532D)", category: "Cards & Board", blurb: "REMAKE ★ Real casino flow — chips, doubles, 3:2 payouts, bankroll!", controls: "both", native: "blackjack", thumb: "/arcade/blackjack.jpg", featured: true },
  { slug: "pokemon-cards", title: "Pokémon Cards", emoji: "⚡", color: "linear-gradient(135deg,#FFC800,#FF4B4B)", category: "Cards & Board", blurb: "Draw a random classic trading card. What will you get?", controls: "touch" },
  { slug: "connect4", title: "Connect Four", emoji: "🔴", color: "linear-gradient(135deg,#FF4B4B,#1CB0F6)", category: "Cards & Board", blurb: "REMAKE ★ Outsmart the CPU (3 brains) or duel a friend!", controls: "both", native: "connect4", thumb: "/arcade/connect4.jpg", featured: true },
  { slug: "rock-paper-scissors", title: "Rock Paper Scissors", emoji: "✊", color: "linear-gradient(135deg,#FF9600,#FF4B6E)", category: "Cards & Board", blurb: "Outsmart the computer in the timeless duel.", controls: "touch" },
  { slug: "pong", title: "Pong", emoji: "🏓", color: "linear-gradient(135deg,#334155,#0F172A)", category: "Classics", blurb: "The original video game! 2 players, one keyboard.", controls: "keyboard" },
  { slug: "key-codes", title: "Key Tester", emoji: "⌨️", color: "linear-gradient(135deg,#64748B,#334155)", category: "Classics", blurb: "Press any key to reveal its secret code.", controls: "keyboard" },
];
