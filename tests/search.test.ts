import { describe, expect, it } from "vitest";
import { findItemByName, normalizeName, searchItems } from "../src/core/search";
import { dataset } from "./fixtures";

const items = dataset.items;
const names = (query: string, exclude = new Set<string>(), limit = 8) =>
  searchItems(query, items, exclude, limit).map((i) => i.name);

describe("searchItems", () => {
  it("matches case-insensitively and ranks name prefixes first", () => {
    const result = names("ALARM", new Set(), 20);
    expect(result[0]).toBe("Alarm clock");
    expect(result).toContain("Wakemaster alarm clock");
    expect(result.indexOf("Alarm clock")).toBeLessThan(result.indexOf("Wakemaster alarm clock"));
  });

  it("ranks name prefix, then word start, then mid-word, alphabetical within each", () => {
    // "ball" has all three kinds: Ball-peen hammer, Bowling ball, Basketball.
    const result = names("ball", new Set(), 50);
    expect(result[0]).toBe("Ball-peen hammer");
    const wordStart = result.filter((n) => /(^|[\s-])ball/i.test(n));
    const midWord = result.filter((n) => !/(^|[\s-])ball/i.test(n));
    expect(midWord).toContain("Basketball");
    expect(result).toEqual([...wordStart, ...midWord]);
    expect(midWord).toEqual(
      [...midWord].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
  });

  it("hides excluded (already guessed) items", () => {
    expect(names("alarm clock", new Set(["alarm-clock"]), 20)).not.toContain("Alarm clock");
  });

  it("returns at most `limit` results, and none for a blank query", () => {
    expect(names("a", new Set(), 8)).toHaveLength(8);
    expect(names("   ")).toEqual([]);
    expect(names("a", new Set(), 0)).toEqual([]);
  });

  it("ignores apostrophes", () => {
    expect(names("danses holotags")).toEqual(["Danse's holotags"]);
  });

  // Review 2026-11-05: 17 names contain "-" or "."; typing them with spaces found nothing.
  it("treats hyphens and full stops as spaces", () => {
    expect(names("nuka cola")).toContain("Nuka-Cola bottle");
    expect(names("ball peen")).toEqual(["Ball-peen hammer"]);
    expect(names("mr handy")).toEqual(["Mr. Handy fuel"]);
    expect(names("pre war")).toEqual(["Pre-War lamp", "Pre-War Money"]);
    expect(names("wooden block b")).toContain("Wooden block - B & Y");
    // and the written form still works
    expect(names("nuka-cola cup")).toContain("Nuka-Cola cup");
  });

  it("accepts every common apostrophe character", () => {
    for (const apostrophe of ["'", "’", "‘", "ʼ", "`"]) {
      expect(names(`danse${apostrophe}s holotags`), apostrophe).toEqual(["Danse's holotags"]);
    }
  });

  it("orders each rank alphabetically, and every name prefix before every word start", () => {
    const result = names("cup", new Set(), 50);
    const rank = (n: string) =>
      n.toLowerCase().startsWith("cup") ? 0 : /(^|[\s-])cup/i.test(n) ? 1 : 2;
    const ranks = result.map(rank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    for (const r of [0, 1, 2]) {
      const group = result.filter((n) => rank(n) === r);
      expect(group).toEqual(
        [...group].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
      );
    }
    expect(new Set(ranks).size).toBeGreaterThanOrEqual(2);
  });
});

describe("findItemByName", () => {
  it("resolves exact names regardless of case and spacing", () => {
    expect(findItemByName("  alarm   CLOCK ", items)?.id).toBe("alarm-clock");
    expect(findItemByName("Danses holotags", items)?.name).toBe("Danse's holotags");
    expect(findItemByName("Nuka Cola bottle", items)?.name).toBe("Nuka-Cola bottle");
    expect(findItemByName("mr handy fuel", items)?.name).toBe("Mr. Handy fuel");
  });

  it("rejects text that is not exactly an item name", () => {
    expect(findItemByName("alarm", items)).toBeNull();
    expect(findItemByName("", items)).toBeNull();
    expect(findItemByName("Fusion core", items)).toBeNull();
  });

  it("normalized names are unique, so a name resolves to one item", () => {
    const normalized = items.map((i) => normalizeName(i.name));
    expect(new Set(normalized).size).toBe(normalized.length);
  });
});
