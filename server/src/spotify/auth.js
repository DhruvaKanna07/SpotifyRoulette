// Spotify OAuth: Authorization Code with PKCE.
// The token exchange runs server-side so access/refresh tokens never touch the client.
import crypto from 'node:crypto';
import { config } from '../config.js';

const { clientId, redirectUri, scopes, authBase } = config.spotify;

// --- PKCE helpers -----------------------------------------------------------

function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function createPkcePair() {
  // code_verifier: 43-128 chars of unreserved characters.
  const verifier = base64url(crypto.randomBytes(64));
  const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest(),
  );
  return { verifier, challenge };
}

export function randomState() {
  return base64url(crypto.randomBytes(16));
}

// Build the URL we send the user's browser to in order to authorize.
export function buildAuthorizeUrl({ state, challenge }) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  return `${authBase}/authorize?${params.toString()}`;
}

// --- Token exchange & refresh ----------------------------------------------

async function tokenRequest(body) {
  const res = await fetch(`${authBase}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      `Spotify token request failed (${res.status}): ${data.error ?? 'unknown'} ${data.error_description ?? ''}`,
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Normalize a raw token response into the shape we store on the player.
function normalizeTokens(data, previousRefreshToken) {
  return {
    accessToken: data.access_token,
    // Spotify may omit refresh_token on refresh; keep the previous one.
    refreshToken: data.refresh_token ?? previousRefreshToken,
    // expires_in is seconds from now; store an absolute epoch-ms deadline.
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope,
  };
}

export async function exchangeCodeForTokens({ code, verifier }) {
  const data = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  });
  return normalizeTokens(data);
}

export async function refreshAccessToken(refreshToken) {
  const data = await tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  return normalizeTokens(data, refreshToken);
}
