// Roulette game engine — pure logic over a room object. No sockets, no timers
// (the socket layer owns IO + timing and calls these functions).
//
// Each round the game secretly picks one player (the "owner") and one of their
// songs for the chosen period. Everyone else guesses whose it is.

const CORRECT_POINTS = 100;
const MAX_SPEED_BONUS = 50;
const OWNER_POINTS_PER_WRONG = 25;

function periodLabel(period) {
  return period === 'all_time' ? 'All Time' : String(period);
}

// A player's ranked list for the chosen period.
function listForPeriod(player, period) {
  if (period === 'all_time') return player.library?.allTime ?? [];
  return player.library?.years?.get(Number(period)) ?? [];
}

// Track IDs that appear in more than one player's list for the period.
// These are skipped entirely (V1 duplicate handling: skip & redraw).
function computeDuplicates(room, period) {
  const counts = new Map();
  for (const p of room.players) {
    for (const t of listForPeriod(p, period)) {
      counts.set(t.trackId, (counts.get(t.trackId) ?? 0) + 1);
    }
  }
  const dup = new Set();
  for (const [id, n] of counts) if (n > 1) dup.add(id);
  return dup;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Initialize per-game state on the room.
export function startGame(room) {
  const period = room.settings.period;
  room.phase = 'in_round';
  room.roundIndex = -1;
  room.scores = Object.fromEntries(room.players.map((p) => [p.id, 0]));
  room.ownerCounts = Object.fromEntries(room.players.map((p) => [p.id, 0]));
  room.dupTrackIds = computeDuplicates(room, period);
  room.usedTrackIds = new Set();
  room.currentRound = null;
  return drawRound(room);
}

// Draw the next round. Balances ownership (players who've owned fewest rounds
// go first) and avoids used/duplicate tracks. Returns the round, or null when
// no drawable song remains (game should end).
export function drawRound(room) {
  const period = room.settings.period;

  // Each player's still-drawable songs for the period.
  const drawable = new Map();
  for (const p of room.players) {
    const songs = listForPeriod(p, period).filter(
      (t) => !room.usedTrackIds.has(t.trackId) && !room.dupTrackIds.has(t.trackId),
    );
    if (songs.length > 0) drawable.set(p.id, songs);
  }
  if (drawable.size === 0) return null;

  // Balance: among players who still have songs, prefer those who've owned the
  // fewest rounds so far.
  const candidateIds = [...drawable.keys()];
  const minCount = Math.min(...candidateIds.map((id) => room.ownerCounts[id]));
  const pool = candidateIds.filter((id) => room.ownerCounts[id] === minCount);
  const ownerId = pickRandom(pool);
  const track = pickRandom(drawable.get(ownerId));

  room.usedTrackIds.add(track.trackId);
  room.ownerCounts[ownerId] += 1;
  room.roundIndex += 1;
  room.phase = 'in_round';
  room.currentRound = {
    index: room.roundIndex,
    ownerId, // secret — never serialized to clients during the round
    track,
    period,
    guesses: new Map(), // guesserId -> { guessPlayerId, remainingRatio }
    deadline: Date.now() + room.settings.timerSec * 1000,
    revealed: false,
  };
  return room.currentRound;
}

// Record a guess. Only non-owners may guess, once, before reveal.
export function recordGuess(room, guesserId, guessPlayerId) {
  const round = room.currentRound;
  if (!round || round.revealed) return { ok: false, error: 'no_active_round' };
  if (guesserId === round.ownerId) return { ok: false, error: 'owner_cannot_guess' };
  if (round.guesses.has(guesserId)) return { ok: false, error: 'already_guessed' };
  if (!room.players.some((p) => p.id === guessPlayerId)) {
    return { ok: false, error: 'invalid_target' };
  }
  const remainingRatio = Math.max(
    0,
    Math.min(1, (round.deadline - Date.now()) / (room.settings.timerSec * 1000)),
  );
  round.guesses.set(guesserId, { guessPlayerId, remainingRatio });
  return { ok: true };
}

// Have all connected non-owners guessed? (Used to reveal early.)
export function allGuessed(room) {
  const round = room.currentRound;
  if (!round) return false;
  const expected = room.players.filter(
    (p) => p.id !== round.ownerId && p.connected,
  );
  return expected.length > 0 && expected.every((p) => round.guesses.has(p.id));
}

// Score the round and mark it revealed. Correct guess = 100 + speed bonus;
// each WRONG guess feeds the owner +25 (being unpredictable is rewarded).
export function revealRound(room) {
  const round = room.currentRound;
  if (!round || round.revealed) return serializeReveal(room);
  round.revealed = true;
  room.phase = 'reveal';

  const roundScores = Object.fromEntries(room.players.map((p) => [p.id, 0]));
  let ownerBonus = 0;
  for (const [guesserId, { guessPlayerId, remainingRatio }] of round.guesses) {
    if (guessPlayerId === round.ownerId) {
      roundScores[guesserId] = CORRECT_POINTS + Math.round(MAX_SPEED_BONUS * remainingRatio);
    } else {
      ownerBonus += OWNER_POINTS_PER_WRONG;
    }
  }
  roundScores[round.ownerId] += ownerBonus;
  for (const p of room.players) room.scores[p.id] += roundScores[p.id];

  round.results = { roundScores };
  return serializeReveal(room);
}

// Advance to the next round, or end the game. Returns { ended }.
// Called after a reveal, so roundIndex is the just-completed round (0-based).
export function advance(room) {
  const completed = room.roundIndex + 1;
  if (completed >= room.settings.rounds) {
    room.phase = 'ended';
    room.currentRound = null;
    return { ended: true };
  }
  const next = drawRound(room);
  if (!next) {
    // Ran out of drawable songs before hitting the target round count.
    room.phase = 'ended';
    room.currentRound = null;
    return { ended: true };
  }
  return { ended: false };
}

export function resetToLobby(room) {
  room.phase = 'lobby';
  room.currentRound = null;
  room.scores = null;
  room.ownerCounts = null;
  room.dupTrackIds = null;
  room.usedTrackIds = new Set();
  room.roundIndex = -1;
  // Match-Up per-game state (mode-agnostic reset to lobby).
  room.currentMatch = null;
  room.usedRanks = null;
  room.matchRounds = null;
}

// --- Serialization (client-safe) -------------------------------------------

function playerBrief(p) {
  return { id: p.id, displayName: p.displayName, avatar: p.avatar };
}

// Per-viewer round view. The owner id and others' guesses are NEVER included;
// only whether *you* are the owner and *your own* guess.
export function serializeRoundFor(room, viewerId) {
  const round = room.currentRound;
  if (!round) return null;
  const mine = round.guesses.get(viewerId);
  return {
    phase: 'in_round',
    index: round.index,
    round: round.index + 1,
    totalRounds: room.settings.rounds,
    track: round.track,
    period: round.period,
    periodLabel: periodLabel(round.period),
    rankLabel: `#${round.track.rank}`,
    players: room.players.map(playerBrief),
    youAreOwner: round.ownerId === viewerId,
    yourGuess: mine?.guessPlayerId ?? null,
    guessedIds: [...round.guesses.keys()], // who has locked in (not what)
    deadline: round.deadline,
    timerSec: room.settings.timerSec,
  };
}

function scoreboard(room) {
  return room.players
    .map((p) => ({ ...playerBrief(p), score: room.scores[p.id] }))
    .sort((a, b) => b.score - a.score);
}

// Reveal is broadcast identically to everyone — the secret is now public.
export function serializeReveal(room) {
  const round = room.currentRound;
  const owner = room.players.find((p) => p.id === round.ownerId);
  return {
    phase: 'reveal',
    index: round.index,
    round: round.index + 1,
    totalRounds: room.settings.rounds,
    track: round.track,
    periodLabel: periodLabel(round.period),
    rankLabel: `#${round.track.rank}`,
    ownerId: round.ownerId,
    owner: owner ? playerBrief(owner) : null,
    guesses: [...round.guesses.entries()].map(([guesserId, g]) => ({
      guesserId,
      guessPlayerId: g.guessPlayerId,
      correct: g.guessPlayerId === round.ownerId,
    })),
    roundScores: round.results.roundScores,
    scoreboard: scoreboard(room),
  };
}

export function serializeFinal(room) {
  return { phase: 'ended', scoreboard: scoreboard(room) };
}
