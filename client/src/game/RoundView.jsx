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

function AlbumArt({ track, roundIndex }) {
  return track.albumArtUrl ? (
    <img
      key={roundIndex}
      src={track.albumArtUrl}
      alt=""
      className="animate-drop-in aspect-square w-full object-cover"
    />
  ) : (
    <div
      key={roundIndex}
      className="animate-drop-in grid aspect-square w-full place-items-center bg-bg-raised text-6xl"
    >
      🎵
    </div>
  );
}

const MODE_LABEL = {
  player: 'Guess the player',
  song: 'Guess the song',
  rank: 'Guess the rank',
};

export default function RoundView({ round, meId, onGuess }) {
  const [rankInput, setRankInput] = useState('');
  useEffect(() => setRankInput(''), [round.index]); // reset per round

  const guess = (value) => {
    unlock();
    sfx.lockIn();
    onGuess(value);
  };

  const totalGuessers = round.players.length;
  const locked = round.yourGuess !== null && round.yourGuess !== undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-dim">
            Round {round.round} of {round.totalRounds}
          </p>
          <p className="text-sm font-bold">{MODE_LABEL[round.unknown]}</p>
        </div>
        <CountdownRing deadline={round.deadline} timerSec={round.timerSec} />
      </header>

      {/* --- What's shown depends on the unknown variable ------------------- */}
      {round.unknown === 'song' ? (
        <section className="card flex items-center gap-3 p-4">
          {round.owner && <Avatar player={round.owner} size="lg" />}
          <div>
            <p className="text-lg font-extrabold leading-tight">{round.owner?.displayName}</p>
            <p className="text-sm text-ink-dim">Their {round.rankLabel} song is one of these…</p>
          </div>
        </section>
      ) : (
        <section className="card overflow-hidden">
          <AlbumArt track={round.track} roundIndex={round.index} />
          <div className="p-4">
            {round.unknown === 'rank' ? (
              round.owner && (
                <div className="mb-2 flex items-center gap-2">
                  <Avatar player={round.owner} size="sm" />
                  <span className="text-sm font-bold">{round.owner.displayName}'s song</span>
                </div>
              )
            ) : (
              <div className="mb-1 inline-flex rounded-full bg-accent-2/20 px-2.5 py-1 text-xs font-bold text-accent-2">
                {round.rankLabel} · {round.periodLabel}
              </div>
            )}
            <h1 className="text-xl font-extrabold leading-tight">{round.track.name}</h1>
            <p className="text-ink-dim">{round.track.artists.join(', ')}</p>
            <div className="mt-3">
              <EmbedPlayer trackId={round.track.trackId} />
            </div>
          </div>
        </section>
      )}

      {/* --- Guess area ---------------------------------------------------- */}
      {locked ? (
        <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="text-4xl">🔒</div>
          <p className="text-lg font-bold">Locked in!</p>
          <p className="text-ink-dim">Waiting for the others…</p>
          <p className="text-sm text-ink-dim">
            {round.guessedIds.length}/{totalGuessers} guessed
          </p>
        </div>
      ) : round.unknown === 'player' ? (
        <div className="mt-6">
          <p className="mb-3 text-center font-bold">Whose song is this?</p>
          <div className="grid grid-cols-2 gap-3">
            {round.players.map((p) => (
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
      ) : round.unknown === 'song' ? (
        <div className="mt-4">
          <p className="mb-3 text-center font-bold">Which song is it?</p>
          <div className="grid grid-cols-2 gap-3">
            {round.songOptions.map((o) => (
              <button
                key={o.trackId}
                onClick={() => guess(o.trackId)}
                className="overflow-hidden rounded-2xl bg-bg-card text-left transition active:scale-95"
              >
                {o.albumArtUrl ? (
                  <img src={o.albumArtUrl} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="grid aspect-square w-full place-items-center bg-bg-raised text-4xl">
                    🎵
                  </div>
                )}
                <div className="p-2.5">
                  <p className="truncate text-sm font-bold leading-tight">{o.name}</p>
                  <p className="truncate text-xs text-ink-dim">{o.artists.join(', ')}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        // rank
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="font-bold">What rank is this for them? (1–{round.rankMax})</p>
          <p className="text-center text-xs text-ink-dim">
            Closer guesses score more — nail it for the full 100.
          </p>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={round.rankMax}
            value={rankInput}
            onChange={(e) => setRankInput(e.target.value)}
            placeholder="#"
            className="w-28 rounded-2xl bg-bg-card px-4 py-3 text-center text-2xl font-extrabold tabular-nums focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            disabled={!isValidRank(rankInput, round.rankMax)}
            onClick={() => guess(Number(rankInput))}
            className="w-full max-w-xs rounded-full bg-good px-6 py-3 text-lg font-extrabold text-[#08301f] transition active:scale-95 disabled:opacity-40"
          >
            Lock in
          </button>
        </div>
      )}
    </main>
  );
}

function isValidRank(value, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max;
}
