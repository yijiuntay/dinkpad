import { describe, it, expect, beforeEach } from "vitest";
import {
  saveSession,
  loadSession,
  clearSession,
  hasActiveSession,
  skillToTier,
  migrateV1ToV2,
} from "../sessionStorage";
import type { SessionState } from "../../types";

const mockSession: SessionState = {
  players: [],
  courts: [],
  matchHistory: [],
  activeMatches: [],
  undoableMatches: [],
  tierConfig: { tiers: ["D", "C", "B", "A"], tierCount: 4 },
  currentStrategy: "balanced",
  strategyConfig: { primary: "balanced" },
  constraints: { fixedPairs: [], doNotPair: [] },
  sessionStartTime: 1000,
  sessionId: "test123",
  nextPlayerId: 1,
  nextMatchId: 1,
};

const makeV1Session = (overrides = {}) => ({
  players: [
    { id: "p1", name: "Alice", skill: 3.5, status: "waiting", waitTime: 120, gamesPlayed: 3, consecutiveSkips: 1 },
    { id: "p2", name: "Bob", skill: 2.0, status: "paused", waitTime: 30, gamesPlayed: 1, consecutiveSkips: 0 },
    { id: "p3", name: "Charlie", skill: 4.5, status: "playing", waitTime: 0, gamesPlayed: 2, consecutiveSkips: 0 },
  ],
  courts: [
    { number: 1, currentMatch: null, isActive: true },
    { number: 2, currentMatch: null, isActive: false },
  ],
  matchHistory: [],
  currentStrategy: "wait-time",
  sessionStartTime: 5000,
  courtCount: 2,
  nextPlayerId: 4,
  nextMatchId: 5,
  ...overrides,
});

// ── skillToTier ─────────────────────────────────────────────────────────────

describe("skillToTier", () => {
  const t4 = ["D", "C", "B", "A"];
  const t3 = ["C", "B", "A"];
  const t5 = ["E", "D", "C", "B", "A"];

  it("4 tiers: maps each bucket", () => {
    expect(skillToTier(1.0, t4)).toBe("D");
    expect(skillToTier(2.4, t4)).toBe("D");
    expect(skillToTier(2.5, t4)).toBe("C");
    expect(skillToTier(2.9, t4)).toBe("C");
    expect(skillToTier(3.0, t4)).toBe("B");
    expect(skillToTier(3.4, t4)).toBe("B");
    expect(skillToTier(3.5, t4)).toBe("A");
    expect(skillToTier(4.0, t4)).toBe("A");
    expect(skillToTier(5.5, t4)).toBe("A");
  });

  it("3 tiers: collapses upper buckets", () => {
    expect(skillToTier(1.0, t3)).toBe("C");
    expect(skillToTier(2.5, t3)).toBe("B");
    expect(skillToTier(3.0, t3)).toBe("A");
    expect(skillToTier(3.5, t3)).toBe("A");
    expect(skillToTier(4.0, t3)).toBe("A");
  });

  it("5 tiers: all 5 buckets map distinctly", () => {
    expect(skillToTier(1.0, t5)).toBe("E");
    expect(skillToTier(2.5, t5)).toBe("D");
    expect(skillToTier(3.0, t5)).toBe("C");
    expect(skillToTier(3.5, t5)).toBe("B");
    expect(skillToTier(4.0, t5)).toBe("A");
  });
});

// ── migrateV1ToV2 ───────────────────────────────────────────────────────────

describe("migrateV1ToV2", () => {
  it("maps skill ratings to tiers", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.players[0].tier).toBe("A"); // 3.5
    expect(result.players[1].tier).toBe("D"); // 2.0
    expect(result.players[2].tier).toBe("A"); // 4.5
  });

  it("renames paused → stepped-away", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.players[1].status).toBe("stepped-away");
  });

  it("preserves existing player data", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.players[0].name).toBe("Alice");
    expect(result.players[0].waitTime).toBe(120);
    expect(result.players[0].gamesPlayed).toBe(3);
    expect(result.players[0].consecutiveSkips).toBe(1);
  });

  it("initialises new player fields with defaults", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.players[0].gamesWon).toBe(0);
    expect(result.players[0].gamesLost).toBe(0);
    expect(result.players[0].tierHistory).toEqual([]);
  });

  it("maps wait-time strategy → minimize-wait", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.currentStrategy).toBe("minimize-wait");
  });

  it("preserves balanced and variety strategy names", () => {
    const r1 = migrateV1ToV2(JSON.stringify(makeV1Session({ currentStrategy: "balanced" })))!;
    const r2 = migrateV1ToV2(JSON.stringify(makeV1Session({ currentStrategy: "variety" })))!;
    expect(r1.currentStrategy).toBe("balanced");
    expect(r2.currentStrategy).toBe("variety");
  });

  it("builds courts with new Court shape", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.courts[0]).toMatchObject({ id: "court_1", name: "Court 1", mode: "normal", isActive: true });
    expect(result.courts[1].isActive).toBe(false);
  });

  it("initialises empty collections", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.activeMatches).toEqual([]);
    expect(result.undoableMatches).toEqual([]);
    expect(result.matchHistory).toEqual([]);
    expect(result.constraints).toEqual({ fixedPairs: [], doNotPair: [] });
  });

  it("preserves sessionStartTime", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.sessionStartTime).toBe(5000);
  });

  it("preserves nextPlayerId and nextMatchId", () => {
    const result = migrateV1ToV2(JSON.stringify(makeV1Session()))!;
    expect(result.nextPlayerId).toBe(4);
    expect(result.nextMatchId).toBe(5);
  });

  it("returns null for invalid JSON", () => {
    expect(migrateV1ToV2("not json")).toBeNull();
  });
});

// ── saveSession / loadSession ────────────────────────────────────────────────

describe("saveSession / loadSession", () => {
  beforeEach(() => localStorage.clear());

  it("returns null when no session exists", () => {
    expect(loadSession()).toBeNull();
  });

  it("roundtrips a v2 session", () => {
    saveSession(mockSession);
    expect(loadSession()).toEqual(mockSession);
  });

  it("migrates a v1 session when no v2 key exists", () => {
    const v1 = makeV1Session();
    localStorage.setItem("dinkpad_session_v1", JSON.stringify(v1));
    const loaded = loadSession();
    expect(loaded).not.toBeNull();
    expect(loaded!.players[0].tier).toBe("A");
    expect(loaded!.currentStrategy).toBe("minimize-wait");
  });

  it("prefers v2 over v1 when both exist", () => {
    saveSession(mockSession);
    localStorage.setItem("dinkpad_session_v1", JSON.stringify(makeV1Session()));
    const loaded = loadSession();
    expect(loaded!.sessionId).toBe("test123");
  });

  it("caps match history at 200 entries keeping the most recent", () => {
    const manyMatches = Array.from({ length: 250 }, (_, i) => ({
      id: `m${i}`,
      court: "court_1",
      teamA: { player1Id: "p1", player2Id: "p2", avgTier: 2 },
      teamB: { player1Id: "p3", player2Id: "p4", avgTier: 2 },
      startTime: i * 1000,
      strategy: "balanced" as const,
      warnings: [],
      endTime: i * 1000 + 600,
      duration: 600,
      undone: false,
    }));
    saveSession({ ...mockSession, matchHistory: manyMatches });
    const loaded = loadSession()!;
    expect(loaded.matchHistory.length).toBe(200);
    expect(loaded.matchHistory[0].id).toBe("m50");
    expect(loaded.matchHistory[199].id).toBe("m249");
  });
});

// ── hasActiveSession / clearSession ─────────────────────────────────────────

describe("hasActiveSession / clearSession", () => {
  beforeEach(() => localStorage.clear());

  it("returns false when no session", () => {
    expect(hasActiveSession()).toBe(false);
  });

  it("returns true after saving", () => {
    saveSession(mockSession);
    expect(hasActiveSession()).toBe(true);
  });

  it("clearSession removes v2 key", () => {
    saveSession(mockSession);
    clearSession();
    expect(hasActiveSession()).toBe(false);
  });

  it("clearSession also removes v1 key", () => {
    localStorage.setItem("dinkpad_session_v1", JSON.stringify(makeV1Session()));
    clearSession();
    expect(hasActiveSession()).toBe(false);
  });
});
