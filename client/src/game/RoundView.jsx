import { useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar.jsx';
import EmbedPlayer from '../components/EmbedPlayer.jsx';
import { sfx, unlock } from '../sound.js';

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
  // Tick sound on each of the final 5 seconds.
  const lastSec = useRef(null);
  useEffect(() => {
    if (secs !== lastSec.current) {
      if (secs <= 5 && secs > 0) sfx.tick();
      lastSec.current = secs;
    }
  }, [secs]);
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
  // Everyone guesses — including for their own song — and can pick any player.
  const options = round.players;
  const totalGuessers = round.players.length;

  const guess = (playerId) => {
    unlock();
    sfx.lockIn();
    onGuess(playerId);
  };

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
        {/* Drop-in fade for the album cover, re-triggered each round via key. */}
        {track.albumArtUrl ? (
          <img
            key={round.index}
            src={track.albumArtUrl}
            alt=""
            className="animate-drop-in aspect-square w-full object-cover"
          />
        ) : (
          <div
            key={round.index}
            className="animate-drop-in grid aspect-square w-full place-items-center bg-bg-raised text-6xl"
          >
            🎵
          </div>
        )}
        <div className="p-4">
          <div className="mb-1 inline-flex rounded-full bg-accent-2/20 px-2.5 py-1 text-xs font-bold text-accent-2">
            {round.rankLabel} · {round.periodLabel}
          </div>
          <h1 className="text-xl font-extrabold leading-tight">{track.name}</h1>
          <p className="text-ink-dim">{track.artists.join(', ')}</p>
          <div className="mt-3">
            <EmbedPlayer trackId={track.trackId} />
          </div>
        </div>
      </section>

      {round.yourGuess ? (
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
            {options.map((p) => (
              <button
                key={p.id}
                onClick={() => guess(p.id)}
                className="flex items-center gap-3 rounded-2xl bg-bg-card p-3 transition active:scale-95"
              >
                <Avatar player={p} />
                <span className="truncate font-bold">
                  {p.displayName}
                  {p.id === meId && <span className="text-ink-dim"> (you)</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
