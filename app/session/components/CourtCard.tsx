'use client';

import { Game } from '../types';
import { GameTimer } from './GameTimer';

interface CourtCardProps {
  courtNum: number;
  game?: Game;
  queueLength: number;
  onFinishGame: (gameId: string) => void;
  onStartGame: (courtNum: number) => void;
}

export function CourtCard({ courtNum, game, queueLength, onFinishGame, onStartGame }: CourtCardProps) {
  return (
    <div 
      className={`relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        game 
          ? "glass-panel border-primary/20 shadow-lg shadow-primary/5" 
          : "bg-slate-900/20 border-slate-800/50 border-dashed"
      }`}
    >
      <div className="p-5">
        <div className="flex justify-between items-start mb-4">
          <div className="px-3 py-1 rounded-full bg-slate-800/50 border border-white/5 text-xs font-medium text-slate-400">
            Court {courtNum}
          </div>
          {game && <GameTimer startTime={game.startTime} />}
        </div>

        {game ? (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {game.players.map((player) => (
                <div key={player.id} className="bg-slate-800/40 border border-white/5 p-2 rounded-lg text-center backdrop-blur-sm">
                  <div className="font-medium truncate text-slate-200">{player.name}</div>
                  {player.rating > 0 && (
                    <div className="text-xs text-slate-500">{player.rating.toFixed(1)}</div>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => onFinishGame(game.id)}
              className="w-full py-2 bg-primary/10 hover:bg-primary/20 text-primary hover:text-primary-foreground border border-primary/20 hover:border-primary/50 rounded-lg transition-all font-medium text-sm hover:shadow-[0_0_15px_rgba(190,242,100,0.1)]"
            >
              Finish Game
            </button>
          </>
        ) : (
          <div className="h-32 flex flex-col items-center justify-center text-slate-500">
            <span className="text-sm mb-3">Court Available</span>
            <button
              onClick={() => onStartGame(courtNum)}
              disabled={queueLength < 4}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                queueLength >= 4
                  ? "bg-primary text-primary-foreground hover:bg-lime-400 shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              {queueLength >= 4 ? "Start Next Game" : "Not enough players"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
