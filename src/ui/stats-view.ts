// The stats dialog's content (SPEC 9.1): games played, win percentage, streaks and the guess
// distribution, for daily puzzles only.

import { streakAsOf, winPercent, type Stats } from "../core/stats";
import { h } from "./dom";

export function statsContent(
  stats: Stats,
  todayPuzzle: number | null,
  limit: number,
  /** Guesses in today's win, highlighted in the distribution. */
  todayWin: number | null,
): Node[] {
  const streak = todayPuzzle === null ? stats.currentStreak : streakAsOf(stats, todayPuzzle);
  const figure = (value: string, label: string) =>
    h(
      "div",
      { class: "figure" },
      h("span", { class: "figure-value" }, value),
      h("span", {}, label),
    );

  const rows = Math.max(limit, stats.distribution.length);
  // reduce, not Math.max(...spread): a huge array would overflow the call stack.
  const most = stats.distribution.reduce((a, b) => Math.max(a, b), 1);
  const bars = Array.from({ length: rows }, (_, i) => {
    const count = stats.distribution[i] ?? 0;
    const today = todayWin === i + 1;
    const bar = h("span", { class: "dist-bar", "aria-hidden": "true" }, String(count));
    // Through the CSSOM, not a style attribute: the Content-Security-Policy blocks those.
    bar.style.width = `${Math.max(8, Math.round((100 * count) / most))}%`;
    return h(
      "li",
      { class: today ? "today" : null },
      h("span", { class: "dist-label", "aria-hidden": "true" }, String(i + 1)),
      bar,
      h(
        "span",
        { class: "sr-only" },
        `${i + 1} ${i === 0 ? "guess" : "guesses"}: ${count} ${count === 1 ? "win" : "wins"}` +
          (today ? ", including today" : ""),
      ),
    );
  });

  return [
    h(
      "div",
      { class: "figures" },
      figure(String(stats.played), "Played"),
      figure(`${winPercent(stats)}%`, "Win %"),
      figure(String(streak), "Current streak"),
      figure(String(stats.maxStreak), "Max streak"),
    ),
    h("h3", {}, "Guess distribution"),
    stats.wins === 0
      ? h("p", { class: "muted" }, "No daily wins yet.")
      : h("ol", { class: "distribution" }, ...bars),
    h("p", { class: "muted" }, "Stats count daily puzzles only."),
  ];
}
