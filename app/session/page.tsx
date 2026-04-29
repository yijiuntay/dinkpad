"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type {
  Player,
  Match,
  MatchHistory,
  MatchResult,
  SessionState,
  StrategyId,
  UndoableMatch,
  UndoablePlayerState,
} from "../types";
import { loadSession, saveSession, clearSession } from "../utils/sessionStorage";
import {
  generateMatch,
  type GenerateMatchInput,
  type GenerateMatchResult,
} from "../utils/matchmaking";
import {
  startPlaying,
  finishPlaying,
  stepAway,
  resumeWithPosition,
  resumeBackOfQueue,
  checkIn,
  createPlayer,
  applySkipIncrement,
  tickWaitTime,
  isCriticalPriority,
} from "../utils/playerStateUtils";
import { getTierLabel } from "../utils/tierUtils";
import { useToast } from "../components/ToastContext";
import ConfirmModal from "../components/ConfirmModal";
import BottomSheet from "../components/BottomSheet";

// ── Local types ───────────────────────────────────────────────────────────────

interface PreviewState {
  courtId: string;
  matchId: string;
  result: GenerateMatchResult;
  shuffleCount: number;
}

interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  return formatTime(Math.floor(ms / 1000));
}

function tierBadgeClass(tier: string | null): string {
  if (!tier) return "bg-slate-700 text-slate-400";
  const map: Record<string, string> = {
    A: "bg-primary/20 text-primary",
    B: "bg-blue-500/20 text-blue-400",
    C: "bg-orange-500/20 text-orange-400",
    D: "bg-slate-600/50 text-slate-400",
    E: "bg-slate-700 text-slate-500",
  };
  return map[tier] ?? "bg-slate-700 text-slate-300";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // ── Core state ──────────────────────────────────────────────────────────────
  const [session, setSession] = useState<SessionState | null>(null);
  const [now, setNow] = useState(Date.now());

  // ── UI state ────────────────────────────────────────────────────────────────
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);
  const [resultState, setResultState] = useState<{ match: Match } | null>(null);
  const [selectedResult, setSelectedResult] = useState<"A" | "B" | null>(null);
  const [addPlayerOpen, setAddPlayerOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", tier: "", checkIn: true });
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [playerMenuId, setPlayerMenuId] = useState<string | null>(null);
  const [rosterCollapsed, setRosterCollapsed] = useState(true);

  // ── Load session on mount ───────────────────────────────────────────────────
  useEffect(() => {
    const loaded = loadSession();
    if (!loaded) {
      router.push("/setup");
      return;
    }
    setSession(loaded);
  }, [router]);

  // ── Auto-save ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (session) saveSession(session);
  }, [session]);

  // ── 1-second tick ──────────────────────────────────────────────────────────
  const sessionReady = session !== null;
  useEffect(() => {
    if (!sessionReady) return;
    const interval = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setSession((prev) => {
        if (!prev) return prev;
        const players = prev.players.map(tickWaitTime);
        // Expire undo windows
        const expiredIds = new Set(
          prev.undoableMatches
            .filter((u) => u.expiresAt <= tick)
            .map((u) => u.matchId),
        );
        const undoableMatches = prev.undoableMatches.filter(
          (u) => u.expiresAt > tick,
        );
        const activeMatches = prev.activeMatches.map((m) =>
          expiredIds.has(m.id) ? { ...m, isUndoable: false } : m,
        );
        return { ...prev, players, activeMatches, undoableMatches };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionReady]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const playerMap = useMemo(() => {
    if (!session) return new Map<string, Player>();
    return new Map(session.players.map((p) => [p.id, p]));
  }, [session]);

  const activeCourts = useMemo(
    () => session?.courts.filter((c) => c.isActive) ?? [],
    [session],
  );

  const waitingPlayers = useMemo(
    () => session?.players.filter((p) => p.status === "waiting") ?? [],
    [session],
  );

  const steppedAwayPlayers = useMemo(
    () => session?.players.filter((p) => p.status === "stepped-away") ?? [],
    [session],
  );

  const rosterPlayers = useMemo(
    () => session?.players.filter((p) => p.status === "roster") ?? [],
    [session],
  );

  const courtCount = activeCourts.length;

  const sortedWaiting = useMemo(() => {
    if (!session) return [];
    return [...waitingPlayers].sort((a, b) => {
      const aIsCrit = isCriticalPriority(a, courtCount);
      const bIsCrit = isCriticalPriority(b, courtCount);
      if (aIsCrit !== bIsCrit) return aIsCrit ? -1 : 1;
      return b.waitTime - a.waitTime;
    });
  }, [waitingPlayers, session, courtCount]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleStartMatch = useCallback(
    (courtId: string) => {
      if (!session) return;
      const matchId = `match_${session.nextMatchId}`;
      const input: GenerateMatchInput = {
        waitingPlayers: session.players.filter((p) => p.status === "waiting"),
        strategy: session.currentStrategy,
        strategyConfig: session.strategyConfig,
        constraints: session.constraints,
        tierConfig: session.tierConfig,
        matchHistory: session.matchHistory,
        courtCount: activeCourts.length,
        courtId,
        matchId,
        now,
      };
      const result = generateMatch(input);
      setPreviewState({ courtId, matchId, result, shuffleCount: 0 });
    },
    [session, activeCourts.length, now],
  );

  const handleShuffle = useCallback(() => {
    if (!session || !previewState) return;
    const { courtId, matchId, shuffleCount } = previewState;
    if (shuffleCount >= 3) return;
    const input: GenerateMatchInput = {
      waitingPlayers: session.players.filter((p) => p.status === "waiting"),
      strategy: session.currentStrategy,
      strategyConfig: session.strategyConfig,
      constraints: session.constraints,
      tierConfig: session.tierConfig,
      matchHistory: session.matchHistory,
      courtCount: activeCourts.length,
      courtId,
      matchId,
      now: Date.now(),
    };
    const result = generateMatch(input);
    setPreviewState({ courtId, matchId, result, shuffleCount: shuffleCount + 1 });
  }, [session, previewState, activeCourts.length]);

  const handleConfirmMatch = useCallback(() => {
    if (!session || !previewState) return;
    const { courtId, matchId, result } = previewState;
    if (!result.match) return;

    const tick = Date.now();
    const { teamA, teamB } = result.match;
    const playingIds = new Set([
      teamA.player1Id,
      teamA.player2Id,
      teamB.player1Id,
      teamB.player2Id,
    ]);

    const prevPlayerStates: UndoablePlayerState[] = session.players
      .filter((p) => playingIds.has(p.id))
      .map((p) => ({
        playerId: p.id,
        waitTime: p.waitTime,
        consecutiveSkips: p.consecutiveSkips,
        status: p.status,
      }));

    const prevOtherSkips = session.players
      .filter(
        (p) =>
          !playingIds.has(p.id) &&
          (p.status === "waiting" || p.status === "stepped-away"),
      )
      .map((p) => ({ playerId: p.id, consecutiveSkips: p.consecutiveSkips }));

    const players = session.players.map((p) => {
      if (playingIds.has(p.id)) return startPlaying(p, tick);
      if (p.status === "waiting" || p.status === "stepped-away")
        return applySkipIncrement(p);
      return p;
    });

    const match: Match = {
      id: matchId,
      court: courtId,
      teamA,
      teamB,
      startTime: tick,
      strategy: session.currentStrategy,
      warnings: result.warnings,
      isUndoable: true,
    };

    const undoable: UndoableMatch = {
      matchId,
      expiresAt: tick + 30_000,
      prevPlayerStates,
      prevOtherSkips,
    };

    setSession((prev) =>
      prev
        ? {
            ...prev,
            players,
            activeMatches: [...prev.activeMatches, match],
            undoableMatches: [...prev.undoableMatches, undoable],
            nextMatchId: prev.nextMatchId + 1,
          }
        : prev,
    );
    setPreviewState(null);
    showToast("Match started!", "success");
  }, [session, previewState, showToast]);

  const handleUndoMatch = useCallback(
    (matchId: string) => {
      if (!session) return;
      const undoable = session.undoableMatches.find(
        (u) => u.matchId === matchId,
      );
      if (!undoable) return;

      const prevStatesMap = new Map(
        undoable.prevPlayerStates.map((s) => [s.playerId, s]),
      );
      const prevSkipsMap = new Map(
        undoable.prevOtherSkips.map((s) => [s.playerId, s.consecutiveSkips]),
      );

      const players = session.players.map((p) => {
        const prev = prevStatesMap.get(p.id);
        if (prev) {
          return {
            ...p,
            status: prev.status,
            waitTime: prev.waitTime,
            consecutiveSkips: prev.consecutiveSkips,
          };
        }
        const prevSkips = prevSkipsMap.get(p.id);
        if (prevSkips !== undefined) {
          return { ...p, consecutiveSkips: prevSkips };
        }
        return p;
      });

      setSession((prev) =>
        prev
          ? {
              ...prev,
              players,
              activeMatches: prev.activeMatches.filter(
                (m) => m.id !== matchId,
              ),
              undoableMatches: prev.undoableMatches.filter(
                (u) => u.matchId !== matchId,
              ),
            }
          : prev,
      );
      showToast("Match undone", "info");
    },
    [session, showToast],
  );

  const handleEndMatch = useCallback((match: Match) => {
    setResultState({ match });
    setSelectedResult(null);
  }, []);

  const handleConfirmResult = useCallback(
    (result?: MatchResult) => {
      if (!session || !resultState) return;
      const { match } = resultState;
      const tick = Date.now();

      const teamAIds = new Set([match.teamA.player1Id, match.teamA.player2Id]);
      const teamBIds = new Set([match.teamB.player1Id, match.teamB.player2Id]);
      const playingIds = new Set([...teamAIds, ...teamBIds]);

      const getResult = (id: string): "won" | "lost" | "none" => {
        if (!result) return "none";
        if (result.winningTeam === "A" && teamAIds.has(id)) return "won";
        if (result.winningTeam === "B" && teamBIds.has(id)) return "won";
        return "lost";
      };

      const players = session.players.map((p) => {
        if (playingIds.has(p.id)) return finishPlaying(p, getResult(p.id), tick);
        return p;
      });

      const entry: MatchHistory = {
        id: match.id,
        court: match.court,
        teamA: match.teamA,
        teamB: match.teamB,
        startTime: match.startTime,
        strategy: match.strategy,
        warnings: match.warnings,
        endTime: tick,
        duration: tick - match.startTime,
        result,
        undone: false,
      };

      setSession((prev) =>
        prev
          ? {
              ...prev,
              players,
              activeMatches: prev.activeMatches.filter(
                (m) => m.id !== match.id,
              ),
              undoableMatches: prev.undoableMatches.filter(
                (u) => u.matchId !== match.id,
              ),
              matchHistory: [...prev.matchHistory, entry],
            }
          : prev,
      );
      setResultState(null);
      setSelectedResult(null);
      showToast(result ? "Result recorded" : "Match ended", "success");
    },
    [session, resultState, showToast],
  );

  const handleStepAway = useCallback(
    (playerId: string) => {
      if (!session) return;
      const p = session.players.find((x) => x.id === playerId);
      if (!p || p.status !== "waiting") return;
      setSession((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((x) =>
                x.id === playerId ? stepAway(x, Date.now()) : x,
              ),
            }
          : prev,
      );
      setPlayerMenuId(null);
      showToast(`${p.name} stepped away`, "info");
    },
    [session, showToast],
  );

  const handleResume = useCallback(
    (playerId: string, mode: "position" | "back") => {
      if (!session) return;
      const p = session.players.find((x) => x.id === playerId);
      if (!p || p.status !== "stepped-away") return;
      const updated =
        mode === "position" ? resumeWithPosition(p) : resumeBackOfQueue(p);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((x) =>
                x.id === playerId ? updated : x,
              ),
            }
          : prev,
      );
    },
    [session],
  );

  const handleCheckIn = useCallback(
    (playerId: string) => {
      if (!session) return;
      const p = session.players.find((x) => x.id === playerId);
      if (!p || p.status !== "roster") return;
      const updated = checkIn(p, Date.now());
      setSession((prev) =>
        prev
          ? {
              ...prev,
              players: prev.players.map((x) =>
                x.id === playerId ? updated : x,
              ),
            }
          : prev,
      );
      showToast(`${p.name} checked in`, "success");
    },
    [session, showToast],
  );

  const handleRemovePlayer = useCallback(
    (playerId: string) => {
      if (!session) return;
      const p = session.players.find((x) => x.id === playerId);
      if (!p) return;
      setPlayerMenuId(null);
      setConfirmState({
        title: "Remove Player",
        message: `Remove ${p.name} from this session?`,
        confirmLabel: "Remove",
        destructive: true,
        onConfirm: () => {
          setSession((prev) =>
            prev
              ? { ...prev, players: prev.players.filter((x) => x.id !== playerId) }
              : prev,
          );
          setConfirmState(null);
          showToast(`${p.name} removed`, "info");
        },
      });
    },
    [session, showToast],
  );

  const handleAddPlayer = useCallback(() => {
    if (!session || !addForm.name.trim()) return;
    const tier = addForm.tier || null;
    const p = createPlayer(
      session.nextPlayerId,
      addForm.name.trim(),
      tier,
      addForm.checkIn,
      Date.now(),
    );
    setSession((prev) =>
      prev
        ? {
            ...prev,
            players: [...prev.players, p],
            nextPlayerId: prev.nextPlayerId + 1,
          }
        : prev,
    );
    setAddPlayerOpen(false);
    setAddForm({ name: "", tier: "", checkIn: true });
    showToast(
      `${p.name} added${addForm.checkIn ? " and checked in" : " to roster"}`,
      "success",
    );
  }, [session, addForm, showToast]);

  const handleStartAll = useCallback(() => {
    if (!session) return;
    const emptyCourts = activeCourts.filter(
      (c) => !session.activeMatches.some((m) => m.court === c.id),
    );
    if (emptyCourts.length === 0) {
      showToast("All courts already have active matches", "info");
      return;
    }

    let curPlayers = [...session.players];
    let curActive = [...session.activeMatches];
    let curUndoable = [...session.undoableMatches];
    let curNextId = session.nextMatchId;
    let started = 0;
    const tick = Date.now();

    for (const court of emptyCourts) {
      const matchId = `match_${curNextId}`;
      const waiting = curPlayers.filter((p) => p.status === "waiting");
      if (waiting.length < 4) break;

      const result = generateMatch({
        waitingPlayers: waiting,
        strategy: session.currentStrategy,
        strategyConfig: session.strategyConfig,
        constraints: session.constraints,
        tierConfig: session.tierConfig,
        matchHistory: session.matchHistory,
        courtCount: activeCourts.length,
        courtId: court.id,
        matchId,
        now: tick,
      });

      if (!result.match) break;

      const { teamA, teamB } = result.match;
      const playingIds = new Set([
        teamA.player1Id,
        teamA.player2Id,
        teamB.player1Id,
        teamB.player2Id,
      ]);

      const prevPlayerStates: UndoablePlayerState[] = curPlayers
        .filter((p) => playingIds.has(p.id))
        .map((p) => ({
          playerId: p.id,
          waitTime: p.waitTime,
          consecutiveSkips: p.consecutiveSkips,
          status: p.status,
        }));

      const prevOtherSkips = curPlayers
        .filter(
          (p) =>
            !playingIds.has(p.id) &&
            (p.status === "waiting" || p.status === "stepped-away"),
        )
        .map((p) => ({ playerId: p.id, consecutiveSkips: p.consecutiveSkips }));

      curPlayers = curPlayers.map((p) => {
        if (playingIds.has(p.id)) return startPlaying(p, tick);
        if (p.status === "waiting" || p.status === "stepped-away")
          return applySkipIncrement(p);
        return p;
      });

      const match: Match = {
        id: matchId,
        court: court.id,
        teamA,
        teamB,
        startTime: tick,
        strategy: session.currentStrategy,
        warnings: result.warnings,
        isUndoable: true,
      };

      curActive = [...curActive, match];
      curUndoable = [
        ...curUndoable,
        { matchId, expiresAt: tick + 30_000, prevPlayerStates, prevOtherSkips },
      ];
      curNextId++;
      started++;
    }

    setSession((prev) =>
      prev
        ? {
            ...prev,
            players: curPlayers,
            activeMatches: curActive,
            undoableMatches: curUndoable,
            nextMatchId: curNextId,
          }
        : prev,
    );

    if (started === 0) {
      showToast("Not enough players to start matches", "warning");
    } else if (started < emptyCourts.length) {
      showToast(
        `Started ${started} of ${emptyCourts.length} matches — not enough players for the rest`,
        "warning",
      );
    } else {
      showToast(`Started ${started} match${started > 1 ? "es" : ""}!`, "success");
    }
  }, [session, activeCourts, showToast]);

  const handleEndSession = useCallback(() => {
    setConfirmState({
      title: "End Session",
      message:
        "Are you sure you want to end this session? All data will be cleared.",
      confirmLabel: "End Session",
      destructive: true,
      onConfirm: () => {
        setSession(null);
        clearSession();
        setConfirmState(null);
        router.push("/");
      },
    });
  }, [router]);

  const handleChangeStrategy = useCallback(
    (strategy: StrategyId) => {
      if (!session) return;
      setSession((prev) =>
        prev
          ? {
              ...prev,
              currentStrategy: strategy,
              strategyConfig: { ...prev.strategyConfig, primary: strategy },
            }
          : prev,
      );
      setStrategyOpen(false);
      showToast(
        `Strategy changed to ${strategy === "minimize-wait" ? "Minimize Wait" : strategy === "balanced" ? "Balanced" : "Variety"}`,
        "info",
      );
    },
    [session, showToast],
  );

  // ── Loading state ───────────────────────────────────────────────────────────
  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400">Loading session…</div>
      </div>
    );
  }

  // ── Computed display values ─────────────────────────────────────────────────
  const sessionElapsed = Math.floor((now - session.sessionStartTime) / 1000);

  const strategyLabel: Record<StrategyId, string> = {
    balanced: "Balanced",
    "minimize-wait": "Min Wait",
    variety: "Variety",
  };

  const playerName = (id: string) => playerMap.get(id)?.name ?? id;
  const playerTier = (id: string) => playerMap.get(id)?.tier ?? null;

  // ── Undo countdown helper ───────────────────────────────────────────────────
  const undoSecondsLeft = (matchId: string): number => {
    const u = session.undoableMatches.find((x) => x.matchId === matchId);
    if (!u) return 0;
    return Math.max(0, Math.ceil((u.expiresAt - now) / 1000));
  };

  const isUndoable = (matchId: string): boolean =>
    session.undoableMatches.some((u) => u.matchId === matchId);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-950 pb-8">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 shadow-lg">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-primary font-black text-lg tracking-tight">
                dinkpad
              </span>
              <span className="text-slate-500 text-sm font-mono">
                {formatTime(sessionElapsed)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setStrategyOpen(true)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-semibold text-slate-300 transition-colors"
              >
                {strategyLabel[session.currentStrategy]}
              </button>
              <button
                onClick={handleEndSession}
                className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
              >
                End
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
            <span>{activeCourts.length} courts</span>
            <span>·</span>
            <span>
              {waitingPlayers.length + session.players.filter((p) => p.status === "playing").length} / {session.players.filter(p => p.status !== "roster" && p.status !== "removed").length} checked in
            </span>
            <span>·</span>
            <span>{waitingPlayers.length} waiting</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-6">

        {/* ── Action Bar ── */}
        <div className="flex gap-2">
          <button
            onClick={handleStartAll}
            className="flex-1 py-3 bg-primary hover:bg-lime-400 text-slate-900 rounded-xl font-bold text-sm transition-colors shadow-lg shadow-primary/20"
          >
            Start All Matches
          </button>
          <button
            onClick={() => setAddPlayerOpen(true)}
            className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-semibold text-sm transition-colors"
          >
            + Player
          </button>
          {rosterPlayers.length > 0 && (
            <button
              onClick={() => setRosterCollapsed(false)}
              className="px-4 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl font-semibold text-sm transition-colors"
            >
              Check In
            </button>
          )}
        </div>

        {/* ── Court Grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {activeCourts.map((court) => {
            const activeMatch = session.activeMatches.find(
              (m) => m.court === court.id,
            );
            const undoable = activeMatch ? isUndoable(activeMatch.id) : false;
            const secondsLeft = activeMatch ? undoSecondsLeft(activeMatch.id) : 0;
            const matchDurationMs = activeMatch
              ? now - activeMatch.startTime
              : 0;

            return (
              <div
                key={court.id}
                className="bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden"
              >
                {/* Court header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                  <span className="font-bold text-slate-200 text-sm">
                    {court.name}
                  </span>
                  {activeMatch && (
                    <span className="font-mono text-slate-400 text-sm">
                      {formatDuration(matchDurationMs)}
                    </span>
                  )}
                </div>

                {activeMatch ? (
                  <div className="p-4 space-y-3">
                    {/* Teams */}
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Team A
                        </div>
                        {[
                          activeMatch.teamA.player1Id,
                          activeMatch.teamA.player2Id,
                        ].map((id) => (
                          <div
                            key={id}
                            className="flex items-center gap-1.5 text-sm text-slate-200"
                          >
                            <span className="truncate">{playerName(id)}</span>
                            {playerTier(id) && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded font-bold ${tierBadgeClass(playerTier(id))}`}
                              >
                                {getTierLabel(playerTier(id)!, session.tierConfig)}
                              </span>
                            )}
                          </div>
                        ))}
                        {activeMatch.teamA.avgTier !== null && (
                          <div className="text-xs text-slate-600">
                            avg {activeMatch.teamA.avgTier.toFixed(1)}
                          </div>
                        )}
                      </div>

                      <div className="text-slate-600 font-bold text-xs pt-5">
                        vs
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                          Team B
                        </div>
                        {[
                          activeMatch.teamB.player1Id,
                          activeMatch.teamB.player2Id,
                        ].map((id) => (
                          <div
                            key={id}
                            className="flex items-center gap-1.5 text-sm text-slate-200"
                          >
                            <span className="truncate">{playerName(id)}</span>
                            {playerTier(id) && (
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded font-bold ${tierBadgeClass(playerTier(id))}`}
                              >
                                {getTierLabel(playerTier(id)!, session.tierConfig)}
                              </span>
                            )}
                          </div>
                        ))}
                        {activeMatch.teamB.avgTier !== null && (
                          <div className="text-xs text-slate-600">
                            avg {activeMatch.teamB.avgTier.toFixed(1)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Warnings */}
                    {activeMatch.warnings.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {activeMatch.warnings.map((w, i) => (
                          <span
                            key={i}
                            title={w.message}
                            className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                              w.severity === "error"
                                ? "bg-red-900/40 text-red-400"
                                : w.severity === "warn"
                                  ? "bg-yellow-900/40 text-yellow-400"
                                  : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {w.code.toLowerCase().replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                      {undoable && (
                        <button
                          onClick={() => handleUndoMatch(activeMatch.id)}
                          className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-sm font-semibold transition-colors"
                        >
                          Undo ({secondsLeft}s)
                        </button>
                      )}
                      <button
                        onClick={() => handleEndMatch(activeMatch)}
                        className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-semibold transition-colors"
                      >
                        End Match
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <button
                      onClick={() => handleStartMatch(court.id)}
                      disabled={waitingPlayers.length < 4}
                      className={`w-full py-8 rounded-xl text-sm font-bold transition-colors ${
                        waitingPlayers.length >= 4
                          ? "bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30"
                          : "bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-800"
                      }`}
                    >
                      {waitingPlayers.length >= 4
                        ? "Start Match"
                        : "Need 4+ players"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Waiting Queue ── */}
        {sortedWaiting.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wide">
                Waiting ({sortedWaiting.length})
              </h2>
            </div>

            {sortedWaiting.map((p, i) => {
              const isCrit = isCriticalPriority(p, courtCount);
              const isNear =
                !isCrit && p.consecutiveSkips >= courtCount - 1;
              const isNextUp = i < 4;

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    isCrit
                      ? "border-red-500/40 bg-red-900/10"
                      : isNear
                        ? "border-yellow-500/30 bg-yellow-900/10"
                        : "border-slate-800 bg-slate-900/50"
                  }`}
                >
                  {/* Next-up indicator */}
                  <div className="w-5 flex-shrink-0">
                    {isNextUp && (
                      <span
                        className="text-primary text-xs font-bold"
                        title="Next up"
                      >
                        #{i + 1}
                      </span>
                    )}
                  </div>

                  {/* Player info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200 text-sm truncate">
                        {p.name}
                      </span>
                      {p.tier && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${tierBadgeClass(p.tier)}`}
                        >
                          {getTierLabel(p.tier, session.tierConfig)}
                        </span>
                      )}
                      {isCrit && (
                        <span className="text-red-400 text-xs flex-shrink-0">
                          🔴
                        </span>
                      )}
                      {isNear && (
                        <span className="text-yellow-400 text-xs flex-shrink-0">
                          ⚠
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Wait {formatTime(p.waitTime)}
                      {p.consecutiveSkips > 0 &&
                        ` · Skipped ${p.consecutiveSkips}×`}
                      {` · ${p.gamesPlayed}G`}
                    </div>
                  </div>

                  {/* Overflow menu */}
                  <button
                    onClick={() =>
                      setPlayerMenuId(playerMenuId === p.id ? null : p.id)
                    }
                    className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-lg transition-colors flex-shrink-0"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="5" r="1.5" />
                      <circle cx="12" cy="12" r="1.5" />
                      <circle cx="12" cy="19" r="1.5" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Away Section ── */}
        {steppedAwayPlayers.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-500" />
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wide">
                Away ({steppedAwayPlayers.length})
              </h2>
            </div>
            {steppedAwayPlayers.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/30"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-400 text-sm truncate">
                      {p.name}
                    </span>
                    {p.tier && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-bold opacity-60 ${tierBadgeClass(p.tier)}`}
                      >
                        {p.tier}
                      </span>
                    )}
                    <span className="text-xs text-slate-600 flex-shrink-0">
                      AWAY
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">
                    Wait {formatTime(p.waitTime)}
                    {p.consecutiveSkips > 0 &&
                      ` · Skipped ${p.consecutiveSkips}×`}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleResume(p.id, "position")}
                    className="px-2.5 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs font-semibold transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => handleResume(p.id, "back")}
                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-lg text-xs font-semibold transition-colors"
                  >
                    Back of Queue
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Roster Section ── */}
        {rosterPlayers.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setRosterCollapsed((v) => !v)}
              className="flex items-center gap-2 w-full text-left"
            >
              <span className="w-2 h-2 rounded-full bg-slate-600" />
              <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wide flex-1">
                Roster ({rosterPlayers.length})
              </h2>
              <span className="text-slate-600 text-xs">
                {rosterCollapsed ? "▶" : "▼"}
              </span>
            </button>
            {!rosterCollapsed &&
              rosterPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-800 bg-slate-900/20 opacity-70"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-400 text-sm truncate">
                        {p.name}
                      </span>
                      {p.tier && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded font-bold opacity-50 ${tierBadgeClass(p.tier)}`}
                        >
                          {p.tier}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      Not checked in
                    </div>
                  </div>
                  <button
                    onClick={() => handleCheckIn(p.id)}
                    className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-xs font-bold transition-colors flex-shrink-0"
                  >
                    Check In
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ── Player Menu Bottom Sheet ── */}
      {playerMenuId && (
        <BottomSheet
          isOpen={true}
          title={playerMap.get(playerMenuId)?.name}
          onClose={() => setPlayerMenuId(null)}
        >
          <div className="space-y-2">
            <button
              onClick={() => handleStepAway(playerMenuId)}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-sm transition-colors text-left px-4"
            >
              Step Away
            </button>
            <button
              onClick={() => handleRemovePlayer(playerMenuId)}
              className="w-full py-3 bg-red-900/20 hover:bg-red-900/30 text-red-400 rounded-xl font-medium text-sm transition-colors text-left px-4 border border-red-900/30"
            >
              Remove from Session
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── Match Preview Sheet ── */}
      {previewState && (
        <BottomSheet
          isOpen={true}
          title="Match Preview"
          onClose={() => setPreviewState(null)}
        >
          <div className="space-y-4">
            {previewState.result.match ? (
              <>
                <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">
                  {activeCourts.find((c) => c.id === previewState.courtId)
                    ?.name ?? previewState.courtId}
                </p>

                {/* Teams */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center">
                  <div className="bg-slate-800/60 rounded-xl p-3 space-y-1.5">
                    <div className="text-xs font-bold text-slate-500 uppercase">
                      Team A
                    </div>
                    {[
                      previewState.result.match.teamA.player1Id,
                      previewState.result.match.teamA.player2Id,
                    ].map((id) => (
                      <div key={id} className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-200 truncate">
                          {playerName(id)}
                        </span>
                        {playerTier(id) && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${tierBadgeClass(playerTier(id))}`}
                          >
                            {playerTier(id)}
                          </span>
                        )}
                      </div>
                    ))}
                    {previewState.result.match.teamA.avgTier !== null && (
                      <div className="text-xs text-slate-600">
                        avg {previewState.result.match.teamA.avgTier.toFixed(1)}
                      </div>
                    )}
                  </div>

                  <div className="text-slate-600 font-bold text-sm">vs</div>

                  <div className="bg-slate-800/60 rounded-xl p-3 space-y-1.5">
                    <div className="text-xs font-bold text-slate-500 uppercase">
                      Team B
                    </div>
                    {[
                      previewState.result.match.teamB.player1Id,
                      previewState.result.match.teamB.player2Id,
                    ].map((id) => (
                      <div key={id} className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-200 truncate">
                          {playerName(id)}
                        </span>
                        {playerTier(id) && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${tierBadgeClass(playerTier(id))}`}
                          >
                            {playerTier(id)}
                          </span>
                        )}
                      </div>
                    ))}
                    {previewState.result.match.teamB.avgTier !== null && (
                      <div className="text-xs text-slate-600">
                        avg {previewState.result.match.teamB.avgTier.toFixed(1)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Warnings */}
                {previewState.result.warnings.length > 0 && (
                  <div className="space-y-1">
                    {previewState.result.warnings.map((w, i) => (
                      <div
                        key={i}
                        className={`text-xs px-3 py-2 rounded-lg ${
                          w.severity === "error"
                            ? "bg-red-900/30 text-red-300"
                            : w.severity === "warn"
                              ? "bg-yellow-900/30 text-yellow-300"
                              : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {w.message}
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleShuffle}
                    disabled={previewState.shuffleCount >= 3}
                    className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-colors ${
                      previewState.shuffleCount >= 3
                        ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    }`}
                  >
                    {previewState.shuffleCount >= 3
                      ? "No more shuffles"
                      : `Shuffle (${3 - previewState.shuffleCount} left)`}
                  </button>
                  <button
                    onClick={handleConfirmMatch}
                    className="flex-1 py-3 rounded-xl text-sm font-bold bg-primary hover:bg-lime-400 text-slate-900 transition-colors"
                  >
                    Confirm
                  </button>
                </div>
              </>
            ) : (
              <div className="py-8 text-center space-y-2">
                {previewState.result.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-red-400">
                    {w.message}
                  </p>
                ))}
                <p className="text-slate-500 text-sm">
                  Add more players to the waiting queue to start a match.
                </p>
              </div>
            )}
          </div>
        </BottomSheet>
      )}

      {/* ── Result Capture Sheet ── */}
      {resultState && (
        <BottomSheet
          isOpen={true}
          title="Match Result"
          onClose={() => {
            setResultState(null);
            setSelectedResult(null);
          }}
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-400 text-center">
              Who won? Tap a team to select.
            </p>

            {/* Team cards */}
            {(["A", "B"] as const).map((team) => {
              const matchTeam =
                team === "A"
                  ? resultState.match.teamA
                  : resultState.match.teamB;
              const isSelected = selectedResult === team;
              return (
                <button
                  key={team}
                  onClick={() =>
                    setSelectedResult(isSelected ? null : team)
                  }
                  className={`w-full p-4 rounded-2xl border-2 transition-all text-left ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                  }`}
                >
                  <div className="text-xs font-bold text-slate-500 uppercase mb-2">
                    Team {team}
                    {isSelected && (
                      <span className="ml-2 text-primary">✓ Winner</span>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {[matchTeam.player1Id, matchTeam.player2Id].map((id) => (
                      <div key={id} className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-200">
                          {playerName(id)}
                        </span>
                        {playerTier(id) && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded font-bold ${tierBadgeClass(playerTier(id))}`}
                          >
                            {playerTier(id)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}

            {/* Action buttons */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => handleConfirmResult()}
                className="flex-1 py-3 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() =>
                  selectedResult &&
                  handleConfirmResult({
                    winningTeam: selectedResult,
                    recordedAt: Date.now(),
                  })
                }
                disabled={!selectedResult}
                className={`flex-1 py-3 rounded-xl text-sm font-bold transition-colors ${
                  selectedResult
                    ? "bg-primary hover:bg-lime-400 text-slate-900"
                    : "bg-slate-800 text-slate-600 cursor-not-allowed"
                }`}
              >
                Save Result
              </button>
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ── Strategy Sheet ── */}
      {strategyOpen && (
        <BottomSheet
          isOpen={true}
          title="Matchmaking Strategy"
          onClose={() => setStrategyOpen(false)}
        >
          <div className="space-y-2">
            {(
              [
                {
                  id: "balanced" as StrategyId,
                  label: "Balanced",
                  desc: "Minimizes tier gap between teams for competitive play",
                },
                {
                  id: "minimize-wait" as StrategyId,
                  label: "Minimize Wait",
                  desc: "Gets the longest-waiting players onto court first",
                },
                {
                  id: "variety" as StrategyId,
                  label: "Variety",
                  desc: "Avoids repeat partners and opponents for social mixing",
                },
              ] as const
            ).map(({ id, label, desc }) => (
              <button
                key={id}
                onClick={() => handleChangeStrategy(id)}
                className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${
                  session.currentStrategy === id
                    ? "border-primary bg-primary/10"
                    : "border-slate-700 bg-slate-800/50 hover:border-slate-600"
                }`}
              >
                <div className="font-bold text-slate-200 text-sm">{label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
              </button>
            ))}
          </div>
        </BottomSheet>
      )}

      {/* ── Add Player Sheet ── */}
      {addPlayerOpen && (
        <BottomSheet
          isOpen={true}
          title="Add Player"
          onClose={() => {
            setAddPlayerOpen(false);
            setAddForm({ name: "", tier: "", checkIn: true });
          }}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Name
              </label>
              <input
                type="text"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Player name"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Tier (optional)
              </label>
              <div className="flex gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setAddForm((f) => ({ ...f, tier: "" }))}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    addForm.tier === ""
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-slate-700 bg-slate-800 text-slate-400"
                  }`}
                >
                  Unrated
                </button>
                {session.tierConfig.tiers.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAddForm((f) => ({ ...f, tier: t }))}
                    className={`px-3 py-2 rounded-lg text-sm font-bold border transition-colors ${
                      addForm.tier === t
                        ? "border-primary bg-primary/20 text-primary"
                        : `border-slate-700 ${tierBadgeClass(t)}`
                    }`}
                  >
                    {getTierLabel(t, session.tierConfig)}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <span className="text-sm font-medium text-slate-300">
                Check in immediately
              </span>
              <button
                type="button"
                onClick={() => setAddForm((f) => ({ ...f, checkIn: !f.checkIn }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  addForm.checkIn ? "bg-primary" : "bg-slate-700"
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    addForm.checkIn ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <button
              onClick={handleAddPlayer}
              disabled={!addForm.name.trim()}
              className={`w-full py-3.5 rounded-xl font-bold text-sm transition-colors ${
                addForm.name.trim()
                  ? "bg-primary hover:bg-lime-400 text-slate-900"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              Add Player
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── Confirm Modal ── */}
      {confirmState && (
        <ConfirmModal
          isOpen={true}
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          destructive={confirmState.destructive}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
}
