import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Dataset, Item } from "../src/core/types";

// A path, not new URL(): in DOM test files URL is the DOM's, which node:fs rejects.
export const ITEMS_JSON = readFileSync(
  join(import.meta.dirname, "..", "data", "items.json"),
  "utf8",
);
export const dataset = JSON.parse(ITEMS_JSON) as Dataset;

/** A real stored item, by display name (U-check-tests-guarantee: no transcribed fixtures). */
export function item(name: string): Item {
  const found = dataset.items.find((i) => i.name === name);
  if (!found) throw new Error(`fixture item "${name}" is not in data/items.json`);
  return found;
}

/** A synthetic item for boundary tests; the dataset has no item at every boundary. */
export function synthetic(over: Partial<Item>): Item {
  const components = over.components ?? { Steel: 1 };
  const quantities = Object.values(components);
  return {
    id: "synthetic",
    name: "Synthetic",
    value: 10,
    weight: 1,
    origin: "base",
    formIds: ["00000000"],
    inTargetPool: true,
    ...over,
    components,
    totalComponents: over.totalComponents ?? quantities.reduce((a, b) => a + b, 0),
    uniqueComponents: over.uniqueComponents ?? quantities.length,
  };
}
