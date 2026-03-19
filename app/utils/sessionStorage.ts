import { SessionState } from "../types";

const SESSION_KEY = "dinkpad_session_v1";

export function saveSession(state: SessionState): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Failed to save session:", error);
    // Handle localStorage full or unavailable
  }
}

export function loadSession(): SessionState | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    if (!saved) return null;

    const session = JSON.parse(saved) as SessionState;

    // Migrate old sessions: add consecutiveSkips if missing
    const migratedPlayers = session.players.map((player) => ({
      ...player,
      consecutiveSkips: player.consecutiveSkips ?? 0,
    }));

    return {
      ...session,
      players: migratedPlayers,
    };
  } catch (error) {
    console.error("Failed to load session:", error);
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
}

export function hasActiveSession(): boolean {
  return loadSession() !== null;
}
