// npm run data:fetch: snapshot the junk-item wiki pages into pipeline/raw/ (SPEC 5.1).
// The only networked step in the pipeline. Everything downstream parses the committed snapshot.

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { planSnapshot } from "./lib/fetch";
import { RAW_DIR, type RawSourceOk } from "./lib/raw";

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
  const plan = await planSnapshot(SOURCES, fetchPage);
  for (const line of plan.log) console.log(line);
  if (plan.primaryFailed) {
    process.exitCode = 1;
    return;
  }
  await mkdir(RAW_DIR, { recursive: true });
  for (const w of plan.writes) await writeFile(join(RAW_DIR, w.file), w.content, "utf8");
}

await main();
