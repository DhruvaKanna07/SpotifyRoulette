# Song Roulette

A party game for a fixed friend group (max 5) where everyone connects their
Spotify account and the game quizzes the group on **whose top song is whose**.
Inspired by Photo Roulette, but for music taste.

See [`spotify-game-plan.md`](./spotify-game-plan.md) for the full spec, the hard
Spotify API constraints, and the phased build plan.

## Stack

- **`client/`** — React + Vite + Tailwind v4, mobile-first.
- **`server/`** — Node + Express + Socket.io, in-memory state (no database in v1).
- npm workspaces monorepo. The Vite dev server proxies `/api` and sockets to the
  backend so everything is same-origin (the session cookie just works).

## Phase 0 — one-time Spotify setup (manual)

Spotify dev-mode rules (Feb 2026): **max 5 users**, 1 app per developer, and the
app owner must have **Spotify Premium**.

1. Create an app at <https://developer.spotify.com/dashboard>.
2. Add a Redirect URI: `http://127.0.0.1:5173/callback` (Spotify allows plain
   `http` only for `127.0.0.1`).
3. Under **User Management**, add every player's Spotify account email (5 max).
4. Copy the app's **Client ID**.

## Running locally

```bash
# 1. Install (from repo root)
npm install

# 2. Configure env
cp .env.example .env
#    then edit .env and set SPOTIFY_CLIENT_ID to your app's Client ID

# 3. Start client + server together
npm run dev
```

Then open <http://127.0.0.1:5173>.

- `npm run dev` — client (5173) + server (3001) together.
- `npm run dev:server` / `npm run dev:client` — run one side.
- `npm run build` — production build of the client.

## Status

- ✅ **Phase 1 — Solo data pipeline.** OAuth PKCE (server-side token exchange),
  fetches `/me`, top tracks (`long_term`), and owned "Your Top Songs {year}"
  playlists; detects year playlists, builds ranked lists, token refresh, and a
  "what the game sees about you" debug screen with Rescan.
- ✅ **Phase 2 — Rooms & lobby.** Socket.io rooms with short join codes,
  presence, the players×periods availability grid (a period is playable only
  when every player owns that year's data), and host settings (mode / period /
  rounds / timer). In-memory room state; lobby snapshots never leak tracks or
  tokens. Note: players connect Spotify *before* creating/joining a room (a
  cleaner variation on the spec's "join then connect").
- ⬜ Phase 3 — Roulette mode
- ⬜ Phase 4 — Match-Up mode
- ⬜ Phase 5 — Polish & edge cases
