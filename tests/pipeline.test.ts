// The data pipeline must fail loudly when the wiki page changes under it, never drop or invent
// data quietly (U-untrusted-data, U-no-silent-fallback). Written against the 2026-11-05 review.

import { describe, expect, it } from "vitest";
import { BuildError, buildDataset } from "../scripts/lib/build";
import { planSnapshot } from "../scripts/lib/fetch";
import type { Overrides } from "../scripts/lib/overrides";
import type { RawSourceOk } from "../scripts/lib/raw";
import { runBuild } from "../scripts/lib/run-build";

const HEADERS = ["Name", "Value", "Weight", "V:W", "Components", "Form ID"];
const section = (title: string, rows: string, headers = HEADERS, tag = "h3") =>
  `<${tag}><span class="mw-headline">${title}</span></${tag}>` +
  `<table class="va-table sortable"><tr>${headers.map((x) => `<th>${x}</th>`).join("")}</tr>${rows}</table>`;
const link = (n: string) => `<a href="/wiki/${n}">${n}</a>`;
let formId = 0x100;
const row = (name: string, opts: { value?: string; comps?: string; extra?: string } = {}) =>
  `<tr><td>${name}${opts.extra ?? ""}</td><td>${opts.value ?? "1"}</td><td>0.5</td><td>2</td>` +
  `<td>${opts.comps ?? link("Steel")}</td><td><span class="va-formid">${(formId++).toString(16).padStart(8, "0")}</span></td></tr>`;

const meta: RawSourceOk = {
  role: "primary",
  title: "Test",
  url: "https://example.invalid/wiki/Test",
  apiUrl: "",
  finalUrl: "",
  revisionId: 1,
  retrievedAt: "2026-01-01T00:00:00.000Z",
  file: "x.html",
  sha256: "",
  bytes: 0,
};
const none: Overrides = { exclude: [], fix: [] };
const build = (html: string, overrides: Overrides = none) =>
  buildDataset(html, meta, overrides, { includeCreationClub: false });
const names = (html: string) => build(html).dataset.items.map((i) => i.name);
const problems = (html: string, overrides: Overrides = none): string => {
  try {
    build(html, overrides);
  } catch (err) {
    if (err instanceof BuildError) return err.problems.join("\n");
    throw err;
  }
  return "(built without problems)";
};

describe("a changed page fails the build instead of losing items", () => {
  it("a table under a known section whose headers changed", () => {
    const html =
      section("Base game", row("Fork")) +
      section("Far Harbor", row("Spoon"), [
        "Item",
        "Value",
        "Weight",
        "V:W",
        "Components",
        "Form ID",
      ]);
    expect(problems(html)).toMatch(/Far Harbor.*not read/);
  });

  it("a known section whose table has no rows", () => {
    const html = section("Base game", row("Fork")) + section("Nuka-World", "");
    expect(problems(html)).toMatch(/Nuka-World.*no rows/);
  });

  it("a page with no base-game items at all", () => {
    expect(problems(section("Far Harbor", row("Spoon")))).toMatch(/Base game/);
  });

  it("a table under an h4 heading the pipeline does not know", () => {
    const html =
      section("Base game", row("Fork")) + section("Fallout London", row("Spoon"), HEADERS, "h4");
    expect(problems(html)).toMatch(/unknown section "Fallout London"/);
  });
});

describe("hidden and decorative text never reaches the data", () => {
  it("a hidden sort key inside a value", () => {
    const html = section(
      "Base game",
      row("Fork", { value: '<span style="display:none">0015</span>15' }),
    );
    expect(build(html).dataset.items[0]?.value).toBe(15);
  });

  it("a footnote marker after a name", () => {
    const html = section(
      "Base game",
      row("Coffee cup", { extra: '<sup class="reference">[1]</sup>' }),
    );
    expect(names(html)).toEqual(["Coffee cup"]);
  });

  it("a name with characters no item name uses is refused, not slugged", () => {
    expect(problems(section("Base game", row("Fork{1}")))).toMatch(/name "Fork\{1\}"/);
  });
});

describe("cut content", () => {
  const cut = (title: string, where: "name" | "formid") => {
    const icon = `<span class="va-icon" title="${title}"></span>`;
    const r = row("Ghost item").replace(
      where === "name" ? "Ghost item</td>" : "</span></td></tr>",
      where === "name" ? `Ghost item ${icon}</td>` : `</span>${icon}</td></tr>`,
    );
    return section("Base game", row("Fork") + r);
  };

  it("is excluded whatever the marker's case", () => {
    expect(names(cut("Cut Content", "name"))).toEqual(["Fork"]);
  });

  it("is excluded wherever in the row the marker sits", () => {
    expect(names(cut("Cut content", "formid"))).toEqual(["Fork"]);
  });

  it("on the real snapshot, excludes exactly these items, by the cut-content rule", () => {
    const cutRule = runBuild()
      .report.exclusions.filter((e) => /cut content/i.test(e.reason))
      .map((e) => e.name)
      .sort();
    expect(cutRule).toEqual([
      "Angler gunk",
      "Bond",
      "CC-00 helmet prop",
      "Captain Cosmos poster",
      "Land grant",
      "Manuscript",
      "Property deed",
    ]);
  });
});

describe("data:fetch writes all or nothing", () => {
  const sources = [
    { key: "nukapedia", role: "primary" as const },
    { key: "fallout-wiki", role: "cross-check" as const },
  ];
  const page = (key: string) => ({
    html: `<p>${key}</p>`,
    meta: { ...meta, file: `${key}.html`, title: key },
  });

  it("a failed primary fetch writes nothing, even if the cross-check succeeded", async () => {
    const plan = await planSnapshot(sources, async (s) => {
      if (s.role === "primary") throw new Error("HTTP 503");
      return page(s.key);
    });
    expect(plan.primaryFailed).toBe(true);
    expect(plan.writes).toEqual([]);
  });

  it("a failed cross-check still writes the primary, with the failure recorded", async () => {
    const plan = await planSnapshot(sources, async (s) => {
      if (s.role === "cross-check") throw new Error("HTTP 500");
      return page(s.key);
    });
    expect(plan.writes.map((w) => w.file)).toEqual(["nukapedia.html", "metadata.json"]);
    const metadata = JSON.parse(plan.writes.at(-1)!.content);
    expect(metadata.sources["fallout-wiki"]).toMatchObject({ failed: true, reason: "HTTP 500" });
  });

  it("writes metadata last, after every page", async () => {
    const plan = await planSnapshot(sources, async (s) => page(s.key));
    expect(plan.writes.map((w) => w.file)).toEqual([
      "nukapedia.html",
      "fallout-wiki.html",
      "metadata.json",
    ]);
  });
});

describe("overrides", () => {
  it("a fix aimed at a row that is also excluded is a contradiction", () => {
    const html = section("Base game", row("Fork") + row("Spoon"));
    const overrides: Overrides = {
      exclude: [{ name: "Spoon", reason: "test exclusion reason" }],
      fix: [{ name: "Spoon", field: "value", from: "1", to: "2", reason: "test fix reason" }],
    };
    expect(problems(html, overrides)).toMatch(/Spoon.*excluded/);
  });

  it("only applied fixes are reported as applied", () => {
    const html = section("Base game", row("Fork"));
    const overrides: Overrides = {
      exclude: [],
      fix: [{ name: "Fork", field: "value", from: "1", to: "3", reason: "test fix reason" }],
    };
    const { report, dataset } = build(html, overrides);
    expect(dataset.items[0]?.value).toBe(3);
    expect(report.fixesApplied.map((f) => f.name)).toEqual(["Fork"]);
  });
});
