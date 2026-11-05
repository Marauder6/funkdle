// Share text (SPEC 9.2): "Funkdle #<n> <guesses>/<limit>" (X on a loss), one line of squares per
// guess in column order, then the URL. No item names, so it never spoils the answer.

import type { Game } from "./game";
import type { CellState, Feedback } from "./types";

export type SharePalette = "standard" | "colorblind";

const SQUARES: Record<SharePalette, Record<CellState, string>> = {
  standard: { match: "\u{1F7E9}", close: "\u{1F7E8}", miss: "⬛" },
  colorblind: { match: "\u{1F7E6}", close: "\u{1F7E7}", miss: "⬛" },
};

/** Squares for one guess, in table order: weight, value, components, total, types, origin. */
export function shareLine(fb: Feedback, palette: SharePalette = "standard"): string {
  const sq = SQUARES[palette];
  return [fb.weight, fb.value, fb.components, fb.total, fb.unique, fb.origin]
    .map((cell) => sq[cell.state])
    .join("");
}

/** `feedback` is the game's history, oldest first. Only a finished daily game can be shared. */
export function shareText(
  game: Game,
  feedback: Feedback[],
  url: string,
  palette: SharePalette = "standard",
): string {
  if (game.mode !== "daily" || game.puzzle === null || game.status === "in-progress") {
    throw new Error("only a finished daily game can be shared");
  }
  const score = game.status === "won" ? String(game.guessIds.length) : "X";
  return [
    `Funkdle #${game.puzzle} ${score}/${game.limit}`,
    ...feedback.map((fb) => shareLine(fb, palette)),
    url,
  ].join("\n");
}
