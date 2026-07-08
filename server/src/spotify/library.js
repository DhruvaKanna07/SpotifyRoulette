// Builds a player's game library from Spotify: the "All Time" ranked list
// (from top tracks) and per-year ranked lists (from owned "Your Top Songs {year}"
// playlist copies, where track order == rank).
import { refreshAccessToken } from './auth.js';
import {
  getMe,
  getTopTracks,
  getAllMyPlaylists,
  getPlaylistItems,
} from './api.js';

// Case-insensitive: name contains "your top songs" and a 4-digit year (20xx).
const YEAR_PLAYLIST_RE = /your top songs.*(20\d{2})|(20\d{2}).*your top songs/i;

function extractYear(name) {
  const match = name.match(/(20\d{2})/);
  return match ? Number(match[1]) : null;
}

// Refresh the token, flagging the player as needing re-login if Spotify rejects
// the refresh token (e.g. revoked). Throws a typed error so callers can react
// without killing a room the player is already in.
async function refreshOrFlag(player) {
  try {
    const refreshed = await refreshAccessToken(player.spotify.refreshToken);
    Object.assign(player.spotify, refreshed);
  } catch (err) {
    player.needsReauth = true;
    const wrapped = new Error('spotify_reauth_required');
    wrapped.code = 'reauth_required';
    wrapped.cause = err;
    throw wrapped;
  }
}

// Refresh the access token if it's expired (or about to be, 30s skew).
export async function ensureFreshToken(player) {
  const { spotify } = player;
  if (spotify.expiresAt && Date.now() < spotify.expiresAt - 30_000) return;
  await refreshOrFlag(player);
}

// Run a Spotify API call; on 401 refresh the token once and retry.
async function withFreshToken(player, fn) {
  await ensureFreshToken(player);
  try {
    return await fn(player.spotify.accessToken);
  } catch (err) {
    if (err.status === 401) {
      await refreshOrFlag(player);
      return fn(player.spotify.accessToken);
    }
    throw err;
  }
}

function toRankedTrack(track, rank) {
  if (!track || !track.id) return null;
  const images = track.album?.images ?? [];
  return {
    trackId: track.id,
    name: track.name,
    artists: (track.artists ?? []).map((a) => a.name),
    albumArtUrl: images[0]?.url ?? null,
    rank,
  };
}

// Detect owned "Your Top Songs {year}" playlists from the user's playlist list.
export function detectYearPlaylists(playlists, spotifyUserId) {
  const found = [];
  for (const pl of playlists) {
    if (!pl?.name) continue;
    if (pl.owner?.id !== spotifyUserId) continue; // must OWN it, not just follow
    if (!YEAR_PLAYLIST_RE.test(pl.name)) continue;
    const year = extractYear(pl.name);
    if (!year) continue;
    found.push({ playlistId: pl.id, name: pl.name, year });
  }
  return found;
}

// Fetch a single year playlist's items and turn them into a ranked list.
async function fetchYearRanked(player, playlistId) {
  const items = await withFreshToken(player, (token) =>
    getPlaylistItems(token, playlistId),
  );
  const ranked = [];
  items.forEach((item, index) => {
    const track = toRankedTrack(item.track, index + 1); // order == rank
    if (track) ranked.push(track);
  });
  return ranked;
}

// Build the full library for a player. Returns the profile plus:
//   allTime: RankedTrack[]  (from /me/top/tracks long_term)
//   years:   Map<year, RankedTrack[]>  (from owned year-playlist copies)
//   detectedPlaylists: metadata for the debug/onboarding UI
export async function buildLibrary(player) {
  const profile = await withFreshToken(player, (token) => getMe(token));
  player.spotify.spotifyUserId = profile.id;

  const topTracks = await withFreshToken(player, (token) =>
    getTopTracks(token, { timeRange: 'long_term', limit: 50 }),
  );
  const allTime = [];
  topTracks.forEach((track, index) => {
    const rt = toRankedTrack(track, index + 1);
    if (rt) allTime.push(rt);
  });

  const playlists = await withFreshToken(player, (token) =>
    getAllMyPlaylists(token),
  );
  const detected = detectYearPlaylists(playlists, profile.id);

  const years = new Map();
  for (const { playlistId, year } of detected) {
    years.set(year, await fetchYearRanked(player, playlistId));
  }

  // A clean scan means the tokens are healthy again.
  player.needsReauth = false;

  return {
    profile: { id: profile.id, displayName: profile.display_name },
    allTime,
    years,
    detectedPlaylists: detected,
  };
}
