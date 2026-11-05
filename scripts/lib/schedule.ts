// Daily schedule generation and checks (SPEC 7). Append-only: extending never changes an
// existing entry, so a later data fix cannot change a past or current day's answer.
//
// Cycles are recorded, not inferred. Each cycle uses every id in the pool once before any repeats.
// Because the pool can change when the data is refreshed, a cycle's boundaries cannot be worked
// out later from today's pool; schedule.json keeps `cycleStarts`, the index where each began.

import {
  dayNumber,
  formatCalendarDate,
  parseCalendarDate,
  type Schedule,
} from "../../src/core/daily";

/** No item appears twice within this many consecutive days, across cycle boundaries too. */
export const MIN_GAP_DAYS = 30;

/** data/schedule.json: what the app reads, plus the cycle record the generator needs. */
export interface ScheduleFile extends Schedule {
  /** entries index at which each cycle began; [0] whenever there are entries. */
  cycleStarts: number[];
}

export interface ScheduleContext {
  /** Every item id in data/items.json. A past entry only has to still exist. */
  knownIds: readonly string[];
  /** The current target pool. Entries from `fromPuzzle` on must be in it. */
  poolIds: readonly string[];
  fromPuzzle: number;
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Appends `days` entries: a seeded shuffle of the pool ids not yet used in the current (last
 * recorded) cycle, then a new cycle over the whole pool, skipping any id used in the last
 * MIN_GAP_DAYS - 1 entries. Ids that joined the pool mid-cycle join the current cycle. Throws
 * rather than break a rule it cannot keep.
 */
export function extendSchedule(
  existing: { entries: readonly string[]; cycleStarts: readonly number[] },
  poolIds: readonly string[],
  days: number,
  rand: () => number,
): { entries: string[]; cycleStarts: number[] } {
  const pool = new Set(poolIds);
  if (pool.size < MIN_GAP_DAYS) {
    throw new Error(`pool of ${pool.size} cannot keep a ${MIN_GAP_DAYS}-day gap`);
  }
  const entries = [...existing.entries];
  // A new schedule's first cycle starts at entry 0.
  const cycleStarts = entries.length ? [...existing.cycleStarts] : [0];
  const used = new Set(entries.slice(cycleStarts.at(-1)));
  let order = shuffle([...pool].filter((id) => !used.has(id)).sort(), rand);

  for (let n = 0; n < days; n++) {
    if (order.length === 0) {
      cycleStarts.push(entries.length);
      order = shuffle([...pool].sort(), rand);
    }
    const recent = new Set(entries.slice(-(MIN_GAP_DAYS - 1)));
    const at = order.findIndex((id) => !recent.has(id));
    if (at < 0) throw new Error(`no id left that keeps the ${MIN_GAP_DAYS}-day gap`);
    const [id] = order.splice(at, 1) as [string];
    entries.push(id);
  }
  return { entries, cycleStarts };
}

/** Every rule the schedule promises. Returns problems; empty means valid. */
export function scheduleProblems(schedule: ScheduleFile, ctx: ScheduleContext): string[] {
  const problems: string[] = [];
  const known = new Set(ctx.knownIds);
  const pool = new Set(ctx.poolIds);
  const { entries, cycleStarts } = schedule;
  try {
    parseCalendarDate(schedule.epoch);
  } catch {
    problems.push(`epoch "${schedule.epoch}" is not a calendar date`);
  }

  const startsOk =
    Array.isArray(cycleStarts) &&
    (entries.length === 0 || cycleStarts[0] === 0) &&
    cycleStarts.every(
      (s, i) =>
        Number.isInteger(s) &&
        s < Math.max(entries.length, 1) &&
        (i === 0 || s > cycleStarts[i - 1]!),
    );
  if (!startsOk)
    problems.push(`cycleStarts ${JSON.stringify(cycleStarts)} is not a valid cycle record`);

  entries.forEach((id, i) => {
    const puzzle = i + 1;
    if (!known.has(id)) problems.push(`puzzle #${puzzle}: "${id}" is not an item`);
    else if (puzzle >= ctx.fromPuzzle && !pool.has(id)) {
      problems.push(`puzzle #${puzzle}: "${id}" is not in the target pool`);
    }
  });

  const lastSeen = new Map<string, number>();
  entries.forEach((id, i) => {
    const prev = lastSeen.get(id);
    if (prev !== undefined && i - prev < MIN_GAP_DAYS) {
      problems.push(`"${id}" repeats after ${i - prev} days (puzzles #${prev + 1} and #${i + 1})`);
    }
    lastSeen.set(id, i);
  });

  // No repeats until the pool is used up: within each recorded cycle every id is new.
  if (startsOk) {
    cycleStarts.forEach((start, c) => {
      const seen = new Set<string>();
      entries.slice(start, cycleStarts[c + 1] ?? entries.length).forEach((id, j) => {
        if (seen.has(id)) {
          problems.push(`puzzle #${start + j + 1}: "${id}" repeats within cycle ${c + 1}`);
        }
        seen.add(id);
      });
    });
  }
  return problems;
}

/** Days of puzzles left, counting today, for a given calendar date. */
export function daysRemaining(schedule: Schedule, today: string): number {
  const elapsed =
    dayNumber(parseCalendarDate(today)) - dayNumber(parseCalendarDate(schedule.epoch));
  return schedule.entries.length - Math.max(0, elapsed);
}

/**
 * The calendar dates in the earliest (UTC-12) and latest (UTC+14) time zones at `now`. Checks use
 * the latest date for days remaining and the earliest for "today", so no player anywhere is
 * counted on the wrong side of a boundary.
 */
export function datesOnEarth(now: Date): { earliest: string; latest: string } {
  const at = (offsetHours: number) => {
    const d = new Date(now.getTime() + offsetHours * 3_600_000);
    return formatCalendarDate({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
    });
  };
  return { earliest: at(-12), latest: at(14) };
}
