// Solver simulation (SPEC 6.3). Both players work from the same precomputed feedback matrix,
// built with core compare(), so game semantics cannot drift from the app.

import { compare, feedbackKey } from "../../src/core/compare";
import type { FeedbackConfig } from "../../src/core/config";
import type { Item } from "../../src/core/types";

export interface FeedbackMatrix {
  n: number;
  /** keys[g * n + t]: id of the feedback row for guess g against target t. */
  keys: Int32Array;
}

export function feedbackMatrix(items: Item[], cfg: FeedbackConfig): FeedbackMatrix {
  const n = items.length;
  const keys = new Int32Array(n * n);
  const ids = new Map<string, number>();
  for (let g = 0; g < n; g++) {
    for (let t = 0; t < n; t++) {
      const key = feedbackKey(compare(items[g]!, items[t]!, cfg));
      let id = ids.get(key);
      if (id === undefined) {
        id = ids.size;
        ids.set(key, id);
      }
      keys[g * n + t] = id;
    }
  }
  return { n, keys };
}

const narrow = (m: FeedbackMatrix, cands: number[], guess: number, target: number) => {
  const k = m.keys[guess * m.n + target];
  return cands.filter((c) => m.keys[guess * m.n + c] === k);
};

const all = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Guesses a uniformly random item consistent with all feedback so far. Returns guesses used. */
export function playConsistentRandom(
  m: FeedbackMatrix,
  target: number,
  rand: () => number,
): number {
  let cands = all(m.n);
  for (let turn = 1; ; turn++) {
    const guess = cands[Math.floor(rand() * cands.length)]!;
    if (guess === target) return turn;
    cands = narrow(m, cands, guess, target);
    // A wrong guess is always ruled out by its own feedback, unless it shares the target's
    // fingerprint, which a target-pool item never does.
    if (cands.includes(guess)) throw new NoProgressError(target, guess, cands.length);
  }
}

/** The candidate set stopped shrinking: the simulation would loop forever. */
export class NoProgressError extends Error {
  constructor(target: number, guess: number, remaining: number) {
    super(
      `no progress: guess #${guess} against target #${target} left ${remaining} candidates including itself`,
    );
  }
}

/**
 * The guess (from the whole guessable set) that minimizes the expected number of remaining
 * candidates. Ties go to a guess that could itself be the answer, then to the lowest index.
 */
export function greedyGuess(m: FeedbackMatrix, cands: number[]): number {
  if (cands.length === 1) return cands[0]!;
  const isCand = new Uint8Array(m.n);
  for (const c of cands) isCand[c] = 1;
  let best = -1;
  let bestScore = Infinity;
  const sizes = new Map<number, number>();
  for (let g = 0; g < m.n; g++) {
    sizes.clear();
    for (const c of cands) {
      const k = m.keys[g * m.n + c]!;
      sizes.set(k, (sizes.get(k) ?? 0) + 1);
    }
    let score = 0; // sum of squared part sizes = expected remaining x |cands|
    for (const s of sizes.values()) score += s * s;
    if (score < bestScore || (score === bestScore && isCand[g] && !isCand[best])) {
      best = g;
      bestScore = score;
    }
  }
  return best;
}

export function makeGreedyPlayer(m: FeedbackMatrix) {
  const memo = new Map<string, number>();
  const choose = (cands: number[]) => {
    const key = cands.join(",");
    let g = memo.get(key);
    if (g === undefined) {
      g = greedyGuess(m, cands);
      memo.set(key, g);
    }
    return g;
  };
  return {
    firstGuess: () => choose(all(m.n)),
    play(target: number): number {
      let cands = all(m.n);
      for (let turn = 1; ; turn++) {
        const guess = choose(cands);
        if (guess === target) return turn;
        const next = narrow(m, cands, guess, target);
        if (next.length === cands.length) throw new NoProgressError(target, guess, next.length);
        cands = next;
      }
    },
  };
}
