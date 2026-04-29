import type {
  Player,
  StrategyId,
  StrategyConfig,
  ConstraintSet,
  TierConfig,
  MatchHistory,
  MatchWarning,
  MatchTeam,
  WarningCode,
} from "../types";
import { getTierOrdinal, getUnratedMidpoint } from "./tierUtils";

// ── Public API ────────────────────────────────────────────────────────────────

export interface GenerateMatchInput {
  waitingPlayers: Player[];
  strategy: StrategyId;
  strategyConfig: StrategyConfig;
  constraints: ConstraintSet;
  tierConfig: TierConfig;
  matchHistory: MatchHistory[];
  courtCount: number;
  courtId: string;
  matchId: string;
  now?: number;
}

export interface GenerateMatchResult {
  match: { teamA: MatchTeam; teamB: MatchTeam } | null;
  warnings: MatchWarning[];
}

// ── Internal types ────────────────────────────────────────────────────────────

type TeamPair = [[Player, Player], [Player, Player]];

interface PairingWeights {
  partnerWeight: number;
  opponentWeight: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeWarning(
  code: WarningCode,
  severity: "info" | "warn" | "error",
  message: string,
): MatchWarning {
  return { code, severity, message };
}

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map((c) => [first, ...c]),
    ...combinations(rest, k),
  ];
}

function pairingKey(id1: string, id2: string): string {
  return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

/**
 * Effective tier ordinal for matchmaking. Unrated players are treated as
 * midpoint + 0.5 uncertainty per the spec.
 */
function effectiveOrdinal(p: Player, tierConfig: TierConfig): number {
  const ord = getTierOrdinal(p.tier, tierConfig);
  return ord ?? getUnratedMidpoint(tierConfig) + 0.5;
}

/**
 * Average tier for a two-player team. Returns null only if both players are
 * unrated (fully ambiguous). Otherwise uses effective ordinals.
 */
function teamAvgTier(
  p1: Player,
  p2: Player,
  tierConfig: TierConfig,
): number | null {
  const o1 = getTierOrdinal(p1.tier, tierConfig);
  const o2 = getTierOrdinal(p2.tier, tierConfig);
  if (o1 === null && o2 === null) return null;
  const mid = getUnratedMidpoint(tierConfig);
  const eff1 = o1 ?? mid + 0.5;
  const eff2 = o2 ?? mid + 0.5;
  return (eff1 + eff2) / 2;
}

/**
 * All 3 canonical team pairings for 4 players, with fixed-pair constraints
 * enforced (pairings that split a fixed pair are excluded).
 */
function validPairings(
  players: [Player, Player, Player, Player],
  constraints: ConstraintSet,
): TeamPair[] {
  const [a, b, c, d] = players;
  const all: TeamPair[] = [
    [[a, b], [c, d]],
    [[a, c], [b, d]],
    [[a, d], [b, c]],
  ];

  return all.filter(([teamA, teamB]) => {
    const aIds = new Set(teamA.map((p) => p.id));
    const bIds = new Set(teamB.map((p) => p.id));
    for (const fp of constraints.fixedPairs) {
      const aInA = aIds.has(fp.playerAId);
      const bInA = aIds.has(fp.playerBId);
      const aInB = bIds.has(fp.playerAId);
      const bInB = bIds.has(fp.playerBId);
      // Both members present in match and split across teams → invalid
      if ((aInA && bInB) || (bInA && aInB)) return false;
    }
    return true;
  });
}

/**
 * Balanced score for a pairing: absolute difference of team avg tiers.
 * Lower is better. Tiebreak: combined wait time (higher wins).
 */
function balancedScore(pairing: TeamPair, tierConfig: TierConfig): number {
  const avgA = teamAvgTier(pairing[0][0], pairing[0][1], tierConfig);
  const avgB = teamAvgTier(pairing[1][0], pairing[1][1], tierConfig);
  if (avgA === null || avgB === null) return 999;
  return Math.abs(avgA - avgB);
}

function combinedWait(pairing: TeamPair): number {
  return (
    pairing[0][0].waitTime +
    pairing[0][1].waitTime +
    pairing[1][0].waitTime +
    pairing[1][1].waitTime
  );
}

// ── Variety helpers ───────────────────────────────────────────────────────────

function buildPairingWeights(
  history: MatchHistory[],
  now: number,
): Map<string, PairingWeights> {
  const weights = new Map<string, PairingWeights>();

  const recencyWeight = (matchTime: number): number => {
    const ageMins = (now - matchTime) / 60_000;
    if (ageMins < 5) return 1.0;
    if (ageMins < 15) return 0.75;
    if (ageMins < 45) return 0.5;
    return 0.25;
  };

  const bump = (
    id1: string,
    id2: string,
    w: number,
    field: "partnerWeight" | "opponentWeight",
  ) => {
    const key = pairingKey(id1, id2);
    const cur = weights.get(key) ?? { partnerWeight: 0, opponentWeight: 0 };
    weights.set(key, { ...cur, [field]: cur[field] + w });
  };

  for (const m of history) {
    if (m.undone) continue;
    const w = recencyWeight(m.startTime);
    bump(m.teamA.player1Id, m.teamA.player2Id, w, "partnerWeight");
    bump(m.teamB.player1Id, m.teamB.player2Id, w, "partnerWeight");
    for (const aId of [m.teamA.player1Id, m.teamA.player2Id]) {
      for (const bId of [m.teamB.player1Id, m.teamB.player2Id]) {
        bump(aId, bId, w, "opponentWeight");
      }
    }
  }

  return weights;
}

function varietyScore(
  pairing: TeamPair,
  weights: Map<string, PairingWeights>,
): number {
  const [teamA, teamB] = pairing;
  const get = (id1: string, id2: string, field: keyof PairingWeights) =>
    weights.get(pairingKey(id1, id2))?.[field] ?? 0;

  const partnerA = get(teamA[0].id, teamA[1].id, "partnerWeight");
  const partnerB = get(teamB[0].id, teamB[1].id, "partnerWeight");
  const opponents =
    get(teamA[0].id, teamB[0].id, "opponentWeight") +
    get(teamA[0].id, teamB[1].id, "opponentWeight") +
    get(teamA[1].id, teamB[0].id, "opponentWeight") +
    get(teamA[1].id, teamB[1].id, "opponentWeight");

  return (partnerA + partnerB) * 3 + opponents;
}

// ── Strategy-specific player selection ───────────────────────────────────────

function pickBestPairing(
  pairings: TeamPair[],
  strategy: StrategyId,
  history: MatchHistory[],
  tierConfig: TierConfig,
  now: number,
): TeamPair {
  if (pairings.length === 1) return pairings[0];

  if (strategy === "variety") {
    const weights = buildPairingWeights(history, now);
    return pairings.reduce((best, p) =>
      varietyScore(p, weights) < varietyScore(best, weights) ? p : best,
    );
  }

  // balanced and minimize-wait both use tier-based pairing
  return pairings.reduce((best, p) => {
    const pScore = balancedScore(p, tierConfig);
    const bScore = balancedScore(best, tierConfig);
    if (pScore < bScore) return p;
    if (pScore === bScore && combinedWait(p) > combinedWait(best)) return p;
    return best;
  });
}

/**
 * Select the best 4-player combo from a pool using the given strategy.
 * Returns a flat array of 4 players arranged as [teamA1, teamA2, teamB1, teamB2]
 * in the best pairing found, or just the top 4 if no pairing beats the default.
 */
function selectFour(
  pool: Player[],
  strategy: StrategyId,
  history: MatchHistory[],
  tierConfig: TierConfig,
  constraints: ConstraintSet,
  now: number,
): Player[] {
  if (pool.length <= 4) return pool;

  // Cap the candidate pool to keep enumeration tractable
  const cap = strategy === "variety" ? 8 : 12;
  const candidates = [...pool]
    .sort((a, b) => b.waitTime - a.waitTime)
    .slice(0, cap);

  if (candidates.length < 4) return candidates;

  const combos = combinations(candidates, 4) as [
    Player,
    Player,
    Player,
    Player,
  ][];

  let bestPlayers: Player[] = candidates.slice(0, 4);
  let bestScore = Infinity;
  let bestWait = 0;

  const weights =
    strategy === "variety" ? buildPairingWeights(history, now) : null;

  for (const combo of combos) {
    const pairings = validPairings(combo, constraints);
    if (pairings.length === 0) continue;

    for (const pairing of pairings) {
      let score: number;
      if (strategy === "variety" && weights) {
        score = varietyScore(pairing, weights);
      } else {
        score = balancedScore(pairing, tierConfig);
      }
      const wait = combinedWait(pairing);

      if (score < bestScore || (score === bestScore && wait > bestWait)) {
        bestScore = score;
        bestWait = wait;
        bestPlayers = combo;
      }
    }
  }

  return bestPlayers;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function generateMatch(input: GenerateMatchInput): GenerateMatchResult {
  const {
    waitingPlayers,
    strategy,
    strategyConfig: _strategyConfig,
    constraints,
    tierConfig,
    matchHistory,
    courtCount,
    now = Date.now(),
  } = input;

  const warnings: MatchWarning[] = [];

  // Only "waiting" players are eligible
  const eligible = waitingPlayers.filter((p) => p.status === "waiting");

  if (eligible.length < 4) {
    warnings.push(
      makeWarning(
        "INSUFFICIENT_PLAYERS",
        "error",
        `Need at least 4 waiting players; only ${eligible.length} available`,
      ),
    );
    return { match: null, warnings };
  }

  // Split into skip-critical and normal pools
  const threshold = courtCount + 1;
  const critical = eligible.filter((p) => p.consecutiveSkips >= threshold);
  const normal = eligible.filter((p) => p.consecutiveSkips < threshold);

  let four: Player[];
  let criticalForced = false;

  if (critical.length >= 4) {
    four = [...critical]
      .sort((a, b) => b.waitTime - a.waitTime)
      .slice(0, 4);
    criticalForced = true;
  } else if (critical.length > 0) {
    const needed = 4 - critical.length;
    const fill = [...normal]
      .sort((a, b) => b.waitTime - a.waitTime)
      .slice(0, needed);
    four = [...critical, ...fill];
    criticalForced = true;

    if (four.length < 4 && eligible.length >= 4) {
      four = [...eligible].sort((a, b) => b.waitTime - a.waitTime).slice(0, 4);
    }
  } else {
    if (strategy === "minimize-wait") {
      four = [...eligible].sort((a, b) => b.waitTime - a.waitTime).slice(0, 4);
    } else {
      four = selectFour(eligible, strategy, matchHistory, tierConfig, constraints, now);
    }
  }

  if (criticalForced) {
    warnings.push(
      makeWarning(
        "CRITICAL_PLAYER_FORCED",
        "info",
        `${critical.length} skip-priority player(s) were forced into this match`,
      ),
    );
  }

  if (four.length < 4) {
    warnings.push(
      makeWarning(
        "INSUFFICIENT_PLAYERS",
        "error",
        "Could not assemble 4 players after applying constraints",
      ),
    );
    return { match: null, warnings };
  }

  const players4 = four as [Player, Player, Player, Player];
  let pairings = validPairings(players4, constraints);

  if (pairings.length === 0) {
    warnings.push(
      makeWarning(
        "FIXED_PAIR_BROKEN",
        "error",
        "Fixed pair constraint could not be honored; it has been relaxed for this match",
      ),
    );
    pairings = [
      [
        [players4[0], players4[1]],
        [players4[2], players4[3]],
      ],
    ];
  }

  const pairing = pickBestPairing(
    pairings,
    strategy,
    matchHistory,
    tierConfig,
    now,
  );
  const [teamAPlayers, teamBPlayers] = pairing;

  const avgA = teamAvgTier(teamAPlayers[0], teamAPlayers[1], tierConfig);
  const avgB = teamAvgTier(teamBPlayers[0], teamBPlayers[1], tierConfig);

  // Emit tier-gap warning
  if (avgA !== null && avgB !== null && Math.abs(avgA - avgB) >= 2) {
    warnings.push(
      makeWarning(
        "LARGE_TIER_GAP",
        "warn",
        `Team tier gap is ${Math.abs(avgA - avgB).toFixed(1)} — this match may be unbalanced`,
      ),
    );
  }

  // Emit unrated-heavy warning
  const unratedCount = players4.filter((p) => p.tier === null).length;
  if (unratedCount >= 3) {
    warnings.push(
      makeWarning(
        "UNRATED_HEAVY",
        "info",
        `${unratedCount} of 4 players are unrated — tier balance cannot be fully assessed`,
      ),
    );
  }

  return {
    match: {
      teamA: {
        player1Id: teamAPlayers[0].id,
        player2Id: teamAPlayers[1].id,
        avgTier: avgA,
      },
      teamB: {
        player1Id: teamBPlayers[0].id,
        player2Id: teamBPlayers[1].id,
        avgTier: avgB,
      },
    },
    warnings,
  };
}

// ── Utilities re-exported for session page convenience ────────────────────────

export { effectiveOrdinal };
