// npm run data:simulate: solver simulation (SPEC 6.3). Prints a summary and writes the results
// into the simulation section of data/audit-report.md.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { DEFAULT_FEEDBACK, GUESS_LIMIT } from "../src/core/config";
import { DatasetSchema } from "../src/core/schema";
import type { Item } from "../src/core/types";
import { SIM_BEGIN, SIM_END } from "./lib/markers";
import { AUDIT_PATH, ITEMS_PATH } from "./lib/raw";
import { feedbackMatrix, makeGreedyPlayer, playConsistentRandom } from "./lib/sim";
import { counts, pct, prng, quantile } from "./lib/stats";

const SEED = 20261030;
const RUNS_PER_TARGET = 100;
/** SPEC 6.3 [DEFAULT]: the limit is the smallest L at which consistent-random solves >= 95%. */
const SOLVE_TARGET = 0.95;

const raw = readFileSync(ITEMS_PATH, "utf8");
const dataset = DatasetSchema.parse(JSON.parse(raw));
const itemsSha = createHash("sha256").update(raw, "utf8").digest("hex");
const items: Item[] = dataset.items;
const poolIdx = items.flatMap((item, i) => (item.inTargetPool ? [i] : []));

const started = performance.now();
const matrix = feedbackMatrix(items, DEFAULT_FEEDBACK);

const rand = prng(SEED);
const randomLengths: number[] = [];
const randomMeanByTarget: Array<[number, number]> = [];
for (const t of poolIdx) {
  let sum = 0;
  for (let r = 0; r < RUNS_PER_TARGET; r++) {
    const len = playConsistentRandom(matrix, t, rand);
    randomLengths.push(len);
    sum += len;
  }
  randomMeanByTarget.push([t, sum / RUNS_PER_TARGET]);
}

const greedy = makeGreedyPlayer(matrix);
const greedyByTarget = poolIdx.map((t) => [t, greedy.play(t)] as const);
const greedyLengths = greedyByTarget.map(([, len]) => len);
const seconds = ((performance.now() - started) / 1000).toFixed(1);

const summarize = (lengths: number[]) => {
  const sorted = [...lengths].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  return {
    sorted,
    mean,
    median: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    max: sorted[sorted.length - 1]!,
  };
};
const rs = summarize(randomLengths);
const gs = summarize(greedyLengths);
const within = (sorted: number[], l: number) => sorted.filter((x) => x <= l).length;
let recommended = 1;
while (within(rs.sorted, recommended) / rs.sorted.length < SOLVE_TARGET) recommended++;

const lines: string[] = [];
const out = (...l: string[]) => lines.push(...l);
out(
  `Dataset sha256 \`${itemsSha}\`. Guessable set ${items.length}, target pool ${poolIdx.length}. Seed ${SEED}; consistent-random plays ${RUNS_PER_TARGET} games per target (${randomLengths.length.toLocaleString("en-US")} games), greedy plays one per target. Both choose guesses from the whole guessable set and count as candidates every guessable item consistent with the feedback so far.`,
  "",
  `- **Recommended guess limit: ${recommended}** (smallest L at which consistent-random solves at least ${SOLVE_TARGET * 100}% of games within L guesses).`,
  `- Greedy (skill ceiling): mean **${gs.mean.toFixed(2)}**, median ${gs.median}, max ${gs.max}. First guess: ${items[greedy.firstGuess()]!.name}.`,
  `- Consistent-random: mean **${rs.mean.toFixed(2)}**, median ${rs.median}, 95th percentile ${rs.p95}, max ${rs.max}.`,
  `- Under the current limit (${GUESS_LIMIT}): consistent-random solves ${pct(within(rs.sorted, GUESS_LIMIT), rs.sorted.length)}, greedy ${pct(within(gs.sorted, GUESS_LIMIT), gs.sorted.length)}.`,
  "",
  "| Guesses | Consistent-random | Cumulative | Greedy | Cumulative |",
  "|---|---|---|---|---|",
);
const rc = counts(randomLengths);
const gc = counts(greedyLengths);
for (let l = 1; l <= Math.max(rs.max, gs.max); l++) {
  out(
    `| ${l} | ${pct(rc.get(l) ?? 0, rs.sorted.length)} | ${pct(within(rs.sorted, l), rs.sorted.length)} | ` +
      `${gc.get(l) ?? 0} | ${pct(within(gs.sorted, l), gs.sorted.length)} |`,
  );
}
const hardest = (pairs: ReadonlyArray<readonly [number, number]>, f: (x: number) => string) =>
  [...pairs]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 8)
    .map(([t, v]) => `${items[t]!.name} (${f(v)})`)
    .join(", ");
out(
  "",
  `Hardest targets for greedy: ${hardest(greedyByTarget, String)}.`,
  "",
  `Hardest targets for consistent-random (mean guesses): ${hardest(randomMeanByTarget, (v) => v.toFixed(2))}.`,
);

const report = readFileSync(AUDIT_PATH, "utf8");
const begin = report.indexOf(SIM_BEGIN);
const end = report.indexOf(SIM_END);
if (begin < 0 || end < begin) {
  console.error(`${AUDIT_PATH} has no simulation section. Run npm run data:audit first.`);
  process.exit(1);
}
await writeFile(
  AUDIT_PATH,
  report.slice(0, begin + SIM_BEGIN.length) + "\n" + lines.join("\n") + "\n" + report.slice(end),
  "utf8",
);
console.log(lines.slice(2, 6).join("\n"));
// Run time goes to the console only, so the report changes only when the data or code does.
console.log(`updated ${AUDIT_PATH} (simulation took ${seconds} s)`);
