// Runs in America/Toronto so the daylight-saving tests cross real transitions whatever the
// machine's own zone (CI runs in UTC). Node applies a TZ change made before the first Date use.
process.env.TZ = "America/Toronto";

import { describe, expect, it } from "vitest";
import {
  dailyTargetId,
  dayNumber,
  formatCalendarDate,
  localCalendarDate,
  msUntilNextLocalMidnight,
  parseCalendarDate,
  puzzleNumber,
  type Schedule,
} from "../src/core/daily";

const d = parseCalendarDate;
const HOUR = 3_600_000;

describe("calendar dates", () => {
  it("counts days from 1970-01-01", () => {
    expect(dayNumber(d("1970-01-01"))).toBe(0);
    expect(dayNumber(d("2000-03-01"))).toBe(11017);
    expect(dayNumber(d("2026-11-05")) - dayNumber(d("2026-10-30"))).toBe(6);
  });

  it("handles leap years and month ends", () => {
    expect(dayNumber(d("2028-03-01")) - dayNumber(d("2028-02-28"))).toBe(2);
    expect(dayNumber(d("2027-03-01")) - dayNumber(d("2027-02-28"))).toBe(1);
    expect(dayNumber(d("2027-01-01")) - dayNumber(d("2026-12-31"))).toBe(1);
  });

  it("parses and formats strictly", () => {
    expect(formatCalendarDate(d("2026-03-08"))).toBe("2026-03-08");
    expect(() => d("2026-02-29")).toThrow();
    expect(() => d("2026-13-01")).toThrow();
    expect(() => d("2026-3-8")).toThrow();
  });
});

describe("puzzle numbering", () => {
  const epoch = d("2026-11-01");

  it("starts at #1 on the epoch date", () => {
    expect(puzzleNumber(d("2026-11-01"), epoch)).toBe(1);
    expect(puzzleNumber(d("2026-11-02"), epoch)).toBe(2);
    expect(puzzleNumber(d("2026-10-31"), epoch)).toBe(0);
    expect(puzzleNumber(d("2027-11-01"), epoch)).toBe(366);
  });

  it("the test really runs in Toronto time, with both 2026 transitions", () => {
    // EST is UTC-5 (offset 300), EDT is UTC-4 (240).
    expect(new Date(2026, 2, 8, 1).getTimezoneOffset()).toBe(300);
    expect(new Date(2026, 2, 8, 4).getTimezoneOffset()).toBe(240);
    expect(new Date(2026, 10, 1, 0).getTimezoneOffset()).toBe(240);
    expect(new Date(2026, 10, 1, 4).getTimezoneOffset()).toBe(300);
  });

  // Walk real instants an hour apart across a transition: each local day must map to exactly one
  // puzzle number, consecutive, however many hours the day has.
  const hoursPerPuzzle = (from: Date, to: Date) => {
    const perPuzzle = new Map<number, number>();
    for (let t = from.getTime(); t < to.getTime(); t += HOUR) {
      const n = puzzleNumber(localCalendarDate(new Date(t)), d("2026-01-01"));
      perPuzzle.set(n, (perPuzzle.get(n) ?? 0) + 1);
    }
    return [...perPuzzle.entries()];
  };

  it("spring forward (2026-03-08 has 23 hours): no puzzle skipped", () => {
    const counts = hoursPerPuzzle(new Date(2026, 2, 7), new Date(2026, 2, 10));
    expect(counts.map(([n]) => n)).toEqual([66, 67, 68]);
    expect(counts.map(([, h]) => h)).toEqual([24, 23, 24]);
  });

  it("fall back (2026-11-01 has 25 hours): no puzzle repeated", () => {
    const counts = hoursPerPuzzle(new Date(2026, 9, 31), new Date(2026, 10, 3));
    expect(counts.map(([n]) => n)).toEqual([304, 305, 306]);
    expect(counts.map(([, h]) => h)).toEqual([24, 25, 24]);
  });

  it("reads the date from the local clock, not UTC", () => {
    // 23:30 local on 2026-11-05 is already 2026-11-06 in UTC.
    const lateEvening = new Date(2026, 10, 5, 23, 30);
    expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-11-06");
    expect(localCalendarDate(lateEvening)).toEqual(d("2026-11-05"));
  });
});

describe("msUntilNextLocalMidnight", () => {
  it("counts down to the real local midnight, on 23- and 25-hour days too", () => {
    expect(msUntilNextLocalMidnight(new Date(2026, 10, 5, 23, 59, 30))).toBe(30_000);
    expect(msUntilNextLocalMidnight(new Date(2026, 10, 5, 0, 0, 0))).toBe(24 * HOUR);
    expect(msUntilNextLocalMidnight(new Date(2026, 2, 8, 0, 0, 0))).toBe(23 * HOUR);
    expect(msUntilNextLocalMidnight(new Date(2026, 10, 1, 0, 0, 0))).toBe(25 * HOUR);
  });
});

describe("dailyTargetId", () => {
  const schedule: Schedule = { epoch: "2026-11-01", entries: ["alarm-clock", "toaster"] };

  it("looks up entry n - 1 for puzzle n", () => {
    expect(dailyTargetId(1, schedule)).toBe("alarm-clock");
    expect(dailyTargetId(2, schedule)).toBe("toaster");
  });

  it("returns null before the epoch and past the end of the schedule", () => {
    expect(dailyTargetId(0, schedule)).toBeNull();
    expect(dailyTargetId(-3, schedule)).toBeNull();
    expect(dailyTargetId(3, schedule)).toBeNull();
    expect(dailyTargetId(1.5, schedule)).toBeNull();
  });
});
