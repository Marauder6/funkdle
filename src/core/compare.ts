// Feedback for one guess against one target (SPEC 4). The single implementation used by the app,
// the audit and the simulation.

import type { FeedbackConfig, Tolerance } from "./config";
import {
  componentTypes,
  weightHundredths,
  type CellState,
  type ComponentChip,
  type Direction,
  type Feedback,
  type Item,
  type NumericCell,
} from "./types";

function direction(guess: number, target: number): NumericCell["direction"] {
  if (guess === target) return null;
  return target > guess ? "higher" : "lower";
}

/** SPEC 4.1: close <=> |guess - target| <= max(floor, ratio * target), inclusive. */
export function toleranceCell(guess: number, target: number, tol: Tolerance): NumericCell {
  const diff = Math.abs(guess - target);
  const state: CellState =
    diff === 0 ? "match" : diff <= Math.max(tol.floor, tol.ratio * target) ? "close" : "miss";
  return { state, direction: direction(guess, target) };
}

/** Close when within `within`; with within = 0 there is no close state (SPEC 4.3). */
export function bandCell(guess: number, target: number, within: number): NumericCell {
  const diff = Math.abs(guess - target);
  const state: CellState = diff === 0 ? "match" : diff <= within ? "close" : "miss";
  return { state, direction: direction(guess, target) };
}

export function compare(guess: Item, target: Item, cfg: FeedbackConfig): Feedback {
  const targetTypes = new Set(componentTypes(target));
  const chips: ComponentChip[] = componentTypes(guess).map((name) => ({
    name,
    quantity: guess.components[name] ?? 0,
    present: targetTypes.has(name),
  }));
  const presentCount = chips.filter((c) => c.present).length;
  const identical = presentCount === chips.length && chips.length === targetTypes.size;
  const componentState: CellState = identical ? "match" : presentCount > 0 ? "close" : "miss";

  return {
    weight: toleranceCell(weightHundredths(guess), weightHundredths(target), cfg.weight),
    value: toleranceCell(guess.value, target.value, cfg.value),
    components: { state: componentState, chips },
    total: bandCell(guess.totalComponents, target.totalComponents, cfg.totalCloseWithin),
    unique: bandCell(guess.uniqueComponents, target.uniqueComponents, 0),
    origin: { state: guess.origin === target.origin ? "match" : "miss" },
  };
}

/** Every cell is a match. With the unique-fingerprint target pool this means the guess is the target. */
export function isSolved(fb: Feedback): boolean {
  return (
    fb.weight.state === "match" &&
    fb.value.state === "match" &&
    fb.components.state === "match" &&
    fb.total.state === "match" &&
    fb.unique.state === "match" &&
    fb.origin.state === "match"
  );
}

/**
 * Everything a player can learn about the target from one feedback row, as a string. Two targets
 * give the same key for a guess exactly when that guess cannot tell them apart.
 */
export function feedbackKey(fb: Feedback): string {
  // One distinct symbol per value. Not first letters: "match" and "miss" share one.
  const num = (c: NumericCell) =>
    `${STATE_CODE[c.state]}${c.direction ? DIRECTION_CODE[c.direction] : ""}`;
  const chips = fb.components.chips.map((c) => (c.present ? "1" : "0")).join("");
  return [
    num(fb.weight),
    num(fb.value),
    STATE_CODE[fb.components.state],
    chips,
    num(fb.total),
    num(fb.unique),
    STATE_CODE[fb.origin.state],
  ].join("|");
}

const STATE_CODE: Record<CellState, string> = { match: "=", close: "~", miss: "x" };
const DIRECTION_CODE: Record<Direction, string> = { higher: "+", lower: "-" };
