// npm run schedule:check: fails on an invalid schedule; warns (GitHub annotation) when fewer than
// 60 days of puzzles remain (SPEC 7). Runs in CI on every push.

import { readFileSync } from "node:fs";
import { formatCalendarDate, type Schedule } from "../src/core/daily";
import { DatasetSchema } from "../src/core/schema";
import { ITEMS_PATH, SCHEDULE_PATH } from "./lib/raw";
import { daysRemaining, scheduleProblems } from "./lib/schedule";

const WARN_BELOW_DAYS = 60;

const schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf8")) as Schedule;
const dataset = DatasetSchema.parse(JSON.parse(readFileSync(ITEMS_PATH, "utf8")));
const pool = dataset.items.filter((i) => i.inTargetPool).map((i) => i.id);

const problems = scheduleProblems(schedule, pool);
if (problems.length) {
  console.error(`schedule invalid:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const now = new Date();
const today = formatCalendarDate({
  year: now.getUTCFullYear(),
  month: now.getUTCMonth() + 1,
  day: now.getUTCDate(),
});
const left = daysRemaining(schedule, today);
const message = `${left} days of daily puzzles left as of ${today} (UTC); ${schedule.entries.length} scheduled from ${schedule.epoch}.`;
if (left < WARN_BELOW_DAYS) {
  // GitHub Actions turns this line into a warning annotation; locally it is just text.
  console.log(
    `::warning title=Daily schedule running out::${message} Run npm run schedule:extend -- --days 365.`,
  );
} else {
  console.log(message);
}
