import {
  Player,
  Match,
  Team,
  MatchmakingStrategy,
  MatchHistory,
  PairingRecord,
} from "../types";

// Helper to calculate team average skill
function calculateTeamSkill(p1: Player, p2: Player): number {
  return (p1.skill + p2.skill) / 2;
}

// Helper to separate players by priority based on skip count
function separateByPriority(
  players: Player[],
  skipThreshold: number,
): { critical: Player[]; normal: Player[] } {
  const critical: Player[] = [];
  const normal: Player[] = [];

  for (const player of players) {
    if (player.consecutiveSkips >= skipThreshold) {
      critical.push(player);
    } else {
      normal.push(player);
    }
  }

  return { critical, normal };
}

// Helper to get pairing count from history
function getPairingCount(
  history: MatchHistory[],
  p1Id: string,
  p2Id: string,
  type: "partners" | "opponents",
): number {
  let count = 0;
  for (const record of history) {
    for (const pairing of record.pairings) {
      if (
        (pairing.player1Id === p1Id && pairing.player2Id === p2Id) ||
        (pairing.player1Id === p2Id && pairing.player2Id === p1Id)
      ) {
        count += type === "partners" ? pairing.asPartners : pairing.asOpponents;
      }
    }
  }
  return count;
}

// Strategy 1: Balanced Skill Gap
function matchBalanced(
  availablePlayers: Player[],
  history: MatchHistory[],
): Player[] | null {
  if (availablePlayers.length < 4) return null;

  // Sort by skill descending
  const sorted = [...availablePlayers].sort((a, b) => b.skill - a.skill);

  let bestMatch: Player[] | null = null;
  let smallestGap = Infinity;

  // Try different combinations
  for (let i = 0; i < Math.min(sorted.length, 8); i++) {
    for (let j = i + 1; j < Math.min(sorted.length, 9); j++) {
      for (let k = 0; k < sorted.length; k++) {
        if (k === i || k === j) continue;
        for (let l = k + 1; l < sorted.length; l++) {
          if (l === i || l === j) continue;

          const p1 = sorted[i];
          const p2 = sorted[j];
          const p3 = sorted[k];
          const p4 = sorted[l];

          // Try pairing 1: (p1,p4) vs (p2,p3) - high+low vs high+low
          const team1A = calculateTeamSkill(p1, p4);
          const team1B = calculateTeamSkill(p2, p3);
          const gap1 = Math.abs(team1A - team1B);

          // Try pairing 2: (p1,p3) vs (p2,p4)
          const team2A = calculateTeamSkill(p1, p3);
          const team2B = calculateTeamSkill(p2, p4);
          const gap2 = Math.abs(team2A - team2B);

          const minGap = Math.min(gap1, gap2);

          if (minGap < smallestGap) {
            smallestGap = minGap;
            if (gap1 < gap2) {
              bestMatch = [p1, p4, p2, p3]; // team1A vs team1B
            } else {
              bestMatch = [p1, p3, p2, p4]; // team2A vs team2B
            }
          }
        }
      }
    }
  }

  return bestMatch;
}

// Strategy 2: Minimize Wait Time
function matchWaitTime(
  availablePlayers: Player[],
  history: MatchHistory[],
): Player[] | null {
  if (availablePlayers.length < 4) return null;

  // Sort by wait time descending (longest wait first)
  const sorted = [...availablePlayers].sort((a, b) => b.waitTime - a.waitTime);

  // Take top 4 players with longest wait time
  const selected = sorted.slice(0, 4);

  // Sort selected by skill to create balanced teams
  selected.sort((a, b) => b.skill - a.skill);

  // Pair high+low vs high+low
  return [selected[0], selected[3], selected[1], selected[2]];
}

// Strategy 3: Maximize Variety (Minimize Repeat Pairings)
function matchVariety(
  availablePlayers: Player[],
  history: MatchHistory[],
): Player[] | null {
  if (availablePlayers.length < 4) return null;

  let bestMatch: Player[] | null = null;
  let lowestRepeatScore = Infinity;

  // Sort by wait time to prioritize those waiting longer
  const sorted = [...availablePlayers].sort((a, b) => b.waitTime - a.waitTime);

  // Try combinations focusing on those who've waited longer
  for (let i = 0; i < Math.min(sorted.length, 6); i++) {
    for (let j = i + 1; j < Math.min(sorted.length, 7); j++) {
      for (let k = 0; k < sorted.length; k++) {
        if (k === i || k === j) continue;
        for (let l = k + 1; l < sorted.length; l++) {
          if (l === i || l === j) continue;

          const p1 = sorted[i];
          const p2 = sorted[j];
          const p3 = sorted[k];
          const p4 = sorted[l];

          // Calculate repeat scores for different pairings
          // Pairing 1: (p1,p2) vs (p3,p4)
          const p1p2Partners = getPairingCount(
            history,
            p1.id,
            p2.id,
            "partners",
          );
          const p3p4Partners = getPairingCount(
            history,
            p3.id,
            p4.id,
            "partners",
          );
          const p1p3Opponents = getPairingCount(
            history,
            p1.id,
            p3.id,
            "opponents",
          );
          const p1p4Opponents = getPairingCount(
            history,
            p1.id,
            p4.id,
            "opponents",
          );
          const p2p3Opponents = getPairingCount(
            history,
            p2.id,
            p3.id,
            "opponents",
          );
          const p2p4Opponents = getPairingCount(
            history,
            p2.id,
            p4.id,
            "opponents",
          );

          const score1 =
            p1p2Partners * 3 +
            p3p4Partners * 3 +
            p1p3Opponents +
            p1p4Opponents +
            p2p3Opponents +
            p2p4Opponents;

          // Pairing 2: (p1,p3) vs (p2,p4)
          const p1p3Partners = getPairingCount(
            history,
            p1.id,
            p3.id,
            "partners",
          );
          const p2p4Partners = getPairingCount(
            history,
            p2.id,
            p4.id,
            "partners",
          );
          const p1p2Opponents = getPairingCount(
            history,
            p1.id,
            p2.id,
            "opponents",
          );
          const p3p4Opponents = getPairingCount(
            history,
            p3.id,
            p4.id,
            "opponents",
          );

          const score2 =
            p1p3Partners * 3 +
            p2p4Partners * 3 +
            p1p2Opponents +
            p1p4Opponents +
            p2p3Opponents +
            p3p4Opponents;

          // Pairing 3: (p1,p4) vs (p2,p3)
          const p1p4Partners = getPairingCount(
            history,
            p1.id,
            p4.id,
            "partners",
          );
          const p2p3Partners = getPairingCount(
            history,
            p2.id,
            p3.id,
            "partners",
          );

          const score3 =
            p1p4Partners * 3 +
            p2p3Partners * 3 +
            p1p2Opponents +
            p1p3Opponents +
            p2p4Opponents +
            p3p4Opponents;

          const minScore = Math.min(score1, score2, score3);

          if (minScore < lowestRepeatScore) {
            lowestRepeatScore = minScore;
            if (minScore === score1) {
              bestMatch = [p1, p2, p3, p4];
            } else if (minScore === score2) {
              bestMatch = [p1, p3, p2, p4];
            } else {
              bestMatch = [p1, p4, p2, p3];
            }
          }
        }
      }
    }
  }

  return bestMatch;
}

// Helper to form ladder teams from a chosen group of 4.
// A locked pair (placed first by the caller) is kept together; otherwise we pick
// the pairing that splits prior partners (minimizes recent repeat partnerships).
function formLadderTeams(
  four: Player[],
  history: MatchHistory[],
  hasLockedPair: boolean,
): Player[] {
  const [a, b, c, d] = four;

  if (hasLockedPair) {
    // a,b are the locked pair; keep them together
    return [a, b, c, d];
  }

  const pairings: [Player, Player, Player, Player][] = [
    [a, b, c, d],
    [a, c, b, d],
    [a, d, b, c],
  ];

  let best = pairings[0];
  let bestScore = Infinity;
  for (const [p1, p2, p3, p4] of pairings) {
    const score =
      getPairingCount(history, p1.id, p2.id, "partners") +
      getPairingCount(history, p3.id, p4.id, "partners");
    if (score < bestScore) {
      bestScore = score;
      best = [p1, p2, p3, p4];
    }
  }
  return best;
}

// Strategy 4: Ladder (results-driven; no skill input)
// Groups players of adjacent ladderRank, honoring "keep together" locked pairs,
// and splits prior partners by default.
function matchLadder(
  availablePlayers: Player[],
  history: MatchHistory[],
  lockedPairs: [string, string][],
): Player[] | null {
  if (availablePlayers.length < 4) return null;

  const byId = new Map(availablePlayers.map((p) => [p.id, p]));

  // Sort by ladderRank desc, tiebreak by longer wait time
  const rankSort = (a: Player, b: Player) =>
    b.ladderRank - a.ladderRank || b.waitTime - a.waitTime;

  // 1. Honor the first locked pair that is fully available
  let lockedPair: [Player, Player] | null = null;
  for (const [id1, id2] of lockedPairs) {
    const p1 = byId.get(id1);
    const p2 = byId.get(id2);
    if (p1 && p2) {
      lockedPair = [p1, p2];
      break;
    }
  }

  let chosen: Player[];
  if (lockedPair) {
    // Seed the match around the locked pair's rank with the 2 nearest-rank others
    const [lp1, lp2] = lockedPair;
    const anchor = (lp1.ladderRank + lp2.ladderRank) / 2;
    const others = availablePlayers
      .filter((p) => p.id !== lp1.id && p.id !== lp2.id)
      .sort(
        (a, b) =>
          Math.abs(a.ladderRank - anchor) - Math.abs(b.ladderRank - anchor) ||
          b.waitTime - a.waitTime,
      );
    chosen = [lp1, lp2, others[0], others[1]];
  } else {
    chosen = [...availablePlayers].sort(rankSort).slice(0, 4);
  }

  return formLadderTeams(chosen, history, lockedPair !== null);
}

// Main matchmaking function
export function generateMatch(
  courtNumber: number,
  players: Player[],
  strategy: MatchmakingStrategy,
  history: MatchHistory[],
  matchId: string,
  courtCount: number,
  lockedPairs: [string, string][] = [],
): Match | null {
  // Get available players (waiting or paused with low wait time)
  const availablePlayers = players.filter((p) => p.status === "waiting");

  if (availablePlayers.length < 4) return null;

  // Calculate skip threshold (courtCount + 1)
  const skipThreshold = courtCount + 1;

  // Separate players by priority
  const { critical, normal } = separateByPriority(
    availablePlayers,
    skipThreshold,
  );

  let selectedPlayers: Player[] | null = null;

  // Ordering for balanced teams: by ladderRank in ladder mode, otherwise by skill
  const teamSort = (a: Player, b: Player) =>
    strategy === "ladder" ? b.ladderRank - a.ladderRank : b.skill - a.skill;

  // Priority 1: If we have 4+ critical players, take top 4 by wait time
  if (critical.length >= 4) {
    const sortedCritical = [...critical].sort(
      (a, b) => b.waitTime - a.waitTime,
    );
    const selected = sortedCritical.slice(0, 4);
    // Order to create balanced teams (high+low vs mid)
    selected.sort(teamSort);
    selectedPlayers = [selected[0], selected[3], selected[1], selected[2]];
  }
  // Priority 2: If we have 1-3 critical players, include them + fill from normal pool
  else if (critical.length > 0 && critical.length < 4) {
    // Sort critical by wait time
    const sortedCritical = [...critical].sort(
      (a, b) => b.waitTime - a.waitTime,
    );

    // Apply strategy to normal pool to get remaining slots
    const neededCount = 4 - critical.length;
    let remainingPlayers: Player[] | null = null;

    switch (strategy) {
      case "balanced":
        remainingPlayers = matchBalanced(normal, history);
        break;
      case "wait-time":
        remainingPlayers = matchWaitTime(normal, history);
        break;
      case "variety":
        remainingPlayers = matchVariety(normal, history);
        break;
      case "ladder":
        remainingPlayers = matchLadder(normal, history, lockedPairs);
        break;
    }

    if (remainingPlayers && remainingPlayers.length >= neededCount) {
      // Combine critical + needed normal players
      const combined = [
        ...sortedCritical,
        ...remainingPlayers.slice(0, neededCount),
      ];
      // Order to create balanced teams
      combined.sort(teamSort);
      selectedPlayers = [combined[0], combined[3], combined[1], combined[2]];
    } else {
      // Fallback: sort all available by wait time if strategy fails
      const allSorted = [...sortedCritical, ...normal].sort(
        (a, b) => b.waitTime - a.waitTime,
      );
      if (allSorted.length >= 4) {
        const selected = allSorted.slice(0, 4);
        selected.sort(teamSort);
        selectedPlayers = [selected[0], selected[3], selected[1], selected[2]];
      }
    }
  }
  // Priority 3: No critical players, use normal strategy
  else {
    switch (strategy) {
      case "balanced":
        selectedPlayers = matchBalanced(availablePlayers, history);
        break;
      case "wait-time":
        selectedPlayers = matchWaitTime(availablePlayers, history);
        break;
      case "variety":
        selectedPlayers = matchVariety(availablePlayers, history);
        break;
      case "ladder":
        selectedPlayers = matchLadder(availablePlayers, history, lockedPairs);
        break;
    }
  }

  if (!selectedPlayers) return null;

  // Create teams - selectedPlayers format: [team1p1, team1p2, team2p1, team2p2]
  const teamA: Team = {
    partner1: selectedPlayers[0],
    partner2: selectedPlayers[1],
    avgSkill: calculateTeamSkill(selectedPlayers[0], selectedPlayers[1]),
  };

  const teamB: Team = {
    partner1: selectedPlayers[2],
    partner2: selectedPlayers[3],
    avgSkill: calculateTeamSkill(selectedPlayers[2], selectedPlayers[3]),
  };

  return {
    id: matchId,
    court: courtNumber,
    teamA,
    teamB,
    startTime: Date.now(),
    strategy,
  };
}

// Record match in history
export function recordMatch(match: Match): MatchHistory {
  const playerIds = [
    match.teamA.partner1.id,
    match.teamA.partner2.id,
    match.teamB.partner1.id,
    match.teamB.partner2.id,
  ];

  const pairings: PairingRecord[] = [
    // Team A partners
    {
      player1Id: match.teamA.partner1.id,
      player2Id: match.teamA.partner2.id,
      asPartners: 1,
      asOpponents: 0,
      lastMatchedAt: match.startTime,
    },
    // Team B partners
    {
      player1Id: match.teamB.partner1.id,
      player2Id: match.teamB.partner2.id,
      asPartners: 1,
      asOpponents: 0,
      lastMatchedAt: match.startTime,
    },
    // Opponents
    {
      player1Id: match.teamA.partner1.id,
      player2Id: match.teamB.partner1.id,
      asPartners: 0,
      asOpponents: 1,
      lastMatchedAt: match.startTime,
    },
    {
      player1Id: match.teamA.partner1.id,
      player2Id: match.teamB.partner2.id,
      asPartners: 0,
      asOpponents: 1,
      lastMatchedAt: match.startTime,
    },
    {
      player1Id: match.teamA.partner2.id,
      player2Id: match.teamB.partner1.id,
      asPartners: 0,
      asOpponents: 1,
      lastMatchedAt: match.startTime,
    },
    {
      player1Id: match.teamA.partner2.id,
      player2Id: match.teamB.partner2.id,
      asPartners: 0,
      asOpponents: 1,
      lastMatchedAt: match.startTime,
    },
  ];

  let winners: string[] | undefined;
  let losers: string[] | undefined;
  if (match.winner) {
    const teamAIds = [match.teamA.partner1.id, match.teamA.partner2.id];
    const teamBIds = [match.teamB.partner1.id, match.teamB.partner2.id];
    winners = match.winner === "A" ? teamAIds : teamBIds;
    losers = match.winner === "A" ? teamBIds : teamAIds;
  }

  return {
    matchId: match.id,
    players: playerIds,
    pairings,
    timestamp: match.startTime,
    winners,
    losers,
  };
}

// Apply a ladder result: winners +1 rank, losers -1 rank, others unchanged.
export function applyLadderResult(
  players: Player[],
  match: Match,
  winner: "A" | "B",
): Player[] {
  const teamAIds = [match.teamA.partner1.id, match.teamA.partner2.id];
  const teamBIds = [match.teamB.partner1.id, match.teamB.partner2.id];
  const winnerIds = winner === "A" ? teamAIds : teamBIds;
  const loserIds = winner === "A" ? teamBIds : teamAIds;

  return players.map((p) => {
    if (winnerIds.includes(p.id)) {
      return { ...p, ladderRank: p.ladderRank + 1 };
    }
    if (loserIds.includes(p.id)) {
      return { ...p, ladderRank: p.ladderRank - 1 };
    }
    return p;
  });
}

// Median ladderRank of a set of players (for fairly seeding mid-session joiners).
export function medianLadderRank(players: Player[]): number {
  if (players.length === 0) return 0;
  const sorted = players.map((p) => p.ladderRank).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
