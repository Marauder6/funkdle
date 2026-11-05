import { describe, expect, it } from "vitest";
import { isSolved } from "../src/core/compare";
import { DEFAULT_FEEDBACK as cfg } from "../src/core/config";
import {
  feedbackHistory,
  indexItems,
  newGame,
  pickUnlimitedTarget,
  replayGame,
  submitGuess,
  type Game,
} from "../src/core/game";
import { prng } from "../scripts/lib/stats";
import { dataset } from "./fixtures";

const index = indexItems(dataset.items);
const pool = dataset.items.filter((i) => i.inTargetPool);
const start = (limit = 6) =>
  newGame({ mode: "daily", puzzle: 1, targetId: "alarm-clock", limit }, index);

function play(game: Game, ids: string[]): Game {
  for (const id of ids) {
    const outcome = submitGuess(game, id, index, cfg);
    if (!outcome.ok) throw new Error(`${id}: ${outcome.reason}`);
    game = outcome.game;
  }
  return game;
}

describe("game state machine", () => {
  it("plays the SPEC 4.4 worked example to a win", () => {
    let game = start();
    const first = submitGuess(game, "desk-fan", index, cfg);
    expect(first.ok && first.feedback.total).toEqual({ state: "close", direction: "lower" });
    game = play(game, ["desk-fan", "wakemaster-alarm-clock"]);
    expect(game.status).toBe("in-progress");
    const last = submitGuess(game, "alarm-clock", index, cfg);
    expect(last.ok).toBe(true);
    expect(last.game.status).toBe("won");
    expect(last.ok && isSolved(last.feedback)).toBe(true);
    expect(last.game.guessIds).toEqual(["desk-fan", "wakemaster-alarm-clock", "alarm-clock"]);
  });

  it("is lost when the limit is reached without the target", () => {
    const game = play(start(3), ["desk-fan", "toaster", "typewriter"]);
    expect(game.status).toBe("lost");
  });

  it("is won, not lost, when the last allowed guess is the target", () => {
    expect(play(start(2), ["desk-fan", "alarm-clock"]).status).toBe("won");
  });

  it("rejects an unknown item, a repeat, and any guess after the game ends", () => {
    const game = play(start(), ["desk-fan"]);
    expect(submitGuess(game, "fusion-core", index, cfg)).toMatchObject({
      ok: false,
      reason: "unknown-item",
    });
    expect(submitGuess(game, "desk-fan", index, cfg)).toMatchObject({
      ok: false,
      reason: "already-guessed",
    });
    const won = play(game, ["alarm-clock"]);
    expect(submitGuess(won, "toaster", index, cfg)).toMatchObject({
      ok: false,
      reason: "game-over",
    });
  });

  it("never mutates the game it was given", () => {
    const game = start();
    const before = JSON.stringify(game);
    submitGuess(game, "desk-fan", index, cfg);
    expect(JSON.stringify(game)).toBe(before);
  });

  it("refuses bad setups", () => {
    expect(() =>
      newGame({ mode: "daily", puzzle: 1, targetId: "nope", limit: 6 }, index),
    ).toThrow();
    expect(() =>
      newGame({ mode: "daily", puzzle: 1, targetId: "alarm-clock", limit: 0 }, index),
    ).toThrow();
    expect(() =>
      newGame({ mode: "unlimited", puzzle: 3, targetId: "alarm-clock", limit: 6 }, index),
    ).toThrow();
    expect(() =>
      newGame({ mode: "daily", puzzle: null, targetId: "alarm-clock", limit: 6 }, index),
    ).toThrow();
  });

  it("gives the feedback history oldest first", () => {
    const game = play(start(), ["desk-fan", "wakemaster-alarm-clock"]);
    const history = feedbackHistory(game, index, cfg);
    expect(history.map(([item]) => item.id)).toEqual(["desk-fan", "wakemaster-alarm-clock"]);
    expect(history[1]?.[1].components.state).toBe("match");
  });
});

describe("replayGame", () => {
  it("rebuilds a saved game exactly", () => {
    const original = play(start(), ["desk-fan", "wakemaster-alarm-clock"]);
    const { game, problem } = replayGame(start(), original.guessIds, index, cfg);
    expect(problem).toBeNull();
    expect(game).toEqual(original);
  });

  it("stops at a bad saved guess and says why", () => {
    const { game, problem } = replayGame(
      start(),
      ["desk-fan", "no-such-item", "toaster"],
      index,
      cfg,
    );
    expect(game.guessIds).toEqual(["desk-fan"]);
    expect(problem).toMatch(/guess 2 .*unknown-item/);
  });
});

describe("pickUnlimitedTarget", () => {
  it("picks from the pool and avoids the previous target", () => {
    const rand = prng(3);
    for (let i = 0; i < 200; i++) {
      const pick = pickUnlimitedTarget(pool, rand, "alarm-clock");
      expect(pick.inTargetPool).toBe(true);
      expect(pick.id).not.toBe("alarm-clock");
    }
  });

  it("refuses an empty pool", () => {
    expect(() => pickUnlimitedTarget([], prng(1))).toThrow();
  });
});
