// Socket wiring for Roulette. Owns per-round timers and the *personalized*
// round emit so a player only ever learns whether they are the owner and what
// they themselves guessed — never the secret owner or others' guesses.
import { getRoom } from '../rooms/store.js';
import { serializeRoom, canStart } from '../rooms/room.js';
import {
  startGame,
  recordGuess,
  allGuessed,
  revealRound,
  advance,
  resetToLobby,
  serializeRoundFor,
  serializeFinal,
} from './roulette.js';
import {
  startMatchGame,
  recordSubmission,
  allSubmitted,
  revealMatch,
  advanceMatch,
  serializeMatchRoundFor,
  serializeMatchReveal,
} from './matchup.js';

const timers = new Map(); // room.code -> setTimeout handle

function clearRoundTimer(code) {
  const t = timers.get(code);
  if (t) {
    clearTimeout(t);
    timers.delete(code);
  }
}

// Emit a tailored round view to every socket in the room.
async function emitRound(io, room) {
  const sockets = await io.in(room.code).fetchSockets();
  for (const s of sockets) {
    const viewerId = s.data.session?.id;
    if (viewerId) s.emit('game:round', serializeRoundFor(room, viewerId));
  }
}

// Match-Up: tailored board per socket (each sees only its own matching).
async function emitMatchRound(io, room) {
  const sockets = await io.in(room.code).fetchSockets();
  for (const s of sockets) {
    const viewerId = s.data.session?.id;
    if (viewerId) s.emit('game:matchRound', serializeMatchRoundFor(room, viewerId));
  }
}

function doMatchReveal(io, room) {
  const reveal = revealMatch(room);
  if (reveal) io.to(room.code).emit('game:matchReveal', reveal);
}

function startRoundTimer(io, room) {
  clearRoundTimer(room.code);
  const delay = Math.max(0, room.currentRound.deadline - Date.now());
  timers.set(
    room.code,
    setTimeout(() => doReveal(io, room), delay),
  );
}

function doReveal(io, room) {
  clearRoundTimer(room.code);
  const reveal = revealRound(room);
  io.to(room.code).emit('game:reveal', reveal);
}

// Send whatever is currently on screen to a single (re)connecting socket.
export function sendCurrentGameState(socket, room) {
  if (!room) return;
  const viewerId = socket.data.session?.id;
  if (room.phase === 'in_round') {
    socket.emit('game:round', serializeRoundFor(room, viewerId));
  } else if (room.phase === 'reveal') {
    socket.emit('game:reveal', revealRound(room)); // idempotent once revealed
  } else if (room.phase === 'matchup_round') {
    socket.emit('game:matchRound', serializeMatchRoundFor(room, viewerId));
  } else if (room.phase === 'matchup_reveal') {
    socket.emit('game:matchReveal', serializeMatchReveal(room));
  } else if (room.phase === 'ended') {
    socket.emit('game:ended', serializeFinal(room));
  }
}

export function attachGameHandlers(io, socket, session) {
  socket.on('game:start', async (_p, ack) => {
    const room = getRoom(session.roomCode);
    if (!room) return ack?.({ ok: false, error: 'not_in_room' });
    if (room.hostPlayerId !== session.id) return ack?.({ ok: false, error: 'not_host' });
    if (!canStart(room)) return ack?.({ ok: false, error: 'cannot_start' });

    if (room.settings.mode === 'matchup') {
      const match = startMatchGame(room);
      if (!match) return ack?.({ ok: false, error: 'no_drawable_ranks' });
      ack?.({ ok: true });
      await emitMatchRound(io, room); // no timer in Match-Up
      return;
    }

    const round = startGame(room);
    if (!round) return ack?.({ ok: false, error: 'no_drawable_songs' });
    ack?.({ ok: true });
    await emitRound(io, room);
    startRoundTimer(io, room);
  });

  socket.on('game:guess', async ({ guessPlayerId } = {}, ack) => {
    const room = getRoom(session.roomCode);
    if (!room) return ack?.({ ok: false, error: 'not_in_room' });
    const res = recordGuess(room, session.id, guessPlayerId);
    if (!res.ok) return ack?.(res);
    ack?.({ ok: true });
    if (allGuessed(room)) doReveal(io, room);
    else await emitRound(io, room); // refresh "who has locked in"
  });

  socket.on('game:next', async (_p, ack) => {
    const room = getRoom(session.roomCode);
    if (!room) return ack?.({ ok: false, error: 'not_in_room' });
    if (room.hostPlayerId !== session.id) return ack?.({ ok: false, error: 'not_host' });
    if (room.phase !== 'reveal') return ack?.({ ok: false, error: 'not_in_reveal' });

    const { ended } = advance(room);
    ack?.({ ok: true, ended });
    if (ended) {
      io.to(room.code).emit('game:ended', serializeFinal(room));
    } else {
      await emitRound(io, room);
      startRoundTimer(io, room);
    }
  });

  // Match-Up: a player locks in a full matching. Auto-reveals once everyone in.
  socket.on('matchup:submit', async ({ assignment } = {}, ack) => {
    const room = getRoom(session.roomCode);
    if (!room) return ack?.({ ok: false, error: 'not_in_room' });
    const res = recordSubmission(room, session.id, assignment);
    if (!res.ok) return ack?.(res);
    ack?.({ ok: true });
    if (allSubmitted(room)) doMatchReveal(io, room);
    else await emitMatchRound(io, room); // refresh "who has locked in"
  });

  // Host fallback: reveal even if someone hasn't submitted (e.g. stuck player).
  socket.on('matchup:reveal', (_p, ack) => {
    const room = getRoom(session.roomCode);
    if (!room) return ack?.({ ok: false, error: 'not_in_room' });
    if (room.hostPlayerId !== session.id) return ack?.({ ok: false, error: 'not_host' });
    if (room.phase !== 'matchup_round') return ack?.({ ok: false, error: 'not_in_round' });
    ack?.({ ok: true });
    doMatchReveal(io, room);
  });

  socket.on('matchup:next', async (_p, ack) => {
    const room = getRoom(session.roomCode);
    if (!room) return ack?.({ ok: false, error: 'not_in_room' });
    if (room.hostPlayerId !== session.id) return ack?.({ ok: false, error: 'not_host' });
    if (room.phase !== 'matchup_reveal') return ack?.({ ok: false, error: 'not_in_reveal' });

    const { ended } = advanceMatch(room);
    ack?.({ ok: true, ended });
    if (ended) io.to(room.code).emit('game:ended', serializeFinal(room));
    else await emitMatchRound(io, room);
  });

  socket.on('game:playAgain', (_p, ack) => {
    const room = getRoom(session.roomCode);
    if (!room) return ack?.({ ok: false, error: 'not_in_room' });
    if (room.hostPlayerId !== session.id) return ack?.({ ok: false, error: 'not_host' });
    clearRoundTimer(room.code);
    resetToLobby(room);
    ack?.({ ok: true });
    io.to(room.code).emit('room:state', serializeRoom(room));
  });
}
