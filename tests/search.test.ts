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
});

describe("findItemByName", () => {
  it("resolves exact names regardless of case and spacing", () => {
    expect(findItemByName("  alarm   CLOCK ", items)?.id).toBe("alarm-clock");
    expect(findItemByName("Danses holotags", items)?.name).toBe("Danse's holotags");
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
