'use client';

import { useState } from 'react';
import { Player } from '../types';

interface AddPlayerFormProps {
  onAddPlayer: (name: string, rating: number) => void;
  onCancel: () => void;
}

export function AddPlayerForm({ onAddPlayer, onCancel }: AddPlayerFormProps) {
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerRating, setNewPlayerRating] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    const rating = parseFloat(newPlayerRating);
    onAddPlayer(newPlayerName.trim(), !isNaN(rating) ? rating : 0);
    
    setNewPlayerName('');
    setNewPlayerRating('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-900/50 border border-slate-700 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Player Name"
          value={newPlayerName}
          onChange={(e) => setNewPlayerName(e.target.value)}
          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
          autoFocus
        />
        <input
          type="number"
          placeholder="Rating"
          step="0.1"
          value={newPlayerRating}
          onChange={(e) => setNewPlayerRating(e.target.value)}
          className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary/50"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!newPlayerName.trim()}
          className="flex-1 bg-primary text-primary-foreground py-2 rounded-lg text-sm font-bold hover:bg-lime-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 bg-slate-800 text-slate-400 hover:text-white rounded-lg text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
