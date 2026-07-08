// Match-Up game engine — pure logic over a room object. No sockets, no timers
// (the socket layer owns IO and calls these functions).
//
// Simultaneous mode: the game picks one rank R that every player has, pulls
// EVERY player's song at rank R, shuffles them, and each player assigns a name
// to each song (a full matching). Score is one hit per correct assignment.

const POINTS_PER_CORRECT = 100;

function periodLabel(period) {
  return period === 'all_time' ? 'All Time' : String(period);
}

function listForPeriod(player, period) {
  if (period === 'all_time') return player.library?.allTime ?? [];
  return player.library?.years?.get(Number(period)) ?? [];
}

// The song at 1-based rank R in a ranked list (order == rank, contiguous).
function songAtRank(list, rank) {
  return list.find((t) => t.rank === rank) ?? null;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Every rank playable this game: within the range all players have, not yet
// used, and with no two players sharing the same track (V1 dupe handling:
// redraw a different rank).
function candidateRanks(room, period) {
  const lists = room.players.map((p) => listForPeriod(p, period));
  if (lists.some((l) => l.length === 0)) return [];
  const maxRank = Math.min(...lists.map((l) => l.length));

  const ranks = [];
  for (let r = 1; r <= maxRank; r++) {
    if (room.usedRanks?.has(r)) continue;
    const tracks = lists.map((l) => songAtRank(l, r));
    if (tracks.some((t) => !t)) continue;
    const ids = tracks.map((t) => t.trackId);
    if (new Set(ids).size !== ids.length) continue; // two players share -> skip
    ranks.push(r);
  }
  return ranks;
}

// Initialize per-game state on the room.
export function startMatchGame(room) {
  const period = room.settings.period;
  room.phase = 'matchup_round';
  room.roundIndex = -1;
  room.scores = Object.fromEntries(room.players.map((p) => [p.id, 0]));
  room.usedRanks = new Set();
  room.currentMatch = null;

  const initial = candidateRanks(room, period);
  if (initial.length === 0) return null;
  // Don't promise more rounds than there are distinct playable ranks.
  room.matchRounds = Math.min(room.settings.rounds, initial.length);

  return drawMatchRound(room);
}

// Draw the next rank and pull every player's song at it. Returns the round, or
// null when no playable rank remains.
export function drawMatchRound(room) {
  const period = room.settings.period;
  const ranks = candidateRanks(room, period);
  if (ranks.length === 0) return null;

  const rank = pickRandom(ranks);
  room.usedRanks.add(rank);

  const songs = shuffle(
    room.players.map((p) => ({
      ownerId: p.id, // secret — never serialized during the round
      track: songAtRank(listForPeriod(p, period), rank),
    })),
  ).map((s, i) => ({ cardId: `c${i}`, ownerId: s.ownerId, track: s.track }));

  room.roundIndex += 1;
  room.phase = 'matchup_round';
  room.currentMatch = {
    index: room.roundIndex,
    rank,
    period,
    songs,
    assignments: new Map(), // playerId -> { cardId: guessedPlayerId }
    submitted: new Set(), // playerIds who have locked in a full matching
    revealed: false,
  };
  return room.currentMatch;
}

// Record a player's full matching. `assignment` maps each cardId to a playerId
// and must be a bijection (every card assigned, every player used once).
export function recordSubmission(room, playerId, assignment) {
  const round = room.currentMatch;
  if (!round || round.revealed) return { ok: false, error: 'no_active_round' };
  if (!room.players.some((p) => p.id === playerId)) {
    return { ok: false, error: 'not_in_room' };
  }
  if (!assignment || typeof assignment !== 'object') {
    return { ok: false, error: 'invalid_assignment' };
  }

  const cardIds = round.songs.map((s) => s.cardId);
  const validPlayerIds = new Set(room.players.map((p) => p.id));
  const keys = Object.keys(assignment);

  // Exactly the round's cards, each mapped to a distinct valid player.
  if (keys.length !== cardIds.length) return { ok: false, error: 'incomplete_matching' };
  if (!cardIds.every((c) => c in assignment)) return { ok: false, error: 'incomplete_matching' };
  const used = new Set();
  for (const c of cardIds) {
    const pid = assignment[c];
    if (!validPlayerIds.has(pid)) return { ok: false, error: 'invalid_target' };
    if (used.has(pid)) return { ok: false, error: 'duplicate_assignment' };
    used.add(pid);
  }

  // Store a clean copy (only the round's cards).
  const clean = {};
  for (const c of cardIds) clean[c] = assignment[c];
  round.assignments.set(playerId, clean);
  round.submitted.add(playerId);
  return { ok: true };
}

// Have all connected players locked in a matching?
export function allSubmitted(room) {
  const round = room.currentMatch;
  if (!round) return false;
  const expected = room.players.filter((p) => p.connected);
  return expected.length > 0 && expected.every((p) => round.submitted.has(p.id));
}

// Score every submission and mark the round revealed.
export function revealMatch(room) {
  const round = room.currentMatch;
  if (!round) return null;
  if (round.revealed) return serializeMatchReveal(room);
  round.revealed = true;
  room.phase = 'matchup_reveal';

  const roundScores = Object.fromEntries(room.players.map((p) => [p.id, 0]));
  for (const p of room.players) {
    const a = round.assignments.get(p.id);
    if (!a) continue;
    let correct = 0;
    for (const song of round.songs) {
      if (a[song.cardId] === song.ownerId) correct += 1;
    }
    roundScores[p.id] = correct * POINTS_PER_CORRECT;
  }
  for (const p of room.players) room.scores[p.id] += roundScores[p.id];

  round.results = { roundScores };
  return serializeMatchReveal(room);
}

// Advance to the next round, or end the game. Returns { ended }.
export function advanceMatch(room) {
  const completed = room.roundIndex + 1;
  if (completed >= room.matchRounds) {
    room.phase = 'ended';
    room.currentMatch = null;
    return { ended: true };
  }
  const next = drawMatchRound(room);
  if (!next) {
    room.phase = 'ended';
    room.currentMatch = null;
    return { ended: true };
  }
  return { ended: false };
}

// --- Serialization (client-safe) -------------------------------------------

function playerBrief(p) {
  return { id: p.id, displayName: p.displayName, avatar: p.avatar };
}

function rankLabel(rank) {
  return `Everyone's #${rank}`;
}

function scoreboard(room) {
  return room.players
    .map((p) => ({ ...playerBrief(p), score: room.scores[p.id] }))
    .sort((a, b) => b.score - a.score);
}

// Per-viewer round view. Song owners are NEVER included; only the viewer's own
// in-progress matching and whether they've submitted.
export function serializeMatchRoundFor(room, viewerId) {
  const round = room.currentMatch;
  if (!round) return null;
  return {
    phase: 'matchup_round',
    index: round.index,
    round: round.index + 1,
    totalRounds: room.matchRounds,
    rank: round.rank,
    rankLabel: rankLabel(round.rank),
    period: round.period,
    periodLabel: periodLabel(round.period),
    players: room.players.map(playerBrief),
    songs: round.songs.map((s) => ({ cardId: s.cardId, track: s.track })),
    yourAssignment: round.assignments.get(viewerId) ?? {},
    youSubmitted: round.submitted.has(viewerId),
    submittedIds: [...round.submitted],
  };
}

// Reveal is broadcast identically — the answer key is now public.
export function serializeMatchReveal(room) {
  const round = room.currentMatch;
  const roundScores = round.results.roundScores;
  const total = round.songs.length;

  return {
    phase: 'matchup_reveal',
    index: round.index,
    round: round.index + 1,
    totalRounds: room.matchRounds,
    rank: round.rank,
    rankLabel: rankLabel(round.rank),
    periodLabel: periodLabel(round.period),
    // Answer key: each song with its true owner.
    songs: round.songs.map((s) => {
      const owner = room.players.find((p) => p.id === s.ownerId);
      return {
        cardId: s.cardId,
        track: s.track,
        ownerId: s.ownerId,
        owner: owner ? playerBrief(owner) : null,
      };
    }),
    // Per-player results (assignments are public now).
    results: room.players
      .map((p) => {
        const a = round.assignments.get(p.id) ?? null;
        let correct = 0;
        if (a) for (const s of round.songs) if (a[s.cardId] === s.ownerId) correct += 1;
        return {
          player: playerBrief(p),
          submitted: round.submitted.has(p.id),
          correct,
          total,
          roundScore: roundScores[p.id] ?? 0,
          assignment: a,
        };
      })
      .sort((x, y) => y.roundScore - x.roundScore),
    roundScores,
    scoreboard: scoreboard(room),
  };
}
