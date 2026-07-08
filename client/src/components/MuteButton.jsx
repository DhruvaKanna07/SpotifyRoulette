import { useEffect, useState } from 'react';
import { isMuted, toggleMute, subscribe, unlock } from '../sound.js';

// Small speaker toggle. Also unlocks the audio context on first interaction.
export default function MuteButton({ className = '' }) {
  const [muted, setMuted] = useState(isMuted());

  useEffect(() => subscribe(setMuted), []);

  return (
    <button
      onClick={() => {
        unlock();
        setMuted(toggleMute());
      }}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
      className={`grid h-10 w-10 place-items-center rounded-full bg-bg-raised text-lg transition active:scale-90 ${className}`}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
