// Shape and location of the committed wiki snapshot (SPEC 5.1).

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "..", "..");
export const RAW_DIR = join(ROOT, "pipeline", "raw");
export const ITEMS_PATH = join(ROOT, "data", "items.json");
export const AUDIT_PATH = join(ROOT, "data", "audit-report.md");
export const SCHEDULE_PATH = join(ROOT, "data", "schedule.json");

export interface RawSourceOk {
  role: "primary" | "cross-check";
  title: string;
  url: string;
  apiUrl: string;
  finalUrl: string;
  revisionId: number;
  retrievedAt: string;
  file: string;
  sha256: string;
  bytes: number;
}

/** A source that could not be fetched still records why (U-outcome-carries-reason). */
export interface RawSourceFailed {
  role: "primary" | "cross-check";
  failed: true;
  reason: string;
  attemptedAt: string;
}

export type RawSourceMeta = RawSourceOk | RawSourceFailed;

export interface RawMetadata {
  sources: Record<string, RawSourceMeta>;
}

export function isOk(meta: RawSourceMeta | undefined): meta is RawSourceOk {
  return meta !== undefined && !("failed" in meta);
}

/** Reads one snapshot and refuses it if its bytes are not the ones data:fetch recorded. */
export function loadSnapshot(key: string): { html: string; meta: RawSourceOk } {
  const metadata = JSON.parse(readFileSync(join(RAW_DIR, "metadata.json"), "utf8")) as RawMetadata;
  const meta = metadata.sources[key];
  if (!isOk(meta)) {
    throw new Error(`snapshot "${key}" is missing or failed: ${JSON.stringify(meta ?? null)}`);
  }
  const html = readFileSync(join(RAW_DIR, meta.file), "utf8");
  const sha = createHash("sha256").update(html, "utf8").digest("hex");
  if (sha !== meta.sha256) {
    throw new Error(
      `${meta.file}: sha256 ${sha} does not match metadata.json (${meta.sha256}). ` +
        "The snapshot was altered after fetching (line-ending conversion?); see .gitattributes.",
    );
  }
  return { html, meta };
}
