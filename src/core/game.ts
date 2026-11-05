// The game as a pure state machine (SPEC 3.2): in progress, then won or lost. Every transition
// returns a new Game; nothing is mutated, so a saved game can be rebuilt by replaying its guesses.

import { compare } from "./compare";
import type { FeedbackConfig } from "./config";
import type { Feedback, Item } from "./types";

export type GameMode = "daily" | "unlimited";
export type GameStatus = "in-progress" | "won" | "lost";

export interface Game {
  mode: GameMode;
  /** Daily puzzle number; null in unlimited mode. */
  puzzle: number | null;
  targetId: string;
  /** In the order guessed. */
  guessIds: string[];
  limit: number;
  status: GameStatus;
}

export type GuessRejection = "game-over" | "unknown-item" | "already-guessed";

export type GuessOutcome =
  { ok: true; game: Game; feedback: Feedback } | { ok: false; reason: GuessRejection; game: Game };

export type ItemIndex = ReadonlyMap<string, Item>;

export function indexItems(items: Item[]): Map<string, Item> {
  return new Map(items.map((i) => [i.id, i]));
}

export function newGame(
  opts: { mode: GameMode; puzzle: number | null; targetId: string; limit: number },
  index: ItemIndex,
): Game {
  if (!index.has(opts.targetId)) throw new Error(`unknown target id "${opts.targetId}"`);
  if (!Number.isInteger(opts.limit) || opts.limit < 1) throw new Error(`bad limit ${opts.limit}`);
  if ((opts.mode === "daily") !== (opts.puzzle !== null)) {
    throw new Error("a daily game needs a puzzle number, and only a daily game has one");
  }
  return { ...opts, guessIds: [], status: "in-progress" };
}

/** Text that does not resolve to an item, a repeat guess, or a finished game is rejected. */
export function submitGuess(
  game: Game,
  guessId: string,
  index: ItemIndex,
  cfg: FeedbackConfig,
): GuessOutcome {
  if (game.status !== "in-progress") return { ok: false, reason: "game-over", game };
  const guess = index.get(guessId);
  if (!guess) return { ok: false, reason: "unknown-item", game };
  if (game.guessIds.includes(guessId)) return { ok: false, reason: "already-guessed", game };

  const target = index.get(game.targetId);
  if (!target) throw new Error(`unknown target id "${game.targetId}"`);
  const guessIds = [...game.guessIds, guessId];
  const status: GameStatus =
    guessId === game.targetId ? "won" : guessIds.length >= game.limit ? "lost" : "in-progress";
  return { ok: true, game: { ...game, guessIds, status }, feedback: compare(guess, target, cfg) };
}

/** Each guess with its feedback, oldest first. */
export function feedbackHistory(
  game: Game,
  index: ItemIndex,
  cfg: FeedbackConfig,
): Array<[Item, Feedback]> {
  const target = index.get(game.targetId);
  if (!target) throw new Error(`unknown target id "${game.targetId}"`);
  return game.guessIds.map((id) => {
    const guess = index.get(id);
    if (!guess) throw new Error(`unknown guess id "${id}"`);
    return [guess, compare(guess, target, cfg)];
  });
}

/**
 * Rebuilds a saved game by replaying its guesses on a fresh one. Stops at the first guess the
 * rules reject and says why, so the caller can report the bad save instead of hiding it.
 */
export function replayGame(
  fresh: Game,
  guessIds: readonly string[],
  index: ItemIndex,
  cfg: FeedbackConfig,
): { game: Game; problem: string | null } {
  let game = fresh;
  for (const [i, id] of guessIds.entries()) {
    const outcome = submitGuess(game, id, index, cfg);
    if (!outcome.ok) {
      // No id in the message: the rejected guess can be the answer, and this text gets logged.
      return { game, problem: `saved guess ${i + 1} rejected: ${outcome.reason}` };
    }
    game = outcome.game;
  }
  return { game, problem: null };
}

/** A random target for unlimited mode, avoiding the previous one when the pool allows. */
export function pickUnlimitedTarget(pool: Item[], rand: () => number, avoidId?: string): Item {
  const choices = pool.length > 1 && avoidId ? pool.filter((i) => i.id !== avoidId) : pool;
  const pick = choices[Math.floor(rand() * choices.length)];
  if (!pick) throw new Error("the target pool is empty");
  return pick;
}
