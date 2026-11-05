import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDBACK as cfg, SITE_URL } from "../src/core/config";
import { feedbackHistory, indexItems, newGame, submitGuess, type Game } from "../src/core/game";
import { shareText } from "../src/core/share";
import { formatCountdown } from "../src/ui/format";
import { dataset } from "./fixtures";

const index = indexItems(dataset.items);

function play(guesses: string[], mode: "daily" | "unlimited" = "daily"): Game {
  let game = newGame(
    { mode, puzzle: mode === "daily" ? 12 : null, targetId: "alarm-clock", limit: 6 },
    index,
  );
  for (const id of guesses) {
    const outcome = submitGuess(game, id, index, cfg);
    if (!outcome.ok) throw new Error(outcome.reason);
    game = outcome.game;
  }
  return game;
}

const share = (game: Game, palette?: "standard" | "colorblind") =>
  shareText(
    game,
    feedbackHistory(game, index, cfg).map(([, fb]) => fb),
    SITE_URL,
    palette,
  );

const [G, Y, B] = ["\u{1F7E9}", "\u{1F7E8}", "⬛"];

describe("share text (SPEC 9.2)", () => {
  it("matches the format for the worked example, oldest guess first", () => {
    const text = share(play(["desk-fan", "wakemaster-alarm-clock", "alarm-clock"]));
    expect(text).toBe(
      [
        "Funkdle #12 3/6",
        // Desk fan: weight miss, value miss, components miss, total close, types miss, origin match
        `${B}${B}${B}${Y}${B}${G}`,
        // Wakemaster: weight match, value miss, components match, total miss, types match, origin match
        `${G}${B}${G}${B}${G}${G}`,
        `${G}${G}${G}${G}${G}${G}`,
        "https://marauder6.github.io/funkdle/",
      ].join("\n"),
    );
  });

  it("scores a loss as X", () => {
    const loss = play([
      "desk-fan",
      "toaster",
      "typewriter",
      "fork",
      "pen",
      "wakemaster-alarm-clock",
    ]);
    expect(share(loss).split("\n")[0]).toBe("Funkdle #12 X/6");
    expect(share(loss).split("\n")).toHaveLength(8);
  });

  it("never names an item", () => {
    const text = share(play(["desk-fan", "alarm-clock"])).toLowerCase();
    for (const name of ["desk fan", "alarm clock", "alarm-clock"]) expect(text).not.toContain(name);
  });

  it("uses blue and orange in the colour-blind palette", () => {
    const text = share(play(["wakemaster-alarm-clock", "alarm-clock"]), "colorblind");
    expect(text.split("\n")[1]).toBe(`\u{1F7E6}${B}\u{1F7E6}${B}\u{1F7E6}\u{1F7E6}`);
  });

  it("refuses unlimited and unfinished games", () => {
    expect(() => share(play(["desk-fan"]))).toThrow();
    expect(() => share(play(["alarm-clock"], "unlimited"))).toThrow();
  });
});

describe("formatCountdown", () => {
  it("formats hours, minutes and seconds, rounding up", () => {
    expect(formatCountdown(5 * 3600_000 + 12 * 60_000 + 33_000)).toBe("05:12:33");
    expect(formatCountdown(500)).toBe("00:00:01");
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(-5)).toBe("00:00:00");
    expect(formatCountdown(25 * 3600_000)).toBe("25:00:00");
  });
});
