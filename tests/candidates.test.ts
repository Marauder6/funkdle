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

  // Review 2026-11-05: the pool test above uses fingerprint() itself, so a fingerprint missing a
  // field would pass it. This checks fingerprint against compare() for every ordered pair.
  it("two items share a fingerprint exactly when guessing one against the other is all-match", () => {
    let mismatches = 0;
    let equalPairs = 0;
    for (const a of items) {
      const fa = fingerprint(a);
      for (const b of items) {
        const same = fa === fingerprint(b);
        if (same) equalPairs++;
        if (isSolved(compare(a, b, cfg)) !== same) mismatches++;
      }
    }
    expect(mismatches).toBe(0);
    expect(equalPairs).toBeGreaterThan(items.length); // collisions exist, so the check has teeth
  }, 120_000); // 305k comparisons: about a second normally, far longer under mutation testing
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

  // Review 2026-11-05: ">= 1" cannot fail. These pin the counts exactly.
  it("a first-guess hit counts as one guess", () => {
    const greedy = makeGreedyPlayer(matrix);
    expect(greedy.play(greedy.firstGuess())).toBe(1);
    // rand() = 0 always picks the first candidate, index 0
    expect(playConsistentRandom(matrix, 0, () => 0)).toBe(1);
  });

  it("consistent-random plays exactly like a reference player built on filterCandidates", () => {
    const reference = (target: Item, rand: () => number): number => {
      const history: Array<[Item, Feedback]> = [];
      for (let turn = 1; turn <= items.length; turn++) {
        const cands = filterCandidates(items, history, cfg);
        const guess = cands[Math.floor(rand() * cands.length)]!;
        if (guess.id === target.id) return turn;
        history.push([guess, compare(guess, target, cfg)]);
      }
      throw new Error("reference player did not finish");
    };
    for (const [seed, target] of pool.slice(0, 12).entries()) {
      const t = index.get(target.id)!;
      expect(playConsistentRandom(matrix, t, prng(seed + 100))).toBe(
        reference(target, prng(seed + 100)),
      );
    }
  });

  it("greedy finds a known short game", () => {
    // The greedy first guess splits the field so finely that most targets need 2-3 guesses; the
    // audit reports a mean of 2.61. A broken counter or a broken narrowing step moves this.
    const greedy = makeGreedyPlayer(matrix);
    const lengths = pool.slice(0, 60).map((t) => greedy.play(index.get(t.id)!));
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    expect(mean).toBeGreaterThan(2);
    expect(mean).toBeLessThan(3.2);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(6);
  });
});
