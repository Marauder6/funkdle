// The app: one state object (the current game and settings) and render functions over it
// (SPEC 8). Phase 3 plays Unlimited mode only; daily mode arrives in Phase 4.

import { DEFAULT_FEEDBACK as cfg, GUESS_LIMIT } from "../core/config";
import {
  feedbackHistory,
  indexItems,
  newGame,
  pickUnlimitedTarget,
  replayGame,
  submitGuess,
  type Game,
  type GuessRejection,
} from "../core/game";
import { findItemByName, searchItems } from "../core/search";
import type { Dataset, Item } from "../core/types";
import type { GameStorage } from "../storage/storage";
import { createCombobox } from "./combobox";
import { h } from "./dom";
import { guessAnnouncement } from "./format";
import { renderHistory, renderItemFacts } from "./history";
import { applySettings, createSettingsDialog } from "./settings";

const MAX_SUGGESTIONS = 8;

const REJECTION_TEXT: Record<GuessRejection, string> = {
  "game-over": "This game is over. Start a new one.",
  "unknown-item": "That isn't an item. Pick one from the list.",
  "already-guessed": "You already guessed that.",
};

export function startApp(root: HTMLElement, dataset: Dataset, storage: GameStorage): void {
  const items = dataset.items;
  const index = indexItems(items);
  const pool = items.filter((i) => i.inTargetPool);
  const itemById = (id: string): Item => {
    const item = index.get(id);
    if (!item) throw new Error(`unknown item id "${id}"`);
    return item;
  };

  let settings = storage.loadSettings();
  applySettings(settings);
  let game = restoreUnlimited() ?? freshUnlimited();
  let revealNewest = false;

  // --- Shell, built once. Only the parts that change are re-rendered.
  const hint = h("p", { class: "hint", id: "guess-hint", "aria-live": "polite" });
  const status = h("p", { class: "status", role: "status" });
  const counter = h("p", { class: "counter" });
  const combo = createCombobox({
    id: "guess",
    label: "Guess an item",
    placeholder: "Type a junk item, e.g. alarm clock",
    search: (q) => searchItems(q, items, new Set(game.guessIds), MAX_SUGGESTIONS),
    resolve: (text) => findItemByName(text, items),
    onChoose: guess,
    onHint: (text) => (hint.textContent = text),
  });
  combo.input.setAttribute("aria-describedby", "guess-hint");
  const play = h(
    "section",
    { class: "play", "aria-label": "Make a guess" },
    combo.root,
    hint,
    counter,
  );
  const endPanel = h("section", { class: "end", "aria-labelledby": "end-title", hidden: true });
  const historyHost = h("div", { class: "history-host" });
  const storageNotice = h(
    "p",
    { class: "notice", hidden: true },
    "This browser isn't letting Funkdle save, so your game will be lost if you leave the page.",
  );

  const settingsButton = h("button", { type: "button" }, "Settings");
  const settingsDialog = createSettingsDialog(settings, settingsButton, (next) => {
    settings = next;
    applySettings(next);
    storage.saveSettings(next);
    showStorageHealth();
  });

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
      h("div", { class: "top-actions" }, h("span", { class: "mode" }, "Unlimited"), settingsButton),
    ),
    storageNotice,
    h(
      "main",
      {},
      h(
        "p",
        { class: "intro" },
        `Each guess shows how its weight, value, components and origin compare with the hidden item. ` +
          `You have ${GUESS_LIMIT} guesses.`,
      ),
      play,
      status,
      endPanel,
      historyHost,
    ),
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
    settingsDialog,
  );
  render();
  showStorageHealth();

  // --- Game flow

  function freshUnlimited(avoidId?: string): Game {
    const target = pickUnlimitedTarget(pool, Math.random, avoidId);
    const g = newGame(
      { mode: "unlimited", puzzle: null, targetId: target.id, limit: GUESS_LIMIT },
      index,
    );
    storage.saveUnlimited({ targetId: g.targetId, guessIds: g.guessIds });
    return g;
  }

  /** The saved unlimited game, rebuilt by replay; null when there is none or it cannot be used. */
  function restoreUnlimited(): Game | null {
    const saved = storage.loadUnlimited();
    if (!saved) return null;
    const target = index.get(saved.targetId);
    if (!target?.inTargetPool) {
      console.warn(
        `[funkdle] saved game ignored: "${saved.targetId}" is no longer a possible answer`,
      );
      return null;
    }
    const fresh = newGame(
      { mode: "unlimited", puzzle: null, targetId: target.id, limit: GUESS_LIMIT },
      index,
    );
    const { game: restored, problem } = replayGame(fresh, saved.guessIds, index, cfg);
    if (problem) console.warn(`[funkdle] saved game partly restored: ${problem}`);
    return restored;
  }

  function guess(item: Item) {
    const outcome = submitGuess(game, item.id, index, cfg);
    if (!outcome.ok) {
      hint.textContent = REJECTION_TEXT[outcome.reason];
      return;
    }
    game = outcome.game;
    storage.saveUnlimited({ targetId: game.targetId, guessIds: game.guessIds });
    showStorageHealth();
    hint.textContent = "";
    const target = itemById(game.targetId);
    status.textContent =
      game.status === "won"
        ? `You found it: ${target.name}, in ${game.guessIds.length} ${game.guessIds.length === 1 ? "guess" : "guesses"}.`
        : game.status === "lost"
          ? `Out of guesses. The item was ${target.name}.`
          : guessAnnouncement(item, outcome.feedback, game.limit - game.guessIds.length);
    revealNewest = true;
    render();
    if (game.status === "in-progress") combo.refresh();
    else document.getElementById("end-title")?.focus();
  }

  function startNewGame() {
    game = freshUnlimited(game.targetId);
    showStorageHealth();
    status.textContent = "New game started.";
    render();
    combo.input.focus();
  }

  // --- Rendering

  function render() {
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
    if (over) endPanel.replaceChildren(...endPanelContent());
  }

  function endPanelContent(): Node[] {
    const target = itemById(game.targetId);
    const n = game.guessIds.length;
    const newGameButton = h("button", { type: "button", class: "primary" }, "New game");
    newGameButton.addEventListener("click", startNewGame);
    return [
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
      newGameButton,
    ];
  }

  function showStorageHealth() {
    storageNotice.hidden = storage.health.state === "ok";
  }
}
