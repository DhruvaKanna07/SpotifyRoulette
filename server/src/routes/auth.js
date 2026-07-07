// OAuth + session HTTP routes.
//
// Flow (PKCE, token exchange server-side):
//   1. GET  /api/auth/login    -> { authorizeUrl }  (client redirects browser there)
//   2. Spotify redirects to REDIRECT_URI (the client's /callback route) with ?code&state
//   3. POST /api/auth/callback { code, state } -> exchange, build library, set session cookie
//   4. GET  /api/me            -> session's player + "what the game sees" debug data
//   5. POST /api/rescan        -> rebuild library (after the user copies playlists)
import express from 'express';
import * as cookie from 'cookie';
import {
  createPkcePair,
  randomState,
  buildAuthorizeUrl,
  exchangeCodeForTokens,
} from '../spotify/auth.js';
import { buildLibrary } from '../spotify/library.js';
import {
  putPendingAuth,
  takePendingAuth,
  createSession,
  getSessionFromToken,
} from '../sessions.js';

const SESSION_COOKIE = 'sr_session';

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    cookie.serialize(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24, // 1 day
    }),
  );
}

function readSession(req) {
  const cookies = cookie.parse(req.headers.cookie ?? '');
  return getSessionFromToken(cookies[SESSION_COOKIE]);
}

// Turn the internal library (years is a Map) into JSON for the debug screen.
// This is the player's OWN data, so full detail is fine here.
function serializeLibrary(library) {
  const years = {};
  for (const [year, tracks] of library.years.entries()) {
    years[year] = tracks;
  }
  return {
    profile: library.profile,
    allTime: library.allTime,
    years,
    availableYears: Object.keys(years).map(Number).sort(),
    detectedPlaylists: library.detectedPlaylists,
  };
}

export const authRouter = express.Router();

// 1. Begin login: create PKCE pair + state, stash verifier, hand back the URL.
authRouter.get('/auth/login', (req, res) => {
  const { verifier, challenge } = createPkcePair();
  const state = randomState();
  putPendingAuth(state, verifier);
  res.json({ authorizeUrl: buildAuthorizeUrl({ state, challenge }) });
});

// 3. Finish login: exchange code, build library, create session.
authRouter.post('/auth/callback', async (req, res) => {
  const { code, state } = req.body ?? {};
  if (!code || !state) {
    return res.status(400).json({ error: 'missing_code_or_state' });
  }
  const verifier = takePendingAuth(state);
  if (!verifier) {
    return res.status(400).json({ error: 'invalid_or_expired_state' });
  }
  try {
    const tokens = await exchangeCodeForTokens({ code, verifier });
    const player = { spotify: tokens };
    player.library = await buildLibrary(player);
    const { token } = createSession(player);
    setSessionCookie(res, token);
    res.json({
      player: {
        id: player.id,
        displayName: player.library.profile.displayName,
        spotifyUserId: player.spotify.spotifyUserId,
      },
      library: serializeLibrary(player.library),
    });
  } catch (err) {
    console.error('[auth/callback] failed:', err.message);
    res.status(502).json({ error: 'spotify_auth_failed', detail: err.message });
  }
});

// 4. Current session's player + debug library.
authRouter.get('/me', (req, res) => {
  const player = readSession(req);
  if (!player) return res.status(401).json({ error: 'not_authenticated' });
  res.json({
    player: {
      id: player.id,
      displayName: player.library.profile.displayName,
      spotifyUserId: player.spotify.spotifyUserId,
    },
    library: serializeLibrary(player.library),
  });
});

// 5. Rescan: rebuild the library (e.g. after copying Wrapped playlists).
authRouter.post('/rescan', async (req, res) => {
  const player = readSession(req);
  if (!player) return res.status(401).json({ error: 'not_authenticated' });
  try {
    player.library = await buildLibrary(player);
    res.json({ library: serializeLibrary(player.library) });
  } catch (err) {
    console.error('[rescan] failed:', err.message);
    res.status(502).json({ error: 'rescan_failed', detail: err.message });
  }
});
