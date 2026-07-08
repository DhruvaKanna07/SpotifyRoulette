import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar.jsx';

// Assign one player to each shuffled song (a full matching). Picking a player
// who's already on another card moves them here, so every player is used once.
export default function MatchUpView({ round, meId, onSubmit }) {
  const [assignment, setAssignment] = useState(round.yourAssignment ?? {});
  const [submitting, setSubmitting] = useState(false);

  // Reset local picks only when a new round starts (not on refresh emits).
  useEffect(() => {
    setAssignment(round.yourAssignment ?? {});
    setSubmitting(false);
  }, [round.index]);

  const { songs, players } = round;
  const assignedCount = Object.keys(assignment).length;
  const complete = assignedCount === songs.length;
  const submittedCount = round.submittedIds.length;

  function assign(cardId, playerId) {
    setAssignment((prev) => {
      const next = {};
      // Drop this player from any other card first (swap semantics).
      for (const [cid, pid] of Object.entries(prev)) {
        if (pid !== playerId) next[cid] = pid;
      }
      next[cardId] = playerId;
      return next;
    });
  }

  function submit() {
    if (!complete || submitting) return;
    setSubmitting(true);
    onSubmit(assignment);
  }

  if (round.youSubmitted) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-4 py-6 text-center">
        <div className="text-5xl">🔒</div>
        <p className="text-lg font-bold">Locked in!</p>
        <p className="text-ink-dim">Waiting for everyone to finish matching…</p>
        <p className="text-sm text-ink-dim">
          {submittedCount}/{players.length} locked in
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-6 pb-28">
      <header className="mb-4">
        <p className="text-xs uppercase tracking-wide text-ink-dim">
          Round {round.round} of {round.totalRounds} · {round.periodLabel}
        </p>
        <h1 className="text-2xl font-extrabold">{round.rankLabel}</h1>
        <p className="text-sm text-ink-dim">Whose song is each of these? Match every one.</p>
      </header>

      <div className="space-y-3">
        {songs.map((s, i) => {
          const chosen = assignment[s.cardId];
          return (
            <section
              key={s.cardId}
              className={`card p-3 ${chosen ? '' : 'ring-1 ring-accent/40'}`}
            >
              <div className="mb-3 flex items-center gap-3">
                {s.track.albumArtUrl ? (
                  <img src={s.track.albumArtUrl} alt="" className="h-14 w-14 rounded-lg" />
                ) : (
                  <div className="grid h-14 w-14 place-items-center rounded-lg bg-bg-raised text-2xl">
                    🎵
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 inline-flex rounded-full bg-accent-2/20 px-2 py-0.5 text-[10px] font-bold text-accent-2">
                    Song {i + 1} · {round.rankLabel}
                  </div>
                  <p className="truncate font-bold leading-tight">{s.track.name}</p>
                  <p className="truncate text-sm text-ink-dim">{s.track.artists.join(', ')}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {players.map((p) => {
                  const selected = chosen === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => assign(s.cardId, p.id)}
                      className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-sm font-bold transition active:scale-95 ${
                        selected ? 'text-white' : 'bg-bg-raised text-ink-dim'
                      }`}
                      style={selected ? { background: p.avatar.color } : undefined}
                    >
                      <Avatar player={p} size="sm" />
                      <span className="max-w-[6rem] truncate">
                        {p.id === meId ? 'You' : p.displayName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-white/10 bg-bg/90 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <span className="text-sm font-bold text-ink-dim">
            {assignedCount}/{songs.length} matched
          </span>
          <button
            disabled={!complete || submitting}
            onClick={submit}
            className="flex-1 rounded-full bg-good px-6 py-3 text-lg font-extrabold text-[#08301f] transition active:scale-95 disabled:opacity-40"
          >
            Lock in
          </button>
        </div>
      </div>
    </main>
  );
}
