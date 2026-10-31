import type { AIDifficulty } from "@/lib/game-engine";

const colors: Record<AIDifficulty, string> = { Rookie: "#a4e45c", Tactician: "#ffad5b", Mastermind: "#b8a3ed", Oracle: "#6fd4db" };
export default function BotMascot({ difficulty, mood = "idle" }: { difficulty: AIDifficulty; mood?: "idle" | "win" | "lose" | "thinking" }) {
  const color = colors[difficulty];
  return <svg className="mascot" viewBox="0 0 80 80" role="img" aria-label={`${difficulty} bot, ${mood}`}>
    {difficulty === "Tactician" && <path d="M13 29 11 7 30 19M50 19 69 7 67 29" fill={color} stroke="#24364b" strokeWidth="3" strokeLinejoin="round"/>}
    {difficulty === "Mastermind" && <path d="M17 23 15 10 30 18M50 18 65 10 63 23" fill={color} stroke="#24364b" strokeWidth="3"/>}
    {difficulty === "Oracle" && <path d="M40 5 46 16 40 22 34 16Z" fill="#ffe084" stroke="#24364b" strokeWidth="3"/>}
    <rect x="11" y="17" width="58" height="52" rx="24" fill={color} stroke="#24364b" strokeWidth="3"/>
    <ellipse cx="30" cy="39" rx="5" ry={mood === "win" ? 2 : 7} fill="#24364b"/><ellipse cx="50" cy="39" rx="5" ry={mood === "win" ? 2 : 7} fill="#24364b"/>
    <path d={mood === "lose" ? "M33 55 Q40 48 47 55" : "M33 51 Q40 59 47 51"} fill="none" stroke="#24364b" strokeWidth="3" strokeLinecap="round"/>
    <path d="M26 70v4M54 70v4" stroke="#24364b" strokeWidth="4" strokeLinecap="round"/>
  </svg>;
}
