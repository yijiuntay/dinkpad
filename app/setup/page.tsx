'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SetupPage() {
  const [courtCount, setCourtCount] = useState(4);
  const [playerInput, setPlayerInput] = useState('');
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('dinkpad_setup', JSON.stringify({ courtCount, playerInput }));
    localStorage.removeItem('dinkpad_active_session'); // Clear any previous session
    router.push('/session');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-lg">
        <div className="glass-panel rounded-2xl p-8 shadow-2xl border border-white/10 relative overflow-hidden">
          {/* Decorative background glow */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
              Session Setup
            </h1>
            <p className="text-slate-400 text-center mb-8">
              Configure your pickleball session
            </p>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label 
                  htmlFor="courtCount" 
                  className="block text-sm font-medium text-slate-300"
                >
                  Number of Courts
                </label>
                <input
                  type="number"
                  id="courtCount"
                  min="1"
                  value={courtCount}
                  onChange={(e) => setCourtCount(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>

              <div className="space-y-2">
                <label 
                  htmlFor="players" 
                  className="block text-sm font-medium text-slate-300"
                >
                  Players & Skill Ratings
                </label>
                <div className="relative">
                  <textarea
                    id="players"
                    rows={8}
                    value={playerInput}
                    onChange={(e) => setPlayerInput(e.target.value)}
                    placeholder={`Paste player list here...
John Doe 4.5
Jane Smith 3.0`}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none font-mono text-sm"
                  />
                  <div className="absolute bottom-3 right-3 text-xs text-slate-500">
                    {playerInput.split('\n').filter(line => line.trim()).length} players
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Format: Name followed by rating (e.g., "Alice 3.5")
                </p>
              </div>

              <button
                type="submit"
                disabled={courtCount < 1 || !playerInput.trim()}
                className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all transform ${
                  courtCount >= 1 && playerInput.trim()
                    ? "bg-primary hover:bg-lime-400 text-primary-foreground shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                Start Session
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
