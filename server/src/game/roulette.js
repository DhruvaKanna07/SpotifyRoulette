// Roulette game engine — pure logic over a room object. No sockets, no timers
// (the socket layer owns IO + timing and calls these functions).
//
// Each round secretly picks one player (the "owner") and one of their songs.
// One of three attributes is the hidden "unknown variable" players guess:
//   - 'player' : song + rank shown, guess WHO it belongs to (tap an avatar)
//   - 'song'   : owner + rank shown, guess WHICH song (pick 1 of 4 covers)
//   - 'rank'   : owner + song shown, guess the RANK number (proximity-scored)

const CORRECT_POINTS = 100;
const MAX_SPEED_BONUS = 50;
const OWNER_POINTS_PER_WRONG = 25; // player mode only (owner is hidden there)
const RANK_PENALTY_PER_STEP = 15; // rank mode: points lost per rank of distance
const SONG_OPTION_COUNT = 4;

function periodLabel(period) {
  return period === 'all_time' ? 'All Time' : String(period);
}

// A player's ranked list for the chosen period.
function listForPeriod(player, period) {
  if (period === 'all_time') return player.library?.allTime ?? [];
  return player.library?.years?.get(Number(period)) ?? [];
}

// Track IDs that appear in more than one player's list for the period.
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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function trackBrief(t) {
  return { trackId: t.trackId, name: t.name, artists: t.artists, albumArtUrl: t.albumArtUrl };
}

// For 'song' mode: the real track plus decoys, shuffled. The decoy pool is
// every other track across the room for the period.
function buildSongOptions(room, period, answer) {
  const seen = new Map();
  for (const p of room.players) {
    for (const t of listForPeriod(p, period)) {
      if (t.trackId !== answer.trackId && !seen.has(t.trackId)) seen.set(t.trackId, t);
    }
  }
  const decoys = shuffle([...seen.values()]).slice(0, SONG_OPTION_COUNT - 1);
  return shuffle([answer, ...decoys]).map(trackBrief);
}

function currentUnknown(room) {
  const u = room.settings.unknown;
  return u === 'song' || u === 'rank' ? u : 'player';
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

// Draw the next round. Balances ownership and avoids used/duplicate tracks.
export function drawRound(room) {
  const period = room.settings.period;

  const drawable = new Map();
  for (const p of room.players) {
    const songs = listForPeriod(p, period).filter(
      (t) => !room.usedTrackIds.has(t.trackId) && !room.dupTrackIds.has(t.trackId),
    );
    if (songs.length > 0) drawable.set(p.id, songs);
  }
  if (drawable.size === 0) return null;

  const candidateIds = [...drawable.keys()];
  const minCount = Math.min(...candidateIds.map((id) => room.ownerCounts[id]));
  const pool = candidateIds.filter((id) => room.ownerCounts[id] === minCount);
  const ownerId = pickRandom(pool);
  const track = pickRandom(drawable.get(ownerId));
  const unknown = currentUnknown(room);

  room.usedTrackIds.add(track.trackId);
  room.ownerCounts[ownerId] += 1;
  room.roundIndex += 1;
  room.phase = 'in_round';
  room.currentRound = {
    index: room.roundIndex,
    ownerId,
    track,
    period,
    unknown,
    // song mode: the multiple-choice board; rank mode: the guessable range.
    songOptions: unknown === 'song' ? buildSongOptions(room, period, track) : null,
    rankMax: unknown === 'rank' ? listForPeriod(getOwner(room, ownerId), period).length : null,
    guesses: new Map(), // guesserId -> { guess, remainingRatio }
    deadline: Date.now() + room.settings.timerSec * 1000,
    revealed: false,
  };
  return room.currentRound;
}

function getOwner(room, ownerId) {
  return room.players.find((p) => p.id === ownerId);
}

// Is `guess` correct for this round's unknown attribute?
function isCorrect(round, guess) {
  if (round.unknown === 'song') return guess === round.track.trackId;
  if (round.unknown === 'rank') return Number(guess) === round.track.rank;
  return guess === round.ownerId; // player
}

// Record a guess. Anyone (owner included) may guess once, before reveal. The
// guess value depends on the mode: a player id, a track id, or a rank number.
export function recordGuess(room, guesserId, guess) {
  const round = room.currentRound;
  if (!round || round.revealed) return { ok: false, error: 'no_active_round' };
  if (round.guesses.has(guesserId)) return { ok: false, error: 'already_guessed' };

  if (round.unknown === 'song') {
    if (!round.songOptions.some((o) => o.trackId === guess)) {
      return { ok: false, error: 'invalid_target' };
    }
  } else if (round.unknown === 'rank') {
    const n = Number(guess);
    if (!Number.isInteger(n) || n < 1 || n > round.rankMax) {
      return { ok: false, error: 'invalid_target' };
    }
    guess = n;
  } else {
    if (!room.players.some((p) => p.id === guess)) {
      return { ok: false, error: 'invalid_target' };
    }
  }

  const remainingRatio = Math.max(
    0,
    Math.min(1, (round.deadline - Date.now()) / (room.settings.timerSec * 1000)),
  );
  round.guesses.set(guesserId, { guess, remainingRatio });
  return { ok: true };
}

// Have all connected players guessed? (Used to reveal early.)
export function allGuessed(room) {
  const round = room.currentRound;
  if (!round) return false;
  const expected = room.players.filter((p) => p.connected);
  return expected.length > 0 && expected.every((p) => round.guesses.has(p.id));
}

// Points a single guess earns its guesser.
function pointsFor(round, guess, remainingRatio) {
  if (round.unknown === 'rank') {
    const diff = Math.abs(Number(guess) - round.track.rank);
    return Math.max(0, CORRECT_POINTS - RANK_PENALTY_PER_STEP * diff);
  }
  if (isCorrect(round, guess)) {
    return CORRECT_POINTS + Math.round(MAX_SPEED_BONUS * remainingRatio);
  }
  return 0;
}

// Score the round and mark it revealed.
export function revealRound(room) {
  const round = room.currentRound;
  if (!round || round.revealed) return serializeReveal(room);
  round.revealed = true;
  room.phase = 'reveal';

  const roundScores = Object.fromEntries(room.players.map((p) => [p.id, 0]));
  const perGuess = {};
  let ownerBonus = 0;

  for (const [guesserId, { guess, remainingRatio }] of round.guesses) {
    const pts = pointsFor(round, guess, remainingRatio);
    perGuess[guesserId] = pts;
    roundScores[guesserId] = pts;
    // Only in 'player' mode (owner hidden) do wrong OTHERS reward the owner.
    if (round.unknown === 'player' && guesserId !== round.ownerId && !isCorrect(round, guess)) {
      ownerBonus += OWNER_POINTS_PER_WRONG;
    }
  }
  if (round.unknown === 'player') roundScores[round.ownerId] += ownerBonus;

  for (const p of room.players) room.scores[p.id] += roundScores[p.id];
  round.results = { roundScores, perGuess };
  return serializeReveal(room);
}

// Advance to the next round, or end the game. Returns { ended }.
export function advance(room) {
  const completed = room.roundIndex + 1;
  if (completed >= room.settings.rounds) {
    room.phase = 'ended';
    room.currentRound = null;
    return { ended: true };
  }
  const next = drawRound(room);
  if (!next) {
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
  room.currentMatch = null;
  room.usedRanks = null;
  room.matchRounds = null;
}

// --- Serialization (client-safe) -------------------------------------------

function playerBrief(p) {
  return { id: p.id, displayName: p.displayName, avatar: p.avatar };
}

// Per-viewer round view. Never leaks the hidden answer: 'player' mode omits the
// owner; 'song' mode omits which option is correct; 'rank' mode omits the rank.
export function serializeRoundFor(room, viewerId) {
  const round = room.currentRound;
  if (!round) return null;
  const owner = getOwner(room, round.ownerId);
  const mine = round.guesses.get(viewerId);

  const base = {
    phase: 'in_round',
    index: round.index,
    round: round.index + 1,
    totalRounds: room.settings.rounds,
    unknown: round.unknown,
    period: round.period,
    periodLabel: periodLabel(round.period),
    players: room.players.map(playerBrief),
    youAreOwner: round.ownerId === viewerId,
    yourGuess: mine?.guess ?? null,
    guessedIds: [...round.guesses.keys()],
    deadline: round.deadline,
    timerSec: room.settings.timerSec,
  };

  if (round.unknown === 'song') {
    return {
      ...base,
      owner: playerBrief(owner), // owner is shown; the song is hidden
      rankLabel: `#${round.track.rank}`,
      songOptions: round.songOptions.map((o) => ({ ...o })),
    };
  }
  if (round.unknown === 'rank') {
    return {
      ...base,
      owner: playerBrief(owner), // owner + song shown; the rank is hidden
      track: trackBrief(round.track), // note: no rank field
      rankMax: round.rankMax,
    };
  }
  // player: song + rank shown; owner hidden
  return { ...base, track: round.track, rankLabel: `#${round.track.rank}` };
}

function scoreboard(room) {
  return room.players
    .map((p) => ({ ...playerBrief(p), score: room.scores[p.id] }))
    .sort((a, b) => b.score - a.score);
}

// Reveal is broadcast identically — the answer is now public.
export function serializeReveal(room) {
  const round = room.currentRound;
  const owner = getOwner(room, round.ownerId);
  return {
    phase: 'reveal',
    index: round.index,
    round: round.index + 1,
    totalRounds: room.settings.rounds,
    unknown: round.unknown,
    track: round.track,
    periodLabel: periodLabel(round.period),
    rankLabel: `#${round.track.rank}`,
    ownerId: round.ownerId,
    owner: owner ? playerBrief(owner) : null,
    songOptions: round.songOptions ?? null,
    guesses: [...round.guesses.entries()].map(([guesserId, g]) => ({
      guesserId,
      guess: g.guess,
      correct: isCorrect(round, g.guess),
      points: round.results.perGuess[guesserId] ?? 0,
    })),
    roundScores: round.results.roundScores,
    scoreboard: scoreboard(room),
  };
}

export function serializeFinal(room) {
  return { phase: 'ended', scoreboard: scoreboard(room) };
}
