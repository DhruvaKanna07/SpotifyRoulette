import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getSocket } from '../socket.js';
import LobbyView from '../game/LobbyView.jsx';
import RoundView from '../game/RoundView.jsx';
import RevealView from '../game/RevealView.jsx';
import FinalView from '../game/FinalView.jsx';
import MatchUpView from '../game/MatchUpView.jsx';
import MatchRevealView from '../game/MatchRevealView.jsx';

export default function Room() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  const [meId, setMeId] = useState(null);
  const [round, setRound] = useState(null);
  const [reveal, setReveal] = useState(null);
  const [matchRound, setMatchRound] = useState(null);
  const [matchReveal, setMatchReveal] = useState(null);
  const [final, setFinal] = useState(null);
  const [stage, setStage] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    const socket = getSocket();

    const onRoomState = (state) => {
      setRoom(state);
      // Only the lobby snapshot drives the lobby view; game events drive the rest.
      if (state.phase === 'lobby') {
        setStage('lobby');
        setRound(null);
        setReveal(null);
        setMatchRound(null);
        setMatchReveal(null);
        setFinal(null);
      }
    };
    const onRound = (r) => {
      setRound(r);
      setReveal(null);
      setStage('round');
    };
    const onReveal = (r) => {
      setReveal(r);
      setStage('reveal');
    };
    const onMatchRound = (r) => {
      setMatchRound(r);
      setMatchReveal(null);
      setStage('matchRound');
    };
    const onMatchReveal = (r) => {
      setMatchReveal(r);
      setStage('matchReveal');
    };
    const onEnded = (f) => {
      setFinal(f);
      setStage('final');
    };
    const onErr = (e) => {
      if (e.code === 'not_authenticated') navigate('/', { replace: true });
    };

    socket.on('room:state', onRoomState);
    socket.on('game:round', onRound);
    socket.on('game:reveal', onReveal);
    socket.on('game:matchRound', onMatchRound);
    socket.on('game:matchReveal', onMatchReveal);
    socket.on('game:ended', onEnded);
    socket.on('room:error', onErr);

    const join = () =>
      socket.emit('room:join', { code }, (res) => {
        if (res?.ok) setMeId(res.playerId ?? null);
        else setError(res?.error ?? 'join_failed');
      });
    if (socket.connected) join();
    else socket.once('connect', join);

    return () => {
      socket.off('room:state', onRoomState);
      socket.off('game:round', onRound);
      socket.off('game:reveal', onReveal);
      socket.off('game:matchRound', onMatchRound);
      socket.off('game:matchReveal', onMatchReveal);
      socket.off('game:ended', onEnded);
      socket.off('room:error', onErr);
    };
  }, [code, navigate]);

  const isHost = room?.hostPlayerId === meId;
  const onGuess = (playerId) => getSocket().emit('game:guess', { guessPlayerId: playerId });
  const onNext = () => getSocket().emit('game:next', {});
  const onMatchSubmit = (assignment) => getSocket().emit('matchup:submit', { assignment });
  const onMatchNext = () => getSocket().emit('matchup:next', {});
  const onPlayAgain = () => getSocket().emit('game:playAgain', {});
  const onLeave = () =>
    getSocket().emit('room:leave', {}, () => {
      try {
        sessionStorage.removeItem('sr_room');
      } catch {
        // ignore
      }
      navigate('/', { replace: true });
    });

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-5xl">🚪</div>
        <p className="text-bad">{ERRORS[error] ?? 'Something went wrong joining this room.'}</p>
        <a href="/" className="text-accent-2 underline">Back home</a>
      </main>
    );
  }

  if (stage === 'round' && round) {
    return <RoundView round={round} meId={meId} onGuess={onGuess} />;
  }
  if (stage === 'reveal' && reveal) {
    return <RevealView reveal={reveal} meId={meId} isHost={isHost} onNext={onNext} />;
  }
  if (stage === 'matchRound' && matchRound) {
    return <MatchUpView round={matchRound} meId={meId} onSubmit={onMatchSubmit} />;
  }
  if (stage === 'matchReveal' && matchReveal) {
    return (
      <MatchRevealView reveal={matchReveal} meId={meId} isHost={isHost} onNext={onMatchNext} />
    );
  }
  if (stage === 'final' && final) {
    return (
      <FinalView
        final={final}
        meId={meId}
        isHost={isHost}
        onPlayAgain={onPlayAgain}
        onLeave={onLeave}
      />
    );
  }
  if (stage === 'lobby' && room) {
    return <LobbyView room={room} meId={meId} onLeave={onLeave} />;
  }
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <p className="animate-pulse text-ink-dim">Joining room {code}…</p>
    </main>
  );
}

const ERRORS = {
  room_not_found: "That room code doesn't exist.",
  room_full: 'That room is full (5 players max).',
  game_in_progress: 'That game already started.',
  account_already_in_room: 'That Spotify account is already in the room.',
};
