// npm run data:build: raw snapshot + pipeline/overrides.yaml -> data/items.json (SPEC 5).
// Offline and deterministic.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { BuildError } from "./lib/build";
import { ITEMS_PATH } from "./lib/raw";
import { runBuild } from "./lib/run-build";

try {
  const { dataset, json, report } = runBuild();
  await mkdir(dirname(ITEMS_PATH), { recursive: true });
  await writeFile(ITEMS_PATH, json, "utf8");
  const pool = dataset.items.filter((i) => i.inTargetPool).length;
  console.log(
    `rows parsed ${report.rowsParsed}; items ${dataset.items.length}; target pool ${pool}; ` +
      `excluded ${report.exclusions.length}; merged names ${report.merges.length}; ` +
      `conflicts ${report.conflicts.length}`,
  );
  console.log(`wrote ${ITEMS_PATH}`);
} catch (err) {
  console.error(err instanceof BuildError ? err.message : err);
  process.exitCode = 1;
}
