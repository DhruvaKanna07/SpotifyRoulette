import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSocket } from '../socket.js';

function Avatar({ player, size = 'md' }) {
  const dim = size === 'sm' ? 'h-8 w-8 text-base' : 'h-11 w-11 text-xl';
  return (
    <div
      className={`grid ${dim} shrink-0 place-items-center rounded-full`}
      style={{ background: player.avatar.color }}
      title={player.displayName}
    >
      {player.avatar.emoji}
    </div>
  );
}

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
              {p.id === meId && <span className="text-ink-dim"> (you)</span>}
            </span>
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
                <td className="flex items-center gap-2 p-1.5">
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
                settings.mode === key
                  ? 'bg-accent-2 text-white'
                  : 'bg-bg-raised text-ink-dim'
              } disabled:opacity-60`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

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
                  selected
                    ? 'bg-accent text-white'
                    : 'bg-bg-raised text-ink-dim'
                } disabled:opacity-40`}
                title={
                  per.availableForAll ? '' : 'Not everyone has this period yet'
                }
              >
                {per.label}
                {!per.availableForAll && ' 🔒'}
              </button>
            );
          })}
        </div>
      </div>

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

export default function Lobby() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [meId, setMeId] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    const socket = getSocket();

    const onState = (state) => {
      setRoom(state);
      setError(null);
    };
    const onError = (e) => {
      if (e.code === 'not_authenticated') navigate('/', { replace: true });
    };
    socket.on('room:state', onState);
    socket.on('room:error', onError);

    // Ensure we're joined (covers direct navigation / refresh). Idempotent.
    const join = () =>
      socket.emit('room:join', { code }, (res) => {
        if (res?.ok) setMeId(res.playerId ?? null);
        else setError(res?.error ?? 'join_failed');
      });
    if (socket.connected) join();
    else socket.once('connect', join);

    return () => {
      socket.off('room:state', onState);
      socket.off('room:error', onError);
    };
  }, [code, navigate]);

  function update(patch) {
    getSocket().emit('room:updateSettings', patch);
  }

  function leave() {
    getSocket().emit('room:leave', {}, () => navigate('/', { replace: true }));
  }

  function copyCode() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">🚪</div>
        <p className="text-bad">
          {ERRORS[error] ?? 'Something went wrong joining this room.'}
        </p>
        <a href="/" className="text-accent-2 underline">
          Back home
        </a>
      </main>
    );
  }
  if (!room) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <p className="animate-pulse text-ink-dim">Joining room {code}…</p>
      </main>
    );
  }

  const isHost = room.hostPlayerId === meId;

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <header className="card flex items-center justify-between p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-ink-dim">Join code</p>
          <button
            onClick={copyCode}
            className="text-3xl font-extrabold tracking-[0.2em]"
            title="Tap to copy"
          >
            {room.code}
          </button>
          <p className="text-xs text-ink-dim">
            {copied ? 'Copied!' : 'Tap the code to copy'}
          </p>
        </div>
        <button
          onClick={leave}
          className="rounded-full bg-bg-raised px-4 py-2 text-sm font-bold text-ink-dim"
        >
          Leave
        </button>
      </header>

      <PlayerList room={room} meId={meId} />
      <AvailabilityGrid room={room} />
      <Settings room={room} isHost={isHost} update={update} />

      {isHost ? (
        <div className="space-y-2">
          <button
            disabled={!room.canStart}
            onClick={() => setNotice('Game start arrives in Phase 3 🎯')}
            className="w-full rounded-full bg-good px-6 py-4 text-lg font-extrabold text-[#08301f] transition active:scale-95 disabled:opacity-40"
          >
            Start game
          </button>
          {!room.canStart && (
            <p className="text-center text-xs text-ink-dim">
              Need 2+ connected players and a period everyone has.
            </p>
          )}
          {notice && <p className="text-center text-sm text-accent">{notice}</p>}
        </div>
      ) : (
        <p className="text-center text-sm text-ink-dim">
          Waiting for the host to start…
        </p>
      )}
    </main>
  );
}

const ERRORS = {
  room_not_found: "That room code doesn't exist.",
  room_full: 'That room is full (5 players max).',
  game_in_progress: 'That game already started.',
  account_already_in_room: 'That Spotify account is already in the room.',
};
