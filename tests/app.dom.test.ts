// @vitest-environment happy-dom
// The real app in a simulated browser, with a fake clock. Each test here was written against a
// finding of the 2026-11-05 review and failed before its fix.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Schedule } from "../src/core/daily";
import { GameStorage, KEY_PREFIX, memoryStore, type KeyValueStore } from "../src/storage/storage";
import { boot } from "../src/ui/boot";
import { startApp } from "../src/ui/app";
import { dataset } from "./fixtures";

// Two pool items as puzzles #1 and #2, from 2026-11-05.
const SCHEDULE: Schedule = {
  epoch: "2026-11-05",
  entries: ["alarm-clock", "wakemaster-alarm-clock"],
};
const LOCAL = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);

let store: KeyValueStore;

function mount(schedule: Schedule = SCHEDULE, opts: { helpSeen?: boolean } = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  if (opts.helpSeen !== false) {
    store.set(
      `${KEY_PREFIX}settings`,
      JSON.stringify({ colorBlind: false, motion: "system", helpSeen: true }),
    );
  }
  startApp(document.getElementById("app")!, dataset, schedule, new GameStorage(store, () => {}));
}

const input = () => document.getElementById("guess") as HTMLInputElement;
function type(text: string) {
  input().value = text;
  input().dispatchEvent(new Event("input"));
}
function press(key: string) {
  input().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}
function guess(text: string) {
  type(text);
  press("Enter");
}
const rows = () =>
  [...document.querySelectorAll("main .guess .col-name")].map((e) => e.textContent);
const hint = () => document.getElementById("guess-hint")!.textContent;
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === label && !b.closest("[hidden]"),
  );
const dailyLabel = () => document.querySelector(".mode-switch button")!.textContent;
const saved = (key: string) => JSON.parse(store.get(`${KEY_PREFIX}${key}`) ?? "null");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(LOCAL(5, 12));
  store = memoryStore();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a new day while the page is open", () => {
  it("a finished daily rolls over to the new puzzle on the next tick after midnight", () => {
    mount();
    guess("Alarm clock");
    expect(document.getElementById("end-title")?.textContent).toBe("Found it!");

    vi.setSystemTime(LOCAL(6, 8)); // the device slept through midnight: no tick near 00:00
    vi.advanceTimersByTime(1000);
    expect(dailyLabel()).toBe("Daily #2");
    expect(input().disabled).toBe(false);
    expect(rows()).toEqual([]);
  });

  it("switching modes after midnight shows today's puzzle, not yesterday's", () => {
    mount();
    guess("Alarm clock");
    button("Play Unlimited")!.click();
    vi.setSystemTime(LOCAL(6, 8));
    document.querySelector<HTMLButtonElement>(".mode-switch button")!.click();
    expect(dailyLabel()).toBe("Daily #2");
  });

  it("a daily in progress at midnight is kept, with an offer to switch", () => {
    mount();
    guess("Toaster");
    vi.setSystemTime(LOCAL(6, 0, 5));
    vi.advanceTimersByTime(60_000);
    expect(rows()).toEqual(["Toaster"]); // not snatched away mid-game
    expect(dailyLabel()).toBe("Daily #1");
    button("Play today's puzzle")!.click();
    expect(dailyLabel()).toBe("Daily #2");
    expect(rows()).toEqual([]);
  });

  it("returning to a hidden tab checks the date", () => {
    mount();
    guess("Alarm clock");
    vi.setSystemTime(LOCAL(6, 9));
    document.dispatchEvent(new Event("visibilitychange"));
    expect(dailyLabel()).toBe("Daily #2");
  });
});

describe("guess entry", () => {
  it("retyping an already-guessed name is rejected, not swapped for another item", () => {
    mount();
    // "Desk fan" is part of "Office desk fan" and "Restored desk fan", which stay in the list.
    guess("Desk fan");
    guess("desk fan");
    expect(rows()).toEqual(["Desk fan"]);
    expect(hint()).toBe("You already guessed that.");
  });

  it("an exact name wins over the first suggestion", () => {
    mount();
    guess("Desk fan"); // "Desk fan", "Desktop picture frame", ... "Desk fan" is exact
    expect(rows()).toEqual(["Desk fan"]);
  });

  it("an option picked with the arrow keys still wins over the exact name", () => {
    mount();
    type("Desk fan");
    press("ArrowDown");
    press("Enter");
    expect(rows()).not.toEqual(["Desk fan"]);
    expect(rows()).toHaveLength(1);
  });
});

describe("Unlimited", () => {
  it("offers a new game at any time, not only after one ends (SPEC 13.4)", () => {
    mount();
    document.querySelectorAll<HTMLButtonElement>(".mode-switch button")[1]!.click();
    const first = saved("unlimited").targetId;
    guess("Toaster");
    expect(rows()).toHaveLength(1);
    button("New game")!.click();
    expect(rows()).toEqual([]);
    expect(saved("unlimited").guessIds).toEqual([]);
    expect(saved("unlimited").targetId).not.toBe(first);
  });
});

describe("saved games", () => {
  it("restore with the limit they were played under", () => {
    // Lost under a limit of 5. With today's limit of 6 it must still be lost.
    store.set(
      `${KEY_PREFIX}daily:1`,
      JSON.stringify({ guessIds: ["toaster", "desk-fan", "fork", "pen", "typewriter"], limit: 5 }),
    );
    mount();
    expect(document.getElementById("end-title")?.textContent).toBe("Out of guesses");
    expect(saved("stats")).toMatchObject({ played: 1, wins: 0 });
  });

  it("a second tab's progress is picked up before writing, never overwritten", () => {
    mount();
    guess("Toaster");
    // Another tab finishes the same puzzle (a loss) and counts it.
    const otherTab = ["toaster", "desk-fan", "fork", "pen", "typewriter", "baseball"];
    store.set(`${KEY_PREFIX}daily:1`, JSON.stringify({ guessIds: otherTab, limit: 6 }));
    guess("Alarm clock"); // this tab would have won
    expect(saved("daily:1").guessIds).toEqual(otherTab);
    expect(document.getElementById("end-title")?.textContent).toBe("Out of guesses");
    expect(hint() + document.querySelector(".status")!.textContent).toMatch(/another tab/i);
  });

  it("a storage event from another tab refreshes the game", () => {
    mount();
    store.set(`${KEY_PREFIX}daily:1`, JSON.stringify({ guessIds: ["toaster"], limit: 6 }));
    window.dispatchEvent(new StorageEvent("storage", { key: `${KEY_PREFIX}daily:1` }));
    expect(rows()).toEqual(["Toaster"]);
  });
});

describe("robustness", () => {
  it("a failure during start-up shows a message instead of a blank page", () => {
    document.body.innerHTML = '<div id="app"></div>';
    const root = document.getElementById("app")!;
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    boot(root, () => ({
      dataset,
      schedule: { epoch: "not a date", entries: [] },
      storage: new GameStorage(store, () => {}),
    }));
    expect(root.textContent).toMatch(/Funkdle couldn't start/);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("never logs a scheduled answer", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A scheduled id that is no longer a possible answer (desk-fan is not in the pool).
    mount({ epoch: "2026-11-05", entries: ["desk-fan"] });
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).not.toContain("desk-fan");
    warn.mockRestore();
  });
});

describe("dialogs", () => {
  it("after the first-visit help closes, focus goes to the guess box", () => {
    mount(SCHEDULE, { helpSeen: false });
    const help = document.querySelector<HTMLDialogElement>("dialog[aria-labelledby=help-title]")!;
    expect(help.open).toBe(true);
    help.close();
    expect(document.activeElement).toBe(input());
  });

  it("a drag that starts inside a dialog and ends on the backdrop does not close it", () => {
    mount();
    button("Settings")!.click();
    const dialog = document.querySelector<HTMLDialogElement>(
      "dialog[aria-labelledby=settings-title]",
    )!;
    expect(dialog.open).toBe(true);
    dialog.querySelector("h2")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(dialog.open).toBe(true);
    // a real backdrop click (press and release on the backdrop) still closes it
    dialog.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(dialog.open).toBe(false);
  });
});
