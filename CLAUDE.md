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

### 🚀 DEPLOYED & LIVE at https://spotifyroulette.com (verified working)

Hosted on **Render** as a single always-on Node web service (Express + Socket.io
serving the built React client from one port — NOT Vercel/serverless; the app
needs a persistent process for WebSockets + in-memory rooms). Live login through
real Spotify OAuth confirmed working on the domain by the owner.

- **Prod serving:** `server/src/index.js` serves `client/dist` + SPA fallback
  when a build exists (dev still uses the Vite proxy). `trust proxy` set for
  Render's TLS terminator. Start script `start:prod` (root + server) runs
  `node src/index.js` with **no `--env-file`** — Render injects env vars.
- **`render.yaml`** blueprint: web service, `buildCommand: npm install
  --include=dev && npm run build` (the `--include=dev` is REQUIRED — `NODE_ENV=
  production` otherwise makes npm skip Vite/Tailwind devDeps and the build
  fails), `startCommand: npm run start:prod`, health check `/api/health`.
- **Env vars on Render:** `NODE_ENV=production`, `CLIENT_ORIGIN=https://
  spotifyroulette.com`, `REDIRECT_URI=https://spotifyroulette.com/callback`,
  `SPOTIFY_CLIENT_ID` (secret), `SESSION_SECRET` (Render-generated).
- **DNS (Squarespace):** custom records `A @ → 216.24.57.1` and `CNAME www →
  spotify-roulette-phqh.onrender.com`; the "Squarespace Defaults" preset
  (parking A records + www CNAME + HTTPS record) removed. Email TXT
  (SPF/DMARC/DKIM) + Domain Connect left intact. HTTPS auto-issued by Render.
- **Spotify dashboard:** redirect URI `https://spotifyroulette.com/callback`
  registered; friends' emails must be allowlisted under User Management (dev-mode
  5-user cap still applies).
- Full deploy runbook in **`DEPLOY.md`**.
- **Gotchas:** Render free tier **sleeps after ~15 min idle** (~30s cold start) —
  open the site early before a game or upgrade to Starter ($7/mo). In-memory
  state means a redeploy or the sleep **wipes all rooms + logins** — don't
  redeploy mid-game. Deploying updates = push to `main` (Render auto-builds).

Built, tested, committed, and pushed to `main` (GitHub: DhruvaKanna07/SpotifyRoulette):
- **Phase 1 — Solo data pipeline** ✅ (OAuth PKCE, top tracks + year playlists, debug screen)
- **Phase 2 — Rooms & lobby** ✅ (join codes, presence, availability grid, host settings)
- **Phase 3 — Roulette mode** ✅ (secret draw, guessing, timer, scoring, reveal, scoreboard)
- **Phase 4 — Match-Up mode** ✅ (shared-rank draw with dupe-redraw, matching board, scoring, reveal answer key, multi-round)
- **Phase 5 — Polish (nearly done)** 🚧 — done: onboarding SVG stepper, deep
  reconnect/edge-case robustness, iFrame embed player, animations, sounds,
  30s Roulette timer. **Remaining: deeper live-multiplayer testing only.**

### Latest session — product tweaks (all shipped to `main`)

Requested by the owner while playtesting solo; all done, committed, pushed:

1. **Dev mode is account-gated.** Test bots are locked to specific Spotify user
   ids — `config.devSpotifyUserIds` (defaults to the owner id
   `02i8dglcphxxgwdwg8rcqf6e5`, env override `DEV_SPOTIFY_USER_IDS`) +
   `isDevUser(session)`. `serializeRoom` exposes per-player `isDev`; the lobby
   "🤖 Add a test bot" button shows only for a dev host. Not tied to NODE_ENV.
2. **Roulette "unknown variable" setting** (`settings.unknown`, default
   `'player'`; lobby "Guess the…" selector, roulette only). Each round hides one
   attribute: **player** (song+rank shown → tap avatar), **song** (owner+rank
   shown → pick real cover from 4 decoys sampled from the room's track pool),
   **rank** (owner+song shown → type the number, **proximity-scored**: 100 exact,
   −15/rank of distance, floor 0). Engine in `roulette.js` branches per mode for
   `recordGuess`/scoring/serialize; privacy preserved per mode (player hides
   owner, song hides the correct option, rank strips `track.rank`). Owner-wrong
   bonus applies **only** in player mode. Guess payload is generic `{ guess }`.
   Bots guess per mode. Client: `RoundView` has three guess UIs (avatars / 4
   cover cards / number input), `RevealView` describes guesses per mode. Proven
   by a 24-assertion engine test (deleted after).
3. **Guess your own song.** Owner may now guess (the "sit out" screen is gone);
   everyone guesses among ALL players incl. self. `recordGuess` dropped the owner
   check; `allGuessed` now counts every connected player; bots guess on owner
   rounds too. **Own-song guesses score normally** (owner's explicit choice — a
   self-pick is an easy 100; flip if it feels exploitable).
4. **Album cover drop-in** each round (`sr-drop-in` keyframe, keyed by round
   index; reduced-motion aware).
5. **Theme is green/black (Spotify-ish), NOT purple** anymore — see the updated
   Design gotcha below. `@theme` tokens now `--color-accent`/`accent-2`/`good`
   = greens, `--color-bg` near-black.
6. **Playlist/year features hidden** behind `client/src/flags.js`
   `SHOW_PLAYLISTS=false` (Home's 2 links, lobby availability grid + "add years"
   shortcut + Settings period row). Routes/pages/`/setup`/`/me` kept for a future
   rework. Game just uses `all_time` (top 50). **Known bug to fix in that rework:
   year playlists are *detected* but their items come back empty** (`/me` shows
   `years: {2022:[],…}`) — the `/playlists/{id}/items` fetch returns nothing;
   didn't chase it since the feature is hidden.

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
- **Dev test bots** (`rooms/bots.js`) — lets ONE human play a full game with no
  second account (a room rejects duplicate Spotify accounts, and two identical
  libraries would dedup to nothing). `store.addBot` builds a fake session +
  player (`isBot`) with a synthetic distinct library covering every period.
  `dev:addBots` socket event (host, lobby, `config.devMode` only). Bots auto-play:
  `scheduleBotGuesses`/`scheduleBotSubmissions` in `game/socket.js` fire after
  each round emit — random guess (roulette) / random valid bijection (match-up)
  after a 0.7–2.6s delay, guarded by round index so stale timers no-op.
  `leaveRoom` now hands host to the next *human* and deletes a room once no
  humans remain. Client: dev-only "🤖 Add a test bot" button
  (`import.meta.env.DEV`) + a 🤖 badge on bot players. **Limitation:** bot tracks
  use synthetic ids, so the embed can't stream them — only the human's own songs
  play real audio; everything else (guessing, timer, scoring, reveals, sounds,
  animations, confetti) works fully. Proven via an 11-assertion socket.io test
  (bots join, roulette + match-up both reach reveal via bot play); deleted after.

**Verified live this session (real account, single player):** full OAuth now
completes through the callback (not just to the consent screen) — the `/setup`
and `/me` pages rendered against a real logged-in Spotify session with a clean
console. **Auto-detection of "(2)"-suffixed copies confirmed working** (e.g.
`Your Top Songs 2025 (2)` → all of 2022–2025 detected). So the solo data
pipeline is proven end-to-end in a real browser now.

**Resume here — open items, in priority order:**
0. **Solo playtest is now possible via dev bots** (see the "Dev test bots"
   bullet). Fastest way to exercise the real game in a browser: Home (connected
   as dhruva kanna, OAuth verified) → Create room → tap **🤖 Add a test bot**
   1–4× → pick mode/period → Start. Bots auto-play so rounds resolve. Not yet
   *observed* end-to-end in the browser by Claude — a good first thing to do next
   session (drive it, or hand it to the user).
1. **Live two-account HUMAN playtest** — the only thing bots don't cover: real
   simultaneous humans + working embeds for *other* players' songs. Needs a
   *second* OAuth'd Spotify account in a separate browser and the human "Agree"
   click Claude can't do. Lower priority now that bots exist.
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
- **Design:** dark, playful party-game vibe on a **green + black, Spotify-ish
  palette** (accent/accent-2/good are greens, bg near-black — changed from the
  original purple at the owner's request). Album art is the primary visual.
  Per-player bold color + emoji avatars are kept as-is (they're player identities,
  not theme). Animations live in `index.css` (`sr-*` keyframes) and honor
  `prefers-reduced-motion`.
- **Feature flag:** `client/src/flags.js` `SHOW_PLAYLISTS` currently hides all
  year/playlist UI (V1 is just "log in → top 50"). `/setup` + `/me` routes and
  the manual-tag endpoint still exist for a later rework.
```
