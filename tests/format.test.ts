import { describe, expect, it } from "vitest";
import { compare } from "../src/core/compare";
import { DEFAULT_FEEDBACK as cfg } from "../src/core/config";
import { cellViews, guessAnnouncement, itemFacts, marks } from "../src/ui/format";
import { item } from "./fixtures";

describe("cell text and labels (SPEC 9.5)", () => {
  const target = item("Alarm clock");

  it("labels the worked example the way the spec words it", () => {
    const views = cellViews(item("Desk fan"), compare(item("Desk fan"), target, cfg));
    const label = Object.fromEntries(views.map((v) => [v.column, v.label]));
    expect(label.weight).toBe("Weight 3 pounds, miss, target is lower");
    expect(label.value).toBe("Value 4 caps, miss, target is higher");
    expect(label.components).toBe(
      "Components Gears 2, not in target; Screw 2, not in target; Steel 2, not in target. Overall miss",
    );
    expect(label.total).toBe("Total components 6, close, target is lower");
    expect(label.unique).toBe("Component types 3, miss, target is higher");
    expect(label.origin).toBe("Origin Base game, match");
  });

  it("shows the guess's own values with a symbol for every state", () => {
    const views = cellViews(item("Desk fan"), compare(item("Desk fan"), target, cfg));
    expect(views.map((v) => [v.text, v.marks])).toEqual([
      ["3 lb", "✗▼"],
      ["4 caps", "✗▲"],
      ["Gears x2, Screw x2, Steel x2", "✗"],
      ["6", "~▼"],
      ["3", "✗▲"],
      ["Base game", "✓"],
    ]);
  });

  it("gives match, close and miss distinct symbols", () => {
    const symbols = new Set([
      marks({ state: "match" }),
      marks({ state: "close" }),
      marks({ state: "miss" }),
    ]);
    expect(symbols.size).toBe(3);
  });

  it("uses singular units for one", () => {
    const fb = compare(item("Alarm clock"), target, cfg);
    const views = cellViews(item("Alarm clock"), fb);
    expect(views[0]?.label).toBe("Weight 1 pound, match");
  });

  it("announces a guess briefly", () => {
    const fb = compare(item("Desk fan"), target, cfg);
    expect(guessAnnouncement(item("Desk fan"), fb, 5)).toBe(
      "Desk fan: 1 of 6 columns match. 5 guesses left.",
    );
  });

  it("lists an item's full stats for the end screen", () => {
    expect(itemFacts(target)).toEqual([
      ["Weight", "1 lb"],
      ["Value", "10 caps"],
      ["Components", "Aluminum x2, Glass x1, Nuclear material x1, Spring x1"],
      ["Total components", "5"],
      ["Component types", "4"],
      ["Origin", "Base game"],
    ]);
  });
});
