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
}

export const MORE_GAME_CATEGORIES: ("All" | MoreGameCategory)[] = [
  "All",
  "Arcade",
  "Puzzle",
  "Cards & Board",
  "Classics",
];

export const MORE_GAMES: MoreGame[] = [
  { slug: "2048", title: "2048", emoji: "🔢", color: "linear-gradient(135deg,#FFC800,#FF7A18)", category: "Puzzle", blurb: "Slide tiles, merge numbers — can you reach 2048?", controls: "both" },
  { slug: "snake", title: "Snake", emoji: "🐍", color: "linear-gradient(135deg,#58CC02,#1F9D55)", category: "Classics", blurb: "Eat the apples, grow long, don't bite yourself!", controls: "keyboard" },
  { slug: "flappy-bird", title: "Flappy Bird", emoji: "🐤", color: "linear-gradient(135deg,#1CB0F6,#7B5CFF)", category: "Arcade", blurb: "Tap to flap through the pipes. Simple... and brutal!", controls: "both" },
  { slug: "candy-crush", title: "Candy Crush", emoji: "🍬", color: "linear-gradient(135deg,#FF4B6E,#A560E8)", category: "Puzzle", blurb: "Swap candies and match 3 or more to score.", controls: "touch" },
  { slug: "doodle-jump", title: "Doodle Jump", emoji: "🐸", color: "linear-gradient(135deg,#2EE6A8,#1CB0F6)", category: "Arcade", blurb: "Bounce platform to platform, as high as you can!", controls: "keyboard" },
  { slug: "dino-run", title: "Dino Run", emoji: "🦖", color: "linear-gradient(135deg,#8A97AD,#5B6ABF)", category: "Arcade", blurb: "The famous offline dinosaur jumping game.", controls: "both" },
  { slug: "breakout", title: "Breakout", emoji: "🧱", color: "linear-gradient(135deg,#FF7A18,#FF4B4B)", category: "Arcade", blurb: "Bounce the ball and smash every brick.", controls: "both" },
  { slug: "space-invaders", title: "Space Invaders", emoji: "👾", color: "linear-gradient(135deg,#7B5CFF,#26283B)", category: "Arcade", blurb: "Defend Earth from waves of alien invaders!", controls: "keyboard" },
  { slug: "fighting-game", title: "Samurai Fighting", emoji: "🥋", color: "linear-gradient(135deg,#E85D04,#9D0208)", category: "Arcade", blurb: "2-player sword fighting on one keyboard.", controls: "keyboard" },
  { slug: "tower-defense", title: "Tower Defense", emoji: "🏰", color: "linear-gradient(135deg,#1899D6,#0B5FFF)", category: "Arcade", blurb: "Build towers and stop the enemy waves.", controls: "both" },
  { slug: "whac-a-mole", title: "Whac-a-Mole", emoji: "🔨", color: "linear-gradient(135deg,#B0703C,#7C4A21)", category: "Arcade", blurb: "Whack the moles, dodge the piranha plants!", controls: "touch" },
  { slug: "dash", title: "Dash Racer", emoji: "🏎️", color: "linear-gradient(135deg,#14D4C5,#0E7C66)", category: "Arcade", blurb: "Retro racer — dodge the trees and go for distance.", controls: "keyboard" },
  { slug: "wordle", title: "Wordle", emoji: "🟩", color: "linear-gradient(135deg,#58CC02,#B8A11A)", category: "Puzzle", blurb: "Guess the hidden 5-letter word in 6 tries.", controls: "keyboard" },
  { slug: "minesweeper", title: "Minesweeper", emoji: "💣", color: "linear-gradient(135deg,#5B8DEF,#8A97AD)", category: "Puzzle", blurb: "Clear the field without blowing up a mine.", controls: "touch" },
  { slug: "sudoku", title: "Sudoku", emoji: "🧮", color: "linear-gradient(135deg,#4C6FFF,#1CB0F6)", category: "Puzzle", blurb: "Fill the grid — every row, column and box 1–9.", controls: "touch" },
  { slug: "puzzle-game", title: "Jigsaw Puzzle", emoji: "🧩", color: "linear-gradient(135deg,#A560E8,#FF4B6E)", category: "Puzzle", blurb: "Drag the pieces to rebuild the picture.", controls: "touch" },
  { slug: "slide-puzzle", title: "Slide Puzzle", emoji: "🖼️", color: "linear-gradient(135deg,#F59E0B,#EF4444)", category: "Puzzle", blurb: "Slide the tiles into the right order.", controls: "touch" },
  { slug: "blackjack", title: "Blackjack", emoji: "🃏", color: "linear-gradient(135deg,#0E7C66,#14532D)", category: "Cards & Board", blurb: "Beat the dealer — closest to 21 wins.", controls: "touch" },
  { slug: "pokemon-cards", title: "Pokémon Cards", emoji: "⚡", color: "linear-gradient(135deg,#FFC800,#FF4B4B)", category: "Cards & Board", blurb: "Draw a random classic trading card. What will you get?", controls: "touch" },
  { slug: "connect4", title: "Connect 4", emoji: "🔴", color: "linear-gradient(135deg,#FF4B4B,#1CB0F6)", category: "Cards & Board", blurb: "Drop discs — first to connect 4 wins (2 players).", controls: "touch" },
  { slug: "rock-paper-scissors", title: "Rock Paper Scissors", emoji: "✊", color: "linear-gradient(135deg,#FF9600,#FF4B6E)", category: "Cards & Board", blurb: "Outsmart the computer in the timeless duel.", controls: "touch" },
  { slug: "pong", title: "Pong", emoji: "🏓", color: "linear-gradient(135deg,#334155,#0F172A)", category: "Classics", blurb: "The original video game! 2 players, one keyboard.", controls: "keyboard" },
  { slug: "key-codes", title: "Key Tester", emoji: "⌨️", color: "linear-gradient(135deg,#64748B,#334155)", category: "Classics", blurb: "Press any key to reveal its secret code.", controls: "keyboard" },
];
