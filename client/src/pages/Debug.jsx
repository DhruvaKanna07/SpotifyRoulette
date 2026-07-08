import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { readRoom } from './Setup.jsx';

function RankBadge({ rank, label }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-2/20 px-2.5 py-1 text-xs font-bold text-accent-2">
      #{rank}
      {label ? <span className="text-ink-dim">· {label}</span> : null}
    </span>
  );
}

function TrackRow({ track, label }) {
  return (
    <li className="flex items-center gap-3 py-2">
      {track.albumArtUrl ? (
        <img
          src={track.albumArtUrl}
          alt=""
          className="h-11 w-11 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="h-11 w-11 shrink-0 rounded-md bg-bg-raised" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{track.name}</div>
        <div className="truncate text-xs text-ink-dim">
          {track.artists.join(', ')}
        </div>
      </div>
      <RankBadge rank={track.rank} label={label} />
    </li>
  );
}

function TrackList({ title, tracks, label }) {
  return (
    <section className="card p-4">
      <h3 className="mb-1 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-ink-dim">
        <span>{title}</span>
        <span>{tracks.length} tracks</span>
      </h3>
      {tracks.length === 0 ? (
        <p className="py-3 text-sm text-ink-dim">Nothing here yet.</p>
      ) : (
        <ol className="divide-y divide-white/5">
          {tracks.map((t) => (
            <TrackRow key={`${t.rank}-${t.trackId}`} track={t} label={label} />
          ))}
        </ol>
      )}
    </section>
  );
}

export default function Debug() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [rescanning, setRescanning] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setData)
      .catch((err) => {
        if (err.status === 401) navigate('/', { replace: true });
        else setError(err.message);
      });
  }, [navigate]);

  async function rescan() {
    setRescanning(true);
    try {
      const res = await api.rescan();
      setData((prev) => ({ ...prev, library: res.library }));
    } catch (err) {
      setError(err.message);
    } finally {
      setRescanning(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <p className="text-bad">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="animate-pulse text-ink-dim">Loading…</p>
      </main>
    );
  }

  const { player, library } = data;
  const years = library.availableYears;

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <button
        onClick={() => {
          const room = readRoom();
          navigate(room ? `/room/${room}` : '/');
        }}
        className="text-sm font-bold text-ink-dim"
      >
        {readRoom() ? '← Back to game' : '← Home'}
      </button>

      <header className="card p-5">
        <p className="text-xs uppercase tracking-wide text-ink-dim">
          What the game sees about you
        </p>
        <h1 className="mt-1 text-2xl font-extrabold">
          {player.displayName ?? player.spotifyUserId}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-good/15 px-3 py-1 text-xs font-bold text-good">
            All Time ✓
          </span>
          {years.length > 0 ? (
            years.map((y) => (
              <span
                key={y}
                className="rounded-full bg-accent/15 px-3 py-1 text-xs font-bold text-accent"
              >
                {y} ✓
              </span>
            ))
          ) : (
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-ink-dim">
              No year playlists detected
            </span>
          )}
        </div>
        <button
          onClick={rescan}
          disabled={rescanning}
          className="mt-4 w-full rounded-full bg-accent-2 px-5 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-60"
        >
          {rescanning ? 'Rescanning…' : 'Rescan playlists'}
        </button>
      </header>

      <div className="card border-accent/30 bg-accent/5 p-4 text-sm text-ink-dim">
        <p className="mb-1 font-bold text-ink">
          {years.length === 0 ? 'Want to play by year?' : 'Add more years'}
        </p>
        <p className="mb-3">
          Copy your “Your Top Songs” Wrapped playlists into playlists you own, and
          the game can quiz your group by year — not just all-time.
        </p>
        <button
          onClick={() => navigate('/setup')}
          className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white transition active:scale-95"
        >
          Guided setup →
        </button>
      </div>

      <TrackList title="All Time" tracks={library.allTime} label="All Time" />

      {years.map((y) => (
        <TrackList key={y} title={String(y)} tracks={library.years[y]} label={y} />
      ))}
    </main>
  );
}
