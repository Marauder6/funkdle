// Privacy and supply-chain properties of the published site and its build (review 2026-11-05).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { CONTENT_SECURITY_POLICY, cspPlugin } from "../build/csp";

const ROOT = join(import.meta.dirname, "..");
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), "utf8");

describe("the page", () => {
  it("loads nothing from another site (no Google Fonts: visitors' IPs stay with GitHub)", () => {
    const html = read("index.html");
    const external = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    expect(external).toEqual([]);
  });

  it("sets a strict Content-Security-Policy in the built page", () => {
    const plugin = cspPlugin();
    const hook = plugin.transformIndexHtml as { handler: (html: string) => string };
    const out = hook.handler(read("index.html"));
    expect(out).toContain(
      `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"`,
    );
    expect(CONTENT_SECURITY_POLICY).toMatch(/default-src 'none'/);
    expect(CONTENT_SECURITY_POLICY).toMatch(/script-src 'self'(;|$)/);
    expect(CONTENT_SECURITY_POLICY).toMatch(/style-src 'self'(;|$)/);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-inline|unsafe-eval|https?:/);
    expect(plugin.apply).toBe("build"); // the dev server injects inline styles; the policy is build-only
  });

  it("never writes a style attribute, which that policy would block", () => {
    const dir = join(ROOT, "src", "ui");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/\bstyle:\s/);
      expect(src, file).not.toMatch(/setAttribute\(\s*["']style/);
    }
  });
});

interface Workflow {
  on: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs: Record<
    string,
    {
      permissions?: Record<string, string>;
      steps: Array<{ uses?: string; with?: Record<string, unknown> }>;
    }
  >;
}
const workflow = (name: string) => parse(read(".github", "workflows", name)) as Workflow;
const steps = (w: Workflow) => Object.values(w.jobs).flatMap((j) => j.steps);

describe("workflows", () => {
  for (const name of ["ci.yml", "deploy.yml"]) {
    it(`${name} pins every action to a full commit SHA`, () => {
      const uses = steps(workflow(name)).flatMap((s) => (s.uses ? [s.uses] : []));
      expect(uses.length).toBeGreaterThan(0);
      for (const u of uses) expect(u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    });

    it(`${name} checks out without leaving the token in .git/config`, () => {
      const checkouts = steps(workflow(name)).filter((s) =>
        s.uses?.startsWith("actions/checkout@"),
      );
      for (const c of checkouts) expect(c.with?.["persist-credentials"]).toBe(false);
    });
  }

  it("deploy grants Pages rights only to the job that deploys, not to the build", () => {
    const w = workflow("deploy.yml");
    expect(w.permissions ?? {}).toEqual({});
    expect(w.jobs.build?.permissions).toEqual({ contents: "read" });
    expect(w.jobs.deploy?.permissions).toEqual({ pages: "write", "id-token": "write" });
  });

  it("CI also runs on a schedule, so the 60-day schedule warning fires without a push", () => {
    expect(workflow("ci.yml").on).toHaveProperty("schedule");
  });
});
