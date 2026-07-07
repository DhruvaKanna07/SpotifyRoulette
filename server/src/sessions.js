// In-memory session + pending-auth stores. Fine for a 5-friend, single-instance
// app with no database (v1). Everything is lost on restart, by design.
import crypto from 'node:crypto';
import { config } from './config.js';

// sessionId -> player record (holds Spotify tokens + built library, server-only)
const sessions = new Map();

// oauth `state` -> { verifier, createdAt } — bridges /login and /callback (PKCE)
const pendingAuth = new Map();
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete the OAuth dance

// --- Signed session tokens (stateless cookie value) -------------------------

function sign(value) {
  const mac = crypto
    .createHmac('sha256', config.sessionSecret)
    .update(value)
    .digest('base64url');
  return `${value}.${mac}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const value = token.slice(0, dot);
  const expected = sign(value);
  // constant-time compare
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return value; // the session id
}

// --- Pending PKCE auth ------------------------------------------------------

export function putPendingAuth(state, verifier) {
  pendingAuth.set(state, { verifier, createdAt: Date.now() });
}

export function takePendingAuth(state) {
  const entry = pendingAuth.get(state);
  if (!entry) return null;
  pendingAuth.delete(state);
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) return null;
  return entry.verifier;
}

// --- Sessions ---------------------------------------------------------------

export function createSession(player) {
  const id = crypto.randomUUID();
  player.id = id;
  sessions.set(id, player);
  return { id, token: sign(id) };
}

export function getSession(sessionId) {
  return sessions.get(sessionId) ?? null;
}

export function getSessionFromToken(token) {
  const id = verifyToken(token);
  return id ? getSession(id) : null;
}
