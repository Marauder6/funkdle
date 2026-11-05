// Settings dialog (SPEC 9.1): colour-blind palette and a reduced-motion override. Changes apply
// at once and are saved.

import type { Settings } from "../storage/storage";
import { h } from "./dom";

export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.palette = settings.colorBlind ? "colorblind" : "standard";
  root.dataset.motion = settings.motion;
}

export function createSettingsDialog(
  initial: Settings,
  opener: HTMLButtonElement,
  onChange: (next: Settings) => void,
): HTMLDialogElement {
  const colorBlind = h("input", { type: "checkbox", id: "setting-colorblind" });
  colorBlind.checked = initial.colorBlind;
  const reduceMotion = h("input", { type: "checkbox", id: "setting-motion" });
  reduceMotion.checked = initial.motion === "reduce";
  const close = h("button", { type: "button" }, "Close");

  const dialog = h(
    "dialog",
    { class: "dialog", "aria-labelledby": "settings-title" },
    h(
      "div",
      { class: "dialog-body" },
      h("h2", { id: "settings-title" }, "Settings"),
      h(
        "div",
        { class: "setting" },
        colorBlind,
        h(
          "label",
          { for: "setting-colorblind" },
          "Colour-blind palette: blue for a match, orange for close",
        ),
      ),
      h(
        "div",
        { class: "setting" },
        reduceMotion,
        h(
          "label",
          { for: "setting-motion" },
          "Reduce motion. Animations also stop when your device asks for reduced motion.",
        ),
      ),
      close,
    ),
  );

  const emit = () =>
    onChange({
      colorBlind: colorBlind.checked,
      motion: reduceMotion.checked ? "reduce" : "system",
    });
  colorBlind.addEventListener("change", emit);
  reduceMotion.addEventListener("change", emit);
  close.addEventListener("click", () => dialog.close());
  // A click on the backdrop lands on the dialog element itself, outside the padded body.
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => opener.focus());
  opener.addEventListener("click", () => dialog.showModal());
  return dialog;
}
