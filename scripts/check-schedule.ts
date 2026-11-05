// npm run schedule:check: fails on an invalid schedule; warns (GitHub annotation) when fewer than
// 60 days of puzzles remain (SPEC 7). Runs in CI on every push and weekly.

import { readFileSync } from "node:fs";
import { parseCalendarDate, puzzleNumber } from "../src/core/daily";
import { DatasetSchema } from "../src/core/schema";
import { ITEMS_PATH, SCHEDULE_PATH } from "./lib/raw";
import { datesOnEarth, daysRemaining, scheduleProblems, type ScheduleFile } from "./lib/schedule";

const WARN_BELOW_DAYS = 60;

const schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf8")) as ScheduleFile;
const dataset = DatasetSchema.parse(JSON.parse(readFileSync(ITEMS_PATH, "utf8")));
const { earliest, latest } = datesOnEarth(new Date());

// Past puzzles only have to still exist; today's (in the earliest zone) and later must be
// unique answers.
const problems = scheduleProblems(schedule, {
  knownIds: dataset.items.map((i) => i.id),
  poolIds: dataset.items.filter((i) => i.inTargetPool).map((i) => i.id),
  fromPuzzle: puzzleNumber(parseCalendarDate(earliest), parseCalendarDate(schedule.epoch)),
});
if (problems.length) {
  console.error(`schedule invalid:\n  ${problems.join("\n  ")}`);
  process.exit(1);
}

const left = daysRemaining(schedule, latest);
const message =
  `${left} days of daily puzzles left as of ${latest} (the latest date anywhere); ` +
  `${schedule.entries.length} scheduled from ${schedule.epoch}.`;
if (left < WARN_BELOW_DAYS) {
  // GitHub Actions turns this line into a warning annotation; locally it is just text.
  console.log(
    `::warning title=Daily schedule running out::${message} Run npm run schedule:extend -- --days 365.`,
  );
} else {
  console.log(message);
}
