// Central config, loaded from environment (see .env.example).
// Server is started with `node --env-file=../.env`, so process.env is populated.

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://127.0.0.1:5173',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev_insecure_secret',
  // Dev-only conveniences (test bots, etc.). Off in production.
  devMode: process.env.NODE_ENV !== 'production',
  // Spotify user ids allowed to use dev features (test bots), regardless of
  // environment. Defaults to the owner's account; override via env if needed.
  devSpotifyUserIds: (process.env.DEV_SPOTIFY_USER_IDS ?? '02i8dglcphxxgwdwg8rcqf6e5')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  spotify: {
    clientId: required('SPOTIFY_CLIENT_ID'),
    redirectUri: required('REDIRECT_URI', 'http://127.0.0.1:5173/callback'),
    // Scopes: read top tracks, and read the user's private/owned playlists.
    scopes: ['user-top-read', 'playlist-read-private'],
    authBase: 'https://accounts.spotify.com',
    apiBase: 'https://api.spotify.com/v1',
  },
};

// Is this session's Spotify account allowed to use dev features (test bots)?
export function isDevUser(session) {
  const id = session?.spotify?.spotifyUserId;
  return Boolean(id) && config.devSpotifyUserIds.includes(id);
}
