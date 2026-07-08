import Avatar from '../components/Avatar.jsx';

// Answer key + scoring for a Match-Up round. Shows each song's true owner and,
// for the viewer, whether their own pick was right.
export default function MatchRevealView({ reveal, meId, isHost, onNext }) {
  const isLast = reveal.round >= reveal.totalRounds;
  const mine = reveal.results.find((r) => r.player.id === meId);
  const players = new Map(reveal.songs.map((s) => [s.ownerId, s.owner]));

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <header className="text-center">
        <p className="text-xs uppercase tracking-wide text-ink-dim">
          Round {reveal.round} of {reveal.totalRounds} · {reveal.periodLabel}
        </p>
        <h1 className="text-2xl font-extrabold">{reveal.rankLabel}</h1>
        {mine && (
          <p className="mt-1 text-lg font-bold text-good">
            You got {mine.correct}/{mine.total} right
            {mine.roundScore > 0 && <span> · +{mine.roundScore}</span>}
          </p>
        )}
      </header>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">Answer key</h2>
        <ul className="space-y-3">
          {reveal.songs.map((s) => {
            const myPick = mine?.assignment?.[s.cardId] ?? null;
            const gotIt = myPick === s.ownerId;
            const pickedPlayer = myPick ? players.get(myPick) : null;
            return (
              <li key={s.cardId} className="flex items-center gap-3">
                {s.track.albumArtUrl ? (
                  <img src={s.track.albumArtUrl} alt="" className="h-12 w-12 rounded-md" />
                ) : (
                  <div className="grid h-12 w-12 place-items-center rounded-md bg-bg-raised text-xl">
                    🎵
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold leading-tight">{s.track.name}</p>
                  <div className="flex items-center gap-1.5 text-sm">
                    {s.owner && <Avatar player={s.owner} size="sm" />}
                    <span className="truncate font-semibold">{s.owner?.displayName}</span>
                  </div>
                </div>
                {mine &&
                  (gotIt ? (
                    <span className="text-lg">✅</span>
                  ) : (
                    <span className="flex flex-col items-end text-right">
                      <span className="text-lg">❌</span>
                      {pickedPlayer && (
                        <span className="text-[10px] text-ink-dim">
                          you said {pickedPlayer.displayName}
                        </span>
                      )}
                    </span>
                  ))}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">Scoreboard</h2>
        <ol className="space-y-1.5">
          {reveal.scoreboard.map((p, i) => {
            const delta = reveal.roundScores[p.id] ?? 0;
            return (
              <li key={p.id} className="flex items-center gap-3">
                <span className="w-5 text-center font-bold text-ink-dim">{i + 1}</span>
                <Avatar player={p} size="sm" />
                <span className="flex-1 truncate font-semibold">
                  {p.displayName}
                  {p.id === meId && <span className="text-ink-dim"> (you)</span>}
                </span>
                {delta > 0 && <span className="text-xs font-bold text-good">+{delta}</span>}
                <span className="w-12 text-right font-extrabold tabular-nums">{p.score}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {isHost ? (
        <button
          onClick={onNext}
          className="w-full rounded-full bg-good px-6 py-4 text-lg font-extrabold text-[#08301f] transition active:scale-95"
        >
          {isLast ? 'See final results 🏆' : 'Next round →'}
        </button>
      ) : (
        <p className="text-center text-sm text-ink-dim">Waiting for the host…</p>
      )}
    </main>
  );
}
