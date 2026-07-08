import { useEffect } from 'react';
import Avatar from '../components/Avatar.jsx';
import EmbedPlayer from '../components/EmbedPlayer.jsx';
import { useCountUp } from '../useCountUp.js';
import { sfx } from '../sound.js';

function ScoreRow({ rank, player, meId, delta }) {
  const score = useCountUp(player.score);
  return (
    <li className="flex items-center gap-3">
      <span className="w-5 text-center font-bold text-ink-dim">{rank}</span>
      <Avatar player={player} size="sm" />
      <span className="flex-1 truncate font-semibold">
        {player.displayName}
        {player.id === meId && <span className="text-ink-dim"> (you)</span>}
      </span>
      {delta > 0 && <span className="text-xs font-bold text-good">+{delta}</span>}
      <span className="w-12 text-right font-extrabold tabular-nums">{score}</span>
    </li>
  );
}

export default function RevealView({ reveal, meId, isHost, onNext }) {
  const byId = new Map(reveal.scoreboard.map((p) => [p.id, p]));
  const isLast = reveal.round >= reveal.totalRounds;

  // Sound: a reveal chime, then a correct/wrong flourish for the viewer.
  useEffect(() => {
    sfx.reveal();
    const mine = reveal.guesses.find((g) => g.guesserId === meId);
    if (!mine) return;
    const t = setTimeout(() => (mine.correct ? sfx.correct() : sfx.wrong()), 260);
    return () => clearTimeout(t);
  }, [reveal.index, meId]);

  const myGuess = reveal.guesses.find((g) => g.guesserId === meId);

  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-6">
      <p className="text-center text-xs uppercase tracking-wide text-ink-dim">
        Round {reveal.round} of {reveal.totalRounds}
      </p>

      <section
        key={reveal.index}
        className={`card flex animate-pop flex-col items-center gap-3 p-5 text-center ${
          myGuess && !myGuess.correct ? 'animate-shake' : ''
        }`}
      >
        {reveal.owner && <Avatar player={reveal.owner} size="lg" />}
        <p className="text-lg">
          It was <span className="font-extrabold">{reveal.owner?.displayName}</span>'s song!
        </p>
        <div className="flex items-center gap-3">
          {reveal.track.albumArtUrl && (
            <img src={reveal.track.albumArtUrl} alt="" className="h-12 w-12 rounded-md" />
          )}
          <div className="text-left">
            <p className="font-bold leading-tight">{reveal.track.name}</p>
            <p className="text-sm text-ink-dim">
              {reveal.rankLabel} · {reveal.periodLabel}
            </p>
          </div>
        </div>
        <div className="w-full">
          <EmbedPlayer trackId={reveal.track.trackId} />
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">Guesses</h2>
        {reveal.guesses.length === 0 ? (
          <p className="text-sm text-ink-dim">Nobody guessed in time.</p>
        ) : (
          <ul className="space-y-2">
            {reveal.guesses.map((g) => {
              const guesser = byId.get(g.guesserId);
              const guessed = byId.get(g.guessPlayerId);
              const pts = reveal.roundScores[g.guesserId] ?? 0;
              return (
                <li key={g.guesserId} className="flex items-center gap-2 text-sm">
                  {guesser && <Avatar player={guesser} size="sm" />}
                  <span className="font-semibold">{guesser?.displayName}</span>
                  <span className="text-ink-dim">guessed</span>
                  {guessed && <Avatar player={guessed} size="sm" />}
                  <span className="flex-1 truncate">{guessed?.displayName}</span>
                  <span>{g.correct ? '✅' : '❌'}</span>
                  {g.correct && pts > 0 && (
                    <span className="font-bold text-good">+{pts}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-dim">Scoreboard</h2>
        <ol className="space-y-1.5">
          {reveal.scoreboard.map((p, i) => (
            <ScoreRow
              key={p.id}
              rank={i + 1}
              player={p}
              meId={meId}
              delta={reveal.roundScores[p.id] ?? 0}
            />
          ))}
        </ol>
      </section>

      {isHost ? (
        <button
          onClick={onNext}
          className="w-full rounded-full bg-good px-6 py-4 text-lg font-extrabold text-[#08301f] transition active:scale-95"
        >
          {isLast ? 'See final results 🏆' : 'Next round →'}
        </button>
      ) : (
        <p className="text-center text-sm text-ink-dim">Waiting for the host…</p>
      )}
    </main>
  );
}
