"use client";

interface GuessEntry {
  id: string;
  playerSlot: 1 | 2;
  playerName: string;
  guess: string;
  points: number;
  orders: number;
  isTimeout: boolean;
  turnNumber: number;
  timestamp: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  guesses: GuessEntry[];
  player1Name: string;
  player2Name: string;
  winnerName: string | null;
  yourSlot: 1 | 2;
}

export default function MatchReplay({
  open,
  onClose,
  guesses,
  player1Name,
  player2Name,
  winnerName,
  yourSlot,
}: Props) {
  if (!open) return null;

  const sorted = [...guesses].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-3 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-hidden rounded-3xl bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3">
          <div>
            <h2 className="font-bold text-white">Match Replay</h2>
            <p className="text-xs text-emerald-100">
              {winnerName ? `Winner: ${winnerName}` : "Finished"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/20 px-3 py-1 text-sm text-white"
          >
            Close
          </button>
        </div>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
          {sorted.length === 0 && (
            <p className="text-center text-sm text-slate-400">No guesses recorded.</p>
          )}
          {sorted.map((g, i) => {
            const isYou = g.playerSlot === yourSlot;
            return (
              <div
                key={g.id || i}
                className={`rounded-2xl border p-3 ${
                  isYou
                    ? "border-emerald-500/40 bg-emerald-950/40"
                    : "border-slate-700 bg-slate-800/60"
                }`}
              >
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Turn {g.turnNumber} · {g.playerName}
                    {isYou ? " (You)" : ""}
                  </span>
                  <span>
                    {g.timestamp
                      ? new Date(g.timestamp).toLocaleTimeString()
                      : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-bold tracking-widest text-white">
                    {g.isTimeout ? "⏱ SKIP" : g.guess}
                  </span>
                  {!g.isTimeout && (
                    <div className="flex gap-2 text-sm">
                      <span className="rounded-lg bg-amber-500/20 px-2 py-0.5 text-amber-300">
                        {g.points}P
                      </span>
                      <span className="rounded-lg bg-sky-500/20 px-2 py-0.5 text-sky-300">
                        {g.orders}O
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-700 px-4 py-3 text-center text-xs text-slate-500">
          {player1Name} vs {player2Name}
        </div>
      </div>
    </div>
  );
}
