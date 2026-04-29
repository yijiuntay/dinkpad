import { describe, it, expect } from "vitest";
import {
  createPlayer,
  checkIn,
  startPlaying,
  finishPlaying,
  stepAway,
  resumeWithPosition,
  resumeBackOfQueue,
  tickWaitTime,
  applySkipIncrement,
  isEligibleForMatchmaking,
  isCriticalPriority,
  canRemove,
} from "../playerStateUtils";
import type { Player } from "../../types";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const roster = (): Player => createPlayer(1, "Alice", "B", false, 1000);
const waiting = (): Player => createPlayer(2, "Bob", "A", true, 1000);
const playing = (): Player => ({ ...waiting(), status: "playing" });
const steppedAway = (): Player => ({ ...waiting(), status: "stepped-away", steppedAwayAt: 2000 });

// ── createPlayer ─────────────────────────────────────────────────────────────

describe("createPlayer", () => {
  it("creates a roster player when checkInImmediately=false", () => {
    const p = createPlayer(1, "Alice", "B", false);
    expect(p.status).toBe("roster");
    expect(p.checkedInAt).toBeUndefined();
  });

  it("creates a waiting player when checkInImmediately=true", () => {
    const p = createPlayer(1, "Alice", "B", true, 5000);
    expect(p.status).toBe("waiting");
    expect(p.checkedInAt).toBe(5000);
  });

  it("assigns correct id format", () => {
    expect(createPlayer(7, "X", null, true).id).toBe("player_7");
  });

  it("initialises numeric stats to 0", () => {
    const p = createPlayer(1, "Alice", "A", true);
    expect(p.gamesPlayed).toBe(0);
    expect(p.gamesWon).toBe(0);
    expect(p.gamesLost).toBe(0);
    expect(p.waitTime).toBe(0);
    expect(p.consecutiveSkips).toBe(0);
  });

  it("sets tier to null for unrated", () => {
    expect(createPlayer(1, "Alice", null, true).tier).toBeNull();
  });

  it("trims whitespace from name", () => {
    expect(createPlayer(1, "  Alice  ", null, true).name).toBe("Alice");
  });
});

// ── checkIn ──────────────────────────────────────────────────────────────────

describe("checkIn", () => {
  it("moves roster → waiting", () => {
    expect(checkIn(roster(), 3000).status).toBe("waiting");
  });

  it("sets checkedInAt", () => {
    expect(checkIn(roster(), 3000).checkedInAt).toBe(3000);
  });

  it("resets waitTime to 0", () => {
    const p = { ...roster(), waitTime: 99 };
    expect(checkIn(p).waitTime).toBe(0);
  });

  it("throws when player is not in roster", () => {
    expect(() => checkIn(waiting())).toThrow("checkIn");
    expect(() => checkIn(playing())).toThrow("checkIn");
  });
});

// ── startPlaying ─────────────────────────────────────────────────────────────

describe("startPlaying", () => {
  it("moves waiting → playing", () => {
    expect(startPlaying(waiting(), 9000).status).toBe("playing");
  });

  it("resets consecutiveSkips and waitTime", () => {
    const p = { ...waiting(), consecutiveSkips: 5, waitTime: 300 };
    const result = startPlaying(p, 9000);
    expect(result.consecutiveSkips).toBe(0);
    expect(result.waitTime).toBe(0);
  });

  it("sets lastPlayedAt", () => {
    expect(startPlaying(waiting(), 9000).lastPlayedAt).toBe(9000);
  });

  it("throws when not waiting", () => {
    expect(() => startPlaying(roster())).toThrow("startPlaying");
    expect(() => startPlaying(steppedAway())).toThrow("startPlaying");
  });
});

// ── finishPlaying ─────────────────────────────────────────────────────────────

describe("finishPlaying", () => {
  it("moves playing → waiting", () => {
    expect(finishPlaying(playing()).status).toBe("waiting");
  });

  it("increments gamesPlayed", () => {
    const p = { ...playing(), gamesPlayed: 3 };
    expect(finishPlaying(p).gamesPlayed).toBe(4);
  });

  it("resets waitTime and consecutiveSkips", () => {
    const p = { ...playing(), waitTime: 500, consecutiveSkips: 2 };
    const result = finishPlaying(p);
    expect(result.waitTime).toBe(0);
    expect(result.consecutiveSkips).toBe(0);
  });

  it("increments gamesWon on result=won", () => {
    const p = { ...playing(), gamesWon: 1 };
    expect(finishPlaying(p, "won").gamesWon).toBe(2);
    expect(finishPlaying(p, "won").gamesLost).toBe(0);
  });

  it("increments gamesLost on result=lost", () => {
    const p = { ...playing(), gamesLost: 2 };
    expect(finishPlaying(p, "lost").gamesLost).toBe(3);
    expect(finishPlaying(p, "lost").gamesWon).toBe(0);
  });

  it("does not change W/L on result=none", () => {
    const p = { ...playing(), gamesWon: 1, gamesLost: 1 };
    const result = finishPlaying(p, "none");
    expect(result.gamesWon).toBe(1);
    expect(result.gamesLost).toBe(1);
  });

  it("throws when not playing", () => {
    expect(() => finishPlaying(waiting())).toThrow("finishPlaying");
  });
});

// ── stepAway ─────────────────────────────────────────────────────────────────

describe("stepAway", () => {
  it("moves waiting → stepped-away", () => {
    expect(stepAway(waiting(), 5000).status).toBe("stepped-away");
  });

  it("records steppedAwayAt timestamp", () => {
    expect(stepAway(waiting(), 5000).steppedAwayAt).toBe(5000);
  });

  it("throws when not waiting", () => {
    expect(() => stepAway(roster())).toThrow("stepAway");
    expect(() => stepAway(playing())).toThrow("stepAway");
  });
});

// ── resumeWithPosition ───────────────────────────────────────────────────────

describe("resumeWithPosition", () => {
  it("moves stepped-away → waiting", () => {
    expect(resumeWithPosition(steppedAway()).status).toBe("waiting");
  });

  it("preserves waitTime and consecutiveSkips", () => {
    const p = { ...steppedAway(), waitTime: 250, consecutiveSkips: 3 };
    const result = resumeWithPosition(p);
    expect(result.waitTime).toBe(250);
    expect(result.consecutiveSkips).toBe(3);
  });

  it("clears steppedAwayAt", () => {
    expect(resumeWithPosition(steppedAway()).steppedAwayAt).toBeUndefined();
  });

  it("throws when not stepped-away", () => {
    expect(() => resumeWithPosition(waiting())).toThrow("resumeWithPosition");
  });
});

// ── resumeBackOfQueue ────────────────────────────────────────────────────────

describe("resumeBackOfQueue", () => {
  it("moves stepped-away → waiting", () => {
    expect(resumeBackOfQueue(steppedAway()).status).toBe("waiting");
  });

  it("resets waitTime and consecutiveSkips to 0", () => {
    const p = { ...steppedAway(), waitTime: 250, consecutiveSkips: 3 };
    const result = resumeBackOfQueue(p);
    expect(result.waitTime).toBe(0);
    expect(result.consecutiveSkips).toBe(0);
  });

  it("clears steppedAwayAt", () => {
    expect(resumeBackOfQueue(steppedAway()).steppedAwayAt).toBeUndefined();
  });

  it("throws when not stepped-away", () => {
    expect(() => resumeBackOfQueue(waiting())).toThrow("resumeBackOfQueue");
  });
});

// ── tickWaitTime ─────────────────────────────────────────────────────────────

describe("tickWaitTime", () => {
  it("increments waitTime for waiting players", () => {
    const p = { ...waiting(), waitTime: 10 };
    expect(tickWaitTime(p).waitTime).toBe(11);
  });

  it("increments waitTime for stepped-away players", () => {
    const p = { ...steppedAway(), waitTime: 60 };
    expect(tickWaitTime(p).waitTime).toBe(61);
  });

  it("does NOT tick for roster players", () => {
    const p = { ...roster(), waitTime: 0 };
    expect(tickWaitTime(p).waitTime).toBe(0);
  });

  it("does NOT tick for playing players", () => {
    const p = { ...playing(), waitTime: 5 };
    expect(tickWaitTime(p).waitTime).toBe(5);
  });
});

// ── applySkipIncrement ───────────────────────────────────────────────────────

describe("applySkipIncrement", () => {
  it("increments consecutiveSkips for waiting players", () => {
    const p = { ...waiting(), consecutiveSkips: 2 };
    expect(applySkipIncrement(p).consecutiveSkips).toBe(3);
  });

  it("increments consecutiveSkips for stepped-away players", () => {
    const p = { ...steppedAway(), consecutiveSkips: 1 };
    expect(applySkipIncrement(p).consecutiveSkips).toBe(2);
  });

  it("does NOT increment for roster players", () => {
    const p = { ...roster(), consecutiveSkips: 0 };
    expect(applySkipIncrement(p).consecutiveSkips).toBe(0);
  });

  it("does NOT increment for playing players", () => {
    const p = { ...playing(), consecutiveSkips: 0 };
    expect(applySkipIncrement(p).consecutiveSkips).toBe(0);
  });
});

// ── Predicates ───────────────────────────────────────────────────────────────

describe("isEligibleForMatchmaking", () => {
  it("true only for waiting", () => {
    expect(isEligibleForMatchmaking(waiting())).toBe(true);
    expect(isEligibleForMatchmaking(roster())).toBe(false);
    expect(isEligibleForMatchmaking(playing())).toBe(false);
    expect(isEligibleForMatchmaking(steppedAway())).toBe(false);
  });
});

describe("isCriticalPriority", () => {
  it("true when consecutiveSkips >= courtCount + 1", () => {
    const p = { ...waiting(), consecutiveSkips: 3 };
    expect(isCriticalPriority(p, 2)).toBe(true); // threshold = 3
  });

  it("false when below threshold", () => {
    const p = { ...waiting(), consecutiveSkips: 2 };
    expect(isCriticalPriority(p, 2)).toBe(false); // threshold = 3
  });

  it("true at exactly the threshold", () => {
    const p = { ...waiting(), consecutiveSkips: 3 };
    expect(isCriticalPriority(p, 2)).toBe(true);
  });

  it("scales with courtCount", () => {
    const p = { ...waiting(), consecutiveSkips: 5 };
    expect(isCriticalPriority(p, 4)).toBe(true);  // threshold = 5
    expect(isCriticalPriority(p, 5)).toBe(false); // threshold = 6
  });
});

describe("canRemove", () => {
  it("true for roster, waiting, stepped-away", () => {
    expect(canRemove(roster())).toBe(true);
    expect(canRemove(waiting())).toBe(true);
    expect(canRemove(steppedAway())).toBe(true);
  });

  it("false for playing", () => {
    expect(canRemove(playing())).toBe(false);
  });
});
