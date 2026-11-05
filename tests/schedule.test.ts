import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dailyTargetId, type Schedule } from "../src/core/daily";
import {
  MIN_GAP_DAYS,
  daysRemaining,
  extendSchedule,
  scheduleProblems,
} from "../scripts/lib/schedule";
import { prng } from "../scripts/lib/stats";
import { dataset } from "./fixtures";

const schedule = JSON.parse(
  readFileSync(new URL("../data/schedule.json", import.meta.url), "utf8"),
) as Schedule;
const poolIds = dataset.items.filter((i) => i.inTargetPool).map((i) => i.id);

describe("data/schedule.json (SPEC 7)", () => {
  it("only schedules items in the target pool", () => {
    const pool = new Set(poolIds);
    const missing = schedule.entries.filter((id) => !pool.has(id));
    expect(missing).toEqual([]);
  });

  it("keeps every rule: valid epoch, no repeat within a cycle, 30-day gap", () => {
    expect(scheduleProblems(schedule, poolIds)).toEqual([]);
  });

  it("covers at least a year", () => {
    expect(schedule.entries.length).toBeGreaterThanOrEqual(365);
  });

  it("answers puzzle #1 with the first entry", () => {
    expect(dailyTargetId(1, schedule)).toBe(schedule.entries[0]);
  });
});

describe("extendSchedule", () => {
  const pool = Array.from({ length: 40 }, (_, i) => `item-${String(i).padStart(2, "0")}`);

  it("never changes existing entries", () => {
    const first = extendSchedule([], pool, 50, prng(1));
    const extended = extendSchedule(first, pool, 70, prng(2));
    expect(extended.slice(0, 50)).toEqual(first);
    expect(extended).toHaveLength(120);
  });

  it("uses every pool id once per cycle and keeps the gap across cycle boundaries", () => {
    // 40 ids, 3 cycles: the gap rule is hardest exactly at the boundaries.
    const entries = extendSchedule([], pool, 120, prng(3));
    for (let c = 0; c < 3; c++) {
      expect(new Set(entries.slice(c * 40, c * 40 + 40)).size).toBe(40);
    }
    expect(scheduleProblems({ epoch: "2026-11-05", entries }, pool)).toEqual([]);
  });

  it("continues the current cycle when extending mid-cycle", () => {
    const start = extendSchedule([], pool, 25, prng(4));
    const entries = extendSchedule(start, pool, 15, prng(5));
    expect(new Set(entries).size).toBe(40);
  });

  it("is deterministic for a given seed", () => {
    expect(extendSchedule([], pool, 60, prng(9))).toEqual(extendSchedule([], pool, 60, prng(9)));
  });

  it("refuses a pool too small to keep the gap", () => {
    expect(() => extendSchedule([], pool.slice(0, MIN_GAP_DAYS - 1), 10, prng(1))).toThrow();
  });

  it("catches a repeat inside the gap", () => {
    const entries = [...pool.slice(0, 10), pool[0]!];
    expect(scheduleProblems({ epoch: "2026-11-05", entries }, pool).join()).toMatch(/repeats/);
  });
});

describe("daysRemaining", () => {
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
});
