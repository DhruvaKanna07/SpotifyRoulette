// Tiny synthesized sound engine. No audio files (keeps the app asset-free and
// offline-friendly) — everything is generated with the Web Audio API. Mobile
// browsers require a user gesture before audio can start, so `unlock()` is
// called on the first tap and resumes a suspended context.

const STORE_KEY = 'sr_muted';
let ctx = null;
let muted = readMuted();
const listeners = new Set();

function readMuted() {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted() {
  return muted;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(STORE_KEY, muted ? '1' : '0');
  } catch {
    // ignore
  }
  listeners.forEach((fn) => fn(muted));
  if (!muted) unlock();
  return muted;
}

function getCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

// Call from a user gesture (first tap) so audio is allowed to play later.
export function unlock() {
  const c = getCtx();
  if (c && c.state === 'suspended') c.resume();
}

// Play one shaped oscillator note.
function note(freq, start, dur, { type = 'sine', gain = 0.14 } = {}) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function play(fn) {
  if (muted) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume();
  fn();
}

// --- Named effects ----------------------------------------------------------

export const sfx = {
  // Countdown blip (last few seconds of a Roulette round).
  tick: () => play(() => note(880, 0, 0.06, { type: 'square', gain: 0.05 })),
  // A guess / a Match-Up submission locks in.
  lockIn: () =>
    play(() => {
      note(523.25, 0, 0.09, { type: 'triangle' });
      note(783.99, 0.06, 0.12, { type: 'triangle' });
    }),
  // A round's answer is revealed.
  reveal: () =>
    play(() => {
      note(392, 0, 0.14, { type: 'sine', gain: 0.12 });
      note(587.33, 0.05, 0.16, { type: 'sine', gain: 0.12 });
    }),
  correct: () =>
    play(() => {
      note(659.25, 0, 0.1, { type: 'triangle' });
      note(987.77, 0.08, 0.16, { type: 'triangle' });
    }),
  wrong: () => play(() => note(174.61, 0, 0.22, { type: 'sawtooth', gain: 0.09 })),
  // Winner fanfare on the final screen.
  win: () =>
    play(() => {
      const seq = [523.25, 659.25, 783.99, 1046.5];
      seq.forEach((f, i) => note(f, i * 0.12, 0.28, { type: 'triangle', gain: 0.14 }));
    }),
};
