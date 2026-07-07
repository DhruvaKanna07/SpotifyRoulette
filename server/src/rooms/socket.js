// Socket.io lobby layer. Each socket authenticates via the session cookie set
// during the Spotify OAuth flow (Phase 1), so a socket == a known player.
import * as cookie from 'cookie';
import { getSessionFromToken } from '../sessions.js';
import { serializeRoom } from './room.js';
import {
  getRoom,
  createRoom,
  joinRoom,
  leaveRoom,
  markDisconnected,
  updateSettings,
} from './store.js';

const SESSION_COOKIE = 'sr_session';

function sessionFromSocket(socket) {
  const cookies = cookie.parse(socket.handshake.headers.cookie ?? '');
  return getSessionFromToken(cookies[SESSION_COOKIE]);
}

// Broadcast the current lobby snapshot to everyone in the room.
function broadcastRoom(io, room) {
  if (!room) return;
  io.to(room.code).emit('room:state', serializeRoom(room));
}

export function registerRoomHandlers(io) {
  io.on('connection', (socket) => {
    const session = sessionFromSocket(socket);
    if (!session) {
      // Not authenticated with Spotify yet — tell the client to connect first.
      socket.emit('room:error', { code: 'not_authenticated' });
      return;
    }
    socket.data.session = session;

    // If this session was already in a room (e.g. page refresh), rejoin it.
    if (session.roomCode) {
      const { room } = joinRoom(session.roomCode, session);
      if (room) {
        socket.join(room.code);
        broadcastRoom(io, room);
      }
    }

    socket.on('room:create', (_payload, ack) => {
      // Leave any previous room first.
      if (session.roomCode) {
        const prev = leaveRoom(session);
        socket.leave(getRoom(session.roomCode)?.code ?? '');
        broadcastRoom(io, prev);
      }
      const room = createRoom(session);
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, playerId: session.id });
      broadcastRoom(io, room);
    });

    socket.on('room:join', ({ code } = {}, ack) => {
      const { room, error } = joinRoom(code, session);
      if (error) return ack?.({ ok: false, error });
      socket.join(room.code);
      ack?.({ ok: true, code: room.code, playerId: session.id });
      broadcastRoom(io, room);
    });

    socket.on('room:leave', (_payload, ack) => {
      const code = getRoom(session.roomCode)?.code;
      const room = leaveRoom(session);
      if (code) socket.leave(code);
      ack?.({ ok: true });
      broadcastRoom(io, room);
    });

    // Host-only: change mode/period/rounds/timer.
    socket.on('room:updateSettings', (patch = {}, ack) => {
      const room = getRoom(session.roomCode);
      if (!room) return ack?.({ ok: false, error: 'not_in_room' });
      if (room.hostPlayerId !== session.id) {
        return ack?.({ ok: false, error: 'not_host' });
      }
      updateSettings(room, patch);
      ack?.({ ok: true });
      broadcastRoom(io, room);
    });

    socket.on('disconnect', () => {
      const room = markDisconnected(session);
      broadcastRoom(io, room);
    });
  });
}
