export type PlayerStatus = "playing" | "waiting" | "paused";

export type MatchmakingStrategy = "balanced" | "wait-time" | "variety" | "ladder";

export type SessionMode = "standard" | "ladder";

export interface Player {
  id: string;
  name: string;
  skill: number;
  ladderRank: number; // ladder points; win +1, loss -1. Unused in standard mode.
  status: PlayerStatus;
  waitTime: number; // in seconds
  gamesPlayed: number;
  lastPlayedAt?: number; // timestamp
  consecutiveSkips: number; // count of match starts without being selected
}

export interface Team {
  partner1: Player;
  partner2: Player;
  avgSkill: number;
}

export interface Match {
  id: string;
  court: number;
  teamA: Team;
  teamB: Team;
  startTime: number;
  strategy: MatchmakingStrategy;
  winner?: "A" | "B"; // set on End Game in ladder mode
}

export interface PairingRecord {
  player1Id: string;
  player2Id: string;
  asPartners: number; // count
  asOpponents: number; // count
  lastMatchedAt: number; // timestamp
}

export interface MatchHistory {
  matchId: string;
  players: string[]; // player IDs
  pairings: PairingRecord[];
  timestamp: number;
  winners?: string[]; // player IDs of winning team (ladder mode)
  losers?: string[]; // player IDs of losing team (ladder mode)
}

export interface Court {
  number: number;
  currentMatch: Match | null;
  isActive: boolean;
}

export interface SessionState {
  players: Player[];
  courts: Court[];
  matchHistory: MatchHistory[];
  currentStrategy: MatchmakingStrategy;
  mode: SessionMode;
  lockedPairs: [string, string][]; // pairs the host marked "keep together" awaiting their next match
  sessionStartTime: number;
  courtCount: number;
  nextPlayerId: number;
  nextMatchId: number;
}
