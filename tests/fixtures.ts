import { readFileSync } from "node:fs";
import type { Dataset, Item } from "../src/core/types";

export const ITEMS_JSON = readFileSync(new URL("../data/items.json", import.meta.url), "utf8");
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
