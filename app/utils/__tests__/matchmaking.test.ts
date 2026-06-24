import { describe, it, expect } from "vitest";
import {
  generateMatch,
  recordMatch,
  applyLadderResult,
  medianLadderRank,
} from "../matchmaking";
import { Player, Match, Team, MatchHistory } from "../../types";

function makePlayer(overrides: Partial<Player> & { id: string }): Player {
  return {
    name: overrides.id,
    skill: 0,
    ladderRank: 0,
    status: "waiting",
    waitTime: 0,
    gamesPlayed: 0,
    consecutiveSkips: 0,
    ...overrides,
  };
}

function makeTeam(p1: Player, p2: Player): Team {
  return { partner1: p1, partner2: p2, avgSkill: (p1.skill + p2.skill) / 2 };
}

function makeMatch(
  teamAPlayers: [Player, Player],
  teamBPlayers: [Player, Player],
  winner?: "A" | "B",
): Match {
  return {
    id: "m1",
    court: 1,
    teamA: makeTeam(teamAPlayers[0], teamAPlayers[1]),
    teamB: makeTeam(teamBPlayers[0], teamBPlayers[1]),
    startTime: 1000,
    strategy: "ladder",
    winner,
  };
}

// Collect the 4 player ids from a generated match
function matchIds(match: Match): string[] {
  return [
    match.teamA.partner1.id,
    match.teamA.partner2.id,
    match.teamB.partner1.id,
    match.teamB.partner2.id,
  ];
}

function sameTeam(match: Match, a: string, b: string): boolean {
  const teamA = [match.teamA.partner1.id, match.teamA.partner2.id];
  const teamB = [match.teamB.partner1.id, match.teamB.partner2.id];
  return (
    (teamA.includes(a) && teamA.includes(b)) ||
    (teamB.includes(a) && teamB.includes(b))
  );
}

describe("applyLadderResult", () => {
  it("gives winners +1, losers -1, leaves others unchanged", () => {
    const p1 = makePlayer({ id: "p1", ladderRank: 0 });
    const p2 = makePlayer({ id: "p2", ladderRank: 0 });
    const p3 = makePlayer({ id: "p3", ladderRank: 0 });
    const p4 = makePlayer({ id: "p4", ladderRank: 0 });
    const bystander = makePlayer({ id: "p5", ladderRank: 3 });
    const match = makeMatch([p1, p2], [p3, p4]);

    const result = applyLadderResult([p1, p2, p3, p4, bystander], match, "A");
    const byId = Object.fromEntries(result.map((p) => [p.id, p.ladderRank]));

    expect(byId.p1).toBe(1);
    expect(byId.p2).toBe(1);
    expect(byId.p3).toBe(-1);
    expect(byId.p4).toBe(-1);
    expect(byId.p5).toBe(3); // untouched
  });
});

describe("medianLadderRank", () => {
  it("returns the middle value for odd counts", () => {
    const players = [0, 2, 5].map((r, i) =>
      makePlayer({ id: `p${i}`, ladderRank: r }),
    );
    expect(medianLadderRank(players)).toBe(2);
  });

  it("returns the rounded average of the two middle values for even counts", () => {
    const players = [0, 2, 3, 5].map((r, i) =>
      makePlayer({ id: `p${i}`, ladderRank: r }),
    );
    expect(medianLadderRank(players)).toBe(3); // round((2+3)/2) = 3
  });

  it("returns 0 for an empty list", () => {
    expect(medianLadderRank([])).toBe(0);
  });
});

describe("recordMatch (ladder result)", () => {
  it("stamps winners/losers from match.winner", () => {
    const p1 = makePlayer({ id: "p1" });
    const p2 = makePlayer({ id: "p2" });
    const p3 = makePlayer({ id: "p3" });
    const p4 = makePlayer({ id: "p4" });
    const history = recordMatch(makeMatch([p1, p2], [p3, p4], "B"));

    expect(history.winners).toEqual(["p3", "p4"]);
    expect(history.losers).toEqual(["p1", "p2"]);
  });

  it("leaves winners/losers undefined when no winner is set", () => {
    const p1 = makePlayer({ id: "p1" });
    const p2 = makePlayer({ id: "p2" });
    const p3 = makePlayer({ id: "p3" });
    const p4 = makePlayer({ id: "p4" });
    const history = recordMatch(makeMatch([p1, p2], [p3, p4]));

    expect(history.winners).toBeUndefined();
    expect(history.losers).toBeUndefined();
  });
});

describe("ladder matchmaking via generateMatch", () => {
  const noHistory: MatchHistory[] = [];

  it("returns null when fewer than 4 players are waiting", () => {
    const players = [0, 1, 2].map((i) => makePlayer({ id: `p${i}` }));
    const match = generateMatch(1, players, "ladder", noHistory, "m", 1, []);
    expect(match).toBeNull();
  });

  it("no-wait: with exactly 4 waiting, returns all 4", () => {
    const players = [0, 1, 2, 3].map((i) =>
      makePlayer({ id: `p${i}`, ladderRank: i }),
    );
    const match = generateMatch(1, players, "ladder", noHistory, "m", 1, []);
    expect(match).not.toBeNull();
    expect(matchIds(match!).sort()).toEqual(["p0", "p1", "p2", "p3"]);
  });

  it("has-wait: picks the top players by ladderRank", () => {
    // ranks 0..7; top 4 by rank are ranks 4,5,6,7
    const players = [0, 1, 2, 3, 4, 5, 6, 7].map((r) =>
      makePlayer({ id: `r${r}`, ladderRank: r }),
    );
    const match = generateMatch(1, players, "ladder", noHistory, "m", 2, []);
    expect(matchIds(match!).sort()).toEqual(["r4", "r5", "r6", "r7"]);
  });

  it("breaks rank ties by longer wait time", () => {
    // top 2 by rank = rank 3; then among rank 2, the two longest waiters
    const players = [
      makePlayer({ id: "a", ladderRank: 3, waitTime: 1 }),
      makePlayer({ id: "b", ladderRank: 3, waitTime: 1 }),
      makePlayer({ id: "shortwait", ladderRank: 2, waitTime: 5 }),
      makePlayer({ id: "midwait", ladderRank: 2, waitTime: 10 }),
      makePlayer({ id: "longwait", ladderRank: 2, waitTime: 20 }),
    ];
    const match = generateMatch(1, players, "ladder", noHistory, "m", 1, []);
    const ids = matchIds(match!);
    expect(ids).toContain("longwait");
    expect(ids).toContain("midwait");
    expect(ids).not.toContain("shortwait");
  });

  it("splits prior partners by default", () => {
    // 4 equal-rank players; p1 & p2 partnered before -> must end up on opposite teams
    const players = ["p1", "p2", "p3", "p4"].map((id) =>
      makePlayer({ id, ladderRank: 0 }),
    );
    const history: MatchHistory[] = [
      {
        matchId: "old",
        players: ["p1", "p2", "p3", "p4"],
        pairings: [
          {
            player1Id: "p1",
            player2Id: "p2",
            asPartners: 1,
            asOpponents: 0,
            lastMatchedAt: 1,
          },
        ],
        timestamp: 1,
      },
    ];
    const match = generateMatch(1, players, "ladder", history, "m", 1, []);
    expect(sameTeam(match!, "p1", "p2")).toBe(false);
  });

  it("honors a locked pair, keeping them together even across ranks", () => {
    const players = [
      makePlayer({ id: "hi", ladderRank: 10 }),
      makePlayer({ id: "lo", ladderRank: -10 }),
      makePlayer({ id: "mid1", ladderRank: 0 }),
      makePlayer({ id: "mid2", ladderRank: 0 }),
    ];
    const match = generateMatch(1, players, "ladder", noHistory, "m", 1, [
      ["hi", "lo"],
    ]);
    expect(sameTeam(match!, "hi", "lo")).toBe(true);
  });

  it("still forces in players past the skip threshold", () => {
    // courtCount 1 -> skipThreshold 2. "stuck" has lowest rank but is critical.
    const players = [
      makePlayer({ id: "stuck", ladderRank: -100, consecutiveSkips: 3 }),
      makePlayer({ id: "a", ladderRank: 5 }),
      makePlayer({ id: "b", ladderRank: 4 }),
      makePlayer({ id: "c", ladderRank: 3 }),
      makePlayer({ id: "d", ladderRank: 2 }),
    ];
    const match = generateMatch(1, players, "ladder", noHistory, "m", 1, []);
    expect(matchIds(match!)).toContain("stuck");
  });
});
