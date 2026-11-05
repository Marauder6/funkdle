// Persistence behind an interface (SPEC 8.3). Keys are prefixed "funkdle:v1:". Every read and
// write is guarded: when storage is unavailable (private windows, blocked site data) the game
// stays fully playable and only forgets, and the failure is reported, never swallowed.
//
// No DOM types here: the browser adapter takes anything shaped like Storage, so this module is
// type-checked and tested without a DOM.

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

export interface SavedUnlimited {
  targetId: string;
  guessIds: string[];
}

export interface Stats {
  played: number;
  wins: number;
  currentStreak: number;
  maxStreak: number;
  /** Last daily puzzle whose result was counted, so a result is counted exactly once (SPEC 11, Phase 4). */
  lastCountedPuzzle: number | null;
  /** distribution[n - 1] = daily wins in n guesses. */
  distribution: number[];
}

export interface Settings {
  colorBlind: boolean;
  /** "system" follows prefers-reduced-motion. */
  motion: "system" | "reduce";
}

export const EMPTY_STATS: Stats = {
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastCountedPuzzle: null,
  distribution: [],
};

export const DEFAULT_SETTINGS: Settings = { colorBlind: false, motion: "system" };

const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isSavedUnlimited = (v: unknown): v is SavedUnlimited =>
  isRecord(v) && typeof v.targetId === "string" && isStringArray(v.guessIds);

const isStats = (v: unknown): v is Stats =>
  isRecord(v) &&
  isCount(v.played) &&
  isCount(v.wins) &&
  isCount(v.currentStreak) &&
  isCount(v.maxStreak) &&
  (v.lastCountedPuzzle === null || Number.isInteger(v.lastCountedPuzzle)) &&
  Array.isArray(v.distribution) &&
  v.distribution.every(isCount);

const isSettings = (v: unknown): v is Settings =>
  isRecord(v) &&
  typeof v.colorBlind === "boolean" &&
  (v.motion === "system" || v.motion === "reduce");

/** Typed access to everything the game saves. */
export class GameStorage {
  constructor(
    private readonly store: KeyValueStore,
    private readonly report: Reporter = consoleReporter,
  ) {}

  get health(): StorageHealth {
    return this.store.health;
  }

  private read<T>(key: string, valid: (v: unknown) => v is T): T | null {
    const raw = this.store.get(KEY_PREFIX + key);
    if (raw === null) return null;
    try {
      const value: unknown = JSON.parse(raw);
      if (valid(value)) return value;
      this.report({
        severity: "violation",
        message: `saved "${key}" has an unexpected shape and was ignored`,
      });
    } catch (err) {
      this.report({
        severity: "violation",
        message: `saved "${key}" is not valid JSON and was ignored (${String(err)})`,
      });
    }
    return null;
  }

  private write(key: string, value: unknown): void {
    this.store.set(KEY_PREFIX + key, JSON.stringify(value));
  }

  loadDaily(puzzle: number): string[] | null {
    return this.read(`daily:${puzzle}`, isStringArray);
  }
  saveDaily(puzzle: number, guessIds: readonly string[]): void {
    this.write(`daily:${puzzle}`, guessIds);
  }

  loadUnlimited(): SavedUnlimited | null {
    return this.read("unlimited", isSavedUnlimited);
  }
  saveUnlimited(game: SavedUnlimited): void {
    this.write("unlimited", { targetId: game.targetId, guessIds: game.guessIds });
  }
  clearUnlimited(): void {
    this.store.remove(KEY_PREFIX + "unlimited");
  }

  loadStats(): Stats {
    return this.read("stats", isStats) ?? { ...EMPTY_STATS, distribution: [] };
  }
  saveStats(stats: Stats): void {
    this.write("stats", stats);
  }

  loadSettings(): Settings {
    return this.read("settings", isSettings) ?? { ...DEFAULT_SETTINGS };
  }
  saveSettings(settings: Settings): void {
    this.write("settings", settings);
  }
}
