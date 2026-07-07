// Thin wrappers over the Spotify Web API endpoints we use.
// Each takes a raw access token and throws an Error with `.status` on failure
// so callers can detect 401 (expired token) and refresh + retry.
import { config } from '../config.js';

const { apiBase } = config.spotify;

async function spotifyGet(accessToken, path) {
  const res = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      `Spotify GET ${path} failed (${res.status}): ${data?.error?.message ?? 'unknown'}`,
    );
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// GET /me — profile. Note: `email` was removed in 2026; use display_name + id.
export function getMe(accessToken) {
  return spotifyGet(accessToken, '/me');
}

// GET /me/top/tracks — ranked top tracks. long_term ≈ last year-plus.
export async function getTopTracks(accessToken, { timeRange = 'long_term', limit = 50 } = {}) {
  const data = await spotifyGet(
    accessToken,
    `/me/top/tracks?time_range=${timeRange}&limit=${limit}`,
  );
  return data?.items ?? [];
}

// GET /me/playlists — paginated. Spotify-owned Wrapped playlists are filtered
// out of this response entirely, so we only ever see user-owned/followed ones.
export async function getAllMyPlaylists(accessToken) {
  const playlists = [];
  let path = '/me/playlists?limit=50';
  while (path) {
    const page = await spotifyGet(accessToken, path);
    playlists.push(...(page?.items ?? []));
    // `next` is an absolute URL; strip the base so spotifyGet can re-add it.
    path = page?.next ? page.next.replace(apiBase, '') : null;
  }
  return playlists;
}

// GET /playlists/{id}/items — 2026 rename (was /tracks). Response field: items.
// Only readable for playlists the user owns or collaborates on.
export async function getPlaylistItems(accessToken, playlistId) {
  const items = [];
  let path = `/playlists/${playlistId}/items?limit=100`;
  while (path) {
    const page = await spotifyGet(accessToken, path);
    items.push(...(page?.items ?? []));
    path = page?.next ? page.next.replace(apiBase, '') : null;
  }
  return items;
}
