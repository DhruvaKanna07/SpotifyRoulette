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

// Fetch a playlist's items and turn them into a ranked list (order == rank).
// Used for both auto-detected year copies and manually pasted playlist links.
export async function fetchPlaylistRanked(player, playlistId) {
  const items = await withFreshToken(player, (token) =>
    getPlaylistItems(token, playlistId),
  );
  const ranked = [];
  items.forEach((item, index) => {
    const track = toRankedTrack(item.track, index + 1);
    if (track) ranked.push(track);
  });
  return ranked;
}

// Pull a Spotify playlist id out of a link or URI the user pasted.
//   https://open.spotify.com/playlist/{id}?si=...   (optionally /intl-xx/)
//   spotify:playlist:{id}
export function parsePlaylistId(input) {
  if (!input || typeof input !== 'string') return null;
  const m =
    input.match(/playlist[/:]([A-Za-z0-9]+)/) ?? input.match(/^([A-Za-z0-9]{16,})$/);
  return m ? m[1] : null;
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
    years.set(year, await fetchPlaylistRanked(player, playlistId));
  }

  // Re-apply playlists the user manually tagged (by pasting a link), so they
  // survive a rescan. A manual entry overrides auto-detection for its period.
  let finalAllTime = allTime;
  if (player.manualPlaylists) {
    for (const [period, playlistId] of Object.entries(player.manualPlaylists)) {
      try {
        const ranked = await fetchPlaylistRanked(player, playlistId);
        if (ranked.length === 0) continue;
        if (period === 'all_time') finalAllTime = ranked;
        else years.set(Number(period), ranked);
      } catch {
        // A manual entry that no longer reads (deleted playlist etc.) is skipped.
      }
    }
  }

  // A clean scan means the tokens are healthy again.
  player.needsReauth = false;

  return {
    profile: { id: profile.id, displayName: profile.display_name },
    allTime: finalAllTime,
    years,
    detectedPlaylists: detected,
  };
}
