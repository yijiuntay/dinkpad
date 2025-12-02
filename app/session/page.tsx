'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Player, Game, PastGame } from './types';
import { CourtCard } from './components/CourtCard';
import { QueueList } from './components/QueueList';
import { AddPlayerForm } from './components/AddPlayerForm';

export default function SessionPage() {
  const router = useRouter();
  const [courts, setCourts] = useState<Game[]>([]);
  const [queue, setQueue] = useState<Player[]>([]);
  const [pastGames, setPastGames] = useState<PastGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCourts, setTotalCourts] = useState(0);
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  useEffect(() => {
    const setupData = localStorage.getItem('dinkpad_setup');
    const activeSessionData = localStorage.getItem('dinkpad_active_session');

    if (!setupData) {
      router.push('/setup');
      return;
    }

    try {
      const { courtCount, playerInput } = JSON.parse(setupData);
      setTotalCourts(courtCount);

      // If we have an active session, load it
      if (activeSessionData) {
        const { courts: savedCourts, queue: savedQueue, pastGames: savedPastGames } = JSON.parse(activeSessionData);
        setCourts(savedCourts);
        setQueue(savedQueue);
        setPastGames(savedPastGames || []);
        setLoading(false);
        return;
      }
      
      // Otherwise initialize new session
      const allPlayers: Player[] = playerInput
        .split('\n')
        .filter((line: string) => line.trim())
        .map((line: string, index: number) => {
          const parts = line.trim().split(' ');
          const lastPart = parts[parts.length - 1];
          const rating = parseFloat(lastPart);
          const hasRating = !isNaN(rating);
          const name = hasRating ? parts.slice(0, -1).join(' ') : line.trim();
          
          return {
            id: `p-${index}`,
            name,
            rating: hasRating ? rating : 0
          };
        });

      setCourts([]);
      setQueue(allPlayers);
      setPastGames([]);
      setLoading(false);
    } catch (e) {
      console.error("Failed to parse setup data", e);
      router.push('/setup');
    }
  }, [router]);

  // Persist state whenever it changes
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('dinkpad_active_session', JSON.stringify({ courts, queue, pastGames }));
    }
  }, [courts, queue, pastGames, loading]);

  const findBestMatch = (candidates: Player[], history: PastGame[]) => {
    // Helper to generate combinations of 4 players
    const getCombinations = (arr: Player[], k: number): Player[][] => {
      if (k === 0) return [[]];
      if (arr.length === 0) return [];
      const [first, ...rest] = arr;
      const withFirst = getCombinations(rest, k - 1).map(c => [first, ...c]);
      const withoutFirst = getCombinations(rest, k);
      return [...withFirst, ...withoutFirst];
    };

    // Only look at top 12 players to ensure wait times aren't too long
    const pool = candidates.slice(0, 12);
    const combinations = getCombinations(pool, 4);

    let bestCombo: Player[] = combinations[0];
    let bestScore = Infinity;

    combinations.forEach(combo => {
      // 1. Skill Spread Score (Lower is better)
      const ratings = combo.map(p => p.rating).filter(r => r > 0);
      let skillScore = 0;
      if (ratings.length > 0) {
        const spread = Math.max(...ratings) - Math.min(...ratings);
        skillScore = spread * 10; // Weight: 10
      }

      // 2. Wait Time Score (Lower is better)
      // We use the sum of indices in the original queue.
      // Lower indices = longer wait time.
      const waitScore = combo.reduce((sum, p) => sum + candidates.indexOf(p), 0) * 1; // Weight: 1

      // 3. History Score (Avoid repeats)
      // Count how many pairs in this combo have played together recently
      let repeatScore = 0;
      const recentGames = history.slice(-5); // Look at last 5 games
      
      for (let i = 0; i < combo.length; i++) {
        for (let j = i + 1; j < combo.length; j++) {
          const p1 = combo[i];
          const p2 = combo[j];
          
          // Check if this pair played together in recent games
          recentGames.forEach(g => {
            const hasP1 = g.players.some(p => p.id === p1.id);
            const hasP2 = g.players.some(p => p.id === p2.id);
            if (hasP1 && hasP2) repeatScore += 1;
          });
        }
      }
      repeatScore *= 5; // Weight: 5 (High penalty for repeats)

      const totalScore = skillScore + waitScore + repeatScore;

      if (totalScore < bestScore) {
        bestScore = totalScore;
        bestCombo = combo;
      }
    });

    return bestCombo;
  };

  const startGame = (courtNumber: number) => {
    if (queue.length < 4) return;
    
    // Find best 4 players
    const gamePlayers = findBestMatch(queue, pastGames);
    
    // Remove selected players from queue
    const nextQueue = queue.filter(p => !gamePlayers.find(gp => gp.id === p.id));
    
    const newGame: Game = {
      id: `game-${Date.now()}-${courtNumber}`,
      courtNumber,
      players: gamePlayers,
      startTime: Date.now()
    };

    setCourts([...courts, newGame]);
    setQueue(nextQueue);
  };

  const finishGame = (gameId: string) => {
    const game = courts.find(g => g.id === gameId);
    if (!game) return;

    // Remove the finished game
    const remainingCourts = courts.filter(g => g.id !== gameId);
    
    // Players from finished game go to back of queue
    const playersFromGame = game.players;
    const nextQueue = [...queue, ...playersFromGame];
    
    // Add to history
    const newPastGame: PastGame = {
      id: game.id,
      players: game.players,
      timestamp: Date.now()
    };
    
    setCourts(remainingCourts);
    setQueue(nextQueue);
    setPastGames([...pastGames, newPastGame]);
  };

  const removePlayer = (playerId: string) => {
    if (confirm('Remove this player from the queue?')) {
      setQueue(queue.filter(p => p.id !== playerId));
    }
  };

  const handleAddPlayer = (name: string, rating: number) => {
    const newPlayer: Player = {
      id: `p-${Date.now()}`,
      name,
      rating
    };

    setQueue([...queue, newPlayer]);
    setIsAddingPlayer(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Helper to get active game for a court index
  const getGameForCourt = (courtNum: number) => courts.find(g => g.courtNumber === courtNum);

  return (
    <div className="min-h-screen p-6 relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <header className="mb-8 flex justify-between items-center relative z-10">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
            Live Session
          </h1>
          <p className="text-slate-400">Manage courts and queue</p>
        </div>
        <button 
          onClick={() => {
            if (confirm('Are you sure you want to end the session? All progress will be lost.')) {
              localStorage.removeItem('dinkpad_active_session');
              router.push('/setup');
            }
          }}
          className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 backdrop-blur-md rounded-lg text-sm transition-all hover:border-primary/30"
        >
          End Session
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
        {/* Active Games Section */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.5)]"/>
            Active Courts
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: totalCourts }).map((_, i) => {
              const courtNum = i + 1;
              const game = getGameForCourt(courtNum);

              return (
                <CourtCard 
                  key={courtNum}
                  courtNum={courtNum}
                  game={game}
                  queueLength={queue.length}
                  onFinishGame={finishGame}
                  onStartGame={startGame}
                />
              );
            })}
          </div>
        </div>

        {/* Queue Section */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Queue</h2>
            <span className="px-2 py-1 bg-slate-800/50 border border-white/5 rounded text-xs text-slate-400">
              {queue.length} waiting
            </span>
          </div>
          
          {/* Add Player Form/Button */}
          {!isAddingPlayer ? (
            <button
              onClick={() => setIsAddingPlayer(true)}
              className="w-full py-3 border border-dashed border-slate-700 rounded-xl text-slate-400 hover:text-primary hover:border-primary/50 hover:bg-slate-800/50 transition-all text-sm font-medium flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Add Player
            </button>
          ) : (
            <AddPlayerForm 
              onAddPlayer={handleAddPlayer}
              onCancel={() => setIsAddingPlayer(false)}
            />
          )}

          <QueueList 
            queue={queue}
            onRemovePlayer={removePlayer}
          />
        </div>
      </div>
    </div>
  );
}
