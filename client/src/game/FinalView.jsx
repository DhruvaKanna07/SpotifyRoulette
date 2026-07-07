import Avatar from '../components/Avatar.jsx';

export default function FinalView({ final, meId, isHost, onPlayAgain, onLeave }) {
  const board = final.scoreboard;
  const top = board[0]?.score ?? 0;
  const winners = board.filter((p) => p.score === top && top > 0);

  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-8 text-center">
      <div className="text-6xl">🏆</div>
      <div>
        <p className="text-sm uppercase tracking-wide text-ink-dim">
          {winners.length > 1 ? "It's a tie!" : 'Winner'}
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          {winners.map((w) => (
            <div key={w.id} className="flex flex-col items-center gap-1">
              <Avatar player={w} size="lg" />
              <span className="font-extrabold">{w.displayName}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="card p-4 text-left">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">
          Final scores
        </h2>
        <ol className="space-y-1.5">
          {board.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3">
              <span className="w-5 text-center font-bold text-ink-dim">{i + 1}</span>
              <Avatar player={p} size="sm" />
              <span className="flex-1 truncate font-semibold">
                {p.displayName}
                {p.id === meId && <span className="text-ink-dim"> (you)</span>}
              </span>
              <span className="font-extrabold tabular-nums">{p.score}</span>
            </li>
          ))}
        </ol>
      </section>

      {isHost ? (
        <button
          onClick={onPlayAgain}
          className="w-full rounded-full bg-good px-6 py-4 text-lg font-extrabold text-[#08301f] transition active:scale-95"
        >
          Play again
        </button>
      ) : (
        <p className="text-sm text-ink-dim">Waiting for the host to restart…</p>
      )}
      <button onClick={onLeave} className="text-sm text-ink-dim underline">
        Leave room
      </button>
    </main>
  );
}
