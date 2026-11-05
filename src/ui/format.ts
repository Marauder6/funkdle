// Text for feedback cells: what is shown, the symbols that carry each state without colour, and
// the full sentence a screen reader hears (SPEC 4, 9.5). Pure, so it is unit-tested without a DOM.

import {
  componentTypes,
  type CellState,
  type Direction,
  type Feedback,
  type Item,
  type NumericCell,
  type Origin,
} from "../core/types";

export const ORIGIN_LABEL: Record<Origin, string> = {
  base: "Base game",
  "far-harbor": "Far Harbor",
  "nuka-world": "Nuka-World",
  "creation-club": "Creation Club",
};

export const STATE_SYMBOL: Record<CellState, string> = { match: "✓", close: "~", miss: "✗" };
export const DIRECTION_SYMBOL: Record<Direction, string> = { higher: "▲", lower: "▼" };

export const COLUMNS = ["weight", "value", "components", "total", "unique", "origin"] as const;
export type Column = (typeof COLUMNS)[number];

export const COLUMN_TITLE: Record<Column, string> = {
  weight: "Weight",
  value: "Value",
  components: "Components",
  total: "Total",
  unique: "Types",
  origin: "Origin",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const formatWeight = (lb: number) => `${lb} lb`;
export const formatValue = (caps: number) => plural(caps, "cap", "caps");

/** The symbols shown beside a value: state, then direction for a numeric non-match. */
export function marks(cell: NumericCell | { state: CellState }): string {
  const dir = "direction" in cell && cell.direction ? DIRECTION_SYMBOL[cell.direction] : "";
  return STATE_SYMBOL[cell.state] + dir;
}

export interface CellView {
  column: Column;
  state: CellState;
  /** The guess's own value, as shown. */
  text: string;
  marks: string;
  /** What a screen reader hears, e.g. "Weight 3 pounds, miss, target is lower". */
  label: string;
}

const stateWords = (cell: NumericCell) =>
  cell.direction ? `${cell.state}, target is ${cell.direction}` : cell.state;

export function cellViews(guess: Item, fb: Feedback): CellView[] {
  const chips = fb.components.chips
    .map((c) => `${c.name} ${c.quantity}, ${c.present ? "in target" : "not in target"}`)
    .join("; ");
  return [
    {
      column: "weight",
      state: fb.weight.state,
      text: formatWeight(guess.weight),
      marks: marks(fb.weight),
      label: `Weight ${plural(guess.weight, "pound", "pounds")}, ${stateWords(fb.weight)}`,
    },
    {
      column: "value",
      state: fb.value.state,
      text: formatValue(guess.value),
      marks: marks(fb.value),
      label: `Value ${plural(guess.value, "cap", "caps")}, ${stateWords(fb.value)}`,
    },
    {
      column: "components",
      state: fb.components.state,
      text: fb.components.chips.map((c) => `${c.name} x${c.quantity}`).join(", "),
      marks: marks(fb.components),
      label: `Components ${chips}. Overall ${fb.components.state}`,
    },
    {
      column: "total",
      state: fb.total.state,
      text: String(guess.totalComponents),
      marks: marks(fb.total),
      label: `Total components ${guess.totalComponents}, ${stateWords(fb.total)}`,
    },
    {
      column: "unique",
      state: fb.unique.state,
      text: String(guess.uniqueComponents),
      marks: marks(fb.unique),
      label: `Component types ${guess.uniqueComponents}, ${stateWords(fb.unique)}`,
    },
    {
      column: "origin",
      state: fb.origin.state,
      text: ORIGIN_LABEL[guess.origin],
      marks: marks(fb.origin),
      label: `Origin ${ORIGIN_LABEL[guess.origin]}, ${fb.origin.state}`,
    },
  ];
}

/** One line for the live region after a guess. */
export function guessAnnouncement(guess: Item, fb: Feedback, guessesLeft: number): string {
  const views = cellViews(guess, fb);
  const matches = views.filter((v) => v.state === "match").length;
  return (
    `${guess.name}: ${matches} of ${views.length} columns match. ` +
    `${plural(guessesLeft, "guess", "guesses")} left.`
  );
}

/** "05:12:33" for a duration in milliseconds (rounded up, so it never shows 00:00:00 early). */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** Full stats of an item, as label/value pairs, for the end screen. */
export function itemFacts(item: Item): Array<[string, string]> {
  return [
    ["Weight", formatWeight(item.weight)],
    ["Value", formatValue(item.value)],
    [
      "Components",
      componentTypes(item)
        .map((c) => `${c} x${item.components[c]}`)
        .join(", "),
    ],
    ["Total components", String(item.totalComponents)],
    ["Component types", String(item.uniqueComponents)],
    ["Origin", ORIGIN_LABEL[item.origin]],
  ];
}
