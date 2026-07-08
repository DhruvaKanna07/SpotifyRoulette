import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../components/Avatar.jsx';
import MuteButton from '../components/MuteButton.jsx';
import { getSocket } from '../socket.js';
import { api } from '../api.js';
import { unlock } from '../sound.js';
import { SHOW_PLAYLISTS } from '../flags.js';

function PlayerList({ room, meId }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">
        Players · {room.players.length}/5
      </h2>
      <ul className="space-y-2">
        {room.players.map((p) => (
          <li key={p.id} className="flex items-center gap-3">
            <Avatar player={p} />
            <span className="flex-1 truncate font-semibold">
              {p.displayName}
              {p.isBot && <span className="text-ink-dim"> 🤖</span>}
              {p.id === meId && <span className="text-ink-dim"> (you)</span>}
            </span>
            {p.needsReauth && (
              <span title="Spotify needs reconnecting" className="text-sm">
                ⚠️
              </span>
            )}
            {p.isHost && <span title="Host">👑</span>}
            <span
              className={`h-2.5 w-2.5 rounded-full ${p.connected ? 'bg-good' : 'bg-white/25'}`}
              title={p.connected ? 'Connected' : 'Away'}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AvailabilityGrid({ room }) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">
        Who can play what
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="p-1.5 text-left" />
              {room.periods.map((per) => (
                <th key={per.key} className="p-1.5 text-center font-bold">
                  <div>{per.label}</div>
                  <div className="text-[10px] font-normal text-ink-dim">
                    {per.availableForAll ? 'playable' : 'missing some'}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {room.players.map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="p-1.5">
                  <Avatar player={p} size="sm" />
                </td>
                {room.periods.map((per) => (
                  <td key={per.key} className="p-1.5 text-center text-lg">
                    {p.has[per.key] ? '✅' : '⬜'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Stepper({ label, value, min, max, step = 1, disabled, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-ink-dim">{label}</span>
      <div className="flex items-center gap-2">
        <button
          disabled={disabled || value <= min}
          onClick={() => onChange(value - step)}
          className="grid h-8 w-8 place-items-center rounded-full bg-bg-raised font-bold disabled:opacity-30"
        >
          −
        </button>
        <span className="w-8 text-center font-bold tabular-nums">{value}</span>
        <button
          disabled={disabled || value >= max}
          onClick={() => onChange(value + step)}
          className="grid h-8 w-8 place-items-center rounded-full bg-bg-raised font-bold disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

function Settings({ room, isHost, update }) {
  const { settings } = room;
  return (
    <section className="card space-y-4 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-dim">
        Game settings {isHost ? '' : '(host controls)'}
      </h2>

      <div>
        <p className="mb-2 text-sm text-ink-dim">Mode</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['roulette', '🎯 Roulette'],
            ['matchup', '🃏 Match-Up'],
          ].map(([key, label]) => (
            <button
              key={key}
              disabled={!isHost}
              onClick={() => update({ mode: key })}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
                settings.mode === key ? 'bg-accent-2 text-white' : 'bg-bg-raised text-ink-dim'
              } disabled:opacity-60`}
            >
              {label}
            </button>
          ))}
        </div>
        {settings.mode === 'matchup' && (
          <p className="mt-2 text-xs text-ink-dim">
            Everyone's song at the same rank, shuffled — match each to a player.
          </p>
        )}
      </div>

      {SHOW_PLAYLISTS && (
        <div>
          <p className="mb-2 text-sm text-ink-dim">Period</p>
          <div className="flex flex-wrap gap-2">
            {room.periods.map((per) => {
              const selected = String(settings.period) === per.key;
              const value = per.key === 'all_time' ? 'all_time' : Number(per.key);
              return (
                <button
                  key={per.key}
                  disabled={!isHost || !per.availableForAll}
                  onClick={() => update({ period: value })}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
                    selected ? 'bg-accent text-white' : 'bg-bg-raised text-ink-dim'
                  } disabled:opacity-40`}
                  title={per.availableForAll ? '' : 'Not everyone has this period yet'}
                >
                  {per.label}
                  {!per.availableForAll && ' 🔒'}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <Stepper
        label="Rounds"
        value={settings.rounds}
        min={1}
        max={20}
        disabled={!isHost}
        onChange={(v) => update({ rounds: v })}
      />
      {settings.mode === 'roulette' && (
        <Stepper
          label="Timer (sec)"
          value={settings.timerSec}
          min={5}
          max={60}
          step={5}
          disabled={!isHost}
          onChange={(v) => update({ timerSec: v })}
        />
      )}
    </section>
  );
}

export default function LobbyView({ room, meId, onLeave }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const isHost = room.hostPlayerId === meId;
  const mePlayer = room.players.find((p) => p.id === meId);

  // Remember this room so /setup and /me can offer a "Back to game" button.
  useEffect(() => {
    try {
      sessionStorage.setItem('sr_room', room.code);
    } catch {
      // ignore
    }
  }, [room.code]);

  const update = (patch) => getSocket().emit('room:updateSettings', patch);

  async function reconnectSpotify() {
    try {
      const { authorizeUrl } = await api.login();
      window.location.href = authorizeUrl;
    } catch {
      setError('Could not start Spotify reconnect.');
    }
  }

  function startGame() {
    setError(null);
    unlock(); // enable audio from this user gesture
    getSocket().emit('game:start', {}, (res) => {
      if (!res?.ok) setError(START_ERRORS[res?.error] ?? 'Could not start the game.');
    });
  }

  function addBot() {
    getSocket().emit('dev:addBots', { count: 1 }, (res) => {
      if (!res?.ok) setError('Could not add a test bot.');
    });
  }

  function copyCode() {
    navigator.clipboard?.writeText(room.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <header className="card flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-dim">Join code</p>
          <button onClick={copyCode} className="text-3xl font-extrabold tracking-[0.2em]">
            {room.code}
          </button>
          <p className="text-xs text-ink-dim">{copied ? 'Copied!' : 'Tap the code to copy'}</p>
        </div>
        <div className="flex items-center gap-2">
          <MuteButton />
          <button
            onClick={onLeave}
            className="rounded-full bg-bg-raised px-4 py-2 text-sm font-bold text-ink-dim"
          >
            Leave
          </button>
        </div>
      </header>

      {mePlayer?.needsReauth && (
        <section className="card border-bad/40 bg-bad/10 p-4">
          <p className="text-sm font-bold text-ink">⚠️ Spotify needs reconnecting</p>
          <p className="mt-1 text-xs text-ink-dim">
            We can't refresh your Spotify session. You can still play from your last
            scan, but reconnect to stay current.
          </p>
          <button
            onClick={reconnectSpotify}
            className="mt-3 rounded-full bg-accent-2 px-4 py-2 text-sm font-bold text-white transition active:scale-95"
          >
            Reconnect Spotify
          </button>
        </section>
      )}

      <PlayerList room={room} meId={meId} />
      {SHOW_PLAYLISTS && <AvailabilityGrid room={room} />}
      {SHOW_PLAYLISTS && (
        <button
          onClick={() => navigate('/setup')}
          className="w-full rounded-full bg-bg-raised px-4 py-2.5 text-sm font-bold text-accent-2 transition active:scale-95"
        >
          Missing a year? Add your Wrapped playlists →
        </button>
      )}
      <Settings room={room} isHost={isHost} update={update} />

      {mePlayer?.isDev && isHost && room.players.length < 5 && (
        <button
          onClick={addBot}
          className="w-full rounded-full border border-dashed border-accent-2/50 bg-accent-2/10 px-4 py-2.5 text-sm font-bold text-accent-2 transition active:scale-95"
        >
          🤖 Add a test bot (dev only — no second account needed)
        </button>
      )}

      {isHost ? (
        <div className="space-y-2">
          <button
            disabled={!room.canStart}
            onClick={startGame}
            className="w-full rounded-full bg-good px-6 py-4 text-lg font-extrabold text-[#08301f] transition active:scale-95 disabled:opacity-40"
          >
            Start game
          </button>
          {!room.canStart && (
            <p className="text-center text-xs text-ink-dim">
              Need 2+ connected players and a period everyone has.
            </p>
          )}
          {error && <p className="text-center text-sm text-bad">{error}</p>}
        </div>
      ) : (
        <p className="text-center text-sm text-ink-dim">Waiting for the host to start…</p>
      )}
    </main>
  );
}

const START_ERRORS = {
  not_host: 'Only the host can start.',
  cannot_start: 'Need 2+ connected players and a shared period.',
  mode_not_implemented: 'That mode is not ready yet.',
  no_drawable_songs: 'Not enough unique songs to play. Try another period.',
  no_drawable_ranks: 'Not enough shared ranks to match. Try another period.',
};
