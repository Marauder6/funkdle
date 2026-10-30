// Items still consistent with every feedback row so far (SPEC 8.2).

import type { FeedbackConfig } from "./config";
import { compare, feedbackKey } from "./compare";
import type { Feedback, Item } from "./types";

export function filterCandidates(
  pool: Item[],
  history: Array<[Item, Feedback]>,
  cfg: FeedbackConfig,
): Item[] {
  const seen = history.map(([guess, fb]) => [guess, feedbackKey(fb)] as const);
  return pool.filter((candidate) =>
    seen.every(([guess, key]) => feedbackKey(compare(guess, candidate, cfg)) === key),
  );
}
