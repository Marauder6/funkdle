// WCAG AA contrast for every colour pair the stylesheet uses (SPEC 9.5), in both palettes.
// Reads the custom properties straight from src/ui/styles.css so the test checks the real values.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/ui/styles.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no "${selector}" block in styles.css`);
  const body = css.slice(start, css.indexOf("}", start));
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)) vars[m[1]!] = m[2]!;
  return vars;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const base = block(":root");
const palettes = {
  standard: base,
  colorblind: { ...base, ...block(':root[data-palette="colorblind"]') },
};

// [foreground, background, minimum]: 4.5 for text, 3 for focus outlines and borders that matter.
const PAIRS: Array<[string, string, number]> = [
  ["text", "bg", 4.5],
  ["text", "panel", 4.5],
  ["text-strong", "panel", 4.5],
  ["text-strong", "select-bg", 4.5],
  ["muted", "bg", 4.5],
  ["muted", "panel", 4.5],
  ["accent", "bg", 4.5],
  ["accent", "panel", 4.5],
  ["warn", "bg", 4.5],
  ["match-fg", "match-bg", 4.5],
  ["close-fg", "close-bg", 4.5],
  ["miss-fg", "miss-bg", 4.5],
  ["focus", "bg", 3],
  ["focus", "panel", 3],
];

describe("colour contrast (WCAG AA)", () => {
  it("parses every variable it checks", () => {
    for (const [fg, bg] of PAIRS) {
      expect(base[fg], fg).toMatch(/^#/);
      expect(base[bg], bg).toMatch(/^#/);
    }
  });

  for (const [name, vars] of Object.entries(palettes)) {
    for (const [fg, bg, min] of PAIRS) {
      it(`${name}: --${fg} on --${bg} >= ${min}`, () => {
        expect(contrast(vars[fg]!, vars[bg]!)).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it("the colour-blind palette really swaps match and close", () => {
    expect(palettes.colorblind["match-bg"]).not.toBe(base["match-bg"]);
    expect(palettes.colorblind["close-bg"]).not.toBe(base["close-bg"]);
  });
});
