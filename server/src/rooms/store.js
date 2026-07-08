// In-memory room store (no DB in v1). Rooms disappear on restart, by design.
import { DEFAULT_SETTINGS, AVATARS, MAX_PLAYERS } from './room.js';
import { createSession } from '../sessions.js';
import { botLibrary } from './bots.js';

const rooms = new Map(); // code -> Room

// Unambiguous alphabet (no O/0/I/1) for readable join codes.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 4;

function randomCode() {
  let code = '';
  for (let i = 0; i < CODE_LEN; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

function uniqueCode() {
  let code;
  do {
    code = randomCode();
  } while (rooms.has(code));
  return code;
}

export function getRoom(code) {
  return rooms.get(String(code).toUpperCase()) ?? null;
}

// Pick the first avatar not already used in the room.
function nextAvatar(room) {
  const used = new Set(room.players.map((p) => p.avatar.emoji));
  return AVATARS.find((a) => !used.has(a.emoji)) ?? AVATARS[0];
}

// Build a room Player from an authenticated session.
function makePlayer(session, avatar) {
  return {
    id: session.id, // session id doubles as the stable player id
    displayName: session.library?.profile?.displayName ?? 'Player',
    spotifyUserId: session.spotify?.spotifyUserId ?? null,
    avatar,
    // Reference the session so availability sees the live library.
    session,
    get library() {
      return this.session.library;
    },
    connected: true,
  };
}

export function createRoom(session) {
  const code = uniqueCode();
  const room = {
    code,
    hostPlayerId: session.id,
    players: [],
    phase: 'lobby',
    settings: { ...DEFAULT_SETTINGS },
    currentRound: null,
    usedTrackIds: new Set(),
  };
  room.players.push(makePlayer(session, AVATARS[0]));
  rooms.set(code, room);
  session.roomCode = code;
  return room;
}

// Returns { room } or { error }.
export function joinRoom(code, session) {
  const room = getRoom(code);
  if (!room) return { error: 'room_not_found' };

  // A known player may ALWAYS rejoin — including mid-game after a phone refresh.
  // (This check must precede the phase gate below, or reconnect breaks.)
  const existing = room.players.find((p) => p.id === session.id);
  if (existing) {
    existing.connected = true;
    session.roomCode = room.code;
    return { room };
  }

  // New players can only join a room that's still in the lobby.
  if (room.phase !== 'lobby') return { error: 'game_in_progress' };
  if (room.players.length >= MAX_PLAYERS) return { error: 'room_full' };
  // Reject a second login from the same Spotify account.
  const dupAccount =
    session.spotify?.spotifyUserId &&
    room.players.some((p) => p.spotifyUserId === session.spotify.spotifyUserId);
  if (dupAccount) return { error: 'account_already_in_room' };

  room.players.push(makePlayer(session, nextAvatar(room)));
  session.roomCode = room.code;
  return { room };
}

// Dev-only: add an auto-playing test bot with its own distinct library so one
// human can play a full game. Returns { player } or { error }.
export function addBot(room) {
  if (room.players.length >= MAX_PLAYERS) return { error: 'room_full' };
  const seed = room.players.filter((p) => p.isBot).length;
  // A bot's "session" mirrors a real one enough for makePlayer + serialization.
  const session = {
    spotify: { spotifyUserId: `bot-${seed}-${room.code}` },
    library: botLibrary(seed),
    roomCode: room.code,
    isBot: true,
  };
  createSession(session); // assigns session.id and stores it
  const player = makePlayer(session, nextAvatar(room));
  player.isBot = true;
  room.players.push(player);
  return { player };
}

// Mark a player disconnected (presence). Empty rooms are cleaned up.
export function markDisconnected(session) {
  const room = getRoom(session.roomCode);
  if (!room) return null;
  const player = room.players.find((p) => p.id === session.id);
  if (player) player.connected = false;
  return room;
}

export function leaveRoom(session) {
  const room = getRoom(session.roomCode);
  if (!room) return null;
  room.players = room.players.filter((p) => p.id !== session.id);
  session.roomCode = null;

  // A room full of only bots (no humans left) is dead — clean it up.
  const humans = room.players.filter((p) => !p.isBot);
  if (humans.length === 0) {
    rooms.delete(room.code);
    return null;
  }
  // If the host left, hand the crown to the next HUMAN (never a bot).
  if (room.hostPlayerId === session.id) {
    room.hostPlayerId = humans[0].id;
  }
  return room;
}

export function updateSettings(room, patch) {
  const next = { ...room.settings, ...patch };
  // Clamp to sane ranges.
  next.rounds = Math.max(1, Math.min(20, Number(next.rounds) || room.settings.rounds));
  next.timerSec = Math.max(5, Math.min(60, Number(next.timerSec) || room.settings.timerSec));
  if (next.mode !== 'roulette' && next.mode !== 'matchup') {
    next.mode = room.settings.mode;
  }
  room.settings = next;
  return room;
}
