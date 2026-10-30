// Compares the dataset with the Independent Fallout Wiki snapshot (SPEC 5.1). Reports only;
// the primary source decides.

import type { Item } from "../../src/core/types";
import { weightHundredths } from "../../src/core/types";
import {
  SECTION_ORIGIN,
  canonicalComponents,
  parseValue,
  parseWeightHundredths,
} from "./normalize";
import { parseJunkTables } from "./parse";

export interface CrossRow {
  section: string;
  name: string;
  value: string;
  weight: string;
  components: string;
}

export interface CrossCheckResult {
  rowsParsed: number;
  unreadable: Array<{ section: string; name: string; problem: string }>;
  missing: Item[];
  extra: CrossRow[];
  differences: Array<{ item: Item; rows: CrossRow[] }>;
}

const statKey = (value: number, weightH: number, components: Record<string, number>) =>
  `${value}|${weightH}|${Object.entries(components)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}x${v}`)
    .join(",")}`;

export function crossCheck(
  html: string,
  items: Item[],
  excludedNames: Set<string>,
): CrossCheckResult {
  const rows = parseJunkTables(html);
  const unreadable: CrossCheckResult["unreadable"] = [];
  const byName = new Map<string, Array<{ row: CrossRow; key: string | null }>>();

  for (const raw of rows) {
    const value = parseValue(raw.valueText);
    const weight = parseWeightHundredths(raw.weightText);
    const comps = canonicalComponents(raw.components);
    const problems = [
      ...raw.problems,
      ...(SECTION_ORIGIN[raw.section] ? [] : [`unknown section "${raw.section}"`]),
      ...[value, weight, comps].flatMap((r) => (r.ok ? [] : [r.problem])),
    ];
    const row: CrossRow = {
      section: raw.section,
      name: raw.name,
      value: raw.valueText,
      weight: raw.weightText,
      components: raw.components.map((c) => `${c.name} x${c.quantity}`).join(", "),
    };
    if (problems.length)
      unreadable.push({ section: raw.section, name: raw.name, problem: problems.join("; ") });
    const key =
      value.ok && weight.ok && comps.ok ? statKey(value.value, weight.value, comps.value) : null;
    const k = raw.name.toLowerCase();
    byName.set(k, [...(byName.get(k) ?? []), { row, key }]);
  }

  const missing: Item[] = [];
  const differences: CrossCheckResult["differences"] = [];
  const itemNames = new Set(items.map((i) => i.name.toLowerCase()));
  for (const item of items) {
    if (item.origin === "creation-club") continue; // the cross-check page has no CC table
    const found = byName.get(item.name.toLowerCase());
    if (!found) {
      missing.push(item);
      continue;
    }
    const key = statKey(item.value, weightHundredths(item), item.components);
    if (!found.some((f) => f.key === key))
      differences.push({ item, rows: found.map((f) => f.row) });
  }
  const extra = [...byName.entries()]
    .filter(([name]) => !itemNames.has(name) && !excludedNames.has(name))
    .flatMap(([, found]) => found.map((f) => f.row));

  return { rowsParsed: rows.length, unreadable, missing, extra, differences };
}
