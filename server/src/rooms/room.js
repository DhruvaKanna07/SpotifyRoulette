// Room/Player domain helpers: avatars, availability computation, and the
// client-safe serialization of lobby state (never leaks track data).

// Bold, distinct per-player identities (max 5 players per room).
export const AVATARS = [
  { color: '#ff5c8a', emoji: '🦊' },
  { color: '#7c5cff', emoji: '🐙' },
  { color: '#3ddc97', emoji: '🐸' },
  { color: '#ffb03a', emoji: '🦁' },
  { color: '#3ac6ff', emoji: '🐬' },
];

export const MAX_PLAYERS = AVATARS.length;

export const DEFAULT_SETTINGS = {
  mode: 'roulette', // 'roulette' | 'matchup'
  period: 'all_time', // 'all_time' | <year number>
  rounds: 10,
  timerSec: 30, // Roulette only; Match-Up has no timer (submit-then-reveal).
};

// The periods a single player has data for: All Time is always present; each
// year they own a "Your Top Songs {year}" copy for is added.
export function playerPeriods(player) {
  const periods = new Set(['all_time']);
  if (player.library?.years) {
    for (const year of player.library.years.keys()) periods.add(String(year));
  }
  return periods;
}

// Build the union of periods across the room and, for each, who is missing it.
// A period is playable only if EVERY player in the room has it.
export function computeAvailability(room) {
  const union = new Set(['all_time']);
  const perPlayer = new Map();
  for (const p of room.players) {
    const periods = playerPeriods(p);
    perPlayer.set(p.id, periods);
    for (const key of periods) union.add(key);
  }

  // Sort: all_time first, then years descending.
  const keys = [...union].sort((a, b) => {
    if (a === 'all_time') return -1;
    if (b === 'all_time') return 1;
    return Number(b) - Number(a);
  });

  return keys.map((key) => {
    const missing = room.players
      .filter((p) => !perPlayer.get(p.id).has(key))
      .map((p) => p.id);
    return {
      key,
      label: key === 'all_time' ? 'All Time' : key,
      availableForAll: missing.length === 0,
      missing,
    };
  });
}

// Can the host start? Need 2+ connected players and a selected period that
// every player actually has.
export function canStart(room) {
  const connected = room.players.filter((p) => p.connected).length;
  if (connected < 2) return false;
  const availability = computeAvailability(room);
  const selected = availability.find(
    (a) => a.key === String(room.settings.period),
  );
  return Boolean(selected?.availableForAll);
}

// Client-safe lobby snapshot. Deliberately excludes tokens and track lists.
export function serializeRoom(room) {
  const availability = computeAvailability(room);
  const perPlayerPeriods = new Map(
    room.players.map((p) => [p.id, playerPeriods(p)]),
  );

  return {
    code: room.code,
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    settings: room.settings,
    periods: availability,
    canStart: canStart(room),
    players: room.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      avatar: p.avatar,
      connected: p.connected,
      isHost: p.id === room.hostPlayerId,
      isBot: Boolean(p.isBot),
      // Token refresh failed on this player's last scan — they can still play
      // from their cached library, but should reconnect Spotify.
      needsReauth: Boolean(p.session?.needsReauth),
      // which of the room's periods this player has (for the availability grid)
      has: Object.fromEntries(
        availability.map((a) => [a.key, perPlayerPeriods.get(p.id).has(a.key)]),
      ),
    })),
  };
}
