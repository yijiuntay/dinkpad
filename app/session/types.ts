export interface Player {
  id: string;
  name: string;
  rating: number;
}

export interface Game {
  id: string;
  courtNumber: number;
  players: Player[];
  startTime: number;
}

export interface PastGame {
  id: string;
  players: Player[];
  timestamp: number;
}
