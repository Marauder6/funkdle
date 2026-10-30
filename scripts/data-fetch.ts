// npm run data:fetch: snapshot the junk-item wiki pages into pipeline/raw/ (SPEC 5.1).
// The only networked step in the pipeline. Everything downstream parses the committed snapshot.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { RAW_DIR, type RawMetadata, type RawSourceOk } from "./lib/raw";

const USER_AGENT =
  "FunkdleDataPipeline/0.1 (fan game data snapshot; https://github.com/Marauder6/funkdle)";

interface Source {
  key: string;
  role: "primary" | "cross-check";
  api: string;
  page: string;
  pageUrl: string;
}

const SOURCES: Source[] = [
  {
    key: "nukapedia",
    role: "primary",
    api: "https://fallout.fandom.com/api.php",
    page: "Fallout_4_junk_items",
    pageUrl: "https://fallout.fandom.com/wiki/Fallout_4_junk_items",
  },
  {
    key: "fallout-wiki",
    role: "cross-check",
    api: "https://fallout.wiki/api.php",
    page: "Fallout_4_junk_items",
    pageUrl: "https://fallout.wiki/wiki/Fallout_4_junk_items",
  },
];

interface ParseResponse {
  parse?: { title: string; revid: number; text: string | { "*": string } };
  error?: { code: string; info: string };
}

async function fetchPage(source: Source): Promise<{ html: string; meta: RawSourceOk }> {
  const params = new URLSearchParams({
    action: "parse",
    page: source.page,
    prop: "text|revid",
    redirects: "1",
    format: "json",
  });
  const apiUrl = `${source.api}?${params.toString()}`;
  const res = await fetch(apiUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok)
    throw new Error(`${source.key}: HTTP ${res.status} ${res.statusText} from ${apiUrl}`);
  const body = (await res.json()) as ParseResponse;
  if (body.error)
    throw new Error(`${source.key}: API error ${body.error.code}: ${body.error.info}`);
  if (!body.parse) throw new Error(`${source.key}: response has no "parse" member`);
  const text = body.parse.text;
  const html = typeof text === "string" ? text : text["*"];
  return {
    html,
    meta: {
      role: source.role,
      title: body.parse.title,
      url: source.pageUrl,
      apiUrl,
      finalUrl: res.url,
      revisionId: body.parse.revid,
      retrievedAt: new Date().toISOString(),
      file: `${source.key}.html`,
      sha256: createHash("sha256").update(html, "utf8").digest("hex"),
      bytes: Buffer.byteLength(html, "utf8"),
    },
  };
}

async function main(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true });
  const metadata: RawMetadata = { sources: {} };
  let primaryFailed = false;

  // Sequential on purpose: polite fetching, one request per page, no parallelism.
  for (const source of SOURCES) {
    try {
      const { html, meta } = await fetchPage(source);
      await writeFile(join(RAW_DIR, meta.file), html, "utf8");
      metadata.sources[source.key] = meta;
      console.log(`${source.key}: "${meta.title}" rev ${meta.revisionId}, ${meta.bytes} bytes`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      metadata.sources[source.key] = {
        role: source.role,
        failed: true,
        reason,
        attemptedAt: new Date().toISOString(),
      };
      if (source.role === "primary") primaryFailed = true;
      console.error(`${source.role === "primary" ? "FAILED" : "DEGRADED"}: ${reason}`);
    }
  }

  if (primaryFailed) {
    console.error("Primary source failed; metadata.json not written, snapshot unchanged.");
    process.exitCode = 1;
    return;
  }
  await writeFile(join(RAW_DIR, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");
}

await main();
