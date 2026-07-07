export default function Avatar({ player, size = 'md', dimmed = false }) {
  const dim =
    size === 'sm'
      ? 'h-8 w-8 text-base'
      : size === 'lg'
        ? 'h-16 w-16 text-3xl'
        : 'h-11 w-11 text-xl';
  return (
    <div
      className={`grid ${dim} shrink-0 place-items-center rounded-full transition ${dimmed ? 'opacity-40' : ''}`}
      style={{ background: player.avatar.color }}
      title={player.displayName}
    >
      {player.avatar.emoji}
    </div>
  );
}
