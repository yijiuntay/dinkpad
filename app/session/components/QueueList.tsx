'use client';

import { Player } from '../types';

interface QueueListProps {
  queue: Player[];
  onRemovePlayer: (playerId: string) => void;
  onUpdateRating: (playerId: string, newRating: number) => void;
}

export function QueueList({ queue, onRemovePlayer, onUpdateRating }: QueueListProps) {
  return (
    <div className="glass-panel rounded-2xl overflow-hidden min-h-[500px] flex flex-col">
      {queue.length === 0 ? (
        <div className="p-8 text-center text-slate-500 flex-1 flex items-center justify-center">
          Queue is empty
        </div>
      ) : (
        <div className="divide-y divide-white/5 overflow-y-auto max-h-[600px] custom-scrollbar">
          {queue.map((player, i) => (
            <div key={player.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-slate-800/80 flex items-center justify-center text-xs text-slate-500 font-mono group-hover:text-primary group-hover:bg-primary/10 transition-colors">
                  {i + 1}
                </div>
                <div>
                  <div className="font-medium text-slate-200">{player.name}</div>
                </div>
              </div>
              
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onUpdateRating(player.id, player.rating - 0.1)}
                  className="p-2 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                  title="Decrease rating"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>
                
                <div className="w-12 text-center font-mono text-sm font-medium text-slate-300">
                  {player.rating.toFixed(1)}
                </div>

                <button
                  onClick={() => onUpdateRating(player.id, player.rating + 0.1)}
                  className="p-2 text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors"
                  title="Increase rating"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                </button>

                <div className="w-px h-8 bg-white/10 mx-2" />

                <button
                  onClick={() => onRemovePlayer(player.id)}
                  className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  title="Remove from queue"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
