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
  spotify: {
    clientId: required('SPOTIFY_CLIENT_ID'),
    redirectUri: required('REDIRECT_URI', 'http://127.0.0.1:5173/callback'),
    // Scopes: read top tracks, and read the user's private/owned playlists.
    scopes: ['user-top-read', 'playlist-read-private'],
    authBase: 'https://accounts.spotify.com',
    apiBase: 'https://api.spotify.com/v1',
  },
};
