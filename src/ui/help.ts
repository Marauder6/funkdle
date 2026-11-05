// The help dialog's content (SPEC 9.1): the rules, with the tolerances read from config, and the
// SPEC 4.4 worked example built from the real items, so it can never disagree with the game.

import { compare } from "../core/compare";
import type { FeedbackConfig } from "../core/config";
import type { ItemIndex } from "../core/game";
import type { Feedback, Item } from "../core/types";
import { h } from "./dom";
import { DIRECTION_SYMBOL, STATE_SYMBOL } from "./format";
import { renderHistory } from "./history";

const EXAMPLE = { target: "alarm-clock", guesses: ["desk-fan", "wakemaster-alarm-clock"] };

export function helpContent(index: ItemIndex, cfg: FeedbackConfig, limit: number): Node[] {
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  const nodes: Node[] = [
    h(
      "p",
      {},
      `Find the hidden Fallout 4 junk item in ${limit} guesses. Type an item's name and pick it ` +
        "from the list. Each guess shows that item's own stats and how they compare with the answer:",
    ),
    h(
      "ul",
      { class: "legend" },
      h(
        "li",
        {},
        `${STATE_SYMBOL.match} match, ${STATE_SYMBOL.close} close, ${STATE_SYMBOL.miss} miss. ` +
          `${DIRECTION_SYMBOL.higher} means the answer is higher, ${DIRECTION_SYMBOL.lower} lower.`,
      ),
      h(
        "li",
        {},
        `Weight and value are close when within ${pct(cfg.weight.ratio)} of the answer ` +
          `(at least ${cfg.weight.floor / 100} lb or ${cfg.value.floor} caps either way).`,
      ),
      h(
        "li",
        {},
        `Components: each of your item's components is ${STATE_SYMBOL.match} if the answer has it ` +
          `too. The cell matches when the component types are exactly the same, and is close when ` +
          "some are shared.",
      ),
      h(
        "li",
        {},
        `Total counts every component; close means within ${cfg.totalCloseWithin}. ` +
          "Types counts different components.",
      ),
      h("li", {}, "Origin is the base game, Far Harbor or Nuka-World."),
    ),
  ];

  const target = index.get(EXAMPLE.target);
  const guesses = EXAMPLE.guesses.map((id) => index.get(id));
  if (target && guesses.every((g): g is Item => g !== undefined)) {
    const rows = guesses.map((g): [Item, Feedback] => [g, compare(g, target, cfg)]);
    nodes.push(
      h("h3", {}, "Example"),
      h("p", {}, `The answer is ${target.name}. Two guesses, newest first:`),
      renderHistory(rows, false, "Example guesses, newest first"),
      h(
        "p",
        {},
        `${guesses[1]!.name} has exactly the answer's component types, so Components matches, ` +
          "but its total is higher: the answer has fewer of them.",
      ),
    );
  }

  nodes.push(
    h(
      "p",
      {},
      "A new daily puzzle starts at midnight, your time, and is the same for everyone. " +
        "Unlimited mode lets you play as many games as you like; it does not change your stats.",
    ),
  );
  return nodes;
}
