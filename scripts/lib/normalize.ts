// Raw wiki text to canonical values (SPEC 5.3). Every unreadable value is a problem string, never
// a guess.

import { COMPONENT_NAMES, type ComponentName, type Origin } from "../../src/core/types";
import type { RawComponent } from "./parse";

/** Known spelling variants. Anything else that is not canonical is a hard error. */
export const COMPONENT_ALIASES: Record<string, ComponentName> = {
  springs: "Spring",
  screws: "Screw",
  gear: "Gears",
  "fiber-optics": "Fiber optics",
  aluminium: "Aluminum",
  // Typo on Nukapedia rev 4734145 (Damaged circuit board, Creation Club table).
  cicruitry: "Circuitry",
};

const CANONICAL = new Map<string, ComponentName>(
  COMPONENT_NAMES.map((name) => [name.toLowerCase(), name]),
);

/** Section heading to origin. Workshop add-ons and Automatron are not places (SPEC 5.3). */
export const SECTION_ORIGIN: Record<string, Origin> = {
  "Base game": "base",
  Automatron: "base",
  "Wasteland Workshop": "base",
  "Contraptions Workshop": "base",
  "Vault-Tec Workshop": "base",
  "Far Harbor": "far-harbor",
  "Nuka-World": "nuka-world",
  "Creation Club/Creations": "creation-club",
};

export type Result<T> = { ok: true; value: T } | { ok: false; problem: string };

export function canonicalComponent(raw: string): Result<ComponentName> {
  const key = raw.trim().toLowerCase();
  const name = CANONICAL.get(key) ?? COMPONENT_ALIASES[key];
  return name ? { ok: true, value: name } : { ok: false, problem: `unknown component "${raw}"` };
}

export function parseValue(text: string): Result<number> {
  return /^\d+$/.test(text)
    ? { ok: true, value: Number(text) }
    : { ok: false, problem: `value "${text}" is not a whole number of caps` };
}

/** Weight text to integer hundredths of a pound, without going through floating point. */
export function parseWeightHundredths(text: string): Result<number> {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m?.[1]) return { ok: false, problem: `weight "${text}" is not a number` };
  const fraction = (m[2] ?? "").padEnd(2, "0");
  if (/[1-9]/.test(fraction.slice(2))) {
    return { ok: false, problem: `weight "${text}" has more than 2 decimal places` };
  }
  return { ok: true, value: Number(m[1]) * 100 + Number(fraction.slice(0, 2)) };
}

export function canonicalComponents(
  raw: RawComponent[],
): Result<Partial<Record<ComponentName, number>>> {
  const out: Partial<Record<ComponentName, number>> = {};
  const problems: string[] = [];
  for (const c of raw) {
    const name = canonicalComponent(c.name);
    if (!name.ok) {
      problems.push(name.problem);
      continue;
    }
    if (out[name.value] !== undefined) problems.push(`component "${name.value}" listed twice`);
    if (!Number.isInteger(c.quantity) || c.quantity < 1) {
      problems.push(`component "${c.name}" has quantity ${c.quantity}`);
    }
    out[name.value] = c.quantity;
  }
  return problems.length ? { ok: false, problem: problems.join("; ") } : { ok: true, value: out };
}

export function componentsText(raw: RawComponent[]): string {
  return raw.map((c) => `${c.name} x${c.quantity}`).join(", ");
}

export function parseComponentsText(text: string): RawComponent[] {
  return text.split(",").map((part) => {
    const m = /^\s*(.+?)\s+x(\d+)\s*$/.exec(part);
    if (!m?.[1] || !m[2]) throw new Error(`override components "${text}": write "Name xN, ..."`);
    return { name: m[1], quantity: Number(m[2]) };
  });
}

/** SPEC 5.2: id is the slug of the name. */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
