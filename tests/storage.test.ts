import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDBACK as cfg } from "../src/core/config";
import { indexItems, newGame, replayGame, submitGuess, type Game } from "../src/core/game";
import type { Stats } from "../src/core/stats";
import {
  DEFAULT_SETTINGS,
  EMPTY_STATS,
  GameStorage,
  KEY_PREFIX,
  LEGACY_GUESS_LIMIT,
  browserStore,
  memoryStore,
  type StorageLike,
  type StorageProblem,
} from "../src/storage/storage";
import { dataset } from "./fixtures";

const index = indexItems(dataset.items);

/** A localStorage stand-in that behaves like the real one, with switchable failures. */
function fakeStorage(fail: { get?: boolean; set?: boolean } = {}) {
  const data = new Map<string, string>();
  const quota = () => Object.assign(new Error("quota exceeded"), { name: "QuotaExceededError" });
  const storage: StorageLike = {
    getItem: (k) => {
      if (fail.get) throw quota();
      return data.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (fail.set) throw quota();
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
  return { storage, data };
}

function collector() {
  const problems: StorageProblem[] = [];
  return { problems, report: (p: StorageProblem) => void problems.push(p) };
}

/** Plays a whole daily game, saving after every guess as the app will. */
function playAndSave(storage: GameStorage): Game {
  let game = newGame({ mode: "daily", puzzle: 7, targetId: "alarm-clock", limit: 6 }, index);
  for (const id of ["desk-fan", "wakemaster-alarm-clock", "alarm-clock"]) {
    const outcome = submitGuess(game, id, index, cfg);
    if (!outcome.ok) throw new Error(outcome.reason);
    game = outcome.game;
    storage.saveDaily(7, { guessIds: game.guessIds, limit: game.limit });
  }
  return game;
}

describe("storage unavailable", () => {
  it("blocked site data: opening storage throws, the game still plays to the end", () => {
    const { problems, report } = collector();
    const store = browserStore(() => {
      throw Object.assign(new Error("access denied"), { name: "SecurityError" });
    }, report);
    const storage = new GameStorage(store, report);

    const game = playAndSave(storage);
    expect(game.status).toBe("won");
    expect(storage.loadDaily(7)).toBeNull();
    expect(storage.loadStats()).toEqual(EMPTY_STATS);
    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);

    // Reported, once, as degraded, and visible in health for the UI.
    expect(storage.health).toMatchObject({ state: "degraded" });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ severity: "degraded" });
    expect(problems[0]?.message).toMatch(/SecurityError/);
  });

  it("full storage: writes fail, the game still plays, the failure is reported", () => {
    const { problems, report } = collector();
    const { storage: fake } = fakeStorage({ set: true });
    const storage = new GameStorage(
      browserStore(() => fake, report),
      report,
    );
    expect(playAndSave(storage).status).toBe("won");
    expect(storage.health).toMatchObject({ state: "degraded" });
    expect(problems[0]?.message).toMatch(/QuotaExceededError/);
  });

  it("unreadable storage: reads fail and fall back to defaults, reported", () => {
    const { problems, report } = collector();
    const { storage: fake } = fakeStorage({ get: true });
    const storage = new GameStorage(
      browserStore(() => fake, report),
      report,
    );
    expect(storage.loadStats()).toEqual(EMPTY_STATS);
    expect(problems).toHaveLength(1);
  });
});

describe("storage available", () => {
  it("restores a game in progress by replaying the saved guesses", () => {
    const { storage: fake, data } = fakeStorage();
    const storage = new GameStorage(browserStore(() => fake));
    let game = newGame({ mode: "daily", puzzle: 7, targetId: "alarm-clock", limit: 6 }, index);
    const outcome = submitGuess(game, "desk-fan", index, cfg);
    if (!outcome.ok) throw new Error(outcome.reason);
    game = outcome.game;
    storage.saveDaily(7, { guessIds: game.guessIds, limit: game.limit });

    expect([...data.keys()]).toEqual([`${KEY_PREFIX}daily:7`]);
    const saved = storage.loadDaily(7);
    const fresh = newGame(
      { mode: "daily", puzzle: 7, targetId: "alarm-clock", limit: saved!.limit },
      index,
    );
    const restored = replayGame(fresh, saved!.guessIds, index, cfg);
    expect(restored.problem).toBeNull();
    expect(restored.game).toEqual(game);
  });

  it("round-trips unlimited games, stats and settings", () => {
    const storage = new GameStorage(memoryStore());
    storage.saveUnlimited({ targetId: "toaster", guessIds: ["desk-fan"], limit: 6 });
    expect(storage.loadUnlimited()).toEqual({
      targetId: "toaster",
      guessIds: ["desk-fan"],
      limit: 6,
    });
    storage.clearUnlimited();
    expect(storage.loadUnlimited()).toBeNull();

    const stats: Stats = {
      ...EMPTY_STATS,
      played: 3,
      wins: 2,
      currentStreak: 0,
      maxStreak: 2,
      lastCountedPuzzle: 9,
      distribution: [0, 1, 1],
    };
    storage.saveStats(stats);
    expect(storage.loadStats()).toEqual(stats);
    storage.saveSettings({ colorBlind: true, motion: "reduce", helpSeen: true });
    expect(storage.loadSettings()).toEqual({ colorBlind: true, motion: "reduce", helpSeen: true });
    expect(storage.health).toEqual({ state: "ok" });
  });

  it("ignores and reports a corrupt or wrongly shaped saved value", () => {
    const { problems, report } = collector();
    const store = memoryStore();
    store.set(`${KEY_PREFIX}stats`, "{not json");
    store.set(`${KEY_PREFIX}settings`, JSON.stringify({ colorBlind: "yes" }));
    const storage = new GameStorage(store, report);
    expect(storage.loadStats()).toEqual(EMPTY_STATS);
    expect(storage.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(problems.map((p) => p.severity)).toEqual(["violation", "violation"]);
  });

  it("does not let callers mutate the shared defaults", () => {
    const storage = new GameStorage(memoryStore());
    storage.loadStats().distribution.push(5);
    storage.loadSettings().colorBlind = true;
    expect(EMPTY_STATS.distribution).toEqual([]);
    expect(DEFAULT_SETTINGS.colorBlind).toBe(false);
  });
});

// Review 2026-11-05: games were saved as bare guess lists and replayed with whatever the limit was
// at load time, so raising the limit from 6 to 7 turned a lost game back into one in progress.
describe("saved games keep their guess limit", () => {
  it("round-trips the limit with the guesses", () => {
    const s = new GameStorage(memoryStore());
    s.saveDaily(3, { guessIds: ["desk-fan"], limit: 6 });
    expect(s.loadDaily(3)).toEqual({ guessIds: ["desk-fan"], limit: 6 });
  });

  it("reads saves written before the limit was stored as the launch limit, 6", () => {
    expect(LEGACY_GUESS_LIMIT).toBe(6);
    const store = memoryStore();
    store.set(`${KEY_PREFIX}daily:3`, JSON.stringify(["desk-fan"]));
    store.set(
      `${KEY_PREFIX}unlimited`,
      JSON.stringify({ targetId: "toaster", guessIds: ["fork"] }),
    );
    const s = new GameStorage(store);
    expect(s.loadDaily(3)).toEqual({ guessIds: ["desk-fan"], limit: 6 });
    expect(s.loadUnlimited()).toEqual({ targetId: "toaster", guessIds: ["fork"], limit: 6 });
  });

  it("rejects a saved limit that is not a positive whole number", () => {
    const { problems, report } = collector();
    const store = memoryStore();
    store.set(`${KEY_PREFIX}daily:3`, JSON.stringify({ guessIds: [], limit: 0 }));
    store.set(`${KEY_PREFIX}daily:4`, JSON.stringify({ guessIds: [], limit: "6" }));
    const s = new GameStorage(store, report);
    expect(s.loadDaily(3)).toBeNull();
    expect(s.loadDaily(4)).toBeNull();
    expect(problems).toHaveLength(2);
  });
});

// Review 2026-11-05: stats were checked field by field, so "5 wins out of 1 played" showed 500%,
// and a 300,000-entry distribution crashed the stats dialog.
describe("stats must be self-consistent to be loaded", () => {
  const good: Stats = {
    played: 3,
    wins: 2,
    currentStreak: 1,
    maxStreak: 2,
    lastCountedPuzzle: 9,
    distribution: [0, 1, 1],
  };
  const cases: Array<[string, Partial<Stats>]> = [
    ["more wins than games", { wins: 5, distribution: [0, 4, 1] }],
    ["distribution does not add up to wins", { distribution: [0, 2, 1] }],
    ["current streak above max streak", { currentStreak: 3, maxStreak: 2 }],
    ["max streak above wins", { maxStreak: 3 }],
    ["wins but no streak ever", { currentStreak: 0, maxStreak: 0 }],
    ["games played but no puzzle counted", { lastCountedPuzzle: null }],
    [
      "a puzzle counted but no games",
      { played: 0, wins: 0, currentStreak: 0, maxStreak: 0, distribution: [] },
    ],
    ["an absurdly long distribution", { distribution: [...Array(299_998).fill(0), 1, 1] }],
  ];

  it("accepts consistent stats", () => {
    const s = new GameStorage(memoryStore());
    s.saveStats(good);
    expect(s.loadStats()).toEqual(good);
  });

  for (const [name, change] of cases) {
    it(`rejects ${name}`, () => {
      const { problems, report } = collector();
      const store = memoryStore();
      store.set(`${KEY_PREFIX}stats`, JSON.stringify({ ...good, ...change }));
      expect(new GameStorage(store, report).loadStats()).toEqual(EMPTY_STATS);
      expect(problems).toHaveLength(1);
      expect(problems[0]?.severity).toBe("violation");
    });
  }
});

describe("problem reports never echo saved content", () => {
  it("does not quote a broken saved value, which could hold the answer", () => {
    const { problems, report } = collector();
    const store = memoryStore();
    // A value that starts with an unexpected token makes V8 quote its first characters:
    // `Unexpected token 'c', "cracked-de"... is not valid JSON`.
    store.set(`${KEY_PREFIX}unlimited`, "cracked-deathclaw-egg");
    new GameStorage(store, report).loadUnlimited();
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).not.toContain("cracked");
  });
});
