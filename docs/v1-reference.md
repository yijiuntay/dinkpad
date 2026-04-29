# DinkPad v1 — Product & Technical Reference

> Reference document for the v2 brainstorm. Describes what exists, how it works, and where it breaks down.

---

## What It Is

DinkPad is a mobile-first web app for managing pickleball open play sessions. The primary user is a **venue host or organizer** running open play on multiple courts. The app handles court assignments, player rotation, and matchmaking so the host doesn't have to track it mentally or on a whiteboard.

It is a **single-user, single-device, fully client-side** app. There is no backend. One person runs it on their phone.

---

## Core User Flows

### Flow 1: Starting a Session

1. User lands on `/` (home page) and taps **Start New Session**
2. Redirected to `/setup`
   - If an active session already exists in localStorage, a warning modal appears offering **Resume Session** or **Start New**
3. On `/setup`, user enters:
   - **Number of courts** (integer, min 1)
   - **Player list** — pasted as raw text, one player per line in the format `Name SkillRating` (e.g. `Alice 3.5`)
   - The textarea shows a live player count as lines are entered
4. Tapping **Start Session** parses the player list, initializes `SessionState`, saves it to localStorage, and navigates to `/session`
   - Minimum 4 players required; invalid lines (missing rating, unparseable) are silently dropped

### Flow 2: Running a Session

The `/session` page is the entire live experience. It has:

- **Sticky header**: app name, court count, player count, active strategy selector, End Session button
- **"Start All Matches" button**: fills every empty court in one tap
- **Courts section**: one card per court showing the active match (Team A vs Team B with avg skill) and a live match timer, or a "Start Match" button if the court is empty
- **Waiting queue**: all waiting players sorted by wait time descending, with live timers, skip indicators, and a `⋮` menu per player
- **Paused section**: players removed from rotation temporarily, with a Resume button
- **Fixed bottom bar**: Add Player button

**Starting a single match:**
1. Host taps **Start Match** on an empty court card
2. `generateMatch()` runs the active strategy against all waiting players
3. Four players are selected and assigned to Team A / Team B
4. Those players' status changes to `playing`; all other waiting/paused players have their `consecutiveSkips` incremented
5. Court card updates to show the match

**Ending a match:**
1. Host taps **End Game** on an active court card
2. The four players' status changes back to `waiting`, their `gamesPlayed` increments, and `waitTime` resets to 0
3. The match is recorded in `matchHistory` (used by the Variety strategy)

**Mid-session player management (via `⋮` menu):**
- **Pause** — moves a waiting player to the paused list; paused players do not accumulate wait time and are invisible to matchmaking
- **Resume** — returns a paused player to waiting
- **Remove** — permanently removes a player from the session (blocked if they are currently playing)
- **Add Player** — modal to add a new player by name and skill rating at any time

**Changing strategy:**
- Tap the strategy pill in the header; a bottom-sheet modal shows all three options with descriptions
- Strategy change takes effect on the next match started; does not affect in-progress matches

### Flow 3: Ending a Session

1. Tap **End Session** in the header
2. Browser `confirm()` dialog — destructive, cannot be undone
3. State set to null, localStorage cleared, redirect to `/`
4. All match history is permanently lost

---

## Matchmaking Engine

All logic lives in `app/utils/matchmaking.ts`. `generateMatch()` is the entry point.

### Skip Priority System

Before any strategy runs, waiting players are split into **critical** and **normal** pools:

- **Threshold** = `courtCount + 1` consecutive skips
- Any player at or above the threshold is critical and **must** play in the next match regardless of strategy
- If 4+ critical players exist, they are matched among themselves (by wait time, then balanced by skill)
- If 1–3 critical players exist, they are force-included and the strategy fills the remaining slots from the normal pool
- The UI shows a yellow `⚠️` warning when a player is at `courtCount` skips, and a red `🔴` when they hit the threshold

### Strategy 1: Balanced Skill Gap

Exhaustive search over the top 8–9 players by skill rating. Tries all 4-player combinations and two team pairings per combination (`high+low vs high+low`, `high+mid vs high+mid`). Picks the pairing that minimizes the absolute difference between team average skills.

**O(n⁴) with n capped at ~9.** Fast enough in practice.

### Strategy 2: Minimize Wait Time

Takes the 4 players with the longest wait times. Within that group, sorts by skill and pairs high+low vs high+low. No history lookup needed — O(n log n).

### Strategy 3: Maximize Variety

Considers up to 6×7 player combinations. For each combination, scores all three possible team pairings using `matchHistory`. Partner repeats are weighted 3× heavier than opponent repeats. Picks the combination + pairing with the lowest repeat score.

**Scoring formula per pairing:**  
`(partnerRepeatA × 3) + (partnerRepeatB × 3) + (sum of 4 cross-opponent repeat counts)`

Also biased toward longer-waiting players — the combination search iterates players pre-sorted by wait time descending, so longer-waiting players are disproportionately represented in the candidates tried.

### History Recording

`recordMatch()` writes 6 `PairingRecord` entries per match (2 partner pairs + 4 opponent pairs), stored in `SessionState.matchHistory`. This array grows unbounded within a session.

---

## Data Model

```
SessionState
├── players: Player[]
├── courts: Court[]
├── matchHistory: MatchHistory[]
├── currentStrategy: "balanced" | "wait-time" | "variety"
├── sessionStartTime: number (timestamp)
├── courtCount: number
├── nextPlayerId: number
└── nextMatchId: number

Player
├── id: string ("player_N")
├── name: string
├── skill: number (1.0–5.5, pickleball standard)
├── status: "waiting" | "playing" | "paused"
├── waitTime: number (seconds, increments every 1s for waiting players)
├── gamesPlayed: number
├── lastPlayedAt?: number (timestamp)
└── consecutiveSkips: number

Match
├── id, court, startTime, strategy
├── teamA: { partner1, partner2, avgSkill }
└── teamB: { partner1, partner2, avgSkill }
```

Players embedded inside `Match` are **snapshots** — they are not updated in place. The live `Player` records in `session.players` are the source of truth.

---

## Persistence

- Single localStorage key: `dinkpad_session_v1`
- Entire `SessionState` is JSON-serialized on every state change via `useEffect`
- One migration exists: adds `consecutiveSkips: 0` to players that predate that field
- No versioning beyond the key name; breaking schema changes require a new key or migration logic
- Storage quota is ~5–10 MB depending on browser; `matchHistory` could theoretically grow large for a very long session, but is unlikely to be a practical problem at typical session sizes

---

## Technical Limitations

### Architecture

- **Single device only.** No way for a second person (e.g., a co-host or a display screen) to view or interact with the session. The entire state lives in one browser's localStorage.
- **No accounts, no history.** Once a session ends, everything is gone. There is no concept of a returning player, career stats, or past session data.
- **No score tracking.** The app manages rotation but has no concept of game scores. The host must track wins/losses externally.
- **No undo.** Ending a match or removing a player cannot be reversed.

### Setup Flow

- **Player input is fragile.** The parser splits on whitespace; multi-word names work (`Alice Smith 3.5`) but the rating must be the last token. A typo in the rating silently drops the player. There is no validation or error feedback per line.
- **Courts are fixed at session start.** If a court opens or closes mid-session (e.g., a court becomes unavailable), there is no way to activate/deactivate individual courts. The court count is set once at setup.
- **No way to edit a player's skill mid-session.** The only per-player actions are pause, resume, and remove.
- **No bulk import from an external source.** Players must be typed or pasted manually every session, even if the same group plays every week.

### Matchmaking

- **Strategy applies globally.** There is no way to use different strategies on different courts simultaneously. All courts share one setting.
- **Skip priority overrides strategy regardless of skill balance.** When critical players are force-included, the resulting teams may be badly mismatched. The balancing that follows is best-effort.
- **Balanced strategy caps at 9 players for combination search.** Players ranked 9th or below by skill can never be selected under the Balanced strategy unless they are critical priority. In large pools (15+ players) with many similarly-skilled players, lower-ranked players can get starved.
- **Variety strategy does not account for recency.** A pairing from 3 hours ago counts the same as one from 2 minutes ago. History is cumulative with no decay.
- **No concept of "must not play together."** Skill and wait time are the only inputs; there is no way to flag that two players should not be paired (e.g., they're playing a tournament the next day and don't want to reveal their style).

### Session Management

- **"End Game" gives no context about what just happened.** When a host ends a match, the match disappears immediately — no summary of who played, no score prompt.
- **Paused players accumulate no wait time**, which means they re-enter the queue at 0 seconds when resumed. If someone pauses for 10 minutes and resumes, they go to the back of the queue even though they may have been waiting (paused) longer than others.
- **`consecutiveSkips` is not reset on pause.** A paused player's skip counter holds at whatever it was when they paused. If they paused at a high count, they'll immediately be flagged as priority on resume.
- **No confirmation on "End Game."** Accidentally ending a match in-progress re-queues all four players and records them as having played, with no recovery path.
- **`alert()` and `confirm()` for all critical actions.** Browser-native dialogs are used for "remove player" confirmation and "end session" confirmation. These are visually inconsistent with the rest of the app, block the UI thread, and are dismissible by accident on mobile.

### UI / UX

- **No match preview before committing.** The host taps "Start Match" and the match is immediately live. There is no "here's who I'm putting on court, confirm?" step.
- **Strategy picker uses emoji labels** that don't communicate the trade-offs clearly at a glance, especially for new hosts.
- **Wait time displayed as M:SS** but the queue is sorted by raw seconds. Large player pools can make the queue hard to scan — no grouping or visual hierarchy beyond the list order.
- **No court-level control from the waiting queue.** A player cannot be assigned to a specific court; the host must start matches court-by-court or use Start All.
- **"Start All Matches" applies to all empty courts at once** with the same strategy. There is no way to fill courts selectively in a single action.
- **No visual distinction between courts** beyond the number label. For venues with named or themed courts, there is no way to rename them.
- **Home page CTA links directly to `/session`, not `/setup`.** A first-time user with no session will immediately get redirected to `/setup` due to the guard in the session page, which is one unnecessary redirect.

### Data Integrity

- **Players embedded in `Match` are snapshots at match creation time.** If a player's skill were editable mid-session, the in-progress match would show stale data.
- **No session export.** There is no way to download or share session data (e.g., a CSV of who played whom, game counts per player).
- **localStorage can be cleared by the browser** under storage pressure, effectively destroying an active session. No warning or backup mechanism exists.

---

## What Works Well

- **The skip priority system is robust.** Players rarely feel stuck at the back indefinitely; the threshold guarantees everyone plays within a predictable number of rounds.
- **Start All Matches is the killer feature.** Hosts can fill every court in one tap at the start of a session, which is the highest-friction moment.
- **Session survives accidental page refresh.** localStorage auto-save prevents data loss on browser crash or accidental navigation.
- **Mobile layout is functional.** The fixed header + bottom bar pattern keeps the most-used actions (strategy, add player) always reachable without scrolling.
- **No account required.** Zero friction to get started — no login, no setup wizard, just a court count and a player list.
