# DINKPAD v2 — Iteration 1 Build Prompt

> Detailed feature specifications and user flows for DinkPad v2, Iteration 1.
> **Scope:** Host-only, client-side only. localStorage persistence. No backend.
> **Primary goal:** Fool-proof, flexible, robust matchmaking via a full engine rebuild.

---

## TABLE OF CONTENTS

1. [Data Model Changes](#1-data-model-changes)
2. [Player Lifecycle & States](#2-player-lifecycle--states)
3. [Tier System](#3-tier-system)
4. [Matchmaking Engine](#4-matchmaking-engine-rebuild)
5. [Constraints & Best-Effort Resolution](#5-constraints--best-effort-resolution)
6. [Match Lifecycle](#6-match-lifecycle)
7. [Match Result Capture](#7-match-result-capture)
8. [Tier Suggestions](#8-tier-suggestions-algorithmic-host-approved)
9. [Court Management](#9-court-management)
10. [UI Surfaces](#10-ui-surfaces)
11. [Custom Modal System](#11-custom-modal-system)
12. [Local Display Handoff](#12-local-display-handoff-optional-p2)
13. [Persistence & Migration](#13-persistence--migration)
14. [Priority & Build Order](#14-priority--build-order)

---

## 1. DATA MODEL CHANGES

### `SessionState` (updated)

```
SessionState
├── players: Player[]
├── courts: Court[]
├── matchHistory: MatchHistory[]
├── activeMatches: Match[]              // currently in-progress
├── undoableMatches: UndoableMatch[]    // recently started, within undo window
├── tierConfig: TierConfig              // NEW
├── currentStrategy: StrategyId
├── strategyConfig: StrategyConfig      // NEW — for hybrid/per-strategy options
├── constraints: ConstraintSet          // NEW — fixed pairs, do not pair, etc.
├── sessionStartTime: number
├── sessionId: string                   // NEW — used for handoff URL
├── nextPlayerId: number
└── nextMatchId: number
```

### `Player` (updated)

```
Player
├── id: string
├── name: string
├── tier: string | null                 // NEW — replaces numeric skill; null = unrated
├── status: PlayerStatus                // expanded enum (see §2)
├── waitTime: number                    // seconds; only ticks when in Waiting state
├── steppedAwayAt?: number              // NEW — timestamp when stepped away; null if not stepped away
├── gamesPlayed: number
├── gamesWon: number                    // NEW
├── gamesLost: number                   // NEW
├── lastPlayedAt?: number
├── consecutiveSkips: number
├── checkedInAt?: number                // NEW — timestamp when moved from Roster to Waiting
└── tierHistory: TierChange[]           // NEW — audit trail for tier changes this session
```

### `TierConfig`

```
TierConfig
├── tiers: string[]                     // ordered, lowest skill → highest, e.g. ["C", "B", "A"]
├── tierCount: 3 | 4 | 5
└── labels?: Record<string, string>     // optional display names
```

### `ConstraintSet`

```
ConstraintSet
├── fixedPairs: FixedPair[]
└── doNotPair: DoNotPairRule[]

FixedPair { id, playerAId, playerBId, createdAt }
DoNotPairRule { id, playerAId, playerBId, mutual: boolean, createdAt }
```

### `Match` / `MatchHistory`

```
Match (in-progress)
├── id, court, startTime, strategy
├── teamA: { player1Id, player2Id, avgTier }
├── teamB: { player1Id, player2Id, avgTier }
├── warnings: MatchWarning[]            // NEW — best-effort relaxations
└── isUndoable: boolean                 // true if within undo window

MatchHistory (completed)
├── (everything above, frozen)
├── endTime
├── duration
├── result?: MatchResult                // optional
└── undone: boolean                     // true if match was undone
```

### `MatchResult`

```
MatchResult
├── winningTeam: "A" | "B"
├── scoreA?: number                     // optional
├── scoreB?: number                     // optional
└── recordedAt: number
```

### `MatchWarning`

```
MatchWarning
├── code: WarningCode                   // see §5
├── severity: "info" | "warn" | "error"
├── message: string                     // human-readable
└── relaxedConstraint?: string
```

---

## 2. PLAYER LIFECYCLE & STATES

### State Diagram

```
[Add Player] → ROSTER ──(Check In)──→ WAITING ──(matched)──→ PLAYING
                  │                       ↑                      │
                  │                       │                      │
                  └────(Check In)─────────┤                      │
                                          │                      │
                  STEPPED AWAY ←─(Step)───┤                      │
                        │                 │                      │
                        ├──(Resume: keep position)───────────────┤
                        │                 │                      │
                        └──(Resume: back of queue)───────────────┤
                                          │                      │
                                          └──(End Match)─────────┘

  Any state → REMOVED (with confirmation; blocked if currently PLAYING)
```

### State Definitions

| State | Visible to MM? | Wait Time Ticks? | Skip Count Increments on Other Matches? |
|---|---|---|---|
| `roster` | No | No | No |
| `waiting` | Yes | Yes | Yes |
| `playing` | No (already in match) | No | No |
| `stepped-away` | No | **Yes** (continues) | **Yes** (continues) |
| `removed` | No (gone) | N/A | N/A |

### Key Behavioral Rules

- A player added during a session defaults to `waiting` (not `roster`) — the roster is a setup-time concept
- A player's `consecutiveSkips` resets to 0 only when they start a match (i.e. transition to `playing`)
- **Stepped Away** is the single non-playing out-of-rotation state. Wait time and skip count continue to accrue while stepped away — the player doesn't lose their place just for stepping out
- On **Resume**, the host gets a one-tap choice presented inline on the player row:
  - **"Restore position"** (default) — player returns to `waiting` with their existing `waitTime` and `consecutiveSkips` intact
  - **"Back of queue"** — player returns to `waiting` with `waitTime = 0` and `consecutiveSkips = 0`; use this if they were away long enough that jumping the queue would be unfair
- The resume choice is a single tap on a two-option inline control, not a modal — fast and unambiguous
- Skip count and wait time continue ticking while stepped away, so a player who was close to skip-priority threshold before stepping away may return as a critical player — this is intentional and correct

---

## 3. TIER SYSTEM

### Setup
- At session start, host picks tier count: 3, 4, or 5
- Defaults to 4 tiers labeled `["D", "C", "B", "A"]` (lowest → highest)
- Host can rename tiers (e.g. "Beginner / Intermediate / Advanced")
- Each player on the roster is assigned a tier OR left unrated

### Player Input Format
The bulk-paste input on `/setup` accepts:
```
Alice A
Bob C
Charlie                ← unrated, valid
Dana Smith B
```
- Last token is parsed as tier IF it matches a configured tier name
- If last token doesn't match, the entire line is treated as the player name and tier is `null`
- Per-line validation surfaces inline (no more silent drops): "✓ Alice — Tier A", "✓ Charlie — Unrated", "✗ Eve — Tier 'Z' not recognized"

### Mid-Session Tier Edits
- Per-player menu has "Edit Tier" → opens tier picker (segmented control)
- Change takes effect on next match generation
- Tier change is logged in `Player.tierHistory` with reason: `"manual"` or `"suggested"`

### Unrated Players in Matchmaking
- Treated as "any tier" — they can fill any slot
- The Balanced strategy will avoid putting unrated players into the same match as a tier-balance optimization unless necessary (they make balance ambiguous)
- A warning surfaces if 3+ unrated players are in a single match

---

## 4. MATCHMAKING ENGINE (REBUILD)

### Engine Contract

```
generateMatch(input: GenerateMatchInput): GenerateMatchResult

GenerateMatchInput
├── waitingPlayers: Player[]
├── strategy: StrategyId
├── strategyConfig: StrategyConfig
├── constraints: ConstraintSet
├── tierConfig: TierConfig
├── matchHistory: MatchHistory[]
├── courtCount: number              // for skip threshold calculation
└── courtId: string                 // which court is being filled

GenerateMatchResult
├── match: { teamA, teamB }
├── warnings: MatchWarning[]
└── debug?: { strategyTrace, candidatesConsidered, ... }   // for dev mode
```

### Pipeline (Order Matters)

1. **Filter input** — only `waiting` players are considered. Stepped Away / Roster are excluded.
2. **Apply skip priority** — split into critical (skips ≥ courtCount + 1) and normal pools. Critical players are mandatory.
3. **Apply hard constraints** — Fixed Partners are pre-locked as units. Do Not Pair rules are enforced.
4. **Run strategy** — selected strategy picks 4 players from the available pool.
5. **Resolve to teams** — given the 4 picked players, decide team composition (handles fixed pairs).
6. **Validate & relax if needed** — if no valid solution exists, relax constraints in priority order (see §5) and emit warnings.
7. **Return** match + warnings.

### Strategies

#### Strategy: Balanced (Default)

**Goal:** Minimize tier distribution gap between teams.

**Algorithm:**
- For each candidate combination of 4 players from the waiting pool (size capped at top 12):
  - Try all 3 possible team pairings
  - Score = absolute difference between Team A's and Team B's avg tier (numerically, lowest tier index = 0)
  - Penalty for unrated players in the team (treated as midpoint with +0.5 uncertainty)
- Pick the lowest-scoring pairing
- Tiebreaker: longer combined wait time wins

**Notes:**
- "Tier average" maps tiers to ordinal integers: D=0, C=1, B=2, A=3 (4-tier example)
- Unbalanced teams (e.g. 2-tier gap) still allowed but emit a warning
- Cap of 12 candidates prevents O(n⁴) blowup; the cap is by descending wait time × tier diversity

#### Strategy: Minimize Wait

**Goal:** Get the longest-waiting players onto the court.

**Algorithm:**
- Sort waiting players by waitTime descending
- Take top 4
- Within those 4, balance teams by tier (same balanced sub-routine as above)
- Hard constraints (fixed pairs, do-not-pair) still apply

**Notes:**
- O(n log n)
- Tier balance is best-effort within the 4 chosen — large gaps emit warnings

#### Strategy: Variety

**Goal:** Minimize recent partner/opponent repeats.

**Algorithm:**
- Build a recent-pairings map from `matchHistory`, weighted by recency:
  - Match from <5 min ago = weight 1.0
  - Match from 5–15 min ago = weight 0.75
  - Match from 15–45 min ago = weight 0.5
  - Match from >45 min ago = weight 0.25
- For top 8 candidates by wait time, evaluate combinations of 4 + team pairings
- Score = sum of weighted partner repeats × 3 + weighted opponent repeats
- Pick lowest score; tiebreak by combined wait time

**Notes:**
- Decay curve is configurable (mild/moderate/strong) but defaults to the above
- O(n⁴ × 3) capped at 8 candidates — tractable

#### Strategy: Fixed Partners (Mode, Not Standalone)

**Not a standalone strategy** — it's a constraint layer that applies to all strategies. When fixed pairs exist:
- Each pair is treated as a single unit during candidate enumeration
- Pair's effective tier = max of the two players' tiers
- A match can include 0, 1, or 2 fixed pairs

#### Strategy: Winner Stays (Per-Court Mode)

**Per-court setting**, configured via court overflow menu.

**Algorithm:**
- When a match ends with a result captured, the winning team is held on the court
- Two challengers are pulled via the **active session strategy** (Balanced / Min Wait / Variety) from the waiting pool, restricted to size-2 selection
- Consecutive-win cap (default 3) — after N wins in a row on this court, winners are rotated off regardless
- Critical-skip players force interruption (override the streak)

**Notes:**
- Requires match results to function — disabled if result capture is also disabled (UI prevents this combo)
- Other courts continue to use normal full-match strategies

### Strategy Config

```
StrategyConfig
├── primary: StrategyId
├── tiebreaker?: StrategyId         // hybrid mode
├── varietyDecay?: "mild" | "moderate" | "strong"
└── winnerStaysCap?: 1 | 2 | 3
```

Hybrid Example: `{ primary: "balanced", tiebreaker: "wait" }`
- Run Balanced; if multiple pairings tie within ε, pick the one with greater combined wait time.

---

## 5. CONSTRAINTS & BEST-EFFORT RESOLUTION

### Priority Order (Highest → Lowest)

1. **Skip Priority (Critical)** — players above skip threshold MUST play. Hardest constraint.
2. **Do Not Pair (Hard)** — flagged pairs never on same team. Hard constraint.
3. **Fixed Partners** — designated pairs always on same team.
4. **Strategy goal** — Balanced / Min Wait / Variety scoring.
5. **Tier balance preference** — soft preference within strategy.

### Relaxation Rules

When the engine cannot satisfy all constraints simultaneously:
- It relaxes from the bottom of the priority list upward
- Each relaxation emits a `MatchWarning`
- Warnings include the reason in plain language

### Warning Codes

| Code | Severity | Trigger |
|---|---|---|
| `LARGE_TIER_GAP` | warn | Team avg tier diff ≥ 2 |
| `UNRATED_HEAVY` | info | 3+ unrated players in match |
| `FIXED_PAIR_BROKEN` | error | Fixed pair couldn't be honored (rare) |
| `DO_NOT_PAIR_FORCED` | error | Do-not-pair rule had to be relaxed (very rare) |
| `CRITICAL_PLAYER_FORCED` | info | A skip-priority player forced into mismatched team |
| `INSUFFICIENT_PLAYERS` | error | Not enough waiting players to form a match |
| `STRATEGY_FALLBACK` | info | Primary strategy couldn't run; fell back to wait-time |

### Warning Display

- Match Preview screen shows warnings prominently as a yellow/red banner
- If preview is disabled, warnings appear as a small badge on the court card after match starts
- Tap the badge to see the full warning detail
- Errors (`severity: "error"`) require host acknowledgment before match starts even with preview disabled

---

## 6. MATCH LIFECYCLE

### Starting a Match

**With Preview (default):**
1. Host taps **Start Match** on empty court card
2. Engine generates match → preview sheet slides up
3. Sheet shows: 4 players, team composition, tier badges, warnings (if any)
4. Three actions: **Confirm**, **Shuffle** (re-run engine), **Cancel**
5. Confirm → match goes live, players → `playing`, undo window opens
6. Shuffle → engine runs again; up to 3 shuffles before sheet auto-confirms or cancels (TBD UX)
7. Cancel → close sheet, no state change

**Without Preview (advanced setting):**
1. Host taps **Start Match**
2. Match goes live immediately
3. Warnings (if any) appear as badge on court card
4. Errors still trigger a confirmation dialog

### Undo Match Start

- 30-second window after match start
- Court card shows a prominent **Undo** button with a countdown ring
- Tapping Undo:
  - Returns 4 players to `waiting` with their pre-match `waitTime` and `consecutiveSkips`
  - Removes the match from `activeMatches` and `matchHistory`
  - Other players' incremented skip counts (from this match) are rolled back
  - If the match captured a result before undo (rare race), result is also discarded

### Ending a Match (Normal Path)

1. Host taps **End Match** on active court card
2. Result sheet slides up (see §7)
3. Host enters result OR taps Skip
4. Match moves to `matchHistory`
5. Players → `waiting`, `gamesPlayed++`, `waitTime = 0`, `consecutiveSkips = 0`, optional W/L increment
6. If Winner Stays mode is on for this court and a result was captured, retain winners and pull challengers (see §4)

### Ending a Match (Cancel — No Result)

- "End Match" sheet has explicit "Cancel Match (no result)" option for matches that fizzled out
- Players still return to waiting + `gamesPlayed++`, but no W/L recorded
- No tier suggestion triggered

---

## 7. MATCH RESULT CAPTURE

### When It Appears
- After every "End Match" tap
- Renders as a bottom sheet, not a blocking modal

### Sheet Contents
- "Who won?" → two big tappable team cards (Team A / Team B) with player names
- Optional: tap a team card → score steppers appear (default 11-X format, configurable)
- "Skip" button — top right, single tap dismisses without result
- "Cancel Match (no result)" — separate destructive option for invalid matches

### Skip Behavior
- Skipping is one tap, never punished or warned about
- Skipped matches still increment `gamesPlayed` but not W/L
- Variety strategy still uses skipped matches for repeat tracking
- Tier suggestions ignore skipped matches

### Result Storage
- Stored on `MatchHistory.result`
- Updates `Player.gamesWon` / `Player.gamesLost` for the two teams' players

### UI Notes
- Sheet is dismissible by swipe-down gesture (treated as Skip)
- Score steppers are oversized for thumb-tap accuracy — these get used courtside

---

## 8. TIER SUGGESTIONS (ALGORITHMIC, HOST-APPROVED)

### Trigger Conditions
A suggestion appears when ALL of the following are true for a player:
- Player has captured results from ≥ 4 matches this session
- Win rate is significantly above or below their tier's expected baseline:
  - **Move Up:** ≥ 75% wins AND ≥ 3 of those wins came against players in their own tier or higher
  - **Move Down:** ≤ 25% wins AND ≥ 3 of those losses came against players in their own tier or lower
- No suggestion has been dismissed for this player in the last 4 matches
- Player isn't already at the top tier (for Move Up) or bottom tier (for Move Down)

### Suggestion UI
- Small non-blocking toast OR a notification badge in the header
- Tapping reveals: "Alice has won 4 of 5 against B-tier players. Move her to A?"
- Three actions: **Yes, move up** / **Not now** / **Don't suggest again this session**
- Approval triggers an instant tier change with a brief animation/notification

### Algorithm Notes
- This is intentionally conservative — fewer false positives is better than more suggestions
- Win rate thresholds (75%/25%) and minimum match count (4) should be tunable in code
- Suggestions never auto-apply
- Manual tier edits override and reset the suggestion cooldown for that player

---

## 9. COURT MANAGEMENT

### Court Setup
- At session start, host picks **active court count** (1+)
- Each court can be optionally named (default: "Court 1", "Court 2", ...)

### Mid-Session Court Actions (per-court overflow menu)
- **Rename Court** — opens text input
- **Activate / Deactivate** — toggle court availability
- **Set Mode** — Normal vs Winner Stays, with consecutive-win cap if Winner Stays

### Deactivation Behavior
- If court is empty: simply marked inactive, hidden from "Start All" and Start Match flows
- If court has an active match: confirmation modal — "End match and deactivate court? Players will return to waiting."
  - On confirm: match is cancelled (no result), players return to waiting, court hidden
- Deactivated courts appear in a collapsed "Inactive Courts" section with a Reactivate button

### "Start All Matches" Behavior
- Fills all empty active courts in sequence
- Engine runs N times (one per empty court), each time accounting for players already assigned to courts in this batch
- If the pool runs out (fewer waiting players than 4 × empty courts), fills as many as possible, leaves remaining courts empty, surfaces a toast: "Started 3 of 4 matches — not enough players for the last court"

---

## 10. UI SURFACES

### `/setup` — Session Setup (Updated)

**Sections (top to bottom):**
1. **Court Count** — stepper, min 1
2. **Tier Configuration** — segmented control (3 / 4 / 5), with editable tier labels below
3. **Player Roster Input**
   - Bulk paste textarea: `Name [Tier]` format
   - Live per-line validation (✓ / ✗) with inline messages
   - Player count + unrated count below the box
4. **Initial Check-In Mode** — toggle:
   - **All in roster (default)** — players start checked-out, host checks in as they arrive
   - **All checked in** — legacy v1 behavior, immediate matchmaking pool
5. **Start Session** button (sticky bottom)

### `/session` — Live Session (Updated)

**Layout:**
- **Sticky header:** session timer, active court count, checked-in count / total roster, strategy pill, overflow menu (End Session, Settings)
- **Action bar (just below header):** **Start All Matches**, **Add Player**, **Check In** (only visible if roster has unchecked-in players)
- **Court Grid:** responsive 1-col (phone) / 2-col (tablet) layout. Each court card is large and tactile.
- **Waiting Queue:** below the courts, grouped into tiers visually (e.g. "Next Up" → top 4 by wait time, "Queued" → rest)
- **Sub-sections (collapsible):** BRB, Paused, Roster (unchecked-in)
- **No fixed bottom bar** — the action bar near the top handles primary actions

### Court Card (Active Match)
- Court name (large, top-left)
- Match timer (large monospace, top-right)
- Team A row: player names, tier badges, avg tier badge
- Team B row: same
- **Warning chips** (if any) — yellow or red, tappable
- **Undo** button (only during 30s window) with countdown ring
- **End Match** button (primary action)

### Court Card (Empty)
- Court name
- Single large **Start Match** tap target (full card height when nothing else)
- Mode badge (e.g. "Winner Stays" if applicable)

### Player Row (in Queue)
- Avatar (initials or a generic icon)
- Name + tier badge
- Wait time (M:SS)
- Skip warning indicator (yellow ⚠ or red 🔴)
- Overflow menu (⋮): **Step Away**, Edit Tier, Remove, Set Fixed Partner, Set Do Not Pair...

### Player Row (in Roster — unchecked in)
- Same as above but greyed out
- Big **Check In** button replaces the wait time

### Player Row (in Stepped Away)
- Status badge "AWAY" with elapsed away timer
- Two inline resume options: **"Restore position"** (default, tappable) / **"Back of queue"** (secondary, tappable)
- No overflow menu while stepped away — the resume choice is the primary action

### Add Player Flow
- Modal with:
  - Name input
  - Tier selector (segmented control + "Unrated" option)
  - Toggle: "Check in immediately" (default ON during session, OFF during setup)
  - Confirm / Cancel

### Strategy Picker
- Tap strategy pill in header → bottom sheet
- Lists strategies with one-line descriptions and trade-offs
- Hybrid section: "Tiebreaker (optional)" with secondary picker
- Variety section appears with decay slider when Variety is selected
- Save → applies to next match generation

### Settings Sheet (header overflow)
- Toggle: Match Preview Before Commit (default ON)
- Tier system: relabel tiers, change count (with confirmation if mid-session)
- Result capture: optional default-on toggle (cannot be disabled if Winner Stays courts exist)
- Constraints: list of fixed pairs and do-not-pair rules with edit/remove
- Display Handoff: generate URL/QR (if §12 implemented)

---

## 11. CUSTOM MODAL SYSTEM

### What It Replaces
- All `window.alert()`, `window.confirm()`, `window.prompt()` calls
- Browser-native dialogs are removed entirely

### Modal Types
- **Confirmation Modal** — destructive actions (End Session, Remove Player, Cancel Match)
- **Bottom Sheet** — match preview, result capture, strategy picker, add player
- **Toast** — non-blocking feedback (e.g. "Match started", "Player checked in")
- **Banner** — persistent in-context warnings (e.g. session-level "3 unrated players in queue")

### Modal Requirements
- Keyboard-accessible
- Dismissible via backdrop tap (non-destructive only) and explicit cancel
- Animated in 150ms, out 100ms (sharp, fast)
- Z-index hierarchy: toast > banner > sheet > modal > main
- Never two modals stacked

---

## 12. LOCAL DISPLAY HANDOFF (OPTIONAL — P2)

> Low priority. Ship only if implementation is straightforward.

### Concept
- Host generates a snapshot URL like `dinkpad.app/view#<encoded-state>`
- URL fragment contains a serialized read-only snapshot
- Receiving device opens the URL → renders a read-only court grid + queue
- **Not real-time.** The receiver shows a "snapshot from HH:MM" timestamp
- Host can tap "Refresh Handoff" to regenerate the URL (or QR) after key events

### Implementation Notes
- URL hash limit (~2KB on most browsers) constrains how much data can be encoded — may need to drop history and just include current state
- QR code rendering via lightweight library (e.g. `qrcode` npm)
- Receiver page is the same SPA in a "view-only" mode — gated by route + URL hash detection
- No editing affordances render in this mode

### Honest Framing
- This is not multi-device sync. It's "show what's happening on the bench tablet, refreshed on demand."
- A real spectator mode is a backend feature for a future iteration.

---

## 13. PERSISTENCE & MIGRATION

### localStorage Keys
- `dinkpad_session_v2` — current session state
- `dinkpad_settings_v2` — host preferences (preview-on-by-default, default tier config, etc.)

### Migration from v1
- On first load with `dinkpad_session_v1` present and no `_v2`:
  - Show a one-time modal: "DinkPad has been updated. Your existing session can be migrated."
  - Migration logic:
    - Map numeric skill ratings to tier buckets:
      - 1.0–2.5 → lowest tier
      - 2.5–3.0 → next
      - 3.0–3.5 → next
      - 3.5–4.0 → next
      - 4.0+ → highest
    - All players default to `waiting` (not roster) since they're already in a session
    - Constraints initialized empty
- Discard v1 session data after successful migration

### Save Frequency
- On every state change (debounced 250ms to avoid hammering localStorage during rapid edits)

### Storage Limits
- Match history is the largest growing structure
- Cap match history at 200 entries per session — older entries pruned silently (Variety strategy decay makes them irrelevant anyway)

---

## 14. PRIORITY & BUILD ORDER

### Build Phase 1 (P0 — Foundation)
> Build these first. Nothing else can be tested without them.

1. **Data model migration** — new `SessionState`, `Player`, `Match` shapes
2. **Tier system core** — config, player tier assignment, tier display
3. **Player lifecycle states** — Roster, Waiting, Stepped Away (full state machine with resume options)
4. **Setup flow rewrite** — including bulk-paste validation and check-in mode
5. **Custom modal system** — replace all browser dialogs
6. **Court grid dashboard** — primary session view
7. **Matchmaking engine rebuild** — Balanced + Min Wait + Variety strategies
8. **Match preview sheet** — with shuffle/confirm/cancel
9. **Undo Match Start** — 30s window with rollback
10. **Match result capture sheet** — with skip path
11. **Best-effort constraints layer** — Fixed Partners, warnings system

### Build Phase 2 (P1 — Polish & Power)
> Build after Phase 1 ships and is stable.

1. **Tier suggestions** (algorithm + UI)
2. **Winner Stays mode** (per-court setting)
3. **Variety recency decay** (engine refinement)
4. **Do Not Pair flag** (constraint addition)
5. **Court Activation/Deactivation**
6. **End Game with score sheet** (full polish on §7)
7. **Manual tier edit mid-session**
8. **Hybrid strategies** (primary + tiebreaker)

### Build Phase 3 (P2 — Optional / Future)
1. Court naming
2. Local display handoff (URL/QR)
3. Neo-brutalist visual restyle (or as parallel design track)

---

## 15. CROSS-CHECK: KNOWN INTERACTIONS & EDGE CASES

> Documenting these so they're not discovered the hard way.

### Tier System Interactions
- **Unrated players + Balanced strategy** — engine treats them as midpoint with uncertainty penalty. If pool is mostly unrated, Balanced behaves close to Min Wait.
- **Tier change mid-session via suggestion** — does NOT affect any in-progress match (Match snapshot freezes player tier at start). Affects all future matches.
- **Changing tier count mid-session** — gated behind a confirmation modal because it requires re-mapping every player. Prefer to set this once at setup.

### Constraint Interactions
- **Fixed Partner with one player Stepped Away** — pair is excluded from matchmaking until both are in `waiting`. The present player accumulates wait time but won't be matched solo. If the absent player returns and chooses "Back of queue," the pair's effective wait time resets to the lower of the two values.
- **Fixed Partner + Do Not Pair conflict** — UI prevents creating these simultaneously. If detected via load (e.g. corrupted state), Fixed Partner takes precedence and Do Not Pair is dropped with a warning.
- **Critical Skip player + Do Not Pair** — engine attempts to honor both. If impossible, Skip Priority wins (player must play) and Do Not Pair is relaxed with `DO_NOT_PAIR_FORCED` warning.

### Match Lifecycle Interactions
- **Undo after Result Captured** — undo also rolls back the result and any tier suggestions it triggered.
- **Undo + Winner Stays** — if the match that's being undone was a "challenger" match in Winner Stays mode, the previous winners are NOT restored to the court (too complex to roll back). The court returns to empty.
- **Undo expires while user is on the result sheet** — sheet remains usable; result still captures normally.
- **Match Preview's "Shuffle" + Skip Priority** — shuffling re-runs the engine, but critical skip players remain forced. Shuffle cannot exclude them.

### Result Capture Interactions
- **Skipping result + Winner Stays** — if Winner Stays is on for this court, skipping a result effectively rotates all 4 players off (no winner to retain). Toast warns: "No winner recorded — court rotates fully."
- **Result captured then match undone** — see Undo above; result is discarded.

### Check-In Interactions
- **Add Player during session with "Check in immediately" off** — player goes to roster, not queue. Useful for hosts pre-loading late-arrivers.
- **Check-in during in-progress match** — player joins queue, accumulates wait time from check-in moment, becomes eligible for next match.
- **Roster player set as Fixed Partner before check-in** — pair is recorded but inactive. Both must be in `waiting` for the pair to influence matchmaking.

### Edge Cases — Keep In Mind
- **Fewer than 4 waiting players when "Start Match" tapped** — preview sheet shows error with `INSUFFICIENT_PLAYERS` warning. Confirm button disabled.
- **All waiting players are critical-skip** — engine matches first 4 by wait time. Skill balance is best-effort.
- **Player removed mid-match** — blocked. Per-player Remove menu is disabled when status is `playing`.
- **Strategy changed mid-shuffle** — shuffle uses the new strategy on the next attempt. No retroactive re-run.

---

## 16. NON-GOALS / EXPLICIT EXCLUSIONS

To be unambiguous about what this iteration is NOT:

- **No backend, no accounts, no auth, no cross-device sync**
- **No persistent player profiles across sessions** — every session is its own world
- **No player-facing UI** (player can't open the app to see "where am I in the queue")
- **No analytics dashboard** for venue owners
- **No native app** (PWA only)
- **No payment / monetization plumbing**
- **No real-time spectator mode** (Local Display Handoff is a snapshot, not live)
- **No automated tier movement** (suggestions only; host always approves)
- **No tournament bracket support** (this is open play only)

---

*Build Prompt — DinkPad v2 Iteration 1 — April 2026*
