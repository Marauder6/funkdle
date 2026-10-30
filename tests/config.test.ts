import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDBACK, GUESS_LIMIT } from "../src/core/config";

describe("config", () => {
  it("holds the SPEC 4.1 default tolerances", () => {
    expect(DEFAULT_FEEDBACK.weight).toEqual({ floor: 50, ratio: 0.25 });
    expect(DEFAULT_FEEDBACK.value).toEqual({ floor: 2, ratio: 0.25 });
    expect(DEFAULT_FEEDBACK.totalCloseWithin).toBe(1);
  });

  it("has a positive guess limit", () => {
    expect(GUESS_LIMIT).toBeGreaterThan(0);
  });
});
