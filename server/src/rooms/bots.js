// Dev-only test bots: fake players with their own distinct libraries so a single
// human can play a full game without a second Spotify account. Bots auto-play
// (guess/submit) from the game socket layer. NOT available in production.

const BOT_NAMES = ['Botly', 'Rizzo', 'DJ Circuit', 'Vinyl', 'Echo', 'Nova'];

// Whimsical fake song/artist names so lobbies + boards look populated. These
// tracks use synthetic ids, so the Spotify embed player can't stream them —
// only the real human's own songs will actually play audio.
const FAKE_SONGS = [
  'Neon Alley', 'Paper Moons', 'Static Bloom', 'Velvet Hours', 'Midnight Cassette',
  'Sugar Static', 'Glass Parade', 'Low Orbit', 'Ceramic Heart', 'Analog Sunrise',
  'Ghost Radio', 'Marble Skies', 'Slow Comet', 'Electric Fable', 'Cobalt Dreams',
  'Tidal Static', 'Golden Hourglass', 'Silk Circuit', 'Amber Waves', 'Pixel Rain',
  'Hollow Bloom', 'Chrome Lullaby', 'Feral Neon', 'Quiet Riot Club', 'Saltwater Disco',
  'Paper Tigers', 'Violet Static', 'Lunar Tide', 'Copper Skyline', 'Fever Signal',
];
const FAKE_ARTISTS = [
  'The Wavelengths', 'Kid Vapor', 'Marlow', 'Sable & Sons', 'Junior Static',
  'Halcyon', 'The Paper Kites Club', 'Novaa', 'Bright Machines', 'Casette Kids',
];

// One period's ranked list of distinct fake tracks (order == rank).
function fakeList(seed, period, n) {
  return Array.from({ length: n }, (_, i) => ({
    trackId: `bot-${seed}-${period}-${i + 1}`,
    name: FAKE_SONGS[(i + seed * 7) % FAKE_SONGS.length],
    artists: [FAKE_ARTISTS[(i + seed * 3) % FAKE_ARTISTS.length]],
    albumArtUrl: null,
    rank: i + 1,
  }));
}

// A full synthetic library. Bots have every period (All Time + recent years) so
// they never restrict what the room can play — the human's real periods drive it.
export function botLibrary(seed) {
  const years = new Map();
  for (const y of [2025, 2024, 2023, 2022, 2021]) {
    years.set(y, fakeList(seed, y, 30));
  }
  return {
    profile: { id: `bot-${seed}`, displayName: BOT_NAMES[seed % BOT_NAMES.length] },
    allTime: fakeList(seed, 'all', 30),
    years,
    detectedPlaylists: [],
  };
}
