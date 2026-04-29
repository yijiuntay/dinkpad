# DinkPad v2 — Features & Manual Test Steps

> Phase 1 (P0 Foundation) — built April 2026

---

## What Was Built

### Feature 1: Data Model (v2)
New `SessionState`, `Player`, `Match`, `MatchHistory`, `Court`, `TierConfig`, `ConstraintSet` types. Full schema in `app/types.ts`.

### Feature 2: Tier System (`app/utils/tierUtils.ts`)
- Configurable 3/4/5 tiers; default D/C/B/A (lowest → highest)
- `parsePlayerLine` / `parseBulkInput` — parse `Name [Tier]` bulk input with per-line validation
- `getTierOrdinal`, `getTierLabel`, `getUnratedMidpoint` — numeric helpers for matchmaking

### Feature 3: Player State Machine (`app/utils/playerStateUtils.ts`)
Pure transition functions with runtime assertions:

| Transition | Function |
|---|---|
| roster → waiting | `checkIn` |
| waiting → playing | `startPlaying` |
| playing → waiting | `finishPlaying` |
| waiting → stepped-away | `stepAway` |
| stepped-away → waiting (keep spot) | `resumeWithPosition` |
| stepped-away → waiting (back of queue) | `resumeBackOfQueue` |

Tick helpers: `tickWaitTime`, `applySkipIncrement` — both run on `waiting` **and** `stepped-away` players so away players don't lose their queue position.

### Feature 4: Setup Page (`app/setup/page.tsx`)
- Court count stepper (±1, min 1)
- Tier system selector (3/4/5) with live label preview
- Bulk-paste player textarea with **per-line live validation** (`✓ Alice — Tier A` / `✗ Eve — Tier 'Z' not recognized`)
- Check-In Mode toggle: **Roster** (check in as players arrive) vs **All Checked In** (everyone starts waiting)
- Start Session button shows valid player count; disabled until 4+ valid players

### Feature 5: Custom Modal System (`app/components/`)
Replaces all `window.alert` / `window.confirm` calls.

| Component | Use |
|---|---|
| `ConfirmModal` | Destructive confirmations (End Session, Remove Player) |
| `BottomSheet` | Match preview, result capture, strategy picker, add player |
| `ToastContext` + `useToast()` | Non-blocking feedback; 4 types: info / success / warning / error; auto-dismiss 3s |

### Feature 6: Court Grid Dashboard (`app/session/page.tsx`)
- **Sticky header** — session timer, strategy pill (tappable), End button
- **Action bar** — Start All Matches, + Player, Check In
- **Court grid** — 1-col mobile / 2-col tablet; each court shows match timer, teams with tier badges, warning chips
- **Waiting queue** — sorted by priority (critical 🔴 first, then wait time desc); `#1–#4` next-up markers; `⚠` near-threshold indicator
- **Away section** — inline Restore / Back of Queue buttons
- **Roster section** — collapsible; per-player Check In button

### Feature 7: Matchmaking Engine (`app/utils/matchmaking.ts`)
New `generateMatch(input): GenerateMatchResult` API.

| Strategy | Algorithm |
|---|---|
| **Balanced** | Enumerate top-12 candidates; try all valid team pairings; minimise \|avgTierA − avgTierB\|; tiebreak on combined wait time |
| **Minimize Wait** | Take top 4 by wait time; find best pairing within those 4 |
| **Variety** | Top-8 candidates; decay-weighted repeat scoring (1.0 / 0.75 / 0.5 / 0.25 by recency); minimise partner×3 + opponent repeats |

**Skip priority** — `consecutiveSkips >= courtCount + 1` marks a player critical; engine forces them into the next match regardless of strategy.

### Feature 8: Match Preview Sheet
- Bottom sheet showing Team A / Team B player names and tier badges
- Warning messages displayed (info / warn / error styled)
- **Shuffle** up to 3× (re-runs engine), **Confirm**, **Cancel**
- Confirm disabled when engine returns `INSUFFICIENT_PLAYERS`

### Feature 9: Undo Match Start
- 30-second undo window after every match start
- Court card shows live countdown `Undo (25s)`
- On undo: 4 playing players restored to pre-match `waitTime` / `consecutiveSkips` / `status`; other players' skip increments rolled back

### Feature 10: Match Result Capture Sheet
- Two large tappable team cards — tap to select winner, tap again to deselect
- **Save Result** — records `winningTeam`, increments `gamesWon` / `gamesLost`
- **Skip** — ends match, increments `gamesPlayed` only, no W/L recorded

### Feature 11: Best-Effort Constraints
Fixed Pairs are treated as indivisible units during team pairing. Warnings emitted with every match:

| Code | Severity | Trigger |
|---|---|---|
| `INSUFFICIENT_PLAYERS` | error | Fewer than 4 waiting players |
| `CRITICAL_PLAYER_FORCED` | info | Skip-priority player forced into match |
| `LARGE_TIER_GAP` | warn | Chosen pairing has avg tier diff ≥ 2 |
| `UNRATED_HEAVY` | info | 3+ unrated players in match |
| `FIXED_PAIR_BROKEN` | error | Fixed pair constraint had to be relaxed |

---

## Unit Tests

Run with `npm test`.

| File | Tests | Coverage |
|---|---|---|
| `sessionStorage.test.ts` | 23 | `skillToTier`, `migrateV1ToV2`, save/load roundtrip |
| `tierUtils.test.ts` | 30 | `getTierOrdinal`, `getTierLabel`, `parsePlayerLine`, `parseBulkInput` |
| `playerStateUtils.test.ts` | 47 | All state transitions, tick helpers, predicates |
| `matchmaking.test.ts` | 18 | All 3 strategies, skip priority, warnings, fixed pairs |
| **Total** | **118** | |

---

## Manual Test Steps

### Setup (`/setup`)

1. **Navigate to app** — should land on `/` home page, then go to `/setup`.
2. **Court count stepper** — tap `−`: stops at 1. Tap `+` a few times. Confirm number updates.
3. **Tier selector** — switch between 3 / 4 / 5 tiers. The tier label row below updates (e.g. C/B/A → E/D/C/B/A).
4. **Player input — valid** — paste:
   ```
   Alice A
   Bob B
   Charlie
   Dana Smith C
   ```
   Expect validation panel: `✓ Alice — Tier A`, `✓ Bob — Tier B`, `✓ Charlie — Unrated`, `✓ Dana Smith — Tier C`.
5. **Player input — error** — add a line `Eve Z`. Expect `✗ Eve — Tier 'Z' not recognized`. Start button count excludes Eve.
6. **Minimum players** — clear input, add only 3 valid lines. Start Session button should be disabled.
7. **Check-In Mode** — select **Roster**. Start session. Players appear in the collapsible Roster section (not the waiting queue).
8. **Check-In Mode** — redo setup with **All Checked In**. All players appear in the waiting queue immediately.
9. **Existing session warning** — if a session is already active, a yellow banner appears offering Resume or Start New.

---

### Session (`/session`)

#### Header & Strategy
10. **Timer** — session timer in header counts up every second.
11. **Strategy pill** — tap `Balanced` in the header → strategy sheet slides up. Tap **Minimize Wait** → sheet closes, pill updates, toast confirms.

#### Waiting Queue
12. **Queue order** — players sorted: critical priority (🔴) first, then by wait time descending.
13. **Next-up markers** — top 4 players show `#1`, `#2`, `#3`, `#4`.
14. **Wait time** — watch a player's wait time tick up every second.
15. **Skip indicator** — after starting a match that skips a player, their skip count increments. After enough skips (`courtCount + 1`), the 🔴 indicator appears.

#### Starting a Match
16. **Start Match (single court)** — tap **Start Match** on an empty court card → preview sheet slides up.
17. **Preview — teams** — team A and team B are shown with player names and tier badges.
18. **Preview — warnings** — if teams are imbalanced, a yellow warning banner appears.
19. **Shuffle** — tap **Shuffle (3 left)** → new match generated. Repeat up to 3 times. Button disables after 3 shuffles.
20. **Cancel preview** — tap `×` or backdrop → no state change, court stays empty.
21. **Confirm** — tap **Confirm** → match starts. Court card now shows teams, match timer (ticking), and `Undo (30s)` button.

#### Undo
22. **Undo countdown** — confirm a match and watch the `Undo (Xs)` countdown on the court card.
23. **Undo within window** — tap **Undo** before 30s → court empties, players restored, toast `Match undone`.
24. **Undo expired** — wait 30+ seconds → Undo button disappears. End Match button remains.

#### Ending a Match
25. **End Match** — tap **End Match** on an active court → result sheet slides up.
26. **Select winner** — tap Team A card → highlighted with `✓ Winner`. Tap again → deselects. Tap Team B instead.
27. **Save Result** — with a team selected, tap **Save Result** → match recorded, players return to waiting queue, their `gamesPlayed` / `gamesWon` / `gamesLost` updated.
28. **Skip result** — tap **Skip** → match ends with no W/L recorded; players return to waiting.

#### Start All
29. **Start All Matches** — with multiple empty courts and enough players, tap **Start All Matches** → all courts fill simultaneously. Toast: `Started 3 matches!`.
30. **Partial start** — with fewer players than `4 × empty courts`, some courts fill, some stay empty. Toast: `Started 2 of 3 matches — not enough players for the rest`.

#### Player Actions
31. **Step Away** — in the waiting queue, tap `⋮` on a player → tap **Step Away** → player moves to Away section. Their wait time and skip count continue ticking.
32. **Resume (restore)** — in Away section, tap **Restore** → player returns to waiting with their existing wait time and skip count intact.
33. **Resume (back of queue)** — tap **Back of Queue** → player returns to waiting with `waitTime = 0` and `consecutiveSkips = 0`.
34. **Remove player** — tap `⋮` → **Remove from Session** → confirm modal → player removed. Cannot remove a player who is currently playing (option is absent).

#### Roster (Check-In Mode)
35. **Roster section** — if session was started in Roster mode, tap the collapsed **Roster** section to expand it.
36. **Check In** — tap **Check In** next to a roster player → player moves to the waiting queue. Toast confirms.
37. **Check In button in action bar** — visible at the top when roster has players. Tapping it expands the Roster section.

#### Add Player
38. **+ Player** — tap **+ Player** → add player sheet. Enter a name, pick a tier (or leave Unrated), toggle Check In.
39. **Check In ON** → player added directly to waiting queue.
40. **Check In OFF** → player added to Roster section.

#### End Session
41. **End Session** — tap **End** in the header → confirm modal: `End Session / Are you sure?`. Tap **Cancel** → nothing. Tap **End Session** → session cleared, navigated to home.

---

## Key Constraints

- **Client-side only** — no backend, no accounts. All data in `localStorage` under `dinkpad_session_v2`.
- **Match format** — always 2v2 doubles.
- **Tier ratings** — configurable per session (D/C/B/A default). Unrated players are valid and treated as midpoint in matchmaking.
- **Undo window** — exactly 30 seconds; rolls back all state changes from that match start.
- **Match history cap** — 200 entries per session (oldest pruned silently).
