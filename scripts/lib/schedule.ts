// Daily schedule generation and checks (SPEC 7). Append-only: extending never changes an
// existing entry, so a later data fix cannot change a past or current day's answer.

import { dayNumber, parseCalendarDate, type Schedule } from "../../src/core/daily";

/** No item appears twice within this many consecutive days, across cycle boundaries too. */
export const MIN_GAP_DAYS = 30;

/** Ids used since the current cycle began. A cycle ends once every pool id has been used. */
function currentCycle(entries: readonly string[], pool: ReadonlySet<string>): Set<string> {
  let used = new Set<string>();
  for (const id of entries) {
    if ([...pool].every((p) => used.has(p))) used = new Set();
    used.add(id);
  }
  if ([...pool].every((p) => used.has(p))) used = new Set();
  return used;
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
 * Appends `days` entries: a seeded shuffle of the pool ids not yet used in the current cycle, then
 * a fresh shuffle of the whole pool for the next cycle, skipping any id used in the last
 * MIN_GAP_DAYS - 1 entries. Throws rather than break a rule it cannot keep.
 */
export function extendSchedule(
  existing: readonly string[],
  poolIds: readonly string[],
  days: number,
  rand: () => number,
): string[] {
  const pool = new Set(poolIds);
  if (pool.size < MIN_GAP_DAYS) {
    throw new Error(`pool of ${pool.size} cannot keep a ${MIN_GAP_DAYS}-day gap`);
  }
  const entries = [...existing];
  let used = currentCycle(entries, pool);
  let order = shuffle([...pool].filter((id) => !used.has(id)).sort(), rand);

  for (let n = 0; n < days; n++) {
    if (order.length === 0) {
      used = new Set();
      order = shuffle([...pool].sort(), rand);
    }
    const recent = new Set(entries.slice(-(MIN_GAP_DAYS - 1)));
    const at = order.findIndex((id) => !recent.has(id));
    if (at < 0) throw new Error(`no id left that keeps the ${MIN_GAP_DAYS}-day gap`);
    const [id] = order.splice(at, 1) as [string];
    entries.push(id);
    used.add(id);
  }
  return entries;
}

/** Every rule the schedule promises. Returns problems; empty means valid. */
export function scheduleProblems(schedule: Schedule, poolIds: readonly string[]): string[] {
  const problems: string[] = [];
  const pool = new Set(poolIds);
  try {
    parseCalendarDate(schedule.epoch);
  } catch {
    problems.push(`epoch "${schedule.epoch}" is not a calendar date`);
  }
  schedule.entries.forEach((id, i) => {
    if (!pool.has(id)) problems.push(`puzzle #${i + 1}: "${id}" is not in the target pool`);
  });
  const lastSeen = new Map<string, number>();
  schedule.entries.forEach((id, i) => {
    const prev = lastSeen.get(id);
    if (prev !== undefined && i - prev < MIN_GAP_DAYS) {
      problems.push(`"${id}" repeats after ${i - prev} days (puzzles #${prev + 1} and #${i + 1})`);
    }
    lastSeen.set(id, i);
  });
  // No repeats until the pool is exhausted: within each cycle every id is new.
  let used = new Set<string>();
  schedule.entries.forEach((id, i) => {
    if ([...pool].every((p) => used.has(p))) used = new Set();
    if (used.has(id)) problems.push(`puzzle #${i + 1}: "${id}" repeats before the pool is used up`);
    used.add(id);
  });
  return problems;
}

/** Days of puzzles left, counting today, for a given calendar date. */
export function daysRemaining(schedule: Schedule, today: string): number {
  const elapsed =
    dayNumber(parseCalendarDate(today)) - dayNumber(parseCalendarDate(schedule.epoch));
  return schedule.entries.length - Math.max(0, elapsed);
}
