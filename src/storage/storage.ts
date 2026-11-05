// Persistence behind an interface (SPEC 8.3). Keys are prefixed "funkdle:v1:". Every read and
// write is guarded: when storage is unavailable (private windows, blocked site data) the game
// stays fully playable and only forgets, and the failure is reported, never swallowed.
//
// No DOM types here: the browser adapter takes anything shaped like Storage, so this module is
// type-checked and tested without a DOM.

import { EMPTY_STATS, type Stats } from "../core/stats";

export const KEY_PREFIX = "funkdle:v1:";

/** The parts of the Web Storage API this module uses. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** "degraded": the world failed (storage blocked or full). "violation": we wrote something we cannot read back. */
export interface StorageProblem {
  severity: "degraded" | "violation";
  message: string;
}

export type StorageHealth = { state: "ok" } | { state: "degraded"; reason: string };

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  readonly health: StorageHealth;
}

export type Reporter = (problem: StorageProblem) => void;

export const consoleReporter: Reporter = (p) =>
  console.warn(`[funkdle storage ${p.severity}] ${p.message}`);

export function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => void data.set(key, value),
    remove: (key) => void data.delete(key),
    health: { state: "ok" },
  };
}

/**
 * Wraps browser storage. `open` is called lazily because merely touching `window.localStorage`
 * can throw (SecurityError) when site data is blocked.
 */
export function browserStore(
  open: () => StorageLike,
  report: Reporter = consoleReporter,
): KeyValueStore {
  let storage: StorageLike | null = null;
  let health: StorageHealth = { state: "ok" };
  const reported = new Set<string>();

  const fail = (action: string, err: unknown): null => {
    const reason = `${action} failed: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`;
    health = { state: "degraded", reason };
    if (!reported.has(reason)) {
      reported.add(reason);
      report({ severity: "degraded", message: `${reason}. Progress will not be saved.` });
    }
    return null;
  };
  const backing = (): StorageLike | null => {
    if (storage) return storage;
    try {
      storage = open();
      return storage;
    } catch (err) {
      return fail("opening storage", err);
    }
  };

  return {
    get(key) {
      const s = backing();
      if (!s) return null;
      try {
        return s.getItem(key);
      } catch (err) {
        return fail(`reading ${key}`, err);
      }
    },
    set(key, value) {
      const s = backing();
      if (!s) return;
      try {
        s.setItem(key, value);
      } catch (err) {
        fail(`writing ${key}`, err);
      }
    },
    remove(key) {
      const s = backing();
      if (!s) return;
      try {
        s.removeItem(key);
      } catch (err) {
        fail(`removing ${key}`, err);
      }
    },
    get health() {
      return health;
    },
  };
}

/** A game's guesses and the guess limit it was played under, so a later limit change cannot
 *  reopen a lost game or end one early. */
export interface SavedGame {
  guessIds: string[];
  limit: number;
}

export interface SavedUnlimited extends SavedGame {
  targetId: string;
}

/** Saves from before the limit was stored (launch day, 2026-11-05) were played with 6 guesses. */
export const LEGACY_GUESS_LIMIT = 6;

/** No limit will ever be this high; a longer stats distribution is corrupt. */
const MAX_DISTRIBUTION = 50;

export { EMPTY_STATS, type Stats };

export interface Settings {
  colorBlind: boolean;
  /** "system" follows prefers-reduced-motion. */
  motion: "system" | "reduce";
  /** The help dialog has been shown once, so it no longer opens by itself. */
  helpSeen: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  colorBlind: false,
  motion: "system",
  helpSeen: false,
});

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isLimit = (v: unknown): v is number =>
  Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_DISTRIBUTION;

/** Current form, or the launch-day form: a bare list of guess ids. */
function asSavedGame(v: unknown): SavedGame | null {
  if (isStringArray(v)) return { guessIds: v, limit: LEGACY_GUESS_LIMIT };
  if (isRecord(v) && isStringArray(v.guessIds) && isLimit(v.limit)) {
    return { guessIds: v.guessIds, limit: v.limit };
  }
  return null;
}

function asSavedUnlimited(v: unknown): SavedUnlimited | null {
  if (!isRecord(v) || typeof v.targetId !== "string" || !isStringArray(v.guessIds)) return null;
  if (v.limit === undefined)
    return { targetId: v.targetId, guessIds: v.guessIds, limit: LEGACY_GUESS_LIMIT };
  return isLimit(v.limit) ? { targetId: v.targetId, guessIds: v.guessIds, limit: v.limit } : null;
}

/** Shape and meaning: every field a count, and the fields agree with each other. */
const isStats = (v: unknown): v is Stats => {
  if (
    !isRecord(v) ||
    !isCount(v.played) ||
    !isCount(v.wins) ||
    !isCount(v.currentStreak) ||
    !isCount(v.maxStreak) ||
    !(v.lastCountedPuzzle === null || Number.isInteger(v.lastCountedPuzzle)) ||
    !Array.isArray(v.distribution) ||
    v.distribution.length > MAX_DISTRIBUTION ||
    !v.distribution.every(isCount)
  ) {
    return false;
  }
  const distributed = (v.distribution as number[]).reduce((a, b) => a + b, 0);
  return (
    v.wins <= v.played &&
    distributed === v.wins &&
    v.currentStreak <= v.maxStreak &&
    v.maxStreak <= v.wins &&
    (v.wins === 0) === (v.maxStreak === 0) &&
    (v.played === 0) === (v.lastCountedPuzzle === null)
  );
};

const isSettings = (v: unknown): v is Settings =>
  isRecord(v) &&
  typeof v.colorBlind === "boolean" &&
  (v.motion === "system" || v.motion === "reduce") &&
  typeof v.helpSeen === "boolean";

/** Typed access to everything the game saves. */
export class GameStorage {
  constructor(
    private readonly store: KeyValueStore,
    private readonly report: Reporter = consoleReporter,
  ) {}

  get health(): StorageHealth {
    return this.store.health;
  }

  /** Parses and converts a saved value; `convert` returns null for anything it does not accept. */
  private read<T>(key: string, convert: (v: unknown) => T | null): T | null {
    const raw = this.store.get(KEY_PREFIX + key);
    if (raw === null) return null;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      // The parser's message quotes the start of the text, which can be an answer id: leave it out.
      this.report({
        severity: "violation",
        message: `saved "${key}" is not valid JSON and was ignored`,
      });
      return null;
    }
    const converted = convert(value);
    if (converted === null) {
      this.report({
        severity: "violation",
        message: `saved "${key}" has an unexpected shape or inconsistent values and was ignored`,
      });
    }
    return converted;
  }

  private readValid<T>(key: string, valid: (v: unknown) => v is T): T | null {
    return this.read(key, (v) => (valid(v) ? v : null));
  }

  private write(key: string, value: unknown): void {
    this.store.set(KEY_PREFIX + key, JSON.stringify(value));
  }

  loadDaily(puzzle: number): SavedGame | null {
    return this.read(`daily:${puzzle}`, asSavedGame);
  }
  saveDaily(puzzle: number, game: SavedGame): void {
    this.write(`daily:${puzzle}`, { guessIds: game.guessIds, limit: game.limit });
  }

  loadUnlimited(): SavedUnlimited | null {
    return this.read("unlimited", asSavedUnlimited);
  }
  saveUnlimited(game: SavedUnlimited): void {
    this.write("unlimited", {
      targetId: game.targetId,
      guessIds: game.guessIds,
      limit: game.limit,
    });
  }
  clearUnlimited(): void {
    this.store.remove(KEY_PREFIX + "unlimited");
  }

  loadStats(): Stats {
    return this.readValid("stats", isStats) ?? { ...EMPTY_STATS, distribution: [] };
  }
  saveStats(stats: Stats): void {
    this.write("stats", stats);
  }

  loadSettings(): Settings {
    return this.readValid("settings", isSettings) ?? { ...DEFAULT_SETTINGS };
  }
  saveSettings(settings: Settings): void {
    this.write("settings", settings);
  }
}
