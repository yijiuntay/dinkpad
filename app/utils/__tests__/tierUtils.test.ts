import { describe, it, expect } from "vitest";
import {
  DEFAULT_TIER_CONFIGS,
  DEFAULT_TIER_CONFIG,
  getTierOrdinal,
  getTierLabel,
  getUnratedMidpoint,
  parsePlayerLine,
  parseBulkInput,
} from "../tierUtils";
import type { TierConfig } from "../../types";

const t4: TierConfig = { tiers: ["D", "C", "B", "A"], tierCount: 4 };
const t3: TierConfig = { tiers: ["C", "B", "A"], tierCount: 3 };
const t5: TierConfig = { tiers: ["E", "D", "C", "B", "A"], tierCount: 5 };

// ── DEFAULT_TIER_CONFIGS ─────────────────────────────────────────────────────

describe("DEFAULT_TIER_CONFIGS", () => {
  it("has entries for 3, 4, and 5", () => {
    expect(Object.keys(DEFAULT_TIER_CONFIGS)).toEqual(["3", "4", "5"]);
  });

  it("4-tier default matches spec", () => {
    expect(DEFAULT_TIER_CONFIG).toEqual({ tiers: ["D", "C", "B", "A"], tierCount: 4 });
  });

  it("tier counts match array lengths", () => {
    expect(DEFAULT_TIER_CONFIGS[3].tiers.length).toBe(3);
    expect(DEFAULT_TIER_CONFIGS[4].tiers.length).toBe(4);
    expect(DEFAULT_TIER_CONFIGS[5].tiers.length).toBe(5);
  });

  it("tiers are ordered lowest to highest (A is highest)", () => {
    expect(DEFAULT_TIER_CONFIGS[4].tiers[0]).toBe("D");
    expect(DEFAULT_TIER_CONFIGS[4].tiers[3]).toBe("A");
  });
});

// ── getTierOrdinal ───────────────────────────────────────────────────────────

describe("getTierOrdinal", () => {
  it("returns correct index for each tier", () => {
    expect(getTierOrdinal("D", t4)).toBe(0);
    expect(getTierOrdinal("C", t4)).toBe(1);
    expect(getTierOrdinal("B", t4)).toBe(2);
    expect(getTierOrdinal("A", t4)).toBe(3);
  });

  it("returns null for unrated (null tier)", () => {
    expect(getTierOrdinal(null, t4)).toBeNull();
  });

  it("returns null for a tier not in config", () => {
    expect(getTierOrdinal("Z", t4)).toBeNull();
  });

  it("works with 3-tier config", () => {
    expect(getTierOrdinal("C", t3)).toBe(0);
    expect(getTierOrdinal("A", t3)).toBe(2);
  });

  it("works with 5-tier config", () => {
    expect(getTierOrdinal("E", t5)).toBe(0);
    expect(getTierOrdinal("A", t5)).toBe(4);
  });
});

// ── getTierLabel ─────────────────────────────────────────────────────────────

describe("getTierLabel", () => {
  it("returns tier identifier when no labels configured", () => {
    expect(getTierLabel("A", t4)).toBe("A");
    expect(getTierLabel("D", t4)).toBe("D");
  });

  it("returns custom label when configured", () => {
    const withLabels: TierConfig = {
      ...t3,
      labels: { C: "Beginner", B: "Intermediate", A: "Advanced" },
    };
    expect(getTierLabel("C", withLabels)).toBe("Beginner");
    expect(getTierLabel("A", withLabels)).toBe("Advanced");
  });

  it("falls back to identifier for unlabelled tier", () => {
    const withPartialLabels: TierConfig = {
      ...t4,
      labels: { A: "Elite" },
    };
    expect(getTierLabel("A", withPartialLabels)).toBe("Elite");
    expect(getTierLabel("D", withPartialLabels)).toBe("D");
  });
});

// ── getUnratedMidpoint ───────────────────────────────────────────────────────

describe("getUnratedMidpoint", () => {
  it("is 1.5 for 4-tier config (D=0..A=3)", () => {
    expect(getUnratedMidpoint(t4)).toBe(1.5);
  });

  it("is 1 for 3-tier config", () => {
    expect(getUnratedMidpoint(t3)).toBe(1);
  });

  it("is 2 for 5-tier config", () => {
    expect(getUnratedMidpoint(t5)).toBe(2);
  });
});

// ── parsePlayerLine ──────────────────────────────────────────────────────────

describe("parsePlayerLine", () => {
  it("parses name + valid tier", () => {
    const r = parsePlayerLine("Alice A", t4);
    expect(r).toMatchObject({ valid: true, name: "Alice", tier: "A" });
    expect(r.displayMessage).toBe("✓ Alice — Tier A");
  });

  it("is case-insensitive for tier matching", () => {
    const lower = parsePlayerLine("Alice a", t4);
    expect(lower).toMatchObject({ valid: true, name: "Alice", tier: "A" });

    const upper = parsePlayerLine("Alice D", t4);
    expect(upper).toMatchObject({ valid: true, tier: "D" });
  });

  it("parses name with no tier as unrated", () => {
    const r = parsePlayerLine("Charlie", t4);
    expect(r).toMatchObject({ valid: true, name: "Charlie", tier: null });
    expect(r.displayMessage).toBe("✓ Charlie — Unrated");
  });

  it("parses multi-word name + tier", () => {
    const r = parsePlayerLine("Dana Smith B", t4);
    expect(r).toMatchObject({ valid: true, name: "Dana Smith", tier: "B" });
    expect(r.displayMessage).toBe("✓ Dana Smith — Tier B");
  });

  it("parses multi-word name with no tier", () => {
    const r = parsePlayerLine("John Doe", t4);
    expect(r).toMatchObject({ valid: true, name: "John Doe", tier: null });
    expect(r.displayMessage).toBe("✓ John Doe — Unrated");
  });

  it("shows error for unrecognized single-letter tier", () => {
    const r = parsePlayerLine("Eve Z", t4);
    expect(r).toMatchObject({ valid: false, name: "Eve", tier: null });
    expect(r.displayMessage).toBe("✗ Eve — Tier 'Z' not recognized");
  });

  it("error case is case-insensitive", () => {
    const r = parsePlayerLine("Eve z", t4);
    expect(r.valid).toBe(false);
    expect(r.displayMessage).toContain("'z' not recognized");
  });

  it("treats multi-word ending in a non-tier word as unrated (no error)", () => {
    // "Smith" is not a tier and is not a single letter → unrated, no error
    const r = parsePlayerLine("Alice Smith", t4);
    expect(r).toMatchObject({ valid: true, name: "Alice Smith", tier: null });
  });

  it("treats a single token matching a tier as unrated (not tier assignment)", () => {
    // "A" alone → player name is "A", tier is null
    const r = parsePlayerLine("A", t4);
    expect(r).toMatchObject({ valid: true, name: "A", tier: null });
    expect(r.displayMessage).toBe("✓ A — Unrated");
  });

  it("works with 3-tier config", () => {
    expect(parsePlayerLine("Alice A", t3)).toMatchObject({ valid: true, tier: "A" });
    expect(parsePlayerLine("Bob D", t3)).toMatchObject({ valid: false, name: "Bob" });
  });

  it("preserves tier canonical casing from config", () => {
    const customTiers: TierConfig = { tiers: ["beg", "int", "adv"], tierCount: 3 };
    const r = parsePlayerLine("Alice adv", customTiers);
    expect(r.tier).toBe("adv"); // canonical form from config
  });
});

// ── parseBulkInput ───────────────────────────────────────────────────────────

describe("parseBulkInput", () => {
  it("skips blank lines", () => {
    const result = parseBulkInput("Alice A\n\nBob C\n", t4);
    expect(result.length).toBe(2);
  });

  it("parses all valid lines", () => {
    const input = "Alice A\nBob C\nCharlie";
    const result = parseBulkInput(input, t4);
    expect(result[0]).toMatchObject({ name: "Alice", tier: "A" });
    expect(result[1]).toMatchObject({ name: "Bob", tier: "C" });
    expect(result[2]).toMatchObject({ name: "Charlie", tier: null });
  });

  it("includes error lines in output with valid=false", () => {
    const input = "Alice A\nEve Z\nBob C";
    const result = parseBulkInput(input, t4);
    expect(result[1].valid).toBe(false);
    expect(result[1].displayMessage).toContain("'Z' not recognized");
  });

  it("returns empty array for empty input", () => {
    expect(parseBulkInput("", t4)).toEqual([]);
    expect(parseBulkInput("   \n  \n", t4)).toEqual([]);
  });
});
