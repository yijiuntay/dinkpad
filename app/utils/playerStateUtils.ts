import { Player, PlayerStatus } from "../types";

// ── Constructors ─────────────────────────────────────────────────────────────

export function createPlayer(
  id: number,
  name: string,
  tier: string | null,
  checkInImmediately: boolean,
  now = Date.now(),
): Player {
  return {
    id: `player_${id}`,
    name: name.trim(),
    tier,
    status: checkInImmediately ? "waiting" : "roster",
    waitTime: 0,
    gamesPlayed: 0,
    gamesWon: 0,
    gamesLost: 0,
    consecutiveSkips: 0,
    tierHistory: [],
    checkedInAt: checkInImmediately ? now : undefined,
  };
}

// ── State transitions ────────────────────────────────────────────────────────

/** roster → waiting. Sets checkedInAt timestamp. */
export function checkIn(player: Player, now = Date.now()): Player {
  assertStatus(player, "roster", "checkIn");
  return { ...player, status: "waiting", checkedInAt: now, waitTime: 0 };
}

/** waiting → playing. Resets consecutiveSkips and waitTime. */
export function startPlaying(player: Player, now = Date.now()): Player {
  assertStatus(player, "waiting", "startPlaying");
  return {
    ...player,
    status: "playing",
    waitTime: 0,
    consecutiveSkips: 0,
    lastPlayedAt: now,
  };
}

/**
 * playing → waiting. Increments gamesPlayed and optionally W/L.
 * Resets waitTime and consecutiveSkips.
 */
export function finishPlaying(
  player: Player,
  result: "won" | "lost" | "none" = "none",
  now = Date.now(),
): Player {
  assertStatus(player, "playing", "finishPlaying");
  return {
    ...player,
    status: "waiting",
    waitTime: 0,
    consecutiveSkips: 0,
    gamesPlayed: player.gamesPlayed + 1,
    gamesWon: result === "won" ? player.gamesWon + 1 : player.gamesWon,
    gamesLost: result === "lost" ? player.gamesLost + 1 : player.gamesLost,
    lastPlayedAt: now,
  };
}

/** waiting → stepped-away. Records the timestamp. */
export function stepAway(player: Player, now = Date.now()): Player {
  assertStatus(player, "waiting", "stepAway");
  return { ...player, status: "stepped-away", steppedAwayAt: now };
}

/**
 * stepped-away → waiting, keeping existing waitTime and consecutiveSkips.
 * Use when the player wasn't gone long enough to lose their spot.
 */
export function resumeWithPosition(player: Player): Player {
  assertStatus(player, "stepped-away", "resumeWithPosition");
  return { ...player, status: "waiting", steppedAwayAt: undefined };
}

/**
 * stepped-away → waiting, resetting waitTime and consecutiveSkips to 0.
 * Use when the player was away long enough that queue-jumping would be unfair.
 */
export function resumeBackOfQueue(player: Player): Player {
  assertStatus(player, "stepped-away", "resumeBackOfQueue");
  return {
    ...player,
    status: "waiting",
    waitTime: 0,
    consecutiveSkips: 0,
    steppedAwayAt: undefined,
  };
}

// ── Per-tick helpers ─────────────────────────────────────────────────────────

/**
 * Increments waitTime by 1 second for waiting and stepped-away players.
 * Called once per second for every player in the session.
 */
export function tickWaitTime(player: Player): Player {
  if (player.status !== "waiting" && player.status !== "stepped-away") return player;
  return { ...player, waitTime: player.waitTime + 1 };
}

/**
 * Increments consecutiveSkips for players who sat out this match.
 * Applied to all waiting and stepped-away players NOT in the playing set.
 */
export function applySkipIncrement(player: Player): Player {
  if (player.status !== "waiting" && player.status !== "stepped-away") return player;
  return { ...player, consecutiveSkips: player.consecutiveSkips + 1 };
}

// ── Predicates ───────────────────────────────────────────────────────────────

/** Only `waiting` players are eligible to be selected by the matchmaking engine. */
export function isEligibleForMatchmaking(player: Player): boolean {
  return player.status === "waiting";
}

/**
 * A player is critical-priority when their consecutive-skip count meets
 * the threshold (courtCount + 1). The engine must include them in the next match.
 */
export function isCriticalPriority(player: Player, courtCount: number): boolean {
  return player.consecutiveSkips >= courtCount + 1;
}

/** Remove is blocked for players currently on court. */
export function canRemove(player: Player): boolean {
  return player.status !== "playing";
}

// ── Internal ─────────────────────────────────────────────────────────────────

function assertStatus(
  player: Player,
  expected: PlayerStatus,
  fn: string,
): void {
  if (player.status !== expected) {
    throw new Error(
      `${fn}: expected status '${expected}', got '${player.status}' (player ${player.id})`,
    );
  }
}
