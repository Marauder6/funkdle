// Tests written to kill mutants that survived the 2026-11-05 mutation run (npm run mutation): each
// case below fails on at least one deliberate break of the code that the earlier tests missed.

import { describe, expect, it } from "vitest";
import { compare } from "../src/core/compare";
import { DEFAULT_FEEDBACK as cfg } from "../src/core/config";
import { parseCalendarDate } from "../src/core/daily";
import { fingerprint } from "../src/core/fingerprint";
import {
  feedbackHistory,
  indexItems,
  newGame,
  pickUnlimitedTarget,
  submitGuess,
  type Game,
} from "../src/core/game";
import { searchItems } from "../src/core/search";
import { shareLine, shareText } from "../src/core/share";
import { EMPTY_STATS, recordDailyResult } from "../src/core/stats";
import {
  GameStorage,
  KEY_PREFIX,
  browserStore,
  memoryStore,
  type StorageLike,
  type StorageProblem,
} from "../src/storage/storage";
import { extendSchedule, scheduleProblems } from "../scripts/lib/schedule";
import { prng } from "../scripts/lib/stats";
import { dataset, item, synthetic } from "./fixtures";

const index = indexItems(dataset.items);
const pool = dataset.items.filter((i) => i.inTargetPool);

describe("calendar dates", () => {
  it("knows the Gregorian leap-year rule, centuries included", () => {
    expect(() => parseCalendarDate("2028-02-29")).not.toThrow();
    expect(() => parseCalendarDate("2000-02-29")).not.toThrow(); // divisible by 400
    expect(() => parseCalendarDate("2100-02-29")).toThrow(); // century, not by 400
    expect(() => parseCalendarDate("2027-02-29")).toThrow();
    expect(() => parseCalendarDate("2027-02-28")).not.toThrow();
  });

  it("knows the 30-day months", () => {
    for (const m of ["04", "06", "09", "11"]) {
      expect(() => parseCalendarDate(`2026-${m}-30`)).not.toThrow();
      expect(() => parseCalendarDate(`2026-${m}-31`), m).toThrow();
    }
    for (const m of ["01", "03", "05", "07", "08", "10", "12"]) {
      expect(() => parseCalendarDate(`2026-${m}-31`), m).not.toThrow();
    }
  });

  it("refuses month or day 0, and anything around the date", () => {
    for (const bad of [
      "2026-00-10",
      "2026-11-00",
      "x2026-11-05",
      "2026-11-05x",
      "2026-11-05T00:00",
    ]) {
      expect(() => parseCalendarDate(bad), bad).toThrow(/not a calendar date/);
    }
  });
});

describe("game setup and edges", () => {
  it("allows a limit of one guess", () => {
    const g = newGame(
      { mode: "unlimited", puzzle: null, targetId: "alarm-clock", limit: 1 },
      index,
    );
    const out = submitGuess(g, "desk-fan", index, cfg);
    expect(out.ok && out.game.status).toBe("lost");
  });

  it("explains each refusal", () => {
    expect(() => newGame({ mode: "daily", puzzle: 1, targetId: "nope", limit: 6 }, index)).toThrow(
      /unknown target id "nope"/,
    );
    expect(() =>
      newGame({ mode: "daily", puzzle: 1, targetId: "alarm-clock", limit: 0 }, index),
    ).toThrow(/bad limit 0/);
    expect(() =>
      newGame({ mode: "unlimited", puzzle: 1, targetId: "alarm-clock", limit: 6 }, index),
    ).toThrow(/needs a puzzle number/);
  });

  it("refuses a game whose target or guesses are not items", () => {
    const ghost: Game = {
      mode: "unlimited",
      puzzle: null,
      targetId: "ghost",
      guessIds: [],
      limit: 6,
      status: "in-progress",
    };
    expect(() => submitGuess(ghost, "desk-fan", index, cfg)).toThrow(/unknown target id "ghost"/);
    expect(() => feedbackHistory(ghost, index, cfg)).toThrow(/unknown target id/);
    const badGuess = { ...ghost, targetId: "alarm-clock", guessIds: ["ghost"] };
    expect(() => feedbackHistory(badGuess, index, cfg)).toThrow(/unknown guess id "ghost"/);
  });

  it("Unlimited: a one-item pool still gives that item, even as the one to avoid", () => {
    const only = pool[0]!;
    expect(pickUnlimitedTarget([only], () => 0.5, only.id)).toBe(only);
  });

  it("Unlimited: rand() near 1 picks the last item, near 0 the first", () => {
    expect(pickUnlimitedTarget(pool, () => 0.9999)).toBe(pool.at(-1));
    expect(pickUnlimitedTarget(pool, () => 0)).toBe(pool[0]);
    expect(() => pickUnlimitedTarget([], () => 0)).toThrow(/pool is empty/);
  });
});

describe("components and origin", () => {
  it("a guess whose types are a subset of the target's is close, not match", () => {
    const fb = compare(
      synthetic({ components: { Steel: 1 } }),
      synthetic({ components: { Steel: 1, Screw: 1 } }),
      cfg,
    );
    expect(fb.components.state).toBe("close");
  });

  it("different origins are a miss", () => {
    expect(compare(item("Alarm clock"), item("Hide bundle"), cfg).origin.state).toBe("miss");
  });

  it("fingerprints differ when only the component types differ", () => {
    const a = synthetic({ components: { Steel: 2 } });
    const b = synthetic({ components: { Screw: 2 } });
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });
});

describe("search", () => {
  const names = (q: string, items = dataset.items) =>
    searchItems(q, items, new Set(), 50).map((i) => i.name);

  it("puts names that start with the query before names with a word that does", () => {
    // "Clean drinking glass" sorts before "Glass barrel vase" alphabetically; rank must win.
    const result = names("glass");
    expect(result[0]?.toLowerCase().startsWith("glass")).toBe(true);
    const firstWordStart = result.findIndex((n) => !n.toLowerCase().startsWith("glass"));
    expect(result.slice(firstWordStart).some((n) => n.toLowerCase().startsWith("glass"))).toBe(
      false,
    );
  });

  it("gives the same order whatever order the items come in", () => {
    for (const q of ["glass", "ball", "cup", "plate"]) {
      expect(names(q, [...dataset.items].reverse()), q).toEqual(names(q));
    }
  });

  it("ignores accents in the query", () => {
    expect(names("dêsk fán")).toContain("Desk fan");
  });
});

describe("share", () => {
  const fb = compare(item("Desk fan"), item("Alarm clock"), cfg);

  it("uses orange for close in the colour-blind palette, and standard by default", () => {
    expect(shareLine(fb, "colorblind")).toContain("\u{1F7E7}");
    expect(shareLine(fb)).toBe(shareLine(fb, "standard"));
    expect(shareLine(fb)).toContain("\u{1F7E8}");
  });

  it("explains why an unfinished game cannot be shared", () => {
    const g = newGame({ mode: "daily", puzzle: 1, targetId: "alarm-clock", limit: 6 }, index);
    expect(() => shareText(g, [], "u")).toThrow(/only a finished daily game/);
  });
});

describe("stats", () => {
  const win = (puzzle: number, guesses: string[]) => {
    let g = newGame({ mode: "daily", puzzle, targetId: "alarm-clock", limit: 6 }, index);
    for (const id of guesses) {
      const out = submitGuess(g, id, index, cfg);
      if (!out.ok) throw new Error(out.reason);
      g = out.game;
    }
    return g;
  };

  it("adds up wins in the same slot of the distribution", () => {
    let s = recordDailyResult(
      { ...EMPTY_STATS, distribution: [] },
      win(1, ["desk-fan", "alarm-clock"]),
    );
    s = recordDailyResult(s, win(2, ["toaster", "alarm-clock"]));
    expect(s.distribution).toEqual([0, 2]);
    expect(s).toMatchObject({ played: 2, wins: 2, currentStreak: 2, maxStreak: 2 });
  });

  it("a win after a loss the day before starts a streak of one", () => {
    let s = recordDailyResult(
      { ...EMPTY_STATS, distribution: [] },
      win(1, ["desk-fan", "toaster", "typewriter", "fork", "pen", "baseball"]),
    );
    s = recordDailyResult(s, win(2, ["alarm-clock"]));
    expect(s).toMatchObject({ currentStreak: 1, maxStreak: 1 });
  });
});

describe("storage adapters", () => {
  function counting(fail: { get?: boolean; set?: boolean; remove?: boolean } = {}) {
    const data = new Map<string, string>();
    let opened = 0;
    const err = () => Object.assign(new Error("blocked"), { name: "SecurityError" });
    const storage: StorageLike = {
      getItem: (k) => {
        if (fail.get) throw err();
        return data.get(k) ?? null;
      },
      setItem: (k, v) => {
        if (fail.set) throw err();
        data.set(k, v);
      },
      removeItem: (k) => {
        if (fail.remove) throw err();
        data.delete(k);
      },
    };
    return { data, open: () => (opened++, storage), opened: () => opened };
  }
  const reports = () => {
    const problems: StorageProblem[] = [];
    return { problems, report: (p: StorageProblem) => void problems.push(p) };
  };

  it("is healthy until something fails, and opens browser storage only once", () => {
    const c = counting();
    const store = browserStore(c.open, () => {});
    expect(store.health).toEqual({ state: "ok" });
    store.set("a", "1");
    store.get("a");
    store.remove("a");
    expect(c.opened()).toBe(1);
    expect(c.data.size).toBe(0);
    expect(store.health).toEqual({ state: "ok" });
  });

  it("names the operation that failed, as degraded", () => {
    for (const [fail, op] of [
      [{ get: true }, "reading"],
      [{ set: true }, "writing"],
      [{ remove: true }, "removing"],
    ] as const) {
      const { problems, report } = reports();
      const store = browserStore(counting(fail).open, report);
      store.get("k");
      store.set("k", "v");
      store.remove("k");
      expect(problems.map((p) => p.severity)).toEqual(["degraded"]);
      expect(problems[0]?.message).toMatch(new RegExp(`${op} k failed`));
      expect(store.health).toMatchObject({ state: "degraded" });
    }
    const { problems, report } = reports();
    browserStore(() => {
      throw new Error("no");
    }, report).get("k");
    expect(problems[0]?.message).toMatch(/opening storage failed/);
  });

  it("clears the saved Unlimited game through browser storage", () => {
    const c = counting();
    const s = new GameStorage(browserStore(c.open, () => {}));
    s.saveUnlimited({ targetId: "toaster", guessIds: [], limit: 6 });
    s.clearUnlimited();
    expect(c.data.size).toBe(0);
    expect(s.loadUnlimited()).toBeNull();
  });
});

describe("saved values are checked field by field", () => {
  const load = (key: string, value: unknown, read: (s: GameStorage) => unknown) => {
    const store = memoryStore();
    store.set(KEY_PREFIX + key, JSON.stringify(value));
    return read(new GameStorage(store, () => {}));
  };
  const daily = (v: unknown) => load("daily:1", v, (s) => s.loadDaily(1));
  const unlimited = (v: unknown) => load("unlimited", v, (s) => s.loadUnlimited());
  const stats = (v: unknown) => load("stats", v, (s) => s.loadStats());
  const okUnlimited = { targetId: "toaster", guessIds: ["fork"], limit: 6 };
  const okStats = {
    played: 2,
    wins: 1,
    currentStreak: 1,
    maxStreak: 1,
    lastCountedPuzzle: 4,
    distribution: [1],
  };

  it("daily: limits 1 and 50 are accepted; 0, 51, 2.5 and non-string guesses are not", () => {
    expect(daily({ guessIds: [], limit: 1 })).toEqual({ guessIds: [], limit: 1 });
    expect(daily({ guessIds: [], limit: 50 })).toEqual({ guessIds: [], limit: 50 });
    for (const bad of [
      { guessIds: [], limit: 51 },
      { guessIds: [], limit: 2.5 },
      { guessIds: ["a", 3], limit: 6 },
      { guessIds: "a", limit: 6 },
      { limit: 6 },
      ["a", 3],
      "a",
      null,
      42,
    ]) {
      expect(daily(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("unlimited: each field must be right", () => {
    expect(unlimited(okUnlimited)).toEqual(okUnlimited);
    for (const bad of [
      { ...okUnlimited, targetId: 7 },
      { ...okUnlimited, guessIds: ["a", null] },
      { ...okUnlimited, guessIds: undefined },
      { ...okUnlimited, limit: 0 },
      { ...okUnlimited, limit: "6" },
      [okUnlimited],
      null,
      "toaster",
    ]) {
      expect(unlimited(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("stats: each count must be a whole number of at least 0", () => {
    expect(stats(okStats)).toEqual(okStats);
    for (const field of ["played", "wins", "currentStreak", "maxStreak"] as const) {
      for (const bad of [-1, 1.5, "1", null]) {
        expect(stats({ ...okStats, [field]: bad }), `${field}=${bad}`).toEqual(EMPTY_STATS);
      }
    }
    for (const bad of [[-1, 2], [0.5, 0.5], ["1"], "1", null]) {
      expect(stats({ ...okStats, distribution: bad }), JSON.stringify(bad)).toEqual(EMPTY_STATS);
    }
    expect(stats({ ...okStats, lastCountedPuzzle: 4.5 })).toEqual(EMPTY_STATS);
    expect(stats([okStats])).toEqual(EMPTY_STATS);
    expect(stats(null)).toEqual(EMPTY_STATS);
  });
});

describe("schedule generation details", () => {
  const ids = (n: number) =>
    Array.from({ length: n }, (_, i) => `id-${String(i).padStart(2, "0")}`);
  const empty = { entries: [], cycleStarts: [] };

  it("really shuffles, and differently for different seeds", () => {
    const pool40 = ids(40);
    const a = extendSchedule(empty, pool40, 40, prng(1)).entries;
    const b = extendSchedule(empty, pool40, 40, prng(2)).entries;
    expect(a).not.toEqual(pool40);
    expect(a).not.toEqual([...pool40].reverse());
    expect(a).not.toEqual(b);
  });

  it("does not depend on the order the pool is given in", () => {
    const pool40 = ids(40);
    expect(extendSchedule(empty, [...pool40].reverse(), 90, prng(3))).toEqual(
      extendSchedule(empty, pool40, 90, prng(3)),
    );
  });

  it("a pool of exactly 30 works, and forces every id exactly 30 days apart", () => {
    const s = extendSchedule(empty, ids(30), 90, prng(4));
    s.entries.forEach((id, i) => {
      if (i >= 30) expect(s.entries[i - 30]).toBe(id);
    });
    expect(s.cycleStarts).toEqual([0, 30, 60]);
  });

  it("extends mid-way through a third cycle without repeating within it", () => {
    const pool40 = ids(40);
    const three = extendSchedule(empty, pool40, 100, prng(5)); // cycles at 0, 40, 80
    const more = extendSchedule(three, pool40, 20, prng(6));
    expect(new Set(more.entries.slice(80, 120)).size).toBe(40);
    expect(more.cycleStarts).toEqual([0, 40, 80]);
  });

  it("an empty schedule is valid, and equal cycle starts are not", () => {
    const ctx = { knownIds: ids(40), poolIds: ids(40), fromPuzzle: 1 };
    expect(scheduleProblems({ epoch: "2026-11-05", cycleStarts: [], entries: [] }, ctx)).toEqual(
      [],
    );
    const entries = ids(40).slice(0, 5);
    expect(
      scheduleProblems({ epoch: "2026-11-05", cycleStarts: [0, 2, 2], entries }, ctx).join(),
    ).toMatch(/cycleStarts/);
  });

  it("names the puzzles involved in each problem exactly", () => {
    const p = ids(40);
    const ctx = { knownIds: p, poolIds: p, fromPuzzle: 1 };
    expect(
      scheduleProblems({ epoch: "2026-11-05", cycleStarts: [0, 40], entries: [...p, p[39]!] }, ctx),
    ).toEqual([`"${p[39]}" repeats after 1 days (puzzles #40 and #41)`]);
    expect(
      scheduleProblems(
        { epoch: "2026-11-05", cycleStarts: [0], entries: [...p, ...p.slice(0, 1)] },
        ctx,
      ),
    ).toEqual([`puzzle #41: "${p[0]}" repeats within cycle 1`]);
  });
});
