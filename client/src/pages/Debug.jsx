import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

function RankBadge({ rank, label }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[--color-accent-2]/20 px-2.5 py-1 text-xs font-bold text-[--color-accent-2]">
      #{rank}
      {label ? <span className="text-[--color-ink-dim]">· {label}</span> : null}
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
        <div className="h-11 w-11 shrink-0 rounded-md bg-[--color-bg-raised]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold">{track.name}</div>
        <div className="truncate text-xs text-[--color-ink-dim]">
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
      <h3 className="mb-1 flex items-center justify-between text-sm font-bold uppercase tracking-wide text-[--color-ink-dim]">
        <span>{title}</span>
        <span>{tracks.length} tracks</span>
      </h3>
      {tracks.length === 0 ? (
        <p className="py-3 text-sm text-[--color-ink-dim]">Nothing here yet.</p>
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
        <p className="text-[--color-bad]">{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="animate-pulse text-[--color-ink-dim]">Loading…</p>
      </main>
    );
  }

  const { player, library } = data;
  const years = library.availableYears;

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-8">
      <header className="card p-5">
        <p className="text-xs uppercase tracking-wide text-[--color-ink-dim]">
          What the game sees about you
        </p>
        <h1 className="mt-1 text-2xl font-extrabold">
          {player.displayName ?? player.spotifyUserId}
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="rounded-full bg-[--color-good]/15 px-3 py-1 text-xs font-bold text-[--color-good]">
            All Time ✓
          </span>
          {years.length > 0 ? (
            years.map((y) => (
              <span
                key={y}
                className="rounded-full bg-[--color-accent]/15 px-3 py-1 text-xs font-bold text-[--color-accent]"
              >
                {y} ✓
              </span>
            ))
          ) : (
            <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-[--color-ink-dim]">
              No year playlists detected
            </span>
          )}
        </div>
        <button
          onClick={rescan}
          disabled={rescanning}
          className="mt-4 w-full rounded-full bg-[--color-accent-2] px-5 py-2.5 text-sm font-bold text-white transition active:scale-95 disabled:opacity-60"
        >
          {rescanning ? 'Rescanning…' : 'Rescan playlists'}
        </button>
      </header>

      {years.length === 0 && (
        <div className="card border-[--color-accent]/30 bg-[--color-accent]/5 p-4 text-sm text-[--color-ink-dim]">
          <p className="mb-1 font-bold text-[--color-ink]">Want to play by year?</p>
          <p>
            In Spotify, search <b>“Your Top Songs 2024”</b>, open the ⋯ menu →{' '}
            <b>Add to other playlist</b> → <b>New playlist</b> (keep the name), then
            tap <b>Rescan</b>. A guided version of this comes later.
          </p>
        </div>
      )}

      <TrackList title="All Time" tracks={library.allTime} label="All Time" />

      {years.map((y) => (
        <TrackList key={y} title={String(y)} tracks={library.years[y]} label={y} />
      ))}
    </main>
  );
}
