"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Player, Match, SessionState, MatchmakingStrategy } from "../types";
import {
  loadSession,
  saveSession,
  clearSession,
} from "../utils/sessionStorage";
import { generateMatch, recordMatch } from "../utils/matchmaking";

export default function SessionPage() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [showStrategyModal, setShowStrategyModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerSkill, setNewPlayerSkill] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const router = useRouter();

  // Load session on mount
  useEffect(() => {
    const loaded = loadSession();
    if (!loaded) {
      router.push("/setup");
      return;
    }
    setSession(loaded);
  }, [router]);

  // Auto-save session whenever it changes
  useEffect(() => {
    if (session) {
      saveSession(session);
    }
  }, [session]);

  // Update wait times and current time every second
  useEffect(() => {
    if (!session) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
      setSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.status === "waiting" ? { ...p, waitTime: p.waitTime + 1 } : p,
          ),
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getMatchDuration = (match: Match): string => {
    const elapsed = Math.floor((currentTime - match.startTime) / 1000);
    return formatTime(elapsed);
  };

  const changeStrategy = (strategy: MatchmakingStrategy) => {
    if (!session) return;
    setSession({ ...session, currentStrategy: strategy });
    setShowStrategyModal(false);
  };

  const startMatch = (courtNumber: number) => {
    if (!session) return;

    const matchId = `match_${session.nextMatchId}`;
    const match = generateMatch(
      courtNumber,
      session.players,
      session.currentStrategy,
      session.matchHistory,
      matchId,
      session.courtCount,
    );

    if (!match) {
      alert("Not enough players available to start a match!");
      return;
    }

    // Update player statuses
    const playingPlayerIds = [
      match.teamA.partner1.id,
      match.teamA.partner2.id,
      match.teamB.partner1.id,
      match.teamB.partner2.id,
    ];

    const updatedPlayers = session.players.map((p) => {
      if (playingPlayerIds.includes(p.id)) {
        // Selected players: reset skip counter, set to playing
        return {
          ...p,
          status: "playing" as const,
          waitTime: 0,
          lastPlayedAt: Date.now(),
          consecutiveSkips: 0,
        };
      } else if (p.status === "waiting" || p.status === "paused") {
        // Not selected: increment skip counter
        return {
          ...p,
          consecutiveSkips: p.consecutiveSkips + 1,
        };
      }
      return p;
    });

    // Update court
    const updatedCourts = session.courts.map((c) =>
      c.number === courtNumber ? { ...c, currentMatch: match } : c,
    );

    setSession({
      ...session,
      players: updatedPlayers,
      courts: updatedCourts,
      nextMatchId: session.nextMatchId + 1,
    });
  };

  const endMatch = (courtNumber: number) => {
    if (!session) return;

    const court = session.courts.find((c) => c.number === courtNumber);
    if (!court?.currentMatch) return;

    const match = court.currentMatch;

    // Record match history
    const history = recordMatch(match);

    // Update player statuses and game counts
    const playingPlayerIds = [
      match.teamA.partner1.id,
      match.teamA.partner2.id,
      match.teamB.partner1.id,
      match.teamB.partner2.id,
    ];

    const updatedPlayers = session.players.map((p) => {
      if (playingPlayerIds.includes(p.id)) {
        return {
          ...p,
          status: "waiting" as const,
          gamesPlayed: p.gamesPlayed + 1,
        };
      }
      return p;
    });

    // Clear court
    const updatedCourts = session.courts.map((c) =>
      c.number === courtNumber ? { ...c, currentMatch: null } : c,
    );

    setSession({
      ...session,
      players: updatedPlayers,
      courts: updatedCourts,
      matchHistory: [...session.matchHistory, history],
    });
  };

  const togglePlayerStatus = (playerId: string) => {
    if (!session) return;

    const player = session.players.find((p) => p.id === playerId);
    if (!player || player.status === "playing") return;

    const newStatus: "waiting" | "paused" =
      player.status === "waiting" ? "paused" : "waiting";

    const updatedPlayers = session.players.map((p) =>
      p.id === playerId
        ? { ...p, status: newStatus as "waiting" | "paused" }
        : p,
    );

    setSession({ ...session, players: updatedPlayers });
    setSelectedPlayer(null);
  };

  const removePlayer = (playerId: string) => {
    if (!session) return;

    const player = session.players.find((p) => p.id === playerId);
    if (player?.status === "playing") {
      alert("Cannot remove a player who is currently playing!");
      return;
    }

    if (!confirm(`Remove ${player?.name} from session?`)) return;

    const updatedPlayers = session.players.filter((p) => p.id !== playerId);
    setSession({ ...session, players: updatedPlayers });
    setSelectedPlayer(null);
  };

  const addPlayer = () => {
    if (!session || !newPlayerName.trim() || !newPlayerSkill.trim()) return;

    const skill = parseFloat(newPlayerSkill);
    if (isNaN(skill) || skill < 1 || skill > 5.5) {
      alert("Please enter a valid skill rating between 1.0 and 5.5");
      return;
    }

    const newPlayer: Player = {
      id: `player_${session.nextPlayerId}`,
      name: newPlayerName.trim(),
      skill,
      status: "waiting",
      waitTime: 0,
      gamesPlayed: 0,
      consecutiveSkips: 0,
    };

    setSession({
      ...session,
      players: [...session.players, newPlayer],
      nextPlayerId: session.nextPlayerId + 1,
    });

    setNewPlayerName("");
    setNewPlayerSkill("");
    setShowAddPlayerModal(false);
  };

  const endSession = () => {
    if (
      !confirm(
        "Are you sure you want to end this session? This cannot be undone.",
      )
    )
      return;

    // Clear session state first to prevent auto-save
    setSession(null);
    // Clear localStorage
    clearSession();
    // Navigate to home
    router.push("/");
  };

  const startAllMatches = () => {
    if (!session) return;
    session.courts.forEach((court) => {
      if (!court.currentMatch && court.isActive) {
        startMatch(court.number);
      }
    });
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Loading session...</div>
      </div>
    );
  }

  const playingPlayers = session.players.filter((p) => p.status === "playing");
  const waitingPlayers = session.players.filter((p) => p.status === "waiting");
  const pausedPlayers = session.players.filter((p) => p.status === "paused");

  const strategyLabels = {
    balanced: "⚖️ Balanced",
    "wait-time": "⏱️ Wait Time",
    variety: "🔄 Variety",
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl font-bold text-primary">DinkPad</h1>
            <button
              onClick={endSession}
              className="text-sm text-red-400 hover:text-red-300 font-medium"
            >
              End Session
            </button>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="text-slate-400">
                {session.courts.filter((c) => c.isActive).length} Courts
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-300">
                {session.players.length} Players
              </span>
            </div>
            <button
              onClick={() => setShowStrategyModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <span className="text-slate-300 text-xs font-medium">
                {strategyLabels[session.currentStrategy]}
              </span>
              <svg
                className="w-4 h-4 text-slate-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Actions */}
        <div className="flex gap-2">
          <button
            onClick={startAllMatches}
            className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-lime-400 transition-colors shadow-lg"
          >
            Start All Matches
          </button>
        </div>

        {/* Courts Section */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            PLAYING ({playingPlayers.length})
          </h2>

          {session.courts
            .filter((c) => c.isActive)
            .map((court) => (
              <div
                key={court.number}
                className="glass-panel rounded-2xl p-4 border border-slate-700/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-bold text-slate-200">
                    Court {court.number}
                  </h3>
                  {court.currentMatch && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>{getMatchDuration(court.currentMatch)}</span>
                    </div>
                  )}
                </div>

                {court.currentMatch ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                      {/* Team A */}
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-1">
                          Team A
                        </div>
                        <div className="text-sm font-medium text-slate-200">
                          {court.currentMatch.teamA.partner1.name}
                        </div>
                        <div className="text-sm font-medium text-slate-200">
                          {court.currentMatch.teamA.partner2.name}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Avg: {court.currentMatch.teamA.avgSkill.toFixed(1)}
                        </div>
                      </div>

                      {/* VS */}
                      <div className="text-slate-500 font-bold text-sm">vs</div>

                      {/* Team B */}
                      <div className="bg-slate-800/50 rounded-lg p-3">
                        <div className="text-xs text-slate-500 mb-1">
                          Team B
                        </div>
                        <div className="text-sm font-medium text-slate-200">
                          {court.currentMatch.teamB.partner1.name}
                        </div>
                        <div className="text-sm font-medium text-slate-200">
                          {court.currentMatch.teamB.partner2.name}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Avg: {court.currentMatch.teamB.avgSkill.toFixed(1)}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => endMatch(court.number)}
                      className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-medium transition-colors"
                    >
                      End Game
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startMatch(court.number)}
                    disabled={waitingPlayers.length < 4}
                    className={`w-full py-3 rounded-lg font-medium transition-colors ${
                      waitingPlayers.length >= 4
                        ? "bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30"
                        : "bg-slate-800 text-slate-500 cursor-not-allowed"
                    }`}
                  >
                    {waitingPlayers.length >= 4
                      ? "Start Match"
                      : "Need 4+ Players"}
                  </button>
                )}
              </div>
            ))}
        </div>

        {/* Waiting Queue */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
            WAITING ({waitingPlayers.length})
          </h2>

          {waitingPlayers.length > 0 ? (
            <div className="space-y-2">
              {waitingPlayers
                .sort((a, b) => b.waitTime - a.waitTime)
                .map((player) => {
                  const skipThreshold = session.courtCount + 1;
                  const isAtThreshold =
                    player.consecutiveSkips >= skipThreshold;
                  const isNearThreshold =
                    player.consecutiveSkips >= session.courtCount;

                  return (
                    <div
                      key={player.id}
                      className={`glass-panel rounded-xl p-4 border flex items-center justify-between ${
                        isAtThreshold
                          ? "border-red-500/50 bg-red-900/10"
                          : isNearThreshold
                            ? "border-yellow-500/50 bg-yellow-900/10"
                            : "border-slate-700/50"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-200">
                            {player.name}
                          </span>
                          {isAtThreshold && (
                            <span
                              className="text-sm"
                              title="Priority: Will be in next match"
                            >
                              🔴
                            </span>
                          )}
                          {!isAtThreshold && isNearThreshold && (
                            <span
                              className="text-sm"
                              title="Warning: Close to max wait"
                            >
                              ⚠️
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-3 mt-1">
                          <span>Skill: {player.skill}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            {formatTime(player.waitTime)}
                          </span>
                          <span>•</span>
                          <span>Games: {player.gamesPlayed}</span>
                          {player.consecutiveSkips > 0 && (
                            <>
                              <span>•</span>
                              <span
                                className={`${
                                  isAtThreshold
                                    ? "text-red-400 font-medium"
                                    : isNearThreshold
                                      ? "text-yellow-400 font-medium"
                                      : ""
                                }`}
                              >
                                Skipped: {player.consecutiveSkips}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedPlayer(player)}
                        className="ml-3 p-2 hover:bg-slate-700 rounded-lg transition-colors"
                      >
                        <svg
                          className="w-5 h-5 text-slate-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                          />
                        </svg>
                      </button>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="glass-panel rounded-xl p-8 text-center text-slate-500">
              No players waiting
            </div>
          )}
        </div>

        {/* Paused Players */}
        {pausedPlayers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-lg font-bold text-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-500"></span>
              PAUSED ({pausedPlayers.length})
            </h2>

            <div className="space-y-2">
              {pausedPlayers.map((player) => (
                <div
                  key={player.id}
                  className="glass-panel rounded-xl p-4 border border-slate-700/50 flex items-center justify-between opacity-60"
                >
                  <div className="flex-1">
                    <div className="font-medium text-slate-200">
                      {player.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      Skill: {player.skill} • Games: {player.gamesPlayed}
                    </div>
                  </div>
                  <button
                    onClick={() => togglePlayerStatus(player.id)}
                    className="ml-3 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    Resume
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-sm border-t border-slate-800 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <button
            onClick={() => setShowAddPlayerModal(true)}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Add Player
          </button>
        </div>
      </div>

      {/* Strategy Modal */}
      {showStrategyModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowStrategyModal(false)}
        >
          <div
            className="bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-slate-200 mb-4">
              Select Matchmaking Strategy
            </h3>
            <div className="space-y-2">
              <button
                onClick={() => changeStrategy("balanced")}
                className={`w-full text-left p-4 rounded-xl transition-colors ${
                  session.currentStrategy === "balanced"
                    ? "bg-primary/20 border-2 border-primary"
                    : "bg-slate-800 hover:bg-slate-700 border-2 border-transparent"
                }`}
              >
                <div className="font-bold text-slate-200 mb-1">
                  ⚖️ Balanced Skill Gap
                </div>
                <div className="text-sm text-slate-400">
                  Prioritizes fair team strength and competitive games
                </div>
              </button>

              <button
                onClick={() => changeStrategy("wait-time")}
                className={`w-full text-left p-4 rounded-xl transition-colors ${
                  session.currentStrategy === "wait-time"
                    ? "bg-primary/20 border-2 border-primary"
                    : "bg-slate-800 hover:bg-slate-700 border-2 border-transparent"
                }`}
              >
                <div className="font-bold text-slate-200 mb-1">
                  ⏱️ Minimize Wait Time
                </div>
                <div className="text-sm text-slate-400">
                  Gets players back on court ASAP, longest wait first
                </div>
              </button>

              <button
                onClick={() => changeStrategy("variety")}
                className={`w-full text-left p-4 rounded-xl transition-colors ${
                  session.currentStrategy === "variety"
                    ? "bg-primary/20 border-2 border-primary"
                    : "bg-slate-800 hover:bg-slate-700 border-2 border-transparent"
                }`}
              >
                <div className="font-bold text-slate-200 mb-1">
                  🔄 Maximize Variety
                </div>
                <div className="text-sm text-slate-400">
                  Avoids repeat pairings to ensure social mixing
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Player Options Modal */}
      {selectedPlayer && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setSelectedPlayer(null)}
        >
          <div
            className="bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-slate-200 mb-2">
              {selectedPlayer.name}
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              Skill: {selectedPlayer.skill} • Games:{" "}
              {selectedPlayer.gamesPlayed}
            </p>
            <div className="space-y-2">
              <button
                onClick={() => togglePlayerStatus(selectedPlayer.id)}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition-colors"
              >
                {selectedPlayer.status === "waiting"
                  ? "Pause Player"
                  : "Resume Player"}
              </button>
              <button
                onClick={() => removePlayer(selectedPlayer.id)}
                className="w-full py-3 bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded-xl font-medium transition-colors border border-red-900/30"
              >
                Remove from Session
              </button>
              <button
                onClick={() => setSelectedPlayer(null)}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Player Modal */}
      {showAddPlayerModal && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowAddPlayerModal(false)}
        >
          <div
            className="bg-slate-900 rounded-t-3xl sm:rounded-3xl w-full max-w-md p-6 border border-slate-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-slate-200 mb-4">
              Add New Player
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Player Name
                </label>
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  placeholder="Enter name"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Skill Rating (1.0 - 5.5)
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="5.5"
                  value={newPlayerSkill}
                  onChange={(e) => setNewPlayerSkill(e.target.value)}
                  placeholder="3.5"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => setShowAddPlayerModal(false)}
                  className="flex-1 py-3 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={addPlayer}
                  disabled={!newPlayerName.trim() || !newPlayerSkill.trim()}
                  className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                    newPlayerName.trim() && newPlayerSkill.trim()
                      ? "bg-primary hover:bg-lime-400 text-primary-foreground"
                      : "bg-slate-800 text-slate-500 cursor-not-allowed"
                  }`}
                >
                  Add Player
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
