import { describe, expect, it } from "vitest";
import { compare, feedbackKey, isSolved } from "../src/core/compare";
import { DEFAULT_FEEDBACK as cfg } from "../src/core/config";
import { dataset, item, synthetic } from "./fixtures";

describe("SPEC 4.4 worked example, from data/items.json", () => {
  const target = item("Alarm clock");

  it("has the stats the spec states", () => {
    expect(target).toMatchObject({
      value: 10,
      weight: 1,
      components: { Aluminum: 2, Glass: 1, "Nuclear material": 1, Spring: 1 },
      totalComponents: 5,
      uniqueComponents: 4,
      origin: "base",
    });
    expect(item("Desk fan")).toMatchObject({
      value: 4,
      weight: 3,
      components: { Gears: 2, Screw: 2, Steel: 2 },
      totalComponents: 6,
      uniqueComponents: 3,
    });
    expect(item("Wakemaster alarm clock")).toMatchObject({
      value: 15,
      weight: 1,
      components: { Aluminum: 2, Glass: 2, "Nuclear material": 2, Spring: 2 },
      totalComponents: 8,
      uniqueComponents: 4,
    });
  });

  it("guess 1: Desk fan", () => {
    const fb = compare(item("Desk fan"), target, cfg);
    expect(fb.weight).toEqual({ state: "miss", direction: "lower" });
    expect(fb.value).toEqual({ state: "miss", direction: "higher" });
    expect(fb.components.state).toBe("miss");
    expect(fb.components.chips).toEqual([
      { name: "Gears", quantity: 2, present: false },
      { name: "Screw", quantity: 2, present: false },
      { name: "Steel", quantity: 2, present: false },
    ]);
    expect(fb.total).toEqual({ state: "close", direction: "lower" });
    expect(fb.unique).toEqual({ state: "miss", direction: "higher" });
    expect(fb.origin.state).toBe("match");
    expect(isSolved(fb)).toBe(false);
  });

  it("guess 2: Wakemaster alarm clock", () => {
    const fb = compare(item("Wakemaster alarm clock"), target, cfg);
    expect(fb.weight).toEqual({ state: "match", direction: null });
    expect(fb.value).toEqual({ state: "miss", direction: "lower" });
    expect(fb.components.state).toBe("match");
    expect(fb.components.chips.map((c) => c.name)).toEqual([
      "Aluminum",
      "Glass",
      "Nuclear material",
      "Spring",
    ]);
    expect(fb.total).toEqual({ state: "miss", direction: "lower" });
    expect(fb.unique).toEqual({ state: "match", direction: null });
    expect(fb.origin.state).toBe("match");
  });

  it("guessing the target solves it", () => {
    expect(isSolved(compare(target, target, cfg))).toBe(true);
  });
});

describe("close boundaries (SPEC 4.1, inclusive)", () => {
  it("value: floor applies when ratio x target is smaller", () => {
    // target 4: tolerance max(2, 1) = 2
    const t = synthetic({ value: 4 });
    expect(compare(synthetic({ value: 6 }), t, cfg).value).toEqual({
      state: "close",
      direction: "lower",
    });
    expect(compare(synthetic({ value: 2 }), t, cfg).value).toEqual({
      state: "close",
      direction: "higher",
    });
    expect(compare(synthetic({ value: 7 }), t, cfg).value.state).toBe("miss");
    expect(compare(synthetic({ value: 1 }), t, cfg).value.state).toBe("miss");
  });

  it("value: ratio applies when larger than the floor", () => {
    // target 100: tolerance max(2, 25) = 25
    const t = synthetic({ value: 100 });
    expect(compare(synthetic({ value: 125 }), t, cfg).value.state).toBe("close");
    expect(compare(synthetic({ value: 75 }), t, cfg).value.state).toBe("close");
    expect(compare(synthetic({ value: 126 }), t, cfg).value.state).toBe("miss");
    expect(compare(synthetic({ value: 74 }), t, cfg).value.state).toBe("miss");
  });

  it("weight: compared in hundredths, floor 0.5 lb", () => {
    // target 1 lb: tolerance max(0.5, 0.25) = 0.5 lb
    const t = synthetic({ weight: 1 });
    expect(compare(synthetic({ weight: 1.5 }), t, cfg).weight.state).toBe("close");
    expect(compare(synthetic({ weight: 0.5 }), t, cfg).weight.state).toBe("close");
    expect(compare(synthetic({ weight: 1.51 }), t, cfg).weight.state).toBe("miss");
    expect(compare(synthetic({ weight: 0.49 }), t, cfg).weight.state).toBe("miss");
    // 0.1 + 0.2 style float traps: 0.3 lb vs 0.3 lb must be an exact match
    expect(
      compare(synthetic({ weight: 0.1 + 0.2 }), synthetic({ weight: 0.3 }), cfg).weight.state,
    ).toBe("match");
  });

  it("weight: ratio applies for heavy targets", () => {
    // target 40 lb: tolerance max(0.5, 10) = 10 lb
    const t = synthetic({ weight: 40 });
    expect(compare(synthetic({ weight: 50 }), t, cfg).weight.state).toBe("close");
    expect(compare(synthetic({ weight: 30 }), t, cfg).weight.state).toBe("close");
    expect(compare(synthetic({ weight: 50.01 }), t, cfg).weight.state).toBe("miss");
  });

  it("zero weight and zero value targets use the floor", () => {
    const t = synthetic({ weight: 0, value: 0 });
    expect(compare(synthetic({ weight: 0.5, value: 2 }), t, cfg).weight.state).toBe("close");
    expect(compare(synthetic({ weight: 0.5, value: 2 }), t, cfg).value.state).toBe("close");
    expect(compare(synthetic({ weight: 0.51, value: 3 }), t, cfg).value.state).toBe("miss");
    expect(compare(synthetic({ weight: 0, value: 0 }), t, cfg).weight.state).toBe("match");
    // Review 2026-11-05: the zero-weight miss boundary was never asserted.
    expect(compare(synthetic({ weight: 0.51 }), t, cfg).weight).toEqual({
      state: "miss",
      direction: "lower",
    });
  });

  it("a zero guess against a non-zero target points higher", () => {
    const fb = compare(
      synthetic({ weight: 0, value: 0 }),
      synthetic({ weight: 3, value: 40 }),
      cfg,
    );
    expect(fb.weight).toEqual({ state: "miss", direction: "higher" });
    expect(fb.value).toEqual({ state: "miss", direction: "higher" });
  });

  // Review 2026-11-05: every earlier boundary had a whole-number ratio x target, so rounding the
  // tolerance (ceil, floor, round) would have passed. Target 10: tolerance is exactly 2.5 caps.
  it("does not round a fractional tolerance", () => {
    const t = synthetic({ value: 10 });
    expect(compare(synthetic({ value: 12 }), t, cfg).value.state).toBe("close");
    expect(compare(synthetic({ value: 8 }), t, cfg).value.state).toBe("close");
    expect(compare(synthetic({ value: 13 }), t, cfg).value.state).toBe("miss");
    expect(compare(synthetic({ value: 7 }), t, cfg).value.state).toBe("miss");
    // Weight: target 2.5 lb, tolerance 0.625 lb. 3.12 lb is inside, 3.13 lb outside.
    const w = synthetic({ weight: 2.5 });
    expect(compare(synthetic({ weight: 3.12 }), w, cfg).weight.state).toBe("close");
    expect(compare(synthetic({ weight: 3.13 }), w, cfg).weight.state).toBe("miss");
  });

  it("measures the band around the target, not the guess", () => {
    // Target 80: band 20. Guess 101 is 21 away: a miss. Around the guess (band 25) it would be close.
    expect(compare(synthetic({ value: 80 }), synthetic({ value: 100 }), cfg).value.state).toBe(
      "close",
    );
    expect(compare(synthetic({ value: 125 }), synthetic({ value: 100 }), cfg).value.state).toBe(
      "close",
    );
    expect(compare(synthetic({ value: 100 }), synthetic({ value: 80 }), cfg).value.state).toBe(
      "close",
    );
    expect(compare(synthetic({ value: 101 }), synthetic({ value: 80 }), cfg).value.state).toBe(
      "miss",
    );
  });

  it("total components: close within 1; unique types has no close state", () => {
    const t = synthetic({ components: { Steel: 2, Screw: 1 } }); // total 3, unique 2
    const g = synthetic({ components: { Steel: 1, Screw: 1, Gears: 2 } }); // total 4, unique 3
    const fb = compare(g, t, cfg);
    expect(fb.total).toEqual({ state: "close", direction: "lower" });
    expect(fb.unique).toEqual({ state: "miss", direction: "lower" });
  });
});

describe("components", () => {
  it("identical type sets with different quantities match; quantities do not affect chips", () => {
    const fb = compare(
      synthetic({ components: { Steel: 5, Screw: 1 } }),
      synthetic({ components: { Steel: 1, Screw: 3 } }),
      cfg,
    );
    expect(fb.components.state).toBe("match");
    expect(fb.components.chips.every((c) => c.present)).toBe(true);
    expect(fb.total.state).toBe("miss");
  });

  it("overlapping but different sets are close", () => {
    const fb = compare(
      synthetic({ components: { Steel: 1, Screw: 1 } }),
      synthetic({ components: { Steel: 1 } }),
      cfg,
    );
    expect(fb.components.state).toBe("close");
    expect(fb.components.chips).toEqual([
      { name: "Screw", quantity: 1, present: false },
      { name: "Steel", quantity: 1, present: true },
    ]);
  });

  it("a guess whose types are a superset is close, not match", () => {
    const fb = compare(
      synthetic({ components: { Steel: 1, Screw: 1 } }),
      synthetic({ components: { Screw: 1 } }),
      cfg,
    );
    expect(fb.components.state).toBe("close");
  });

  it("single-component items", () => {
    const fb = compare(
      synthetic({ components: { Lead: 3 } }),
      synthetic({ components: { Lead: 2 } }),
      cfg,
    );
    expect(fb.components.state).toBe("match");
    expect(fb.unique.state).toBe("match");
    expect(fb.total).toEqual({ state: "close", direction: "lower" });
  });
});

describe("feedbackKey", () => {
  it("separates origin match from origin miss (regression: first-letter codes collided)", () => {
    const g = synthetic({ origin: "base" });
    const a = compare(g, synthetic({ origin: "base" }), cfg);
    const b = compare(g, synthetic({ origin: "far-harbor" }), cfg);
    expect(feedbackKey(a)).not.toBe(feedbackKey(b));
  });

  it("is equal exactly when the visible states are equal, over real item pairs", () => {
    const items = dataset.items;
    const visible = (fb: ReturnType<typeof compare>) =>
      JSON.stringify({
        ...fb,
        components: { ...fb.components, chips: fb.components.chips.map((c) => c.present) },
      });
    const keyToVisible = new Map<string, string>();
    const visibleToKey = new Map<string, string>();
    for (let i = 0; i < items.length; i += 7) {
      const g = items[i]!;
      for (let j = 0; j < items.length; j += 3) {
        const fb = compare(g, items[j]!, cfg);
        const key = `${g.id}:${feedbackKey(fb)}`;
        const v = `${g.id}:${visible(fb)}`;
        expect(keyToVisible.get(key) ?? v).toBe(v);
        expect(visibleToKey.get(v) ?? key).toBe(key);
        keyToVisible.set(key, v);
        visibleToKey.set(v, key);
      }
    }
    expect(keyToVisible.size).toBeGreaterThan(100);
  });
});
