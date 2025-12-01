export type PlayerStatus = 'playing' | 'waiting';

export interface Player {
  id: string;
  name: string;
  skill: number;
  status: PlayerStatus;
  waitTime: number;
}
