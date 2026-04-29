import { SessionState, Player, StrategyId } from "../types";

const SESSION_KEY_V2 = "dinkpad_session_v2";
const SESSION_KEY_V1 = "dinkpad_session_v1";
const MAX_MATCH_HISTORY = 200;

const DEFAULT_TIERS = ["D", "C", "B", "A"];
const DEFAULT_TIER_COUNT = 4 as const;

function generateSessionId(): string {
  return Math.random().toString(36).slice(2, 11);
}

/**
 * Maps a v1 numeric skill rating to a tier label.
 * Uses 5 fixed breakpoints: <2.5, 2.5–3.0, 3.0–3.5, 3.5–4.0, 4.0+
 * Segment index is capped at tierCount-1 so upper buckets collapse for fewer tiers.
 */
export function skillToTier(skill: number, tiers: string[]): string {
  const breakpoints = [2.5, 3.0, 3.5, 4.0];
  let segment = 0;
  for (const bp of breakpoints) {
    if (skill >= bp) segment++;
  }
  return tiers[Math.min(segment, tiers.length - 1)];
}

/**
 * Migrates a raw v1 JSON string to a v2 SessionState.
 * Returns null if the input is invalid.
 */
export function migrateV1ToV2(v1Raw: string): SessionState | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const v1 = JSON.parse(v1Raw) as Record<string, any>;
    const tiers = DEFAULT_TIERS;

    const players: Player[] = (v1.players ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (p: Record<string, any>): Player => ({
        id: p.id,
        name: p.name,
        tier:
          typeof p.skill === "number" ? skillToTier(p.skill as number, tiers) : null,
        status:
          p.status === "paused"
            ? "stepped-away"
            : (p.status ?? "waiting"),
        waitTime: p.waitTime ?? 0,
        gamesPlayed: p.gamesPlayed ?? 0,
        gamesWon: 0,
        gamesLost: 0,
        lastPlayedAt: p.lastPlayedAt,
        consecutiveSkips: p.consecutiveSkips ?? 0,
        tierHistory: [],
      }),
    );

    const courts = (v1.courts ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: Record<string, any>, idx: number) => ({
        id: `court_${c.number ?? idx + 1}`,
        name: `Court ${c.number ?? idx + 1}`,
        isActive: c.isActive ?? true,
        mode: "normal" as const,
      }),
    );

    const strategyMap: Record<string, StrategyId> = {
      "wait-time": "minimize-wait",
      balanced: "balanced",
      variety: "variety",
    };
    const currentStrategy: StrategyId =
      strategyMap[v1.currentStrategy as string] ?? "balanced";

    const state: SessionState = {
      players,
      courts,
      matchHistory: [],
      activeMatches: [],
      undoableMatches: [],
      tierConfig: { tiers, tierCount: DEFAULT_TIER_COUNT },
      currentStrategy,
      strategyConfig: { primary: currentStrategy },
      constraints: { fixedPairs: [], doNotPair: [] },
      sessionStartTime: v1.sessionStartTime ?? Date.now(),
      sessionId: generateSessionId(),
      nextPlayerId: v1.nextPlayerId ?? players.length + 1,
      nextMatchId: v1.nextMatchId ?? 1,
    };

    return state;
  } catch {
    return null;
  }
}

export function saveSession(state: SessionState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const toSave =
      state.matchHistory.length > MAX_MATCH_HISTORY
        ? { ...state, matchHistory: state.matchHistory.slice(-MAX_MATCH_HISTORY) }
        : state;
    localStorage.setItem(SESSION_KEY_V2, JSON.stringify(toSave));
  } catch (error) {
    console.error("Failed to save session:", error);
  }
}

export function loadSession(): SessionState | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const v2Raw = localStorage.getItem(SESSION_KEY_V2);
    if (v2Raw) {
      return JSON.parse(v2Raw) as SessionState;
    }

    const v1Raw = localStorage.getItem(SESSION_KEY_V1);
    if (v1Raw) {
      return migrateV1ToV2(v1Raw);
    }

    return null;
  } catch (error) {
    console.error("Failed to load session:", error);
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem(SESSION_KEY_V2);
    localStorage.removeItem(SESSION_KEY_V1);
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
}

export function hasActiveSession(): boolean {
  return loadSession() !== null;
}
