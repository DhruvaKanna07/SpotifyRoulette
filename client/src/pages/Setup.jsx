import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

// A simplified, brand-neutral phone mock (deliberately NOT Spotify's UI). The
// illustrations teach the copy-a-Wrapped-playlist workaround the app depends on.
function Phone({ children }) {
  return (
    <svg viewBox="0 0 240 300" className="mx-auto w-48" role="img">
      <rect x="8" y="4" width="224" height="292" rx="26" fill="var(--color-bg-raised)" />
      <rect x="16" y="14" width="208" height="272" rx="18" fill="var(--color-bg)" />
      <rect x="98" y="20" width="44" height="6" rx="3" fill="var(--color-bg-raised)" />
      {children}
    </svg>
  );
}

function SearchArt({ year }) {
  return (
    <Phone>
      {/* search field */}
      <rect x="28" y="40" width="184" height="26" rx="13" fill="var(--color-bg-card)" />
      <circle cx="42" cy="53" r="6" fill="none" stroke="var(--color-ink-dim)" strokeWidth="2" />
      <line x1="46" y1="57" x2="50" y2="61" stroke="var(--color-ink-dim)" strokeWidth="2" />
      <text x="56" y="57" fill="var(--color-ink)" fontSize="9" fontWeight="700">
        Your Top Songs {year}
      </text>
      {/* result row */}
      <rect x="28" y="80" width="184" height="44" rx="10" fill="var(--color-bg-card)" />
      <rect x="36" y="88" width="28" height="28" rx="5" fill="var(--color-accent)" />
      <text x="50" y="106" fill="#fff" fontSize="11" fontWeight="800" textAnchor="middle">
        ♪
      </text>
      <text x="72" y="99" fill="var(--color-ink)" fontSize="8" fontWeight="700">
        Your Top Songs {year}
      </text>
      <text x="72" y="112" fill="var(--color-ink-dim)" fontSize="7">
        Playlist · Spotify
      </text>
    </Phone>
  );
}

function MenuArt() {
  return (
    <Phone>
      <text x="120" y="46" fill="var(--color-ink)" fontSize="10" fontWeight="800" textAnchor="middle">
        ⋯  more
      </text>
      {/* bottom-sheet options */}
      {[
        ['Add to playlist', false],
        ['Add to other playlist', true],
        ['Share', false],
      ].map(([label, hi], i) => (
        <g key={label}>
          <rect
            x="24"
            y={70 + i * 40}
            width="192"
            height="32"
            rx="8"
            fill={hi ? 'var(--color-accent-2)' : 'var(--color-bg-card)'}
          />
          <text
            x="40"
            y={90 + i * 40}
            fill={hi ? '#fff' : 'var(--color-ink)'}
            fontSize="9"
            fontWeight={hi ? '800' : '600'}
          >
            + {label}
          </text>
        </g>
      ))}
      <text x="120" y="230" fill="var(--color-ink-dim)" fontSize="8" textAnchor="middle">
        tap the highlighted one
      </text>
    </Phone>
  );
}

function NameArt({ year }) {
  return (
    <Phone>
      <text x="120" y="50" fill="var(--color-ink)" fontSize="11" fontWeight="800" textAnchor="middle">
        New playlist
      </text>
      {/* name field with the required name */}
      <rect x="28" y="70" width="184" height="34" rx="8" fill="var(--color-bg-card)" stroke="var(--color-accent)" strokeWidth="2" />
      <text x="40" y="91" fill="var(--color-ink)" fontSize="10" fontWeight="700">
        Your Top Songs {year}
      </text>
      <text x="120" y="128" fill="var(--color-ink-dim)" fontSize="8" textAnchor="middle">
        keep the name — it must contain
      </text>
      <text x="120" y="142" fill="var(--color-good)" fontSize="8" fontWeight="800" textAnchor="middle">
        “Your Top Songs {year}”
      </text>
      {/* create button */}
      <rect x="76" y="164" width="88" height="30" rx="15" fill="var(--color-good)" />
      <text x="120" y="184" fill="#08301f" fontSize="10" fontWeight="800" textAnchor="middle">
        Create
      </text>
    </Phone>
  );
}

function RescanArt() {
  return (
    <Phone>
      <text x="120" y="60" fontSize="30" textAnchor="middle">🎵🎯</text>
      <circle cx="120" cy="150" r="34" fill="none" stroke="var(--color-accent-2)" strokeWidth="5" strokeDasharray="150 60" strokeLinecap="round" />
      <path d="M120 118 l10 6 l-10 6 z" fill="var(--color-accent-2)" />
      <text x="120" y="220" fill="var(--color-ink-dim)" fontSize="9" textAnchor="middle">
        back in Song Roulette
      </text>
    </Phone>
  );
}

const STEPS = [
  {
    art: SearchArt,
    title: 'Find your Wrapped playlist',
    body: (year) => (
      <>
        In the Spotify app, search <b>“Your Top Songs {year}”</b>. These often
        aren't saved in your library — searching finds them.
      </>
    ),
  },
  {
    art: MenuArt,
    title: 'Copy it into your own playlist',
    body: () => (
      <>
        Open the playlist's <b>⋯</b> menu → <b>Add to other playlist</b> →{' '}
        <b>New playlist</b>. Spotify's own Wrapped playlists can't be read by
        apps, but a copy you own can.
      </>
    ),
  },
  {
    art: NameArt,
    title: 'Keep the suggested name',
    body: (year) => (
      <>
        Leave the name containing <b>“Your Top Songs {year}”</b> and tap{' '}
        <b>Create</b>. The song order is preserved — that order is the ranking
        the game uses.
      </>
    ),
  },
  {
    art: RescanArt,
    title: 'Come back and Rescan',
    body: () => (
      <>
        Return here and tap <b>Rescan</b>. Newly copied years will light up in
        the lobby's availability grid.
      </>
    ),
  },
];

const YEARS = [0, 1, 2, 3, 4].map((n) => new Date().getFullYear() - 1 - n);

export default function Setup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [year, setYear] = useState(YEARS[0]);
  const [owned, setOwned] = useState([]); // years already detected
  const [rescanning, setRescanning] = useState(false);
  const [result, setResult] = useState(null); // { added: number } | { error }

  useEffect(() => {
    api
      .me()
      .then((d) => setOwned(d.library.availableYears ?? []))
      .catch((err) => {
        if (err.status === 401) navigate('/', { replace: true });
      });
  }, [navigate]);

  async function rescan() {
    setRescanning(true);
    setResult(null);
    try {
      const res = await api.rescan();
      const years = res.library.availableYears ?? [];
      const added = years.filter((y) => !owned.includes(y));
      setOwned(years);
      setResult({ added });
    } catch (err) {
      setResult({ error: err.status === 502 ? 'reach' : 'unknown' });
    } finally {
      setRescanning(false);
    }
  }

  const s = STEPS[step];
  const Art = s.art;
  const isLast = step === STEPS.length - 1;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 py-6">
      <header className="mb-2 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-sm text-ink-dim">
          ← Back
        </button>
        <p className="text-xs uppercase tracking-wide text-ink-dim">
          Add a year · step {step + 1}/{STEPS.length}
        </p>
      </header>

      {/* which year you're copying (drives the illustrations) */}
      <div className="mb-4 flex flex-wrap justify-center gap-2">
        {YEARS.map((y) => {
          const has = owned.includes(y);
          const sel = y === year;
          return (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded-full px-3 py-1 text-sm font-bold transition ${
                sel ? 'bg-accent text-white' : 'bg-bg-raised text-ink-dim'
              }`}
            >
              {y} {has ? '✓' : ''}
            </button>
          );
        })}
      </div>

      <section className="card flex flex-1 flex-col items-center p-5 text-center">
        <div className="mb-4">
          <Art year={year} />
        </div>
        <h1 className="text-xl font-extrabold">{s.title}</h1>
        <p className="mt-2 text-sm text-ink-dim">{s.body(year)}</p>

        {isLast && (
          <div className="mt-5 w-full space-y-3">
            <button
              onClick={rescan}
              disabled={rescanning}
              className="w-full rounded-full bg-good px-6 py-3 text-lg font-extrabold text-[#08301f] transition active:scale-95 disabled:opacity-60"
            >
              {rescanning ? 'Rescanning…' : 'Rescan playlists'}
            </button>
            {result?.added && (
              <p className="text-sm font-bold text-good">
                {result.added.length > 0
                  ? `Added ${result.added.join(', ')} 🎉`
                  : 'No new years found yet — double-check the playlist name.'}
              </p>
            )}
            {result?.error && (
              <p className="text-sm text-bad">
                {result.error === 'reach'
                  ? "Couldn't reach Spotify. Try reconnecting from Home."
                  : 'Rescan failed. Try again.'}
              </p>
            )}
          </div>
        )}
      </section>

      {/* progress dots */}
      <div className="my-4 flex justify-center gap-2">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-2 rounded-full transition-all ${
              i === step ? 'w-6 bg-accent' : 'w-2 bg-white/20'
            }`}
          />
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep((n) => Math.max(0, n - 1))}
          disabled={step === 0}
          className="flex-1 rounded-full bg-bg-raised px-6 py-3 font-bold text-ink-dim transition active:scale-95 disabled:opacity-30"
        >
          Previous
        </button>
        {!isLast ? (
          <button
            onClick={() => setStep((n) => Math.min(STEPS.length - 1, n + 1))}
            className="flex-1 rounded-full bg-accent-2 px-6 py-3 font-bold text-white transition active:scale-95"
          >
            Next
          </button>
        ) : (
          <button
            onClick={() => navigate('/me')}
            className="flex-1 rounded-full bg-accent-2 px-6 py-3 font-bold text-white transition active:scale-95"
          >
            View my data
          </button>
        )}
      </div>
    </main>
  );
}
