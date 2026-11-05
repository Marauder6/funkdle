// The guess history, newest first (SPEC 9.1). One structure serves both layouts: CSS shows it as
// a table at 768 px and wider, and as one card per guess below that. ARIA table roles keep the
// semantics in both, and each cell's full meaning is in screen-reader text.

import type { Feedback, Item } from "../core/types";
import { h, srOnly } from "./dom";
import { COLUMN_TITLE, COLUMNS, cellViews, itemFacts, marks } from "./format";

function componentsCell(fb: Feedback): HTMLElement {
  return h(
    "span",
    { class: "chips", "aria-hidden": "true" },
    ...fb.components.chips.map((c) =>
      h(
        "span",
        { class: `chip ${c.present ? "present" : "absent"}` },
        h("span", { class: "chip-mark" }, c.present ? "✓" : "✗"),
        ` ${c.name} ×${c.quantity}`,
      ),
    ),
  );
}

function guessRow(item: Item, fb: Feedback, reveal: boolean): HTMLElement {
  const cells = cellViews(item, fb).map((view, i) =>
    h(
      "div",
      {
        role: "cell",
        class: `cell col-${view.column} state-${view.state}${reveal ? " reveal" : ""}`,
        style: reveal ? `--i: ${i + 1}` : null,
      },
      h("span", { class: "cell-title", "aria-hidden": "true" }, COLUMN_TITLE[view.column]),
      view.column === "components"
        ? componentsCell(fb)
        : h("span", { class: "cell-text", "aria-hidden": "true" }, view.text),
      h(
        "span",
        { class: "cell-marks", "aria-hidden": "true" },
        view.column === "components" ? marks(fb.components) : view.marks,
      ),
      srOnly(view.label),
    ),
  );
  return h(
    "div",
    { role: "row", class: "guess" },
    h("div", { role: "rowheader", class: "cell col-name" }, item.name),
    ...cells,
  );
}

export function renderHistory(
  rows: Array<[Item, Feedback]>,
  revealNewest: boolean,
  label = "Your guesses, newest first",
): HTMLElement {
  const header = h(
    "div",
    { role: "row", class: "head" },
    h("div", { role: "columnheader", class: "cell col-name" }, "Item"),
    ...COLUMNS.map((c) =>
      h("div", { role: "columnheader", class: `cell col-${c}` }, COLUMN_TITLE[c]),
    ),
  );
  const newestFirst = [...rows].reverse();
  return h(
    "div",
    { role: "table", class: "history", "aria-label": label },
    header,
    ...newestFirst.map(([item, fb], i) => guessRow(item, fb, revealNewest && i === 0)),
  );
}

/** The answer's full stats, shown when a game ends. */
export function renderItemFacts(item: Item): HTMLElement {
  return h(
    "dl",
    { class: "facts" },
    ...itemFacts(item).flatMap(([term, value]) => [h("dt", {}, term), h("dd", {}, value)]),
  );
}
