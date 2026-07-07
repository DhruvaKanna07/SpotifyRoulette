# Song Roulette — Build Plan

A party game for a fixed friend group (max 5 people) where everyone connects their Spotify account, and the game quizzes the group on whose top song is whose. Inspired by Photo Roulette, but for music taste.

This document is the working spec for building the app with Claude Code. It includes hard platform constraints discovered during research — **do not "simplify" around these, they are real API restrictions as of 2026.**

---

## 1. Hard Spotify API constraints (non-negotiable, verified July 2026)

1. **Development mode limits (Feb 2026 rules):** max **5 users per app**, 1 app per developer, and the app owner must have **Spotify Premium**. Every player's Spotify account email must be manually allowlisted in the Spotify Developer Dashboard (User Management tab). This app will never be public — it is for one friend group.
2. **Spotify-owned playlists are unreadable.** All Wrapped playlists ("Your Top Songs 2023", etc.) are owned by Spotify. Requesting them via the API returns **404**, and they are **filtered out of `/me/playlists` responses entirely** — even if the user has saved/followed them. Following ≠ owning. There is no way to read them directly.
3. **Playlist items are only readable for playlists the user owns or collaborates on.** For any other playlist, only metadata is returned (no `items` field).
4. **Workaround for year data (core to this app):** each player copies their Wrapped playlist into a playlist *they own* (Spotify app: playlist → ⋯ → *Add to other playlist* → *New playlist*). The copy preserves track order, and **track order = rank** (first song = their #1). The game reads these copies.
5. **`GET /me/top/tracks` still works** (endpoint: "Get User's Top Items"). `time_range=long_term` covers roughly the last year-plus of listening and is ranked. This powers "All Time" mode with zero setup.
6. **Feb 2026 endpoint renames:** playlist tracks are now `GET /playlists/{id}/items` (NOT `/tracks`), and the response field is `items`. Do not use pre-2026 endpoint paths from old tutorials/SDKs — verify each endpoint against current docs.
7. **No 30-second preview URLs.** `preview_url` is null/removed for dev-mode apps. To let players *hear* a song, use the **Spotify iFrame Embed** (`https://open.spotify.com/embed/track/{id}`). Album art (`album.images`) is still available and should be the primary visual.
8. **Search endpoint limit is 10 per page** (not needed for v1, noted for completeness).
9. Some profile fields were removed (e.g., email on `/me`). Use `display_name` + `id` from `GET /me`; don't rely on removed fields.

**OAuth:** Authorization Code with PKCE. Scopes needed: `user-top-read`, `playlist-read-private`. Handle token refresh; store tokens server-side keyed to the player's session.

---

## 2. Product overview

- **Players:** 2–5, each on their own phone (mobile-first web app). One player is the host.
- **Rooms:** host creates a room → gets a short join code → friends join with the code, then each connects Spotify.
- **Time period selection:** the group plays with exactly ONE period per game: a single year (e.g., 2023) **or** All Time. Never multiple years mixed.
- **Availability:** a year is playable only if **every player in the room** has that year's data (i.e., owns a copied "Your Top Songs {year}" playlist). All Time is always available (from `/me/top/tracks`). The lobby must show a grid of players × periods so the group can see what's playable and who's missing what.

### Game modes

**Mode A — Roulette (turn-based rounds):**
1. Each round, the game secretly picks one player and one song from that player's list for the chosen period.
2. Everyone sees: album art, song title, artist, and the **rank badge** (e.g., "#4 of 2023" or "#12 All Time"). Optional embedded player to listen.
3. Everyone except the song's owner guesses which player it belongs to (tap a player avatar). Timer per round (default 15s, configurable).
4. Reveal: show whose song it was + who guessed right. Correct guess = 100 pts; speed bonus optional (e.g., +up to 50 based on remaining time). The song's owner gets points if people guess WRONG (e.g., +25 per wrong guess) — being unpredictable is rewarded.
5. Default 10 rounds (configurable). Avoid repeating songs; try to balance rounds roughly evenly across players.
6. **Duplicate handling:** if the drawn song appears in multiple players' lists for that period, either (a) skip and redraw, or (b) accept any owner as correct. V1: skip and redraw — simpler and cleaner.

**Mode B — Match-Up (simultaneous):**
1. The game picks **one rank R** (random within a safe range all players have, or host-chosen), then pulls **every player's song at rank R** for the chosen period.
2. All songs are displayed at once in shuffled order, each labeled with the same rank badge ("everyone's #3").
3. Each player drags/assigns one player name to each song (a full matching, no reuse of names). Players auto-match themselves? No — players DO know their own song, so either exclude each player's own song from their board, or just accept it as a free point. V1: each player matches ALL songs including their own (free point, keeps UI simple).
4. Scoring: points per correct assignment. Reveal shows the full answer key.
5. A "game" of match-up = several rounds at different ranks (default 5 rounds).
6. **Duplicate handling:** if two players share the same song at rank R, redraw a different rank.

### Onboarding / playlist-copy instructions (IMPORTANT feature)

After Spotify login, the app checks which "Your Top Songs {year}" playlists the player owns. If a player is missing years (they always will be at first), show a friendly **visual step-by-step guide**:

1. "Open Spotify and search **Your Top Songs 2023**" (these playlists often aren't in your library — search for them).
2. "Tap the ⋯ menu → **Add to other playlist** → **New playlist**."
3. "Keep the suggested name (it must contain 'Your Top Songs 2023')."
4. "Come back here and tap **Rescan**."

Build this as an illustrated stepper (one step per screen with a simple illustration/mock screenshot per step — draw simplified SVG mockups of the Spotify UI rather than using real Spotify screenshots/branding). Include a **Rescan** button that re-fetches `/me/playlists`.

**Playlist detection rule:** case-insensitive match on names containing `your top songs` + a 4-digit year, owned by the current user. Fallback: a "My playlist isn't detected" option that lists the user's owned playlists so they can manually tag one as a given year.

---

## 3. Architecture & stack

- **Monorepo, two packages:**
  - `client/` — React + Vite + Tailwind. Mobile-first.
  - `server/` — Node + Express + Socket.io. In-memory room state (fine for 5 friends; no database in v1).
- **Why a server:** multiplayer room state, secret answer keys (clients must never receive whose song it is before reveal), OAuth token handling, and hiding nothing else — no DB needed.
- **Realtime:** Socket.io events for lobby presence, round start, guesses, reveals, scores.
- **Sessions:** simple signed session cookie or socket auth token mapping to a player record on the server.
- **Env/config:** `SPOTIFY_CLIENT_ID`, `REDIRECT_URI`, `PORT`. PKCE flow means no client secret is strictly required, but doing the token exchange server-side is cleaner — keep tokens off the client entirely.
- **Deployment target:** anything that runs a Node server with websockets (Railway/Render/Fly/a VPS). Needs HTTPS for Spotify redirect URI in production; `http://127.0.0.1` allowed for local dev.

### Server data model (in-memory)

```
Room {
  code: string            // 4-5 letter join code
  hostPlayerId: string
  players: Player[]        // max 5
  phase: 'lobby' | 'in_round' | 'reveal' | 'scoreboard' | 'ended'
  settings: { mode: 'roulette'|'matchup', period: 'all_time'|year,
              rounds: number, timerSec: number }
  currentRound: RoundState | null
  usedTrackIds: Set<string>
}

Player {
  id, displayName, avatarColor/emoji,
  spotify: { accessToken, refreshToken, expiresAt, spotifyUserId },
  library: {
    allTime: RankedTrack[],            // from /me/top/tracks long_term (up to 50)
    years: Map<year, RankedTrack[]>    // from owned copied playlists
  },
  connected: boolean
}

RankedTrack { trackId, name, artists[], albumArtUrl, rank }
```

**Privacy rule:** a player's full track lists live ONLY on the server. Clients only ever receive the specific songs used in rounds (and answers only at reveal time).

---

## 4. Screens

1. **Home** — game logo, "Create room" / "Join room (code)".
2. **Connect Spotify** — OAuth button; after callback, show scan results.
3. **Playlist setup / onboarding stepper** — the visual copy-instructions described above, with Rescan.
4. **Lobby** — player list with avatars + connection status; availability grid (players × periods, checkmarks); host controls: mode, period (only fully-available periods enabled), rounds, timer; Start button (host only, requires 2+ players ready).
5. **Roulette round** — big album art, title/artist, rank badge, optional embed player, player-avatar answer buttons, countdown ring.
6. **Roulette reveal** — whose song it was, who got it right, points animation, running scoreboard.
7. **Match-up board** — grid of songs (art + title + shared rank badge), name chips to assign, submit, then reveal with answer key.
8. **Final scoreboard** — winner celebration, "Play again" (same room, back to lobby).

Design vibe: dark theme, bold color per player, chunky rounded cards, playful — party-game energy, readable on a phone held at arm's length. Do NOT imitate Spotify's exact branding; just make it music-y.

---

## 5. Build phases (suggested Claude Code milestones)

**Phase 0 — Manual setup (human, not code):**
- Create app in Spotify Developer Dashboard (owner account has Premium).
- Set redirect URI (`http://127.0.0.1:5173/callback` for dev; prod URI later).
- Add all friends' Spotify account emails under User Management (5-user cap).

**Phase 1 — Solo data pipeline:** OAuth PKCE login → fetch `/me`, `/me/top/tracks?time_range=long_term&limit=50`, `/me/playlists` → detect "Your Top Songs {year}" owned playlists → fetch their items → display "here's what the game sees about you" debug screen. Token refresh. This phase proves all API constraints before any game logic.

**Phase 2 — Rooms & lobby:** Socket.io rooms, join codes, presence, availability grid, host settings.

**Phase 3 — Roulette mode:** round loop, secret drawing (dupe redraw, balance across players, no repeats), guessing, timer, scoring, reveal, scoreboard.

**Phase 4 — Match-up mode:** shared-rank drawing with redraw on duplicates, matching UI, scoring, multi-round flow.

**Phase 5 — Polish:** onboarding illustrations, embed player, animations, sounds, reconnect handling (player refreshes phone mid-game), edge cases below.

---

## 6. Edge cases & rules

- Player with fewer than N tracks in a period (short playlists / low listening history): cap usable rank range at `min(list lengths)` for match-up; for roulette just draw from what exists.
- Player disconnects mid-round: pause or auto-skip their guess after timer; reconnect restores state by session.
- Two players logged into the same Spotify account: reject (same `spotifyUserId` already in room).
- Token expiry mid-game: refresh transparently; if refresh fails, mark player "needs re-login" without killing the room.
- Playlist name variants (other languages, renamed copies): manual-tag fallback covers this.
- Rate limits: fetch each player's data once at join + on rescan, cache on server; never fetch during rounds.

## 7. Out of scope for v1

- Public release / more than 5 users (impossible under dev-mode rules anyway).
- Mixing multiple years in one game.
- Persistent accounts, stats history, databases.
- Native mobile apps — mobile web only.
