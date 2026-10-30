// pipeline/overrides.yaml: the only place manual corrections live (SPEC 5.3).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { ROOT } from "./raw";

export const OVERRIDES_PATH = join(ROOT, "pipeline", "overrides.yaml");

const target = {
  /** Row name exactly as the wiki shows it. */
  name: z.string().min(1),
  /** Section heading; required when the name appears in more than one section. */
  section: z.string().min(1).optional(),
  reason: z.string().min(10),
};

const ExcludeSchema = z.strictObject(target);

/**
 * `from` must equal the snapshot's current text for the field, so a fix that no longer matches
 * (the wiki changed and the snapshot was refreshed) fails the build instead of applying blindly.
 * Components are written as "Steel x2, Screw x1" in the wiki's order.
 */
const FixSchema = z.strictObject({
  ...target,
  field: z.enum(["name", "value", "weight", "components"]),
  from: z.string(),
  to: z.string().min(1),
});

export const OverridesSchema = z.strictObject({
  exclude: z.array(ExcludeSchema).default([]),
  fix: z.array(FixSchema).default([]),
});

export type Overrides = z.infer<typeof OverridesSchema>;
export type ExcludeOverride = z.infer<typeof ExcludeSchema>;
export type FixOverride = z.infer<typeof FixSchema>;

export function loadOverrides(path = OVERRIDES_PATH): Overrides {
  const parsed: unknown = parse(readFileSync(path, "utf8")) ?? {};
  return OverridesSchema.parse(parsed);
}
