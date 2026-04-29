"use client";
import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { saveSession, hasActiveSession } from "../utils/sessionStorage";
import {
  parseBulkInput,
  DEFAULT_TIER_CONFIGS,
  DEFAULT_TIER_CONFIG,
} from "../utils/tierUtils";
import { createPlayer } from "../utils/playerStateUtils";
import type { TierConfig } from "../types";

export default function SetupPage() {
  const [courtCount, setCourtCount] = useState(4);
  const [tierCount, setTierCount] = useState<3 | 4 | 5>(4);
  const [tierConfig, setTierConfig] = useState<TierConfig>(DEFAULT_TIER_CONFIG);
  const [playerInput, setPlayerInput] = useState("");
  const [checkInMode, setCheckInMode] = useState<"roster" | "checked-in">(
    "roster",
  );
  const [activeSessionExists] = useState(() => hasActiveSession());
  const [dismissWarning, setDismissWarning] = useState(false);
  const router = useRouter();

  const parsedPlayers = useMemo(
    () => parseBulkInput(playerInput, tierConfig),
    [playerInput, tierConfig],
  );

  const validPlayers = useMemo(
    () => parsedPlayers.filter((p) => p.valid && p.name),
    [parsedPlayers],
  );

  const unratedCount = useMemo(
    () => validPlayers.filter((p) => p.tier === null).length,
    [validPlayers],
  );

  const handleTierCountChange = (count: 3 | 4 | 5) => {
    setTierCount(count);
    setTierConfig(DEFAULT_TIER_CONFIGS[count]);
  };

  const handleStartSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (validPlayers.length < 4 || courtCount < 1) return;

    const now = Date.now();
    const immediateCheckIn = checkInMode === "checked-in";

    const players = validPlayers.map((line, i) =>
      createPlayer(i + 1, line.name, line.tier, immediateCheckIn, now),
    );

    const courts = Array.from({ length: courtCount }, (_, i) => ({
      id: `court_${i + 1}`,
      name: `Court ${i + 1}`,
      isActive: true,
      mode: "normal" as const,
    }));

    const sessionState = {
      players,
      courts,
      matchHistory: [],
      activeMatches: [],
      undoableMatches: [],
      tierConfig,
      currentStrategy: "balanced" as const,
      strategyConfig: { primary: "balanced" as const },
      constraints: { fixedPairs: [], doNotPair: [] },
      sessionStartTime: now,
      sessionId: Math.random().toString(36).slice(2, 11),
      nextPlayerId: players.length + 1,
      nextMatchId: 1,
    };

    saveSession(sessionState);
    router.push("/session");
  };

  const canStart = validPlayers.length >= 4 && courtCount >= 1;
  const showWarning = !dismissWarning && activeSessionExists;

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <main className="w-full max-w-lg">
        <div className="glass-panel rounded-2xl p-8 shadow-2xl border border-white/10 relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <h1 className="text-4xl font-bold text-center mb-2 bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
              Session Setup
            </h1>
            <p className="text-slate-400 text-center mb-8">
              Configure your pickleball session
            </p>

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
                        onClick={() => router.push("/session")}
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
              {/* Court Count */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Number of Courts
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCourtCount((c) => Math.max(1, c - 1))}
                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xl font-bold transition-colors border border-slate-700"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center text-2xl font-bold text-white">
                    {courtCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCourtCount((c) => c + 1)}
                    className="w-11 h-11 flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xl font-bold transition-colors border border-slate-700"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Tier Configuration */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-slate-300">
                  Tier System
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([3, 4, 5] as const).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => handleTierCountChange(n)}
                      className={`py-2.5 rounded-xl text-sm font-medium transition-colors border ${
                        tierCount === n
                          ? "bg-primary/20 border-primary text-primary"
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {n} Tiers
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 justify-center">
                  {tierConfig.tiers.map((t, i) => (
                    <span
                      key={t}
                      className="px-3 py-1 rounded-lg bg-slate-800 text-slate-300 text-sm border border-slate-700"
                    >
                      {i === 0 ? "Low" : i === tierConfig.tiers.length - 1 ? "High" : ""}
                      {i > 0 && i < tierConfig.tiers.length - 1 ? "Mid" : ""}{" "}
                      <span className="font-bold text-primary">{t}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Players Input */}
              <div className="space-y-2">
                <label
                  htmlFor="players"
                  className="block text-sm font-medium text-slate-300"
                >
                  Players &amp; Skill Tiers
                </label>
                <div className="relative">
                  <textarea
                    id="players"
                    rows={8}
                    value={playerInput}
                    onChange={(e) => setPlayerInput(e.target.value)}
                    placeholder={`Paste player list here...\nJohn Doe A\nJane Smith B\nCharlie (unrated)`}
                    className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all resize-none font-mono text-sm"
                  />
                  <div className="absolute bottom-3 right-3 text-xs text-slate-500">
                    {validPlayers.length} valid
                  </div>
                </div>

                {/* Per-line validation */}
                {parsedPlayers.length > 0 && (
                  <div className="max-h-36 overflow-y-auto space-y-0.5 rounded-xl bg-slate-900/50 border border-slate-800 p-2">
                    {parsedPlayers.map((p, i) => (
                      <div
                        key={i}
                        className={`text-xs px-2 py-0.5 rounded ${
                          p.valid
                            ? "text-emerald-400"
                            : "text-red-400 bg-red-900/20"
                        }`}
                      >
                        {p.displayMessage}
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-xs text-slate-500">
                  Format: Name followed by tier (e.g.{" "}
                  <span className="font-mono text-slate-400">Alice A</span>
                  ) or just a name for unrated.
                  {unratedCount > 0 && (
                    <span className="text-slate-400 ml-1">
                      {unratedCount} player{unratedCount > 1 ? "s" : ""} unrated.
                    </span>
                  )}
                </p>
              </div>

              {/* Check-In Mode */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Initial Check-In Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckInMode("roster")}
                    className={`py-3 px-4 rounded-xl text-sm font-medium transition-colors border text-left ${
                      checkInMode === "roster"
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    <div className="font-semibold">Roster</div>
                    <div className="text-xs opacity-80 mt-0.5">
                      Check in as players arrive
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckInMode("checked-in")}
                    className={`py-3 px-4 rounded-xl text-sm font-medium transition-colors border text-left ${
                      checkInMode === "checked-in"
                        ? "bg-primary/20 border-primary text-primary"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    <div className="font-semibold">All Checked In</div>
                    <div className="text-xs opacity-80 mt-0.5">
                      Everyone starts waiting
                    </div>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={!canStart}
                className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all transform ${
                  canStart
                    ? "bg-primary hover:bg-lime-400 text-primary-foreground shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 active:translate-y-0"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                {showWarning
                  ? "Start New Session"
                  : `Start Session (${validPlayers.length} players)`}
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
