'use client';

import { Player } from '../types';

interface QueueListProps {
  queue: Player[];
  onRemovePlayer: (playerId: string) => void;
}

export function QueueList({ queue, onRemovePlayer }: QueueListProps) {
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
                  {player.rating > 0 && (
                    <div className="text-xs text-slate-500">{player.rating.toFixed(1)}</div>
                  )}
                </div>
              </div>
              <button
                onClick={() => onRemovePlayer(player.id)}
                className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 transition-all"
                title="Remove from queue"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
