import { TierConfig } from "../types";

export const DEFAULT_TIER_CONFIGS: Record<3 | 4 | 5, TierConfig> = {
  3: { tiers: ["C", "B", "A"], tierCount: 3 },
  4: { tiers: ["D", "C", "B", "A"], tierCount: 4 },
  5: { tiers: ["E", "D", "C", "B", "A"], tierCount: 5 },
};

export const DEFAULT_TIER_CONFIG = DEFAULT_TIER_CONFIGS[4];

/**
 * Returns the ordinal index of a tier (lowest = 0), or null for unrated.
 * Used for numeric comparison in matchmaking.
 */
export function getTierOrdinal(
  tier: string | null,
  tierConfig: TierConfig,
): number | null {
  if (tier === null) return null;
  const idx = tierConfig.tiers.indexOf(tier);
  return idx >= 0 ? idx : null;
}

/**
 * Returns the display label for a tier, falling back to the tier identifier.
 */
export function getTierLabel(tier: string, tierConfig: TierConfig): string {
  return tierConfig.labels?.[tier] ?? tier;
}

/**
 * Returns the midpoint ordinal for unrated players.
 * Used as a stand-in value when an unrated player's tier must be estimated.
 */
export function getUnratedMidpoint(tierConfig: TierConfig): number {
  return (tierConfig.tiers.length - 1) / 2;
}

// ── Bulk-paste parser ────────────────────────────────────────────────────────

export interface ParsedPlayerLine {
  valid: boolean;
  name: string;
  tier: string | null;
  displayMessage: string;
}

/**
 * Parses a single line from the bulk-paste input.
 *
 * Rules (from spec §3):
 * - Last token parsed as tier if it matches a configured tier name (case-insensitive)
 * - Single-char token that looks like a tier attempt but isn't → error
 * - Otherwise entire line = name, tier = null (unrated, valid)
 */
export function parsePlayerLine(
  line: string,
  tierConfig: TierConfig,
): ParsedPlayerLine {
  const trimmed = line.trim();
  const parts = trimmed.split(/\s+/);
  const lastToken = parts[parts.length - 1];

  const matchedTier = tierConfig.tiers.find(
    (t) => t.toLowerCase() === lastToken.toLowerCase(),
  );

  if (matchedTier) {
    if (parts.length === 1) {
      // Single token that coincidentally matches a tier name → treat as name, unrated
      return {
        valid: true,
        name: trimmed,
        tier: null,
        displayMessage: `✓ ${trimmed} — Unrated`,
      };
    }
    const name = parts.slice(0, -1).join(" ");
    return {
      valid: true,
      name,
      tier: matchedTier,
      displayMessage: `✓ ${name} — Tier ${matchedTier}`,
    };
  }

  // Single-letter token not in tier list → likely a typo; show a clear error
  if (/^[A-Za-z]$/.test(lastToken) && parts.length >= 2) {
    const name = parts.slice(0, -1).join(" ");
    return {
      valid: false,
      name,
      tier: null,
      displayMessage: `✗ ${name} — Tier '${lastToken}' not recognized`,
    };
  }

  // Whole line = player name, tier = null (unrated)
  return {
    valid: true,
    name: trimmed,
    tier: null,
    displayMessage: `✓ ${trimmed} — Unrated`,
  };
}

/**
 * Parses multi-line bulk-paste input, skipping blank lines.
 * Returns one ParsedPlayerLine per non-empty line.
 */
export function parseBulkInput(
  input: string,
  tierConfig: TierConfig,
): ParsedPlayerLine[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => parsePlayerLine(line, tierConfig));
}
