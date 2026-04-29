# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DinkPad is a **mobile-first pickleball open play session manager** — a fully client-side Next.js 16 / React 19 / TypeScript / Tailwind CSS 4 app with no backend. All data persists in `localStorage`. The core feature is a 3-strategy matchmaking engine for managing courts, players, and fair rotation at open play sessions.

## Commands

```bash
npm run dev       # Start dev server at localhost:3000 (hot reload)
npm run build     # Production build (also type-checks)
npm run start     # Run production build locally
npm run lint      # Run ESLint
npm run test      # Run unit tests (Vitest)
npm run test:watch # Run Vitest in watch mode
```

## Architecture

### Page Flow
```
/ (home) → /setup → /session
```
- `/setup` — Initialize session: set court count, tier config, paste player list (`Name [Tier]` per line, e.g. `Alice A`), creates `SessionState` in localStorage
- `/session` — Main app; all game logic lives here

### Data Model (`app/types.ts`)
```typescript
Player       { id, name, tier: string|null, status, waitTime, gamesPlayed, gamesWon, gamesLost,
               consecutiveSkips, checkedInAt?, steppedAwayAt?, lastPlayedAt?, tierHistory }
Match        { id, court, teamA, teamB, startTime, strategy, warnings: MatchWarning[], isUndoable }
MatchHistory { ...Match fields, endTime, duration, result?: MatchResult, undone }
MatchTeam    { player1Id, player2Id, avgTier: number|null }
UndoableMatch { matchId, expiresAt, prevPlayerStates, prevOtherSkips }
Court        { id, name, isActive, mode: "normal"|"winner-stays" }
TierConfig   { tiers: string[], tierCount: 3|4|5, labels? }
ConstraintSet { fixedPairs: FixedPair[], doNotPair: DoNotPairRule[] }
SessionState { players, courts, matchHistory, activeMatches, undoableMatches, tierConfig,
               currentStrategy, strategyConfig, constraints, sessionStartTime, sessionId,
               nextPlayerId, nextMatchId }
```

Player statuses: `roster | waiting | playing | stepped-away | removed`
Strategies: `balanced | minimize-wait | variety`

### Persistence (`app/utils/sessionStorage.ts`)
- Active key: `dinkpad_session_v2`
- Migrates from `dinkpad_session_v1` automatically on first load (`skillToTier` maps numeric skill → tier bucket)
- Match history capped at 200 entries (oldest pruned on save)
- Auto-saved via `useEffect` on every state change in the session page

### Tier Utilities (`app/utils/tierUtils.ts`)
- `DEFAULT_TIER_CONFIGS` — preset configs for 3/4/5 tiers; default is 4-tier `["D","C","B","A"]`
- `getTierOrdinal(tier, config)` — returns 0-based index, null for unrated
- `getUnratedMidpoint(config)` — used as stand-in value for unrated players in matchmaking
- `parsePlayerLine(line, config)` — parses `"Alice A"` or `"Charlie"` into `{ valid, name, tier, displayMessage }`
- `parseBulkInput(text, config)` — splits on newlines, skips blanks, returns one result per line

### Player State Machine (`app/utils/playerStateUtils.ts`)
Pure transition functions — each throws if called from the wrong status:

| Function | Transition | Notes |
|---|---|---|
| `createPlayer` | → roster or waiting | `checkInImmediately` flag |
| `checkIn` | roster → waiting | sets `checkedInAt` |
| `startPlaying` | waiting → playing | resets `waitTime`, `consecutiveSkips` |
| `finishPlaying` | playing → waiting | increments `gamesPlayed`, optional W/L |
| `stepAway` | waiting → stepped-away | sets `steppedAwayAt` |
| `resumeWithPosition` | stepped-away → waiting | preserves `waitTime` and `consecutiveSkips` |
| `resumeBackOfQueue` | stepped-away → waiting | resets both to 0 |
| `tickWaitTime` | — | increments `waitTime` for **waiting and stepped-away** |
| `applySkipIncrement` | — | increments `consecutiveSkips` for **waiting and stepped-away** |
| `isCriticalPriority(player, courtCount)` | — | true when `consecutiveSkips >= courtCount + 1` |

### Matchmaking Engine (`app/utils/matchmaking.ts`)
Entry point: `generateMatch(input: GenerateMatchInput): GenerateMatchResult`

```typescript
GenerateMatchInput  { waitingPlayers, strategy, strategyConfig, constraints, tierConfig,
                      matchHistory, courtCount, courtId, matchId, now? }
GenerateMatchResult { match: { teamA, teamB } | null, warnings: MatchWarning[] }
```

Three strategies, selectable at runtime:

| Strategy | Algorithm |
|---|---|
| **Balanced** | Enumerate top-12 candidates by wait time; try all valid team pairings; minimise \|avgTierA − avgTierB\|; tiebreak on combined wait time |
| **Minimize Wait** | Take top 4 by wait time; find best pairing within those 4 |
| **Variety** | Top-8 candidates; decay-weighted repeat scoring (1.0/0.75/0.5/0.25 by recency bucket); minimise partnerRepeats×3 + opponentRepeats |

**Skip priority** — `consecutiveSkips >= courtCount + 1` marks critical; engine forces critical players in first.

**Warning codes** emitted per match: `INSUFFICIENT_PLAYERS`, `CRITICAL_PLAYER_FORCED`, `LARGE_TIER_GAP` (avg diff ≥ 2), `UNRATED_HEAVY` (3+ unrated), `FIXED_PAIR_BROKEN`.

**Fixed pairs** — pairs in `constraints.fixedPairs` are kept on the same team; team pairings that split a pair are excluded from consideration.

### UI Components (`app/components/`)
| File | Purpose |
|---|---|
| `ConfirmModal.tsx` | Blocking confirmation dialog; destructive (red) or normal (green) confirm; Esc to cancel |
| `BottomSheet.tsx` | Slides up from bottom; backdrop/Esc to close; scrollable content |
| `ToastContext.tsx` | `ToastProvider` + `useToast()` hook; 4 types; auto-dismiss 3s; max 3 visible |

`ToastProvider` is mounted in `app/layout.tsx`, wrapping all pages.

### State Management
Pure React (`useState` / `useEffect`) — no external state library. A 1-second `setInterval` drives wait-time ticking (`tickWaitTime`), undo window expiry, and the session timer in the header.

## Testing

Unit tests live in `app/utils/__tests__/`. Run with `npm test`. Vitest + jsdom. **118 tests, all passing.**

| File | Tests | What it covers |
|---|---|---|
| `sessionStorage.test.ts` | 23 | `skillToTier`, `migrateV1ToV2`, save/load/clear roundtrip |
| `tierUtils.test.ts` | 30 | `getTierOrdinal`, `getTierLabel`, `parsePlayerLine`, `parseBulkInput` |
| `playerStateUtils.test.ts` | 47 | All state transitions, tick helpers, predicates |
| `matchmaking.test.ts` | 18 | All 3 strategies, skip priority, warning codes, fixed pairs |

## Design System

Style direction: **neo-brutalist / corporate punk / modern** (think Joola brand aesthetic).

Defined CSS variables in `app/globals.css`:
- `--primary: #bef264` (pickleball yellow-green accent)
- Dark base: `slate-900` / `slate-950`
- Glassmorphism panels with `backdrop-filter: blur`

UI is built entirely with vanilla Tailwind — no component library. Shared UI primitives live in `app/components/`; page-specific UI is inlined in page files. Mobile-first breakpoints, touch-optimized tap targets, bottom-sheet modals on mobile.

## Key Constraints
- **Client-side only** — no API routes, no server actions, no database
- **No component library** — all UI is custom Tailwind
- Tier ratings use configurable labels (default: D / C / B / A, lowest → highest)
- Match format is always **2v2 doubles**
