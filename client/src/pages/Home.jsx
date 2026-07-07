import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { getSocket } from '../socket.js';

export default function Home() {
  const navigate = useNavigate();
  const [me, setMe] = useState(null); // null = loading, false = not connected
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .me()
      .then((data) => setMe(data.player))
      .catch(() => setMe(false));
  }, []);

  async function connectSpotify() {
    setBusy(true);
    setError(null);
    try {
      const { authorizeUrl } = await api.login();
      window.location.href = authorizeUrl;
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function createRoom() {
    setBusy(true);
    setError(null);
    getSocket().emit('room:create', {}, (res) => {
      setBusy(false);
      if (res?.ok) navigate(`/room/${res.code}`);
      else setError('Could not create room.');
    });
  }

  function joinRoom(e) {
    e.preventDefault();
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) return;
    setBusy(true);
    setError(null);
    getSocket().emit('room:join', { code: clean }, (res) => {
      setBusy(false);
      if (res?.ok) navigate(`/room/${res.code}`);
      else setError(JOIN_ERRORS[res?.error] ?? 'Could not join room.');
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div>
        <div className="mb-3 text-6xl">🎵🎯</div>
        <h1 className="bg-gradient-to-r from-accent to-accent-2 bg-clip-text text-4xl font-extrabold tracking-tight text-transparent">
          Song Roulette
        </h1>
        <p className="mt-3 text-ink-dim">
          Whose top song is this? Guess your friends' music taste.
        </p>
      </div>

      {me === null ? (
        <p className="animate-pulse text-ink-dim">Loading…</p>
      ) : me === false ? (
        <div className="card w-full space-y-3 p-6">
          <button
            onClick={connectSpotify}
            disabled={busy}
            className="w-full rounded-full bg-good px-6 py-3.5 text-lg font-bold text-[#08301f] transition active:scale-95 disabled:opacity-60"
          >
            {busy ? 'Connecting…' : 'Connect Spotify'}
          </button>
          <p className="text-xs text-ink-dim">
            We only read your top tracks and your own playlists.
          </p>
        </div>
      ) : (
        <div className="card w-full space-y-4 p-6">
          <p className="text-sm text-ink-dim">
            Connected as{' '}
            <span className="font-bold text-ink">{me.displayName}</span>
          </p>
          <button
            onClick={createRoom}
            disabled={busy}
            className="w-full rounded-full bg-good px-6 py-3.5 text-lg font-bold text-[#08301f] transition active:scale-95 disabled:opacity-60"
          >
            Create room
          </button>
          <div className="flex items-center gap-3 text-xs text-ink-dim">
            <div className="h-px flex-1 bg-white/10" />
            or join
            <div className="h-px flex-1 bg-white/10" />
          </div>
          <form onSubmit={joinRoom} className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={5}
              className="min-w-0 flex-1 rounded-full bg-bg-raised px-4 py-3 text-center text-lg font-bold tracking-[0.3em] uppercase placeholder:tracking-normal placeholder:text-ink-dim focus:outline-none focus:ring-2 focus:ring-accent-2"
            />
            <button
              type="submit"
              disabled={busy || code.trim().length < 4}
              className="rounded-full bg-accent-2 px-6 py-3 font-bold text-white transition active:scale-95 disabled:opacity-40"
            >
              Join
            </button>
          </form>
        </div>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}

      {me && (
        <a href="/me" className="text-sm text-ink-dim underline">
          View my Spotify data
        </a>
      )}
    </main>
  );
}

const JOIN_ERRORS = {
  room_not_found: "That room code doesn't exist.",
  room_full: 'That room is full (5 players max).',
  game_in_progress: 'That game already started.',
  account_already_in_room: 'That Spotify account is already in the room.',
};
