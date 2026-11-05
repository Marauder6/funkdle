import { defineConfig } from "vitest/config";
// With the extension: Vite's native config loader (a future default) requires it.
import { cspPlugin } from "./build/csp.ts";

export default defineConfig({
  // GitHub Pages serves project sites under /<repo>/ (SPEC 11, Phase 5; repo decided in SPEC 13.8).
  base: "/funkdle/",
  plugins: [cspPlugin()],
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
