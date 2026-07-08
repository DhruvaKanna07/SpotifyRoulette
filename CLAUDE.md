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

**Next up: Phase 5 — Polish & edge cases** (onboarding SVG stepper, iFrame embed
player, animations/sounds, deeper reconnect handling).

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

### Not yet verified in a real browser

The **live multiplayer feel** has never been exercised end-to-end in the browser
because it needs two OAuth'd Spotify accounts. OAuth works up to Spotify's
consent screen (verified); completing it requires the user to click **Agree**
(an authorization grant Claude must not click). Phase 3 logic is proven via a
27-assertion socket.io integration test instead. If asked to do the live test:
drive Home → Connect Spotify, hand off the Agree click to the user, then create/
join a room. A second player needs a different account in a separate browser.

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
