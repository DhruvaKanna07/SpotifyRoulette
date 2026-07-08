// Spotify iFrame embed — the only way to actually hear a song in dev mode
// (there is no preview_url). Album art stays the primary visual elsewhere; this
// is an optional "listen" affordance.
export default function EmbedPlayer({ trackId, compact = true }) {
  if (!trackId) return null;
  return (
    <iframe
      title="Spotify player"
      // theme=0 = dark, matches our palette.
      src={`https://open.spotify.com/embed/track/${trackId}?theme=0`}
      width="100%"
      height={compact ? 80 : 152}
      loading="lazy"
      allow="encrypted-media; clipboard-write; picture-in-picture"
      style={{ border: 0, borderRadius: 12, colorScheme: 'normal' }}
    />
  );
}
