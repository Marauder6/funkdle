import { describe, expect, it } from "vitest";
import { BuildError, buildDataset } from "../scripts/lib/build";
import {
  canonicalComponent,
  canonicalComponents,
  parseWeightHundredths,
  slugify,
} from "../scripts/lib/normalize";
import { parseJunkTables } from "../scripts/lib/parse";
import type { RawSourceOk } from "../scripts/lib/raw";

const table = (rows: string) => `
<h3><span class="mw-headline">Base game</span><span class="mw-editsection">[edit]</span></h3>
<table class="sortable">
  <tr><th>Name</th><th>Value</th><th>Weight</th><th>V:W</th><th>Components</th><th>Form ID</th></tr>
  ${rows}
</table>`;

const row = (name: string, comps: string, value = "1", weight = "0.5", formId = "00012345") =>
  `<tr><td><a href="/wiki/x">${name}</a></td><td>${value}</td><td>${weight}</td><td>inf</td>` +
  `<td>${comps}</td><td><span class="va-formid">${formId}</span></td></tr>`;

const link = (n: string) => `<a href="/wiki/${n}">${n}</a>`;

describe("parseJunkTables", () => {
  it("reads components from structure: breaks, missing breaks, spaced quantities", () => {
    const [r] = parseJunkTables(
      table(row("Typewriter", `${link("Gears")} x3<br>${link("Screw")} x2 ${link("Spring")} x 3`)),
    );
    expect(r?.section).toBe("Base game");
    expect(r?.components).toEqual([
      { name: "Gears", quantity: 3 },
      { name: "Screw", quantity: 2 },
      { name: "Spring", quantity: 3 },
    ]);
    expect(r?.problems).toEqual([]);
  });

  it("treats a bare name as quantity 1 and list items as separate components", () => {
    const [r] = parseJunkTables(
      table(row("Thing", `<ul><li>Cloth</li><li>${link("Plastic")} x2</li></ul>`)),
    );
    expect(r?.components).toEqual([
      { name: "Cloth", quantity: 1 },
      { name: "Plastic", quantity: 2 },
    ]);
  });

  it("does not split concatenated text: it surfaces as an unknown component", () => {
    const [r] = parseJunkTables(table(row("Thing", "ClothPlastic")));
    expect(r?.components).toEqual([{ name: "ClothPlastic", quantity: 1 }]);
    expect(canonicalComponents(r!.components).ok).toBe(false);
  });

  it("reads several form IDs in one cell as one row", () => {
    const html = table(
      row(
        "Toaster",
        link("Steel"),
        "3",
        "3",
        '00059B19</span><br><span class="va-formid">00059B1A',
      ),
    );
    expect(parseJunkTables(html)[0]?.formIds).toEqual(["00059B19", "00059B1A"]);
  });
});

describe("normalize", () => {
  it("maps known variants and refuses unknown names", () => {
    expect(canonicalComponent("Springs")).toEqual({ ok: true, value: "Spring" });
    expect(canonicalComponent("Nuclear Material")).toEqual({ ok: true, value: "Nuclear material" });
    expect(canonicalComponent("Aluminium")).toEqual({ ok: true, value: "Aluminum" });
    expect(canonicalComponent("Black Ice").ok).toBe(false);
  });

  it("parses weights to hundredths without floating point", () => {
    expect(parseWeightHundredths("0.25")).toEqual({ ok: true, value: 25 });
    expect(parseWeightHundredths("1.5")).toEqual({ ok: true, value: 150 });
    expect(parseWeightHundredths("160")).toEqual({ ok: true, value: 16000 });
    expect(parseWeightHundredths("0.250")).toEqual({ ok: true, value: 25 });
    expect(parseWeightHundredths("0.125").ok).toBe(false);
    expect(parseWeightHundredths("").ok).toBe(false);
  });

  it("slugs names to stable ids", () => {
    expect(slugify("Nuka-Cola cup and straw")).toBe("nuka-cola-cup-and-straw");
    expect(slugify("Annika's locket")).toBe("annikas-locket");
    expect(slugify("Wooden block - B & Y")).toBe("wooden-block-b-y");
  });
});

describe("buildDataset", () => {
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
  const noOverrides = { exclude: [], fix: [] };
  const opts = { includeCreationClub: false };

  it("refuses an unknown component instead of guessing", () => {
    const html = table(row("Black Ice", link("Black Ice")));
    expect(() => buildDataset(html, meta, noOverrides, opts)).toThrow(BuildError);
  });

  it("refuses an override that matches no row", () => {
    const html = table(row("Fork", link("Steel")));
    const overrides = { exclude: [{ name: "Spoon", reason: "does not exist here" }], fix: [] };
    expect(() => buildDataset(html, meta, overrides, opts)).toThrow(/matches 0 rows/);
  });

  it("refuses a fix whose `from` no longer matches the snapshot", () => {
    const html = table(row("Fork", link("Steel"), "1"));
    const overrides = {
      exclude: [],
      fix: [
        { name: "Fork", field: "value" as const, from: "2", to: "3", reason: "test fix reason" },
      ],
    };
    expect(() => buildDataset(html, meta, overrides, opts)).toThrow(/expects "2"/);
  });
});
