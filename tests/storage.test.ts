import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDBACK as cfg } from "../src/core/config";
import { indexItems, newGame, replayGame, submitGuess, type Game } from "../src/core/game";
import {
  DEFAULT_SETTINGS,
  EMPTY_STATS,
  GameStorage,
  KEY_PREFIX,
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
    storage.saveDaily(7, game.guessIds);
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
    storage.saveDaily(7, game.guessIds);

    expect([...data.keys()]).toEqual([`${KEY_PREFIX}daily:7`]);
    const fresh = newGame({ mode: "daily", puzzle: 7, targetId: "alarm-clock", limit: 6 }, index);
    const restored = replayGame(fresh, storage.loadDaily(7) ?? [], index, cfg);
    expect(restored.problem).toBeNull();
    expect(restored.game).toEqual(game);
  });

  it("round-trips unlimited games, stats and settings", () => {
    const storage = new GameStorage(memoryStore());
    storage.saveUnlimited({ targetId: "toaster", guessIds: ["desk-fan"] });
    expect(storage.loadUnlimited()).toEqual({ targetId: "toaster", guessIds: ["desk-fan"] });
    storage.clearUnlimited();
    expect(storage.loadUnlimited()).toBeNull();

    const stats = {
      ...EMPTY_STATS,
      played: 3,
      wins: 2,
      lastCountedPuzzle: 9,
      distribution: [0, 1, 1],
    };
    storage.saveStats(stats);
    expect(storage.loadStats()).toEqual(stats);
    storage.saveSettings({ colorBlind: true, motion: "reduce" });
    expect(storage.loadSettings()).toEqual({ colorBlind: true, motion: "reduce" });
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
