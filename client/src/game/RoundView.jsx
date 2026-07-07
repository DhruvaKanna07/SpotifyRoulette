import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar.jsx';

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function CountdownRing({ deadline, timerSec }) {
  const now = useNow(true);
  const remaining = Math.max(0, deadline - now);
  const secs = Math.ceil(remaining / 1000);
  const ratio = Math.max(0, Math.min(1, remaining / (timerSec * 1000)));
  const R = 26;
  const C = 2 * Math.PI * R;
  const urgent = secs <= 5;
  return (
    <div className="relative grid h-16 w-16 place-items-center">
      <svg className="absolute -rotate-90" width="64" height="64">
        <circle cx="32" cy="32" r={R} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={R}
          fill="none"
          stroke={urgent ? 'var(--color-bad)' : 'var(--color-accent-2)'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <span className={`text-xl font-extrabold tabular-nums ${urgent ? 'text-bad' : ''}`}>
        {secs}
      </span>
    </div>
  );
}

export default function RoundView({ round, meId, onGuess }) {
  const { track } = round;
  const others = round.players.filter((p) => p.id !== meId);
  const totalGuessers = round.players.length - 1;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-dim">
            Round {round.round} of {round.totalRounds}
          </p>
          <p className="text-sm font-bold">{round.periodLabel}</p>
        </div>
        <CountdownRing deadline={round.deadline} timerSec={round.timerSec} />
      </header>

      <section className="card overflow-hidden">
        {track.albumArtUrl ? (
          <img src={track.albumArtUrl} alt="" className="aspect-square w-full object-cover" />
        ) : (
          <div className="grid aspect-square w-full place-items-center bg-bg-raised text-6xl">
            🎵
          </div>
        )}
        <div className="p-4">
          <div className="mb-1 inline-flex rounded-full bg-accent-2/20 px-2.5 py-1 text-xs font-bold text-accent-2">
            {round.rankLabel} · {round.periodLabel}
          </div>
          <h1 className="text-xl font-extrabold leading-tight">{track.name}</h1>
          <p className="text-ink-dim">{track.artists.join(', ')}</p>
        </div>
      </section>

      {round.youAreOwner ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-5xl">🤫</div>
          <p className="text-lg font-bold">This is your song!</p>
          <p className="text-ink-dim">
            Sit tight — everyone's guessing who it belongs to.
          </p>
          <p className="text-sm text-ink-dim">
            {round.guessedIds.length}/{totalGuessers} locked in
          </p>
        </div>
      ) : round.yourGuess ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-4xl">🔒</div>
          <p className="text-lg font-bold">Locked in!</p>
          <p className="text-ink-dim">Waiting for the others…</p>
          <p className="text-sm text-ink-dim">
            {round.guessedIds.length}/{totalGuessers} guessed
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <p className="mb-3 text-center font-bold">Whose song is this?</p>
          <div className="grid grid-cols-2 gap-3">
            {others.map((p) => (
              <button
                key={p.id}
                onClick={() => onGuess(p.id)}
                className="flex items-center gap-3 rounded-2xl bg-bg-card p-3 transition active:scale-95"
              >
                <Avatar player={p} />
                <span className="truncate font-bold">{p.displayName}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
