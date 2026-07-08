import { useEffect, useMemo } from 'react';
import Avatar from '../components/Avatar.jsx';
import { useCountUp } from '../useCountUp.js';
import { sfx } from '../sound.js';

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, () => ({
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 2.4 + Math.random() * 1.6,
        color: ['#ff5c8a', '#7c5cff', '#3ddc97', '#ffb03a', '#3ac6ff'][
          Math.floor(Math.random() * 5)
        ],
        size: 6 + Math.random() * 8,
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            animation: `sr-fall ${p.dur}s linear ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

function FinalRow({ rank, player, meId }) {
  const score = useCountUp(player.score, 900);
  return (
    <li className="flex items-center gap-3">
      <span className="w-5 text-center font-bold text-ink-dim">{rank}</span>
      <Avatar player={player} size="sm" />
      <span className="flex-1 truncate font-semibold">
        {player.displayName}
        {player.id === meId && <span className="text-ink-dim"> (you)</span>}
      </span>
      <span className="font-extrabold tabular-nums">{score}</span>
    </li>
  );
}

export default function FinalView({ final, meId, isHost, onPlayAgain, onLeave }) {
  const board = final.scoreboard;
  const top = board[0]?.score ?? 0;
  const winners = board.filter((p) => p.score === top && top > 0);

  useEffect(() => {
    sfx.win();
  }, []);

  return (
    <main className="mx-auto max-w-md space-y-5 px-4 py-8 text-center">
      {top > 0 && <Confetti />}
      <div className="animate-bounce-in text-6xl">🏆</div>
      <div>
        <p className="text-sm uppercase tracking-wide text-ink-dim">
          {winners.length > 1 ? "It's a tie!" : 'Winner'}
        </p>
        <div className="mt-3 flex items-center justify-center gap-3">
          {winners.map((w) => (
            <div key={w.id} className="flex animate-pop flex-col items-center gap-1">
              <Avatar player={w} size="lg" />
              <span className="font-extrabold">{w.displayName}</span>
            </div>
          ))}
        </div>
      </div>

      <section className="card p-4 text-left">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">
          Final scores
        </h2>
        <ol className="space-y-1.5">
          {board.map((p, i) => (
            <FinalRow key={p.id} rank={i + 1} player={p} meId={meId} />
          ))}
        </ol>
      </section>

      {isHost ? (
        <button
          onClick={onPlayAgain}
          className="w-full rounded-full bg-good px-6 py-4 text-lg font-extrabold text-[#08301f] transition active:scale-95"
        >
          Play again
        </button>
      ) : (
        <p className="text-sm text-ink-dim">Waiting for the host to restart…</p>
      )}
      <button onClick={onLeave} className="text-sm text-ink-dim underline">
        Leave room
      </button>
    </main>
  );
}
