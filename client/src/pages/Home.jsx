import { useState } from 'react';
import { api } from '../api.js';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function connectSpotify() {
    setLoading(true);
    setError(null);
    try {
      const { authorizeUrl } = await api.login();
      window.location.href = authorizeUrl; // hand off to Spotify's consent screen
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div>
        <div className="mb-3 text-6xl">🎵🎯</div>
        <h1 className="bg-gradient-to-r from-[--color-accent] to-[--color-accent-2] bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
          Song Roulette
        </h1>
        <p className="mt-3 text-[--color-ink-dim]">
          Whose top song is this? Guess your friends' music taste.
        </p>
      </div>

      <div className="card w-full space-y-3 p-6">
        <button
          onClick={connectSpotify}
          disabled={loading}
          className="w-full rounded-full bg-[--color-good] px-6 py-3.5 text-lg font-bold text-[#08301f] transition active:scale-95 disabled:opacity-60"
        >
          {loading ? 'Connecting…' : 'Connect Spotify'}
        </button>
        <p className="text-xs text-[--color-ink-dim]">
          We only read your top tracks and your own playlists.
        </p>
        {error && <p className="text-sm text-[--color-bad]">{error}</p>}
      </div>

      <div className="text-sm text-[--color-ink-dim]">
        <p>Rooms &amp; multiplayer land in the next phase.</p>
      </div>
    </main>
  );
}
