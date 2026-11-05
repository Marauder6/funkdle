import { defineConfig } from "vitest/config";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/ (SPEC 11, Phase 5; repo decided in SPEC 13.8).
  base: "/funkdle/",
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
