// The app: one state object (mode, the daily and unlimited games, settings) and render functions
// over it (SPEC 8, 9). Daily is the default mode; Unlimited starts a new random game any time.

import { DEFAULT_FEEDBACK as cfg, GUESS_LIMIT, SITE_URL } from "../core/config";
import {
  dailyTargetId,
  localCalendarDate,
  msUntilNextLocalMidnight,
  parseCalendarDate,
  puzzleNumber,
  type Schedule,
} from "../core/daily";
import {
  feedbackHistory,
  indexItems,
  newGame,
  pickUnlimitedTarget,
  replayGame,
  submitGuess,
  type Game,
  type GameMode,
  type GuessRejection,
} from "../core/game";
import { findItemByName, searchItems } from "../core/search";
import { shareText } from "../core/share";
import { recordDailyResult } from "../core/stats";
import type { Dataset, Item } from "../core/types";
import { KEY_PREFIX, type GameStorage, type SavedGame } from "../storage/storage";
import { createCombobox } from "./combobox";
import { createDialog } from "./dialog";
import { h } from "./dom";
import { formatCountdown, guessAnnouncement } from "./format";
import { helpContent } from "./help";
import { renderHistory, renderItemFacts } from "./history";
import { applySettings, createSettingsDialog } from "./settings";
import { statsContent } from "./stats-view";

const MAX_SUGGESTIONS = 8;
/** How often an open page checks whether the local date has moved on. */
const NEW_DAY_CHECK_MS = 30_000;

const REJECTION_TEXT: Record<GuessRejection, string> = {
  "game-over": "This game is over.",
  "unknown-item": "That isn't an item. Pick one from the list.",
  "already-guessed": "You already guessed that.",
};

interface DailyState {
  puzzle: number;
  /** null when there is no puzzle today; `unavailable` says why. */
  game: Game | null;
  unavailable: string | null;
}

/** The saved form matches the game in memory: same guesses, same limit. */
const matchesSave = (saved: SavedGame, game: Game) =>
  saved.limit === game.limit &&
  saved.guessIds.length === game.guessIds.length &&
  saved.guessIds.every((id, i) => id === game.guessIds[i]);

export function startApp(
  root: HTMLElement,
  dataset: Dataset,
  schedule: Schedule,
  storage: GameStorage,
  clock: () => Date = () => new Date(),
): void {
  const items = dataset.items;
  const index = indexItems(items);
  const pool = items.filter((i) => i.inTargetPool);
  const epoch = parseCalendarDate(schedule.epoch);
  const todayPuzzle = () => puzzleNumber(localCalendarDate(clock()), epoch);
  const itemById = (id: string): Item => {
    const item = index.get(id);
    if (!item) throw new Error(`unknown item id "${id}"`);
    return item;
  };

  let settings = storage.loadSettings();
  applySettings(settings);
  let mode: GameMode = "daily";
  let daily = loadDaily(todayPuzzle());
  let unlimited: Game | null = null;
  /** The date moved on while a daily was in progress: offer the new one, don't snatch the old. */
  let newDayWaiting = false;
  let revealNewest = false;
  let countdownTimer: ReturnType<typeof setInterval> | undefined;

  // --- Shell, built once. Only the parts that change are re-rendered.
  const hint = h("p", { class: "hint", id: "guess-hint", "aria-live": "polite" });
  const status = h("p", { class: "status", role: "status" });
  const counter = h("p", { class: "counter" });
  const combo = createCombobox({
    id: "guess",
    label: "Guess an item",
    placeholder: "Type a junk item, e.g. alarm clock",
    search: (q) => searchItems(q, items, new Set(current()?.guessIds ?? []), MAX_SUGGESTIONS),
    resolve: (text) => findItemByName(text, items),
    onChoose: guess,
    onHint: (text) => (hint.textContent = text),
  });
  combo.input.setAttribute("aria-describedby", "guess-hint");
  const newGameButton = h("button", { type: "button" }, "New game");
  newGameButton.addEventListener("click", startNewUnlimited);
  const newDayButton = h("button", { type: "button", class: "primary" }, "Play today's puzzle");
  newDayButton.addEventListener("click", playToday);
  const newDayNotice = h(
    "p",
    { class: "notice", hidden: true },
    "A new daily puzzle has started. ",
    newDayButton,
  );
  const play = h(
    "section",
    { class: "play", "aria-label": "Make a guess" },
    newDayNotice,
    combo.root,
    hint,
    h("div", { class: "play-footer" }, counter, newGameButton),
  );
  const unavailablePanel = h("section", { class: "end", hidden: true });
  const endPanel = h("section", { class: "end", "aria-labelledby": "end-title", hidden: true });
  const historyHost = h("div", { class: "history-host" });
  const storageNotice = h(
    "p",
    { class: "notice", hidden: true },
    "This browser isn't letting Funkdle save, so your games and stats will be lost when you leave.",
  );

  const dailyButton = h("button", { type: "button", class: "mode-button" }, "Daily");
  const unlimitedButton = h("button", { type: "button", class: "mode-button" }, "Unlimited");
  dailyButton.addEventListener("click", () => switchMode("daily"));
  unlimitedButton.addEventListener("click", () => switchMode("unlimited"));

  const helpButton = h("button", { type: "button" }, "Help");
  const statsButton = h("button", { type: "button" }, "Stats");
  const settingsButton = h("button", { type: "button" }, "Settings");
  const help = createDialog("help", "How to play");
  help.setContent(...helpContent(index, cfg, GUESS_LIMIT));
  helpButton.addEventListener("click", () => help.open(helpButton));
  const stats = createDialog("stats", "Statistics");
  statsButton.addEventListener("click", () => {
    const today = daily.game;
    stats.setContent(
      ...statsContent(
        storage.loadStats(),
        today ? daily.puzzle : null,
        GUESS_LIMIT,
        today?.status === "won" ? today.guessIds.length : null,
      ),
    );
    stats.open(statsButton);
  });
  const settingsDialog = createSettingsDialog(settings, (change) => {
    settings = { ...settings, ...change };
    applySettings(settings);
    storage.saveSettings(settings);
    showStorageHealth();
  });
  settingsButton.addEventListener("click", () => settingsDialog.open(settingsButton));

  const { source } = dataset;
  root.replaceChildren(
    h(
      "header",
      { class: "top" },
      h(
        "div",
        { class: "brand" },
        h("h1", {}, "Funkdle"),
        h("p", { class: "tagline" }, "Guess the Fallout 4 junk item"),
      ),
      h(
        "nav",
        { class: "top-actions", "aria-label": "Game" },
        h(
          "div",
          { class: "mode-switch", role: "group", "aria-label": "Mode" },
          dailyButton,
          unlimitedButton,
        ),
        helpButton,
        statsButton,
        settingsButton,
      ),
    ),
    storageNotice,
    h("main", {}, unavailablePanel, play, status, endPanel, historyHost),
    h(
      "footer",
      {},
      h(
        "p",
        {},
        "Item data from ",
        h("a", { href: source.url }, `Nukapedia, "${source.title}"`),
        `, revision ${source.revisionId}, under `,
        h("a", { href: "https://creativecommons.org/licenses/by-sa/3.0/" }, "CC BY-SA 3.0"),
        ". ",
        h("a", { href: "https://github.com/Marauder6/funkdle" }, "Source code"),
        ".",
      ),
      h(
        "p",
        {},
        "Fan-made. Not affiliated with or endorsed by Bethesda Softworks or ZeniMax Media. " +
          "Fallout is a trademark of ZeniMax Media.",
      ),
    ),
    help.element,
    stats.element,
    settingsDialog.element,
  );
  render();
  showStorageHealth();
  if (!settings.helpSeen) {
    help.open(play.hidden ? helpButton : combo.input);
    settings = { ...settings, helpSeen: true };
    storage.saveSettings(settings);
  }

  // A page left open must notice a new day (the countdown alone misses it when timers sleep) and
  // progress saved by another tab.
  setInterval(checkNewDay, NEW_DAY_CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "hidden") checkNewDay();
  });
  window.addEventListener("pageshow", () => checkNewDay());
  window.addEventListener("focus", () => checkNewDay());
  window.addEventListener("storage", (e) => {
    if (e.key !== null && !e.key.startsWith(KEY_PREFIX)) return;
    if (e.key === null || e.key === `${KEY_PREFIX}settings`) {
      settings = storage.loadSettings();
      applySettings(settings);
    }
    if (syncFromStorage()) {
      status.textContent = "Updated from another tab.";
      render();
    }
  });

  // --- Games

  function current(): Game | null {
    if (mode === "daily") return daily.game;
    unlimited ??= restoreUnlimited() ?? freshUnlimited();
    return unlimited;
  }

  /** A puzzle rebuilt from its saved guesses. A finished one is (re)counted in stats. */
  function loadDaily(puzzle: number): DailyState {
    if (puzzle < 1) {
      const start = new Date(epoch.year, epoch.month - 1, epoch.day).toLocaleDateString(undefined, {
        dateStyle: "long",
      });
      return {
        puzzle,
        game: null,
        unavailable: `Daily puzzles start on ${start}. Until then, play Unlimited.`,
      };
    }
    // Never log the id itself: it is the day's answer (SPEC 7).
    const targetId = dailyTargetId(puzzle, schedule);
    if (!targetId || !index.has(targetId)) {
      if (targetId) console.warn(`[funkdle violation] puzzle #${puzzle}: scheduled item unknown`);
      return {
        puzzle,
        game: null,
        unavailable: "There's no daily puzzle for today yet. Unlimited mode is always open.",
      };
    }
    // Everyone must get the same answer, so a scheduled item that a data update made ambiguous is
    // still played; the schedule checks stop that reaching a future date.
    if (!index.get(targetId)?.inTargetPool) {
      console.warn(`[funkdle violation] puzzle #${puzzle}: scheduled item is not a unique answer`);
    }
    const saved = storage.loadDaily(puzzle);
    const fresh = newGame(
      { mode: "daily", puzzle, targetId, limit: saved?.limit ?? GUESS_LIMIT },
      index,
    );
    const { game, problem } = saved
      ? replayGame(fresh, saved.guessIds, index, cfg)
      : { game: fresh, problem: null };
    if (problem) console.warn(`[funkdle] daily #${puzzle} partly restored: ${problem}`);
    countDaily(game);
    return { puzzle, game, unavailable: null };
  }

  function countDaily(game: Game) {
    const before = storage.loadStats();
    const after = recordDailyResult(before, game);
    if (after !== before) storage.saveStats(after);
  }

  function saveUnlimited(game: Game) {
    storage.saveUnlimited({ targetId: game.targetId, guessIds: game.guessIds, limit: game.limit });
  }

  function freshUnlimited(avoidId?: string): Game {
    const target = pickUnlimitedTarget(pool, Math.random, avoidId);
    const g = newGame(
      { mode: "unlimited", puzzle: null, targetId: target.id, limit: GUESS_LIMIT },
      index,
    );
    saveUnlimited(g);
    return g;
  }

  /** The saved unlimited game, rebuilt by replay; null when there is none or it cannot be used. */
  function restoreUnlimited(): Game | null {
    const saved = storage.loadUnlimited();
    if (!saved) return null;
    const target = index.get(saved.targetId);
    if (!target?.inTargetPool) {
      console.warn("[funkdle] saved Unlimited game ignored: its answer is no longer possible");
      return null;
    }
    const fresh = newGame(
      { mode: "unlimited", puzzle: null, targetId: target.id, limit: saved.limit },
      index,
    );
    const { game: restored, problem } = replayGame(fresh, saved.guessIds, index, cfg);
    if (problem) console.warn(`[funkdle] saved Unlimited game partly restored: ${problem}`);
    return restored;
  }

  /**
   * Adopts progress another tab saved, so this tab never overwrites it with an older game.
   * Returns true when this tab's game changed.
   */
  function syncFromStorage(): boolean {
    let changed = false;
    if (daily.game) {
      const saved = storage.loadDaily(daily.puzzle);
      if (saved && !matchesSave(saved, daily.game)) {
        daily = loadDaily(daily.puzzle);
        changed = true;
      }
    }
    if (unlimited) {
      const saved = storage.loadUnlimited();
      if (saved && (saved.targetId !== unlimited.targetId || !matchesSave(saved, unlimited))) {
        const restored = restoreUnlimited();
        if (restored) {
          unlimited = restored;
          changed = true;
        }
      }
    }
    return changed;
  }

  /** Has the local date moved past the daily on show? Acts on it; returns true if it has. */
  function checkNewDay(): boolean {
    const today = todayPuzzle();
    if (today === daily.puzzle) return false;
    if (daily.game?.status === "in-progress") {
      if (!newDayWaiting) {
        newDayWaiting = true;
        render();
      }
      return true;
    }
    daily = loadDaily(today);
    newDayWaiting = false;
    if (mode === "daily") status.textContent = "A new daily puzzle is ready.";
    render();
    return true;
  }

  function guess(item: Item) {
    if (syncFromStorage()) {
      hint.textContent = "";
      status.textContent = "This game was changed in another tab, so it has been updated here.";
      render();
      return;
    }
    const game = current();
    if (!game) return;
    const outcome = submitGuess(game, item.id, index, cfg);
    if (!outcome.ok) {
      hint.textContent = REJECTION_TEXT[outcome.reason];
      return;
    }
    const next = outcome.game;
    if (next.mode === "daily" && next.puzzle !== null) {
      daily = { ...daily, game: next };
      storage.saveDaily(next.puzzle, { guessIds: next.guessIds, limit: next.limit });
      countDaily(next);
    } else {
      unlimited = next;
      saveUnlimited(next);
    }
    showStorageHealth();
    hint.textContent = "";
    const target = itemById(next.targetId);
    const n = next.guessIds.length;
    status.textContent =
      next.status === "won"
        ? `You found it: ${target.name}, in ${n} ${n === 1 ? "guess" : "guesses"}.`
        : next.status === "lost"
          ? `Out of guesses. The item was ${target.name}.`
          : guessAnnouncement(item, outcome.feedback, next.limit - n);
    revealNewest = true;
    render();
    if (next.status === "in-progress") combo.refresh();
    else document.getElementById("end-title")?.focus();
  }

  function switchMode(next: GameMode) {
    if (next === mode) return;
    mode = next;
    combo.clear();
    status.textContent = "";
    checkNewDay();
    render();
    focusMain();
  }

  function startNewUnlimited() {
    unlimited = freshUnlimited(unlimited?.targetId);
    showStorageHealth();
    combo.clear();
    status.textContent = "New game started.";
    render();
    combo.input.focus();
  }

  function playToday() {
    daily = loadDaily(todayPuzzle());
    newDayWaiting = false;
    mode = "daily";
    combo.clear();
    status.textContent = "";
    render();
    focusMain();
  }

  function focusMain() {
    if (!play.hidden) combo.input.focus();
    else if (!endPanel.hidden) document.getElementById("end-title")?.focus();
    else unavailablePanel.querySelector<HTMLElement>("button")?.focus();
  }

  // --- Rendering

  function render() {
    dailyButton.textContent = daily.game ? `Daily #${daily.puzzle}` : "Daily";
    dailyButton.setAttribute("aria-pressed", String(mode === "daily"));
    unlimitedButton.setAttribute("aria-pressed", String(mode === "unlimited"));
    newDayNotice.hidden = !(mode === "daily" && newDayWaiting);
    newGameButton.hidden = mode !== "unlimited";

    const game = current();
    unavailablePanel.hidden = game !== null;
    stopCountdown();
    if (!game) {
      const toUnlimited = h("button", { type: "button", class: "primary" }, "Play Unlimited");
      toUnlimited.addEventListener("click", () => switchMode("unlimited"));
      unavailablePanel.replaceChildren(h("p", {}, daily.unavailable ?? ""), toUnlimited);
      play.hidden = true;
      endPanel.hidden = true;
      historyHost.replaceChildren();
      return;
    }

    const over = game.status !== "in-progress";
    play.hidden = over;
    combo.setDisabled(over);
    counter.textContent = `Guess ${game.guessIds.length + 1} of ${game.limit}`;

    const rows = feedbackHistory(game, index, cfg);
    historyHost.replaceChildren(
      rows.length
        ? renderHistory(rows, revealNewest)
        : h("p", { class: "empty" }, "No guesses yet."),
    );
    revealNewest = false;

    endPanel.hidden = !over;
    if (over) endPanel.replaceChildren(...endPanelContent(game));
  }

  function endPanelContent(game: Game): Node[] {
    const target = itemById(game.targetId);
    const n = game.guessIds.length;
    const nodes: Node[] = [
      h(
        "h2",
        { id: "end-title", tabindex: "-1" },
        game.status === "won" ? "Found it!" : "Out of guesses",
      ),
      h(
        "p",
        {},
        game.status === "won"
          ? `You found ${target.name} in ${n} ${n === 1 ? "guess" : "guesses"}.`
          : `The item was ${target.name}.`,
      ),
      renderItemFacts(target),
    ];

    if (game.mode === "unlimited") {
      const again = h("button", { type: "button", class: "primary" }, "New game");
      again.addEventListener("click", startNewUnlimited);
      return [...nodes, h("div", { class: "actions" }, again)];
    }

    const shareButton = h("button", { type: "button", class: "primary" }, "Share");
    const shareStatus = h("p", { class: "share-status", role: "status" });
    const fallback = h("textarea", {
      class: "share-fallback",
      rows: "8",
      readonly: true,
      "aria-label": "Your result, to copy",
      hidden: true,
    });
    shareButton.addEventListener("click", () => share(game, shareStatus, fallback));
    const toUnlimited = h("button", { type: "button" }, "Play Unlimited");
    toUnlimited.addEventListener("click", () => switchMode("unlimited"));
    const countdown = h("p", { class: "countdown" });
    startCountdown(countdown);
    return [
      ...nodes,
      h("div", { class: "actions" }, shareButton, toUnlimited),
      shareStatus,
      fallback,
      countdown,
    ];
  }

  async function share(game: Game, statusEl: HTMLElement, fallback: HTMLTextAreaElement) {
    const text = shareText(
      game,
      feedbackHistory(game, index, cfg).map(([, fb]) => fb),
      SITE_URL,
      settings.colorBlind ? "colorblind" : "standard",
    );
    try {
      await navigator.clipboard.writeText(text);
      fallback.hidden = true;
      statusEl.textContent = "Copied. Paste it anywhere.";
    } catch (err) {
      // Reported, not hidden: show the text so it can be copied by hand.
      console.warn(`[funkdle] clipboard unavailable: ${String(err)}`);
      fallback.value = text;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      statusEl.textContent = "Couldn't copy automatically. The text below is selected: copy it.";
    }
  }

  /**
   * Counts down to local midnight. Each later tick compares the date itself (checkNewDay); the
   * first display does not, because it runs inside render() and must not re-render.
   */
  function startCountdown(el: HTMLElement) {
    const show = () =>
      (el.textContent = `Next puzzle in ${formatCountdown(msUntilNextLocalMidnight(clock()))}`);
    show();
    countdownTimer = setInterval(() => {
      if (!checkNewDay()) show();
    }, 1000);
  }

  function stopCountdown() {
    if (countdownTimer !== undefined) clearInterval(countdownTimer);
    countdownTimer = undefined;
  }

  function showStorageHealth() {
    storageNotice.hidden = storage.health.state === "ok";
  }
}
