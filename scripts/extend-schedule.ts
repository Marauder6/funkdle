// npm run schedule:extend -- --days N [--epoch YYYY-MM-DD]
// Appends N days to data/schedule.json (SPEC 7). Never changes existing entries. --epoch is only
// accepted when the file does not exist yet; changing the epoch of an existing schedule is a
// deliberate edit, not something this script does.

import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { parseCalendarDate } from "../src/core/daily";
import { DatasetSchema } from "../src/core/schema";
import { ITEMS_PATH, SCHEDULE_PATH } from "./lib/raw";
import { extendSchedule, scheduleProblems, type ScheduleFile } from "./lib/schedule";
import { prng } from "./lib/stats";

/** The PRNG seed for each extension is this plus the number of existing entries. */
const SCHEDULE_SEED = 20261105;

const { values } = parseArgs({
  options: { days: { type: "string" }, epoch: { type: "string" } },
});
const days = Number(values.days);
if (!Number.isInteger(days) || days < 1) {
  console.error("usage: npm run schedule:extend -- --days N [--epoch YYYY-MM-DD]");
  process.exit(1);
}

let schedule: ScheduleFile;
if (existsSync(SCHEDULE_PATH)) {
  if (values.epoch) {
    console.error(`${SCHEDULE_PATH} exists; --epoch only applies when creating it.`);
    process.exit(1);
  }
  schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf8")) as ScheduleFile;
  if (!Array.isArray(schedule.cycleStarts)) {
    console.error(`${SCHEDULE_PATH} has no cycleStarts record; add it before extending.`);
    process.exit(1);
  }
} else {
  if (!values.epoch) {
    console.error("no schedule yet: pass --epoch YYYY-MM-DD for puzzle #1");
    process.exit(1);
  }
  parseCalendarDate(values.epoch);
  schedule = { epoch: values.epoch, cycleStarts: [], entries: [] };
}

const dataset = DatasetSchema.parse(JSON.parse(readFileSync(ITEMS_PATH, "utf8")));
const pool = dataset.items.filter((i) => i.inTargetPool).map((i) => i.id);
const before = schedule.entries.length;
const extended = extendSchedule(schedule, pool, days, prng(SCHEDULE_SEED + before));
const next: ScheduleFile = { epoch: schedule.epoch, ...extended };

// New entries must all be in today's pool; earlier ones only have to still exist.
const problems = scheduleProblems(next, {
  knownIds: dataset.items.map((i) => i.id),
  poolIds: pool,
  fromPuzzle: before + 1,
});
if (problems.length) {
  console.error(`refusing to write an invalid schedule:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
await writeFile(
  SCHEDULE_PATH,
  JSON.stringify(
    { epoch: next.epoch, cycleStarts: next.cycleStarts, entries: next.entries },
    null,
    2,
  ) + "\n",
  "utf8",
);
console.log(`schedule: ${before} -> ${next.entries.length} entries from ${next.epoch}`);
