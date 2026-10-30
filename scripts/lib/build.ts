// Snapshot + overrides -> Dataset (SPEC 5). Pure and deterministic: same inputs, same bytes.

import { collisionClasses } from "../../src/core/fingerprint";
import { DatasetSchema } from "../../src/core/schema";
import {
  ORIGINS,
  type ComponentName,
  type Dataset,
  type Item,
  type Origin,
} from "../../src/core/types";
import {
  SECTION_ORIGIN,
  canonicalComponents,
  componentsText,
  parseComponentsText,
  parseValue,
  parseWeightHundredths,
  slugify,
} from "./normalize";
import type { ExcludeOverride, FixOverride, Overrides } from "./overrides";
import { parseJunkTables, type RawRow } from "./parse";
import type { RawSourceOk } from "./raw";

export interface RowSummary {
  section: string;
  value: number;
  weight: number;
  components: string;
  formIds: string[];
}

export interface Exclusion {
  name: string;
  section: string;
  kind: "override" | "rule" | "config";
  reason: string;
}

export interface Merge {
  name: string;
  keptSection: string;
  otherSections: string[];
}

export interface Conflict {
  name: string;
  kept: RowSummary;
  dropped: RowSummary[];
}

export interface BuildReport {
  rowsParsed: number;
  rowsPerSection: Record<string, number>;
  exclusions: Exclusion[];
  merges: Merge[];
  conflicts: Conflict[];
  fixesApplied: FixOverride[];
}

export interface BuildResult {
  dataset: Dataset;
  json: string;
  report: BuildReport;
}

export class BuildError extends Error {
  constructor(readonly problems: string[]) {
    super(`data build failed with ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  }
}

interface NormRow {
  name: string;
  section: string;
  order: number;
  origin: Origin;
  value: number;
  weightH: number;
  components: Partial<Record<ComponentName, number>>;
  formIds: string[];
}

const sortedComponents = (c: Partial<Record<ComponentName, number>>) =>
  Object.fromEntries((Object.keys(c) as ComponentName[]).sort().map((k) => [k, c[k]])) as Partial<
    Record<ComponentName, number>
  >;

const sameStats = (a: NormRow, b: NormRow) =>
  a.value === b.value &&
  a.weightH === b.weightH &&
  JSON.stringify(sortedComponents(a.components)) === JSON.stringify(sortedComponents(b.components));

const summary = (r: NormRow): RowSummary => ({
  section: r.section,
  value: r.value,
  weight: r.weightH / 100,
  components: Object.entries(sortedComponents(r.components))
    .map(([k, v]) => `${k} x${v}`)
    .join(", "),
  formIds: r.formIds,
});

function matchRows(rows: RawRow[], o: { name: string; section?: string | undefined }) {
  return rows.filter((r) => r.name === o.name && (!o.section || r.section === o.section));
}

export function buildDataset(
  html: string,
  meta: RawSourceOk,
  overrides: Overrides,
  opts: { includeCreationClub: boolean },
): BuildResult {
  const rows = parseJunkTables(html);
  const problems: string[] = [];
  const exclusions: Exclusion[] = [];
  const label = (r: { section: string; name: string }) => `${r.section} / ${r.name}`;

  // Resolve every override against the raw rows first: one that matches nothing, or more than
  // one row, is stale or ambiguous and fails the build.
  const excludedBy = new Map<RawRow, ExcludeOverride>();
  const fixesFor = new Map<RawRow, FixOverride[]>();
  const resolve = (o: ExcludeOverride | FixOverride, kind: string): RawRow | undefined => {
    const hits = matchRows(rows, o);
    if (hits.length === 1) return hits[0];
    problems.push(
      `${kind} override for "${o.name}"${o.section ? ` in ${o.section}` : ""} matches ${hits.length} rows` +
        (hits.length > 1 ? "; add a section" : ""),
    );
    return undefined;
  };
  for (const o of overrides.exclude) {
    const row = resolve(o, "exclude");
    if (row) excludedBy.set(row, o);
  }
  for (const o of overrides.fix) {
    const row = resolve(o, "fix");
    if (row) fixesFor.set(row, [...(fixesFor.get(row) ?? []), o]);
  }

  const rowsPerSection: Record<string, number> = {};
  const normRows: NormRow[] = [];
  for (const raw of rows) {
    rowsPerSection[raw.section] = (rowsPerSection[raw.section] ?? 0) + 1;
    const ex = excludedBy.get(raw);
    if (ex) {
      exclusions.push({
        name: raw.name,
        section: raw.section,
        kind: "override",
        reason: ex.reason,
      });
      continue;
    }

    const row = { ...raw, components: [...raw.components] };
    for (const fix of fixesFor.get(raw) ?? []) {
      const current =
        fix.field === "name"
          ? row.name
          : fix.field === "value"
            ? row.valueText
            : fix.field === "weight"
              ? row.weightText
              : componentsText(row.components);
      if (current !== fix.from) {
        problems.push(
          `${label(raw)}: fix of ${fix.field} expects "${fix.from}", snapshot has "${current}"`,
        );
        continue;
      }
      if (fix.field === "name") row.name = fix.to;
      else if (fix.field === "value") row.valueText = fix.to;
      else if (fix.field === "weight") row.weightText = fix.to;
      else row.components = parseComponentsText(fix.to);
    }

    const origin = SECTION_ORIGIN[row.section];
    if (!origin) problems.push(`${label(raw)}: unknown section "${row.section}"`);
    for (const p of row.problems) problems.push(`${label(raw)}: ${p}`);
    if (row.components.length === 0) {
      exclusions.push({
        name: raw.name,
        section: raw.section,
        kind: "rule",
        reason: "no components",
      });
      continue;
    }
    const value = parseValue(row.valueText);
    const weight = parseWeightHundredths(row.weightText);
    const components = canonicalComponents(row.components);
    for (const r of [value, weight, components])
      if (!r.ok) problems.push(`${label(raw)}: ${r.problem}`);
    if (row.formIds.length === 0) problems.push(`${label(raw)}: no form ID`);
    if (!origin || !value.ok || !weight.ok || !components.ok) continue;

    normRows.push({
      name: row.name,
      section: row.section,
      order: row.order,
      origin,
      value: value.value,
      weightH: weight.value,
      components: components.value,
      formIds: row.formIds,
    });
  }
  if (problems.length) throw new BuildError(problems);

  // Same name in several sections: one item, earliest origin, then page order (SPEC 5.3).
  const groups = new Map<string, NormRow[]>();
  for (const r of normRows) {
    const key = r.name.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const merges: Merge[] = [];
  const conflicts: Conflict[] = [];
  const kept: NormRow[] = [];
  for (const group of groups.values()) {
    group.sort(
      (a, b) => ORIGINS.indexOf(a.origin) - ORIGINS.indexOf(b.origin) || a.order - b.order,
    );
    const [first, ...others] = group;
    if (!first) continue;
    const item = { ...first, formIds: [...first.formIds] };
    const dropped: NormRow[] = [];
    for (const other of others) {
      if (sameStats(first, other)) item.formIds.push(...other.formIds);
      else dropped.push(other);
    }
    if (others.length) {
      merges.push({
        name: first.name,
        keptSection: first.section,
        otherSections: others.map((o) => o.section),
      });
    }
    if (dropped.length) {
      conflicts.push({ name: first.name, kept: summary(first), dropped: dropped.map(summary) });
    }
    kept.push(item);
  }

  const items: Item[] = [];
  const idOwner = new Map<string, string>();
  for (const r of kept) {
    if (r.origin === "creation-club" && !opts.includeCreationClub) {
      exclusions.push({
        name: r.name,
        section: r.section,
        kind: "config",
        reason: "Creation Club item (INCLUDE_CREATION_CLUB is false)",
      });
      continue;
    }
    const id = slugify(r.name);
    const owner = idOwner.get(id);
    if (owner) problems.push(`"${r.name}" and "${owner}" both slug to id "${id}"`);
    idOwner.set(id, r.name);
    const components = sortedComponents(r.components);
    const quantities = Object.values(components);
    items.push({
      id,
      name: r.name,
      value: r.value,
      weight: r.weightH / 100,
      components,
      totalComponents: quantities.reduce((a, b) => a + b, 0),
      uniqueComponents: quantities.length,
      origin: r.origin,
      formIds: r.formIds,
      inTargetPool: false,
    });
  }
  if (problems.length) throw new BuildError(problems);

  // SPEC 5.4: targetable iff its fingerprint is unique within the guessable set.
  for (const members of collisionClasses(items).values()) {
    if (members.length === 1 && members[0]) members[0].inTargetPool = true;
  }
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const dataset: Dataset = {
    schemaVersion: 1,
    source: {
      title: meta.title,
      url: meta.url,
      revisionId: meta.revisionId,
      retrievedAt: meta.retrievedAt,
    },
    // Pinned to the snapshot time, not the wall clock, so two builds are byte-identical.
    generatedAt: meta.retrievedAt,
    items,
  };
  const check = DatasetSchema.safeParse(dataset);
  if (!check.success) {
    throw new BuildError(check.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  }

  return {
    dataset,
    json: JSON.stringify(dataset, null, 2) + "\n",
    report: {
      rowsParsed: rows.length,
      rowsPerSection,
      exclusions,
      merges,
      conflicts,
      fixesApplied: overrides.fix,
    },
  };
}
