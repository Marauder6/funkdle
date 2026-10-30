import { describe, expect, it } from "vitest";
import { DatasetSchema } from "../src/core/schema";
import { COMPONENT_NAMES } from "../src/core/types";
import { runBuild } from "../scripts/lib/run-build";
import { ITEMS_JSON, dataset } from "./fixtures";

describe("data/items.json", () => {
  it("validates against the schema", () => {
    const result = DatasetSchema.safeParse(dataset);
    expect(result.success, JSON.stringify(result.error?.issues.slice(0, 5))).toBe(true);
  });

  it("uses only canonical component names", () => {
    const canonical = new Set<string>(COMPONENT_NAMES);
    for (const i of dataset.items) {
      for (const c of Object.keys(i.components))
        expect(canonical.has(c), `${i.id}: ${c}`).toBe(true);
    }
  });

  it("has consistent derived counts", () => {
    for (const i of dataset.items) {
      const q = Object.values(i.components);
      expect(i.totalComponents).toBe(q.reduce((a, b) => a + b, 0));
      expect(i.uniqueComponents).toBe(q.length);
    }
  });

  it("has unique ids and names", () => {
    const ids = dataset.items.map((i) => i.id);
    const names = dataset.items.map((i) => i.name.toLowerCase());
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("is exactly what data:build produces from the committed snapshot and overrides", () => {
    // Catches hand edits to items.json and a stale build. Two builds must be byte-identical.
    const first = runBuild().json;
    const second = runBuild().json;
    expect(second).toBe(first);
    expect(first).toBe(ITEMS_JSON);
  });
});
