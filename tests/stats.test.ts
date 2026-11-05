import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDBACK as cfg } from "../src/core/config";
import { indexItems, newGame, submitGuess, type Game } from "../src/core/game";
import {
  EMPTY_STATS,
  recordDailyResult,
  streakAsOf,
  winPercent,
  type Stats,
} from "../src/core/stats";
import { GameStorage, memoryStore } from "../src/storage/storage";
import { dataset } from "./fixtures";

const index = indexItems(dataset.items);

function finished(puzzle: number, guesses: string[], mode: "daily" | "unlimited" = "daily"): Game {
  let game = newGame(
    { mode, puzzle: mode === "daily" ? puzzle : null, targetId: "alarm-clock", limit: 6 },
    index,
  );
  for (const id of guesses) {
    const outcome = submitGuess(game, id, index, cfg);
    if (!outcome.ok) throw new Error(outcome.reason);
    game = outcome.game;
  }
  return game;
}

const WIN_IN_2 = ["desk-fan", "alarm-clock"];
const LOSS = ["desk-fan", "toaster", "typewriter", "fork", "pen", "wakemaster-alarm-clock"];

describe("recordDailyResult", () => {
  it("counts a win once, however many times it is recorded (reloads)", () => {
    const game = finished(5, WIN_IN_2);
    const once = recordDailyResult({ ...EMPTY_STATS }, game);
    const again = recordDailyResult(once, game);
    const thrice = recordDailyResult(again, game);
    expect(once).toEqual({
      played: 1,
      wins: 1,
      currentStreak: 1,
      maxStreak: 1,
      lastCountedPuzzle: 5,
      distribution: [0, 1],
    });
    expect(again).toBe(once);
    expect(thrice).toBe(once);
  });

  it("survives a real reload: stats saved, game rebuilt, recorded again, unchanged", () => {
    const store = memoryStore();
    const game = finished(5, WIN_IN_2);
    new GameStorage(store).saveStats(recordDailyResult(new GameStorage(store).loadStats(), game));
    const reloaded = new GameStorage(store);
    const after = recordDailyResult(reloaded.loadStats(), game);
    expect(after).toEqual(reloaded.loadStats());
    expect(after.played).toBe(1);
  });

  it("ignores games in progress and unlimited games", () => {
    expect(recordDailyResult({ ...EMPTY_STATS }, finished(5, ["desk-fan"]))).toEqual(EMPTY_STATS);
    expect(recordDailyResult({ ...EMPTY_STATS }, finished(5, WIN_IN_2, "unlimited"))).toEqual(
      EMPTY_STATS,
    );
  });

  it("counts a loss and ends the streak", () => {
    let s: Stats = recordDailyResult({ ...EMPTY_STATS }, finished(1, WIN_IN_2));
    s = recordDailyResult(s, finished(2, ["alarm-clock"]));
    expect(s.currentStreak).toBe(2);
    s = recordDailyResult(s, finished(3, LOSS));
    expect(s).toMatchObject({ played: 3, wins: 2, currentStreak: 0, maxStreak: 2 });
    expect(s.distribution).toEqual([1, 1]);
  });

  it("restarts the streak after a missed day", () => {
    let s: Stats = recordDailyResult({ ...EMPTY_STATS }, finished(1, WIN_IN_2));
    s = recordDailyResult(s, finished(3, WIN_IN_2));
    expect(s).toMatchObject({ currentStreak: 1, maxStreak: 1 });
  });

  it("never counts an earlier puzzle after a later one (clock moved back)", () => {
    const s = recordDailyResult({ ...EMPTY_STATS }, finished(10, WIN_IN_2));
    expect(recordDailyResult(s, finished(9, WIN_IN_2))).toBe(s);
  });
});

describe("streakAsOf and winPercent", () => {
  const s = recordDailyResult({ ...EMPTY_STATS }, finished(7, WIN_IN_2));

  it("keeps the streak on the day of the win and the next day, drops it after a missed day", () => {
    expect(streakAsOf(s, 7)).toBe(1);
    expect(streakAsOf(s, 8)).toBe(1);
    expect(streakAsOf(s, 9)).toBe(0);
  });

  it("rounds the win percentage and handles no games", () => {
    expect(winPercent(EMPTY_STATS)).toBe(0);
    expect(winPercent({ ...EMPTY_STATS, played: 3, wins: 2 })).toBe(67);
  });
});
