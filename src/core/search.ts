// Autocomplete matching and guess resolution (SPEC 3.2, 9.1).

import type { Item } from "./types";

/**
 * Case-, accent- and punctuation-insensitive form used for matching. Apostrophes (every common
 * form) are dropped; hyphens, dashes and full stops become spaces, so "nuka cola" finds
 * "Nuka-Cola bottle" and "mr handy" finds "Mr. Handy fuel".
 */
export function normalizeName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['`‘’ʼ]/g, "")
    .replace(/[-.‐-―]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Items whose name contains the query, best first: names that start with it, then names with a
 * word that starts with it, then any other substring match; alphabetical within each group.
 * Items whose id is in `exclude` (already guessed) are left out.
 */
export function searchItems(
  query: string,
  items: Item[],
  exclude: Set<string>,
  limit: number,
): Item[] {
  const q = normalizeName(query);
  if (!q || limit <= 0) return [];
  const ranked: Array<{ item: Item; rank: number; name: string }> = [];
  for (const item of items) {
    if (exclude.has(item.id)) continue;
    const name = normalizeName(item.name);
    const at = name.indexOf(q);
    if (at < 0) continue;
    const wordStart = name.startsWith(q) || name.includes(` ${q}`);
    ranked.push({ item, name, rank: at === 0 ? 0 : wordStart ? 1 : 2 });
  }
  ranked.sort((a, b) => a.rank - b.rank || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return ranked.slice(0, limit).map((r) => r.item);
}

/** The item whose name is exactly `text`, compared in normalizeName() form; else null. */
export function findItemByName(text: string, items: Item[]): Item | null {
  const q = normalizeName(text);
  return (q && items.find((i) => normalizeName(i.name) === q)) || null;
}
