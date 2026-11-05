// Which snapshot files data:fetch writes, decided only after every fetch has finished, so a failed
// primary fetch leaves the committed snapshot exactly as it was (review 2026-11-05: the
// cross-check page used to be written before the primary was known to have failed).

import type { RawMetadata, RawSourceOk } from "./raw";

export interface SnapshotSource {
  key: string;
  role: "primary" | "cross-check";
}

export interface SnapshotPlan {
  /** Files to write, in order: page snapshots first, metadata.json last. Empty on failure. */
  writes: Array<{ file: string; content: string }>;
  primaryFailed: boolean;
  log: string[];
}

export async function planSnapshot<S extends SnapshotSource>(
  sources: readonly S[],
  fetchPage: (source: S) => Promise<{ html: string; meta: RawSourceOk }>,
  now: () => string = () => new Date().toISOString(),
): Promise<SnapshotPlan> {
  const metadata: RawMetadata = { sources: {} };
  const pages: Array<{ file: string; content: string }> = [];
  const log: string[] = [];
  let primaryFailed = false;

  // Sequential on purpose: polite fetching, one request per page, no parallelism.
  for (const source of sources) {
    try {
      const { html, meta } = await fetchPage(source);
      pages.push({ file: meta.file, content: html });
      metadata.sources[source.key] = meta;
      log.push(`${source.key}: "${meta.title}" rev ${meta.revisionId}, ${meta.bytes} bytes`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      metadata.sources[source.key] = {
        role: source.role,
        failed: true,
        reason,
        attemptedAt: now(),
      };
      if (source.role === "primary") primaryFailed = true;
      log.push(`${source.role === "primary" ? "FAILED" : "DEGRADED"}: ${reason}`);
    }
  }

  if (primaryFailed) {
    log.push("Primary source failed; nothing written, snapshot unchanged.");
    return { writes: [], primaryFailed, log };
  }
  return {
    writes: [
      ...pages,
      { file: "metadata.json", content: JSON.stringify(metadata, null, 2) + "\n" },
    ],
    primaryFailed,
    log,
  };
}
