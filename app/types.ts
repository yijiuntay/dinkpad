export type PlayerStatus =
  | "roster"
  | "waiting"
  | "playing"
  | "stepped-away"
  | "removed";

export type StrategyId = "balanced" | "minimize-wait" | "variety";

export type CourtMode = "normal" | "winner-stays";

export type WarningCode =
  | "LARGE_TIER_GAP"
  | "UNRATED_HEAVY"
  | "FIXED_PAIR_BROKEN"
  | "DO_NOT_PAIR_FORCED"
  | "CRITICAL_PLAYER_FORCED"
  | "INSUFFICIENT_PLAYERS"
  | "STRATEGY_FALLBACK";

export interface TierConfig {
  tiers: string[]; // ordered lowest → highest, e.g. ["D", "C", "B", "A"]
  tierCount: 3 | 4 | 5;
  labels?: Record<string, string>;
}

export interface TierChange {
  tier: string | null;
  changedAt: number;
  reason: "manual" | "suggested";
}

export interface Player {
  id: string;
  name: string;
  tier: string | null;
  status: PlayerStatus;
  waitTime: number; // seconds; ticks only in "waiting" state
  steppedAwayAt?: number;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  lastPlayedAt?: number;
  consecutiveSkips: number;
  checkedInAt?: number;
  tierHistory: TierChange[];
}

export interface MatchWarning {
  code: WarningCode;
  severity: "info" | "warn" | "error";
  message: string;
  relaxedConstraint?: string;
}

export interface MatchResult {
  winningTeam: "A" | "B";
  scoreA?: number;
  scoreB?: number;
  recordedAt: number;
}

export interface MatchTeam {
  player1Id: string;
  player2Id: string;
  avgTier: number | null; // null if either player is unrated
}

interface MatchBase {
  id: string;
  court: string; // courtId
  teamA: MatchTeam;
  teamB: MatchTeam;
  startTime: number;
  strategy: StrategyId;
  warnings: MatchWarning[];
}

export interface Match extends MatchBase {
  isUndoable: boolean;
}

export interface MatchHistory extends MatchBase {
  endTime: number;
  duration: number;
  result?: MatchResult;
  undone: boolean;
}

export interface UndoablePlayerState {
  playerId: string;
  waitTime: number;
  consecutiveSkips: number;
  status: PlayerStatus;
}

export interface UndoableMatch {
  matchId: string;
  expiresAt: number; // timestamp when 30s undo window closes
  prevPlayerStates: UndoablePlayerState[]; // the 4 playing players' pre-match state
  prevOtherSkips: { playerId: string; consecutiveSkips: number }[]; // rollback skips for waiting players
}

export interface FixedPair {
  id: string;
  playerAId: string;
  playerBId: string;
  createdAt: number;
}

export interface DoNotPairRule {
  id: string;
  playerAId: string;
  playerBId: string;
  mutual: boolean;
  createdAt: number;
}

export interface ConstraintSet {
  fixedPairs: FixedPair[];
  doNotPair: DoNotPairRule[];
}

export interface StrategyConfig {
  primary: StrategyId;
  tiebreaker?: StrategyId;
  varietyDecay?: "mild" | "moderate" | "strong";
  winnerStaysCap?: 1 | 2 | 3;
}

export interface Court {
  id: string;
  name: string;
  isActive: boolean;
  mode: CourtMode;
  winnerStaysCap?: number;
  consecutiveWins?: number;
}

export interface SessionState {
  players: Player[];
  courts: Court[];
  matchHistory: MatchHistory[];
  activeMatches: Match[];
  undoableMatches: UndoableMatch[];
  tierConfig: TierConfig;
  currentStrategy: StrategyId;
  strategyConfig: StrategyConfig;
  constraints: ConstraintSet;
  sessionStartTime: number;
  sessionId: string;
  nextPlayerId: number;
  nextMatchId: number;
}
