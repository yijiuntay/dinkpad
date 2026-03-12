export type PlayerStatus = "playing" | "waiting" | "paused";

export type MatchmakingStrategy = "balanced" | "wait-time" | "variety";

export interface Player {
  id: string;
  name: string;
  skill: number;
  status: PlayerStatus;
  waitTime: number; // in seconds
  gamesPlayed: number;
  lastPlayedAt?: number; // timestamp
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
  sessionStartTime: number;
  courtCount: number;
  nextPlayerId: number;
  nextMatchId: number;
}
