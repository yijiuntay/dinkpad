"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Player, SessionState, Court, SessionMode } from "../types";
import { saveSession, hasActiveSession } from "../utils/sessionStorage";

export default function SetupPage() {
  const [courtCount, setCourtCount] = useState(4);
  const [mode, setMode] = useState<SessionMode>("standard");
  const [playerInput, setPlayerInput] = useState("");
  const [dismissWarning, setDismissWarning] = useState(false);
  const [activeSessionExists, setActiveSessionExists] = useState(() =>
    hasActiveSession(),
  );
  const router = useRouter();

  const showWarning = useMemo(
    () => !dismissWarning && activeSessionExists,
    [dismissWarning, activeSessionExists],
  );

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();

    if (courtCount < 1 || !playerInput.trim()) return;

    // Parse players
    const lines = playerInput
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line);
    const players: Player[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (mode === "ladder") {
        // Ladder mode: names only, no skill input. Everyone starts at equal rank.
        const name = lines[i].trim();
        if (name) {
          players.push({
            id: `player_${i + 1}`,
            name,
            skill: 0,
            ladderRank: 0,
            status: "waiting",
            waitTime: 0,
            gamesPlayed: 0,
            consecutiveSkips: 0,
          });
        }
        continue;
      }

      const parts = lines[i].split(/\s+/);
      if (parts.length < 2) continue;

      const skill = parseFloat(parts[parts.length - 1]);
      const name = parts.slice(0, -1).join(" ");

      if (name && !isNaN(skill)) {
        players.push({
          id: `player_${i + 1}`,
          name,
          skill,
          ladderRank: 0,
          status: "waiting",
          waitTime: 0,
          gamesPlayed: 0,
          consecutiveSkips: 0,
        });
      }
    }

    if (players.length < 4) {
      alert("You need at least 4 players to start a session.");
      return;
    }

    // Initialize courts
    const courts: Court[] = [];
    for (let i = 1; i <= courtCount; i++) {
      courts.push({
        number: i,
        currentMatch: null,
        isActive: true,
      });
    }

    // Create initial session state
    const sessionState: SessionState = {
      players,
      courts,
      matchHistory: [],
      currentStrategy: mode === "ladder" ? "ladder" : "balanced",
      mode,
      lockedPairs: [],
      sessionStartTime: Date.now(),
      courtCount,
      nextPlayerId: players.length + 1,
      nextMatchId: 1,
    };

    // Save to localStorage
    saveSession(sessionState);

    // Navigate to session page
    router.push("/session");
  };

  const handleResumeSession = () => {
    router.push("/session");
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

            {/* Warning Modal */}
            {showWarning && (
              <div className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-yellow-300 font-semibold mb-1">
                      Active Session Found
                    </h3>
                    <p className="text-sm text-yellow-200/80 mb-3">
                      You have an ongoing session. Resume it or start a new one?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleResumeSession}
                        className="px-4 py-2 bg-yellow-500 text-yellow-950 rounded-lg font-medium text-sm hover:bg-yellow-400 transition-colors"
                      >
                        Resume Session
                      </button>
                      <button
                        onClick={() => setDismissWarning(true)}
                        className="px-4 py-2 bg-slate-700 text-slate-200 rounded-lg font-medium text-sm hover:bg-slate-600 transition-colors"
                      >
                        Start New
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <form className="space-y-6" onSubmit={handleStartSession}>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Session Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("standard")}
                    className={`p-3 rounded-xl border-2 text-left transition-colors ${
                      mode === "standard"
                        ? "bg-primary/20 border-primary"
                        : "bg-slate-900/50 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-bold text-slate-200 text-sm">
                      ⚖️ Standard
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Uses skill ratings
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("ladder")}
                    className={`p-3 rounded-xl border-2 text-left transition-colors ${
                      mode === "ladder"
                        ? "bg-primary/20 border-primary"
                        : "bg-slate-900/50 border-slate-700 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-bold text-slate-200 text-sm">
                      🪜 Ladder
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      No skills, results-driven
                    </div>
                  </button>
                </div>
              </div>

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
                  {mode === "ladder" ? "Players" : "Players & Skill Ratings"}
                </label>
                <div className="relative">
                  <textarea
                    id="players"
                    rows={8}
                    value={playerInput}
                    onChange={(e) => setPlayerInput(e.target.value)}
                    placeholder={
                      mode === "ladder"
                        ? `Paste player list here...
John Doe
Jane Smith`
                        : `Paste player list here...
John Doe 4.5
Jane Smith 3.0`
                    }
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none font-mono text-sm"
                  />
                  <div className="absolute bottom-3 right-3 text-xs text-slate-500">
                    {
                      playerInput.split("\n").filter((line) => line.trim())
                        .length
                    }{" "}
                    players
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  {mode === "ladder"
                    ? "One name per line. No skill ratings needed — everyone starts equal."
                    : 'Format: Name followed by rating (e.g., "Alice 3.5")'}
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
                {showWarning ? "Start New Session" : "Start Session"}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
