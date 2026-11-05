// Content-Security-Policy for the published page. GitHub Pages cannot send headers, so the policy
// goes in a <meta> tag. Build-only: the Vite dev server injects inline styles and scripts.
//
// Everything is first-party: scripts, styles and fonts come from this site, the favicon is a data:
// URL, and nothing else is fetched. 'self' is the whole marauder6.github.io origin, which this
// site shares with the owner's other Pages sites; GitHub Pages offers nothing narrower.

import type { Plugin } from "vite";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

export function cspPlugin(): Plugin {
  return {
    name: "funkdle-csp",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html: string) =>
        html.replace(
          "<head>",
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}" />`,
        ),
    },
  };
}
