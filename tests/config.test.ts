import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDBACK, GUESS_LIMIT, INCLUDE_CREATION_CLUB, SITE_URL } from "../src/core/config";
import { dataset } from "./fixtures";

describe("config", () => {
  it("holds the SPEC 4.1 default tolerances", () => {
    expect(DEFAULT_FEEDBACK.weight).toEqual({ floor: 50, ratio: 0.25 });
    expect(DEFAULT_FEEDBACK.value).toEqual({ floor: 2, ratio: 0.25 });
    expect(DEFAULT_FEEDBACK.totalCloseWithin).toBe(1);
  });

  // Pinned to the owner's decisions (SPEC 13). Changing one is a deliberate edit to this test too.
  it("pins the decisions made at the Phase 1 gate", () => {
    expect(GUESS_LIMIT).toBe(6);
    expect(INCLUDE_CREATION_CLUB).toBe(false);
    expect(SITE_URL).toBe("https://marauder6.github.io/funkdle/");
  });

  it("the dataset honours them: no Creation Club items, no cut content", () => {
    expect(dataset.items.filter((i) => i.origin === "creation-club")).toEqual([]);
    const cut = ["Angler gunk", "Bond", "Land grant", "Manuscript", "Property deed"];
    expect(dataset.items.filter((i) => cut.includes(i.name)).map((i) => i.name)).toEqual([]);
  });
});
