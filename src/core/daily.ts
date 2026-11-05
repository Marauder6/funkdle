// Daily puzzle numbering and schedule lookup (SPEC 7). All arithmetic is on calendar dates, never
// milliseconds divided by a day, so a daylight-saving change cannot skip or repeat a puzzle.

export interface CalendarDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

export interface Schedule {
  /** Date of puzzle #1, "YYYY-MM-DD". */
  epoch: string;
  /** entries[n - 1] is the target id for puzzle #n. */
  entries: string[];
}

/** Days since 1970-01-01 in the proleptic Gregorian calendar (H. Hinnant's days_from_civil). */
export function dayNumber({ year, month, day }: CalendarDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function parseCalendarDate(text: string): CalendarDate {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const date = m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
  if (
    !date ||
    date.month < 1 ||
    date.month > 12 ||
    date.day < 1 ||
    date.day > daysInMonth(date.year, date.month)
  ) {
    throw new Error(`not a calendar date: "${text}"`);
  }
  return date;
}

export function formatCalendarDate({ year, month, day }: CalendarDate): string {
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The calendar date on the player's own clock, which is where the day boundary sits (SPEC 3.1). */
export function localCalendarDate(now: Date): CalendarDate {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** Puzzle #1 is the epoch date. Dates before the epoch give 0 or less. */
export function puzzleNumber(localDate: CalendarDate, epoch: CalendarDate): number {
  return dayNumber(localDate) - dayNumber(epoch) + 1;
}

/** The target id for puzzle `puzzle`, or null when the schedule has no entry for it. */
export function dailyTargetId(puzzle: number, schedule: Schedule): string | null {
  if (!Number.isInteger(puzzle) || puzzle < 1) return null;
  return schedule.entries[puzzle - 1] ?? null;
}
