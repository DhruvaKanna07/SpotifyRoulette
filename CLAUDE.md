# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Song Roulette — a mobile-web party game (max 5 friends) that quizzes a group on
whose top Spotify song is whose. `spotify-game-plan.md` is the authoritative
spec, including **hard Spotify API constraints verified for 2026** (dev-mode
5-user cap, Wrapped playlists unreadable, `/playlists/{id}/items` not `/tracks`,
no `preview_url`, etc.). Read it before touching Spotify integration — those
constraints are real and must not be "simplified" away.

## Current status (resume here)

Built, tested, committed, and pushed to `main` (GitHub: DhruvaKanna07/SpotifyRoulette):
- **Phase 1 — Solo data pipeline** ✅ (OAuth PKCE, top tracks + year playlists, debug screen)
- **Phase 2 — Rooms & lobby** ✅ (join codes, presence, availability grid, host settings)
- **Phase 3 — Roulette mode** ✅ (secret draw, guessing, timer, scoring, reveal, scoreboard)
- **Phase 4 — Match-Up mode** ✅ (shared-rank draw with dupe-redraw, matching board, scoring, reveal answer key, multi-round)
- **Phase 5 — Polish (nearly done)** 🚧 — done: onboarding SVG stepper, deep
  reconnect/edge-case robustness, iFrame embed player, animations, sounds,
  30s Roulette timer. **Remaining: deeper live-multiplayer testing only.**

Phase 5 done so far:
- **iFrame embed player** (`components/EmbedPlayer.jsx`): Spotify embed
  (`open.spotify.com/embed/track/{id}?theme=0`) — the only way to hear a song in
  dev mode. Always-on under the Roulette round + reveal cards; lazy per-card
  "▶ Listen" toggle in the Match-Up board and reveal (avoids N iframes at once).
- **Animations** (`index.css` keyframes + `useCountUp.js`): fade-up card
  entrances, pop/shake on reveal, bounce-in + falling confetti on the winner
  screen, and score count-ups on every scoreboard. Honors
  `prefers-reduced-motion`.
- **Sounds** (`sound.js`, all Web-Audio-synthesized — no asset files, works
  offline): countdown tick (last 5s), lock-in, reveal, correct/wrong, winner
  fanfare. Muted state persists in localStorage; `components/MuteButton.jsx` 🔊/🔇
  lives in the lobby header. Audio is unlocked on the first user gesture (Start
  button, a guess, a submit, or the mute toggle) — required by mobile browsers.
- **Roulette timer default is now 30s** (`DEFAULT_SETTINGS.timerSec`, still
  host-adjustable 5–60). Match-Up stays timerless (submit → auto-reveal when all
  in). Round count is host-choosable via the existing lobby "Rounds" stepper
  (1–20; Match-Up is additionally capped to the number of distinct shared ranks).
- **Onboarding stepper** (`pages/Setup.jsx`, route `/setup`): 4-step illustrated
  guide (brand-neutral inline-SVG phone mocks, no Spotify branding) for copying a
  "Your Top Songs {year}" Wrapped playlist into an owned copy. Period row leads
  with **All Time** (automatic, no copy needed) then copy-able years; Rescan is
  always in the header and reports newly detected years. **Manual-tag fallback**
  (spec §Playlist detection): if auto-detection misses a renamed/localized copy,
  paste its playlist link → `POST /api/playlists/manual {url, period}` parses the
  id, fetches items, and tags it. The mapping is stored on the session
  (`player.manualPlaylists`) and **re-applied inside `buildLibrary`**, so it
  survives rescans. Entry points from Home, the `/me` debug page, and a "Missing
  a year?" shortcut under the lobby availability grid. `/me` and `/setup` show
  "← Back to game" when the player came from a room (remembered in
  `sessionStorage['sr_room']`).
- **Deep robustness:** (1) **reconnect bug fixed** — `joinRoom` checked the
  `phase !== 'lobby'` gate *before* the known-player rejoin branch, so a mid-game
  phone refresh failed to restore; the rejoin check now runs first (new players
  are still blocked mid-game). (2) **no-stall on disconnect** — `handleGameDisconnect`
  (in `game/socket.js`, called from the room `disconnect` handler) re-checks
  round completion when a player drops, so a game never hangs on someone who
  left. Critical for Match-Up, which has no timer. (3) **needs-reauth** — a failed
  token refresh sets `session.needsReauth` (via `refreshOrFlag` in `library.js`,
  cleared on a clean scan) instead of throwing/killing the room; surfaced as a
  per-player `needsReauth` in `serializeRoom` → a ⚠️ badge + a "Reconnect Spotify"
  banner in the lobby. Players keep playing from their cached library.
- Proven via a 7-assertion socket.io integration test (reconnect restores the
  round, Match-Up reveals when the hold-out disconnects, needsReauth surfaces);
  script deleted after.

**Verified live this session (real account, single player):** full OAuth now
completes through the callback (not just to the consent screen) — the `/setup`
and `/me` pages rendered against a real logged-in Spotify session with a clean
console. **Auto-detection of "(2)"-suffixed copies confirmed working** (e.g.
`Your Top Songs 2025 (2)` → all of 2022–2025 detected). So the solo data
pipeline is proven end-to-end in a real browser now.

**Resume here — open items, in priority order:**
1. **Live two-account playtest of the actual game** (roulette + match-up, incl.
   embed/sounds/animations). Still not done — needs a *second* OAuth'd Spotify
   account in a separate browser, and the human "Agree" click Claude can't do.
   Drive: reconnect Spotify → create room → hand off Agree → second account joins.
2. **Decision pending (asked, not answered): easier friend-testing setup.** Two
   options offered — (a) add `express.static` so the whole app serves from the
   single Node port (cleanest for a Cloudflare/ngrok tunnel + future deploy), or
   (b) just add `server.allowedHosts` to `vite.config.js` for a quick tunnel of
   the dev server. See the "test with a friend" notes: the 3 Spotify must-dos are
   owner-has-Premium, allowlist each friend's email under User Management, and
   register the exact redirect URI.
3. **Optional follow-up (offered, not answered):** a "Return to your active room"
   button on Home when the session still has a `roomCode` (needs the client to
   learn its room — e.g. include `roomCode` in `/me`, or the `sr_room`
   sessionStorage value already set by the lobby).

**Gotcha that bit us:** all state is in-memory, so editing any *server* file
triggers the `node --watch` restart and **wipes every session and room** — a
mid-playtest login vanishes. Batch server edits, and expect to reconnect Spotify
after them. (Item 2a would also make it easy to run a stable prebuilt server that
doesn't restart on edits.)

Phase 4 shape (as built): `game/matchup.js` is the pure engine (mirrors
`roulette.js` — `startMatchGame`/`drawMatchRound`/`recordSubmission`/
`allSubmitted`/`revealMatch`/`advanceMatch` + serializers). Picks one rank R
within `min(list lengths)` that no two players share (skip/redraw on dupes),
pulls every player's song at R, shuffles into `songs:[{cardId,ownerId,track}]`
(ownerId **secret** — never in the round payload). Each player submits a full
bijection matching (`matchup:submit {assignment: {cardId: playerId}}`, validated
server-side); auto-reveal when all connected players submit, plus a host-only
`matchup:reveal` fallback. `matchup:next` advances (host, in reveal). Rounds are
capped to the number of distinct playable ranks (`room.matchRounds`). New client
events `game:matchRound` (per-socket, privacy-preserving) / `game:matchReveal`
(broadcast, includes answer key + per-player results) drive `MatchUpView` /
`MatchRevealView`; `game:ended` + `game:playAgain` are shared with roulette.
No timer in Match-Up. Proven via a 23-assertion socket.io integration test
(same throwaway-script pattern as Phase 3, deleted after).

Task list (`TaskList`) tracks these six phases if the tools are available.

### Verified in a real browser vs. not

**Now verified (single account, real browser):** full OAuth through the callback,
library build, `/setup` + `/me` pages, and auto-detection of copied year
playlists (see "Resume here" above).

**Still NOT verified — the live multiplayer feel:** two players in a room actually
playing roulette/match-up, and the in-game polish (embed player, sounds,
animations) firing during real rounds. This needs a *second* OAuth'd Spotify
account in a separate browser, plus the human **Agree** click (an authorization
grant Claude must not perform). Game logic is otherwise proven via socket.io
integration tests (Phase 3: 27 assertions; Phase 4: 23; Phase 5 robustness: 7 —
all standalone scripts, deleted after). To do the live test: reconnect Spotify,
hand off the Agree click, create a room, then have the second account join with
the code from another browser/device.

### Working agreement

The user wants **git used for the whole project**: after each meaningful chunk,
commit with a clean message and `git push origin main`. `.env` (holds the real
`SPOTIFY_CLIENT_ID`) is gitignored and exists locally — never commit it. Dev
servers may already be running in the background from a prior session (check
`curl -s http://127.0.0.1:3001/api/health` before starting new ones).

## Commands

```bash
npm install                      # from repo root (npm workspaces)
cp .env.example .env             # then set SPOTIFY_CLIENT_ID (required to boot)
npm run dev                      # client (:5173) + server (:3001) together
npm run dev:server               # server only (node --watch, restarts on change)
npm run dev:client               # client only (Vite)
npm run build                    # production build of the client
npm run start --workspace server # run server without --watch
```

Server startup **throws** if `SPOTIFY_CLIENT_ID` is unset (see `config.js`).
Local dev must use `127.0.0.1` (not `localhost`) — Spotify only allows plain
`http` redirect URIs on `127.0.0.1`, and the redirect URI must match the app
dashboard exactly.

### Tests

There is no test runner configured. Tests so far are **standalone ESM scripts**
run directly:

```bash
node --env-file=.env ./some-test.mjs
```

Two patterns, both important to reproduce:
- **Pure logic** (engine, availability): import functions and assert. Node's ESM
  resolver walks up for `node_modules`, so the script must live **inside the repo
  tree** (repo root works; `/tmp` and the scratchpad do NOT resolve `express`
  etc.). Import repo modules by absolute path.
- **Socket integration**: spin up a throwaway `http` + `socket.io` server with
  `registerRoomHandlers(io)`, inject fake sessions via `createSession(...)` (the
  session store is a per-process singleton shared with the server), then connect
  `socket.io-client` with `extraHeaders: { cookie: 'sr_session=<token>' }`.
  Always add a hard `setTimeout(...process.exit)` guard — a missing socket event
  hangs forever otherwise. Delete the script when done (keep the tree clean).

## Architecture

npm-workspaces monorepo: `client/` (React 19 + Vite + Tailwind v4) and `server/`
(Express + Socket.io). **All state is in-memory — no database by design.**
Everything is lost on restart. Fine for one friend group.

The Vite dev server **proxies `/api` and `/socket.io` to the server** (see
`client/vite.config.js`), so the browser talks to a single origin (:5173) and
the session cookie "just works" with no browser-side CORS.

### The identity model (read this first)

**A session IS a player.** OAuth (PKCE, exchanged server-side) creates an
in-memory session keyed by a signed cookie (`sessions.js`); `session.id` doubles
as the stable player id everywhere. A room `Player` (`rooms/store.js`) wraps a
session and exposes `library` via a getter that reads back through to the live
session, so token refresh and rescans are automatically visible to the room.
Sockets authenticate by parsing that same cookie from the handshake
(`rooms/socket.js` → `sessionFromSocket`).

Consequence: players connect Spotify **before** creating/joining a room (a
deliberate deviation from the spec's "join then connect" — it keeps the lobby's
availability grid fully populated).

### The privacy invariant (do not break)

A player's full track lists and OAuth tokens live **only on the server**. The
only things a client ever receives are:
- `serializeRoom()` — lobby snapshot; excludes `session`, `library`, tokens.
- `serializeRoundFor(room, viewerId)` — per-viewer round view. It tells a client
  only whether **it** is the owner (`youAreOwner`) and **its own** guess; the
  secret `ownerId` and other players' guesses are never included.
- `serializeReveal()` — broadcast only after the answer is public.

The round emit is therefore **per-socket**, not a broadcast: `emitRound` in
`game/socket.js` does `io.in(code).fetchSockets()` and emits a tailored payload
to each. Any change here must preserve the invariant (the integration test
asserts no `game:round` payload contains `ownerId`/`guesses`).

### Server layout

- `spotify/` — `auth.js` (PKCE + token exchange/refresh), `api.js` (endpoint
  wrappers; throws with `.status` so callers can refresh on 401), `library.js`
  (builds All-Time from top tracks + per-year lists from owned "Your Top Songs
  {year}" playlist copies, where **track order == rank**).
- `routes/auth.js` — login/callback/me/rescan HTTP endpoints; sets the session
  cookie.
- `rooms/` — `room.js` (avatars, availability, `serializeRoom`; a period is
  playable only when **every** player owns it), `store.js` (in-memory rooms,
  join codes, join/leave/host-reassign), `socket.js` (the single `connection`
  handler; also handles rejoin-on-refresh and calls `attachGameHandlers`).
- `game/` — `roulette.js` is **pure logic over a room** (draw/dedup/balance/
  score/serialize; no IO, no timers). `socket.js` owns the timers and the
  per-viewer emits and calls into the engine. Keep that separation.

### Client layout

- Routes in `main.jsx`: `/` (auth-aware Home: Connect vs Create/Join), `/callback`
  (OAuth return → POSTs code to server), `/me` (debug "what the game sees"),
  `/room/:code` (`pages/Room.jsx`).
- `pages/Room.jsx` is a **phase-driven container**: it subscribes to socket
  events (`room:state`, `game:round`, `game:reveal`, `game:ended`) and swaps
  between `game/LobbyView`, `RoundView`, `RevealView`, `FinalView`. `room:state`
  only drives the lobby view; game events drive the rest.
- `socket.js` is a lazy singleton `io({ withCredentials: true })`.

## Gotchas

- **Tailwind v4 colors:** custom colors are defined in `@theme` in `index.css`
  and used as **named tokens** (`bg-good`, `text-ink-dim`, `from-accent`). The
  v3-style `bg-[--color-good]` bracket form compiles to invalid CSS in v4 and is
  silently dropped (this already caused an invisible-UI bug). Use the token form.
- **StrictMode double-invoke:** the OAuth `code` is single-use, so `/callback`
  guards its exchange with a ref (`Callback.jsx`). Preserve that.
- **Design:** dark, playful party-game vibe; deliberately **not** Spotify's
  branding. Album art is the primary visual. Per-player bold color + emoji avatar.
```
