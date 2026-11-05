// Daily statistics (SPEC 9.1). A finished daily is counted exactly once: recording the same
// puzzle again, as happens on every reload of a finished game, changes nothing.

import type { Game } from "./game";

export interface Stats {
  played: number;
  wins: number;
  /** Consecutive daily wins up to lastCountedPuzzle. Read it through streakAsOf(). */
  currentStreak: number;
  maxStreak: number;
  /** The last daily puzzle counted. Puzzles at or before it are never counted again. */
  lastCountedPuzzle: number | null;
  /** distribution[n - 1] = daily wins in n guesses. */
  distribution: number[];
}

export const EMPTY_STATS: Readonly<Stats> = Object.freeze({
  played: 0,
  wins: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastCountedPuzzle: null,
  distribution: Object.freeze([]) as unknown as number[],
});

/** Stats with a finished daily game counted. Returns `stats` unchanged if there is nothing new. */
export function recordDailyResult(stats: Stats, game: Game): Stats {
  if (game.mode !== "daily" || game.puzzle === null || game.status === "in-progress") return stats;
  if (stats.lastCountedPuzzle !== null && game.puzzle <= stats.lastCountedPuzzle) return stats;

  const won = game.status === "won";
  // Yesterday's result was counted: build on its streak (0 after a loss, so a win makes 1).
  const continues = stats.lastCountedPuzzle === game.puzzle - 1;
  const currentStreak = won ? (continues ? stats.currentStreak + 1 : 1) : 0;
  const distribution = [...stats.distribution];
  if (won) {
    const slot = game.guessIds.length - 1;
    while (distribution.length <= slot) distribution.push(0);
    distribution[slot] = (distribution[slot] ?? 0) + 1;
  }
  return {
    played: stats.played + 1,
    wins: stats.wins + (won ? 1 : 0),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    lastCountedPuzzle: game.puzzle,
    distribution,
  };
}

/** The streak as it stands on `todayPuzzle`: a missed day ends it even before the next result. */
export function streakAsOf(stats: Stats, todayPuzzle: number): number {
  return stats.lastCountedPuzzle !== null && stats.lastCountedPuzzle >= todayPuzzle - 1
    ? stats.currentStreak
    : 0;
}

export function winPercent(stats: Stats): number {
  return stats.played === 0 ? 0 : Math.round((100 * stats.wins) / stats.played);
}
