import { describe, expect, it } from "vitest";
import { filterCandidates } from "../src/core/candidates";
import { compare, isSolved } from "../src/core/compare";
import { DEFAULT_FEEDBACK as cfg } from "../src/core/config";
import { collisionClasses, fingerprint } from "../src/core/fingerprint";
import type { Feedback, Item } from "../src/core/types";
import { feedbackMatrix, makeGreedyPlayer, playConsistentRandom } from "../scripts/lib/sim";
import { prng } from "../scripts/lib/stats";
import { dataset, item } from "./fixtures";

const items = dataset.items;
const pool = items.filter((i) => i.inTargetPool);

describe("fingerprint", () => {
  it("is shared exactly by items no guess can tell apart (sampled)", () => {
    const desk = item("Desk fan");
    const office = item("Office desk fan");
    expect(fingerprint(desk)).toBe(fingerprint(office));
    for (const g of items.slice(0, 60)) {
      expect(compare(g, desk, cfg)).toEqual(compare(g, office, cfg));
    }
  });

  it("puts an item in the target pool iff its collision class has size 1", () => {
    for (const members of collisionClasses(items).values()) {
      for (const m of members) expect(m.inTargetPool).toBe(members.length === 1);
    }
  });

  it("all-match feedback against a pool target means the guess is the target", () => {
    for (const t of pool.slice(0, 40)) {
      for (const g of items) expect(isSolved(compare(g, t, cfg))).toBe(g.id === t.id);
    }
  });
});

describe("filterCandidates", () => {
  const play = (target: Item, guesses: Item[]): Array<[Item, Feedback]> =>
    guesses.map((g) => [g, compare(g, target, cfg)]);

  it("keeps the target and drops each wrong guess", () => {
    const target = item("Alarm clock");
    const history = play(target, [item("Desk fan"), item("Wakemaster alarm clock")]);
    const left = filterCandidates(items, history, cfg);
    expect(left.map((i) => i.id)).toContain(target.id);
    expect(left.map((i) => i.id)).not.toContain("desk-fan");
    expect(left.map((i) => i.id)).not.toContain("wakemaster-alarm-clock");
    expect(left.length).toBeLessThan(items.length);
  });

  it("with no history returns the whole pool", () => {
    expect(filterCandidates(items, [], cfg)).toHaveLength(items.length);
  });
});

describe("simulation agrees with core", () => {
  const matrix = feedbackMatrix(items, cfg);
  const index = new Map(items.map((it, i) => [it.id, i]));

  it("matrix narrowing equals filterCandidates", () => {
    const rand = prng(7);
    for (let trial = 0; trial < 25; trial++) {
      const target = pool[Math.floor(rand() * pool.length)]!;
      const guesses = [0, 1].map(() => items[Math.floor(rand() * items.length)]!);
      const t = index.get(target.id)!;
      let cands = items.map((_, i) => i);
      for (const g of guesses) {
        const gi = index.get(g.id)!;
        const k = matrix.keys[gi * matrix.n + t];
        cands = cands.filter((c) => matrix.keys[gi * matrix.n + c] === k);
      }
      const viaCore = filterCandidates(
        items,
        guesses.map((g) => [g, compare(g, target, cfg)]),
        cfg,
      );
      expect(cands.map((i) => items[i]!.id)).toEqual(viaCore.map((i) => i.id));
    }
  });

  it("both players solve every target they are given", () => {
    const greedy = makeGreedyPlayer(matrix);
    const rand = prng(1);
    for (const target of pool.slice(0, 30)) {
      const t = index.get(target.id)!;
      expect(greedy.play(t)).toBeGreaterThanOrEqual(1);
      expect(playConsistentRandom(matrix, t, rand)).toBeGreaterThanOrEqual(1);
    }
  });
});
