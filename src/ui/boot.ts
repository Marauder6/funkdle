// Start-up with an error boundary: if anything throws before or during the first render, the page
// says so instead of staying blank, and the error is logged (U-no-silent-fallback).

import type { Schedule } from "../core/daily";
import type { Dataset } from "../core/types";
import type { GameStorage } from "../storage/storage";
import { startApp } from "./app";
import { h } from "./dom";

export function boot(
  root: HTMLElement,
  load: () => { dataset: Dataset; schedule: Schedule; storage: GameStorage },
): void {
  try {
    const { dataset, schedule, storage } = load();
    startApp(root, dataset, schedule, storage);
  } catch (err) {
    console.error("[funkdle] start-up failed", err);
    root.replaceChildren(
      h(
        "section",
        { class: "end", role: "alert" },
        h("h2", {}, "Funkdle couldn't start"),
        h(
          "p",
          {},
          "Try reloading the page. If that doesn't help, clearing this site's data in your " +
            "browser's settings resets saved games and stats, which usually fixes it.",
        ),
      ),
    );
  }
}
