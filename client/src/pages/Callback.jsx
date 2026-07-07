import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

// Spotify redirects here (?code&state). We hand the code to the server, which
// does the token exchange and sets the session cookie, then we go to /me.
export default function Callback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const ran = useRef(false); // StrictMode double-invoke guard (code is single-use)

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const spotifyError = params.get('error');
    if (spotifyError) {
      setError(`Spotify denied access: ${spotifyError}`);
      return;
    }
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      setError('Missing code or state in callback.');
      return;
    }
    api
      .callback(code, state)
      .then(() => navigate('/me', { replace: true }))
      .catch((err) => setError(err.message));
  }, [params, navigate]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <>
          <div className="text-5xl">😵</div>
          <p className="text-bad">{error}</p>
          <a href="/" className="text-accent-2 underline">
            Start over
          </a>
        </>
      ) : (
        <>
          <div className="animate-pulse text-5xl">🎧</div>
          <p className="text-ink-dim">Reading your Spotify…</p>
        </>
      )}
    </main>
  );
}
