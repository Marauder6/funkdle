import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  dailyTargetId,
  localCalendarDate,
  parseCalendarDate,
  puzzleNumber,
  type Schedule,
} from "../src/core/daily";
import {
  MIN_GAP_DAYS,
  datesOnEarth,
  daysRemaining,
  extendSchedule,
  scheduleProblems,
  type ScheduleFile,
} from "../scripts/lib/schedule";
import { prng } from "../scripts/lib/stats";
import { dataset } from "./fixtures";

const schedule = JSON.parse(
  readFileSync(join(import.meta.dirname, "..", "data", "schedule.json"), "utf8"),
) as ScheduleFile;
const knownIds = dataset.items.map((i) => i.id);
const poolIds = dataset.items.filter((i) => i.inTargetPool).map((i) => i.id);
const today = puzzleNumber(localCalendarDate(new Date()), parseCalendarDate(schedule.epoch));
const ctx = (pool = poolIds, fromPuzzle = Math.max(1, today)) => ({
  knownIds,
  poolIds: pool,
  fromPuzzle,
});

describe("data/schedule.json (SPEC 7)", () => {
  it("schedules only pool items from today on, and only real items before", () => {
    expect(scheduleProblems(schedule, ctx())).toEqual([]);
  });

  it("every entry is in today's pool (no data change has made one ambiguous yet)", () => {
    const pool = new Set(poolIds);
    expect(schedule.entries.filter((id) => !pool.has(id))).toEqual([]);
  });

  it("records where each cycle began", () => {
    expect(schedule.cycleStarts[0]).toBe(0);
    expect(schedule.cycleStarts).toEqual([0, 256]);
  });

  it("covers at least a year", () => {
    expect(schedule.entries.length).toBeGreaterThanOrEqual(365);
  });

  it("answers puzzle #1 with the first entry", () => {
    expect(dailyTargetId(1, schedule)).toBe(schedule.entries[0]);
  });
});

// Review 2026-11-05: cycle boundaries were inferred from today's pool, so any data change that
// grew or shrank the pool made the committed schedule "invalid", failed CI and blocked deploys.
describe("a change to the pool after the schedule was written", () => {
  const notInPool = knownIds.find((id) => !poolIds.includes(id))!;

  it("growing the pool keeps the committed schedule valid", () => {
    expect(scheduleProblems(schedule, ctx([...poolIds, notInPool], 1))).toEqual([]);
  });

  it("a new pool id joins the current cycle, before any id repeats", () => {
    const grown = [...poolIds, notInPool];
    const next = extendSchedule(schedule, grown, 200, prng(1));
    expect(next.entries.slice(0, schedule.entries.length)).toEqual(schedule.entries);
    const cycle2 = next.entries.slice(256, next.cycleStarts[2] ?? next.entries.length);
    expect(cycle2).toContain(notInPool);
    expect(new Set(cycle2).size).toBe(cycle2.length);
    expect(cycle2).toHaveLength(grown.length); // cycle 2 used every id of the grown pool once
    expect(scheduleProblems({ epoch: schedule.epoch, ...next }, ctx(grown, 1))).toEqual([]);
  });

  it("shrinking the pool only matters for puzzles not yet played", () => {
    const gone = schedule.entries[9]!; // puzzle #10
    const shrunk = poolIds.filter((id) => id !== gone);
    const later = schedule.entries.indexOf(gone, 10) + 1; // its next appearance, if any
    // Checked from puzzle #11 on: #10 is history.
    const fromAfter = scheduleProblems(schedule, ctx(shrunk, later > 0 ? later + 1 : 11));
    expect(fromAfter).toEqual([]);
    // Checked from #10: a problem, because #10 has not been played yet.
    expect(scheduleProblems(schedule, ctx(shrunk, 10)).join()).toMatch(
      /#10: .* not in the target pool/,
    );
  });
});

describe("extendSchedule", () => {
  const pool = Array.from({ length: 40 }, (_, i) => `item-${String(i).padStart(2, "0")}`);
  const known = [...pool, "other"];
  const empty = { entries: [], cycleStarts: [] };
  const valid = (s: { entries: string[]; cycleStarts: number[] }) =>
    scheduleProblems(
      { epoch: "2026-11-05", ...s },
      { knownIds: known, poolIds: pool, fromPuzzle: 1 },
    );

  it("never changes existing entries", () => {
    const first = extendSchedule(empty, pool, 50, prng(1));
    const extended = extendSchedule(first, pool, 70, prng(2));
    expect(extended.entries.slice(0, 50)).toEqual(first.entries);
    expect(extended.cycleStarts.slice(0, first.cycleStarts.length)).toEqual(first.cycleStarts);
    expect(extended.entries).toHaveLength(120);
  });

  it("uses every pool id once per cycle and keeps the gap across cycle boundaries", () => {
    // 40 ids, 3 cycles: the gap rule is hardest exactly at the boundaries.
    const s = extendSchedule(empty, pool, 120, prng(3));
    expect(s.cycleStarts).toEqual([0, 40, 80]);
    for (let c = 0; c < 3; c++) {
      expect(new Set(s.entries.slice(c * 40, c * 40 + 40)).size).toBe(40);
    }
    expect(valid(s)).toEqual([]);
  });

  it("continues the current cycle when extending mid-cycle", () => {
    const start = extendSchedule(empty, pool, 25, prng(4));
    const s = extendSchedule(start, pool, 15, prng(5));
    expect(new Set(s.entries).size).toBe(40);
    expect(s.cycleStarts).toEqual([0]);
  });

  it("is deterministic for a given seed", () => {
    expect(extendSchedule(empty, pool, 60, prng(9))).toEqual(
      extendSchedule(empty, pool, 60, prng(9)),
    );
  });

  it("refuses a pool too small to keep the gap", () => {
    expect(() => extendSchedule(empty, pool.slice(0, MIN_GAP_DAYS - 1), 10, prng(1))).toThrow();
  });
});

describe("scheduleProblems catches each broken rule on its own", () => {
  const pool = Array.from({ length: 40 }, (_, i) => `item-${String(i).padStart(2, "0")}`);
  const check = (s: Partial<ScheduleFile>) =>
    scheduleProblems(
      { epoch: "2026-11-05", cycleStarts: [0], entries: [], ...s },
      { knownIds: [...pool, "retired"], poolIds: pool, fromPuzzle: 1 },
    ).join("\n");

  // Review 2026-11-05: the old test matched /repeats/, which the cycle rule also produces, so
  // deleting the 30-day check left every test green.
  it("the 30-day gap, at a cycle boundary where the cycle rule is satisfied", () => {
    const entries = [...pool, pool[39]!]; // cycle 2 opens with the id that closed cycle 1
    expect(check({ entries, cycleStarts: [0, 40] })).toMatch(/repeats after 1 days/);
    expect(check({ entries, cycleStarts: [0, 40] })).not.toMatch(/within cycle/);
  });

  it("a repeat inside a cycle, far enough apart to keep the gap", () => {
    const entries = [...pool, ...pool.slice(0, 5)].slice(0, 45);
    expect(check({ entries, cycleStarts: [0] })).toMatch(/repeats within cycle 1/);
    expect(check({ entries, cycleStarts: [0] })).not.toMatch(/repeats after/);
  });

  it("an id that is not an item at all", () => {
    expect(check({ entries: ["nonsense"] })).toMatch(/"nonsense" is not an item/);
  });

  it("an id that is an item but not in the pool, scheduled ahead", () => {
    expect(check({ entries: ["retired"] })).toMatch(/not in the target pool/);
  });

  it("a cycle record that does not start at 0, goes backwards, or points past the end", () => {
    expect(check({ entries: pool.slice(0, 3), cycleStarts: [1] })).toMatch(/cycleStarts/);
    expect(check({ entries: pool.slice(0, 3), cycleStarts: [0, 2, 1] })).toMatch(/cycleStarts/);
    expect(check({ entries: pool.slice(0, 3), cycleStarts: [0, 3] })).toMatch(/cycleStarts/);
  });

  it("a bad epoch", () => {
    expect(check({ epoch: "2026-02-30" })).toMatch(/epoch/);
  });
});

describe("daysRemaining and datesOnEarth", () => {
  const s: Schedule = {
    epoch: "2026-11-05",
    entries: Array.from({ length: 100 }, (_, i) => `x${i}`),
  };
  it("counts today and the days after it", () => {
    expect(daysRemaining(s, "2026-11-05")).toBe(100);
    expect(daysRemaining(s, "2026-11-06")).toBe(99);
    expect(daysRemaining(s, "2027-02-12")).toBe(1);
    expect(daysRemaining(s, "2027-02-13")).toBe(0);
    expect(daysRemaining(s, "2026-10-01")).toBe(100);
  });

  // Review 2026-11-05: the check used the UTC date, one day behind for players at UTC+13/14.
  it("gives the dates in the earliest and latest time zones", () => {
    expect(datesOnEarth(new Date("2026-11-05T11:00:00Z"))).toEqual({
      earliest: "2026-11-04",
      latest: "2026-11-06",
    });
    expect(datesOnEarth(new Date("2026-11-05T13:00:00Z"))).toEqual({
      earliest: "2026-11-05",
      latest: "2026-11-06",
    });
  });
});
