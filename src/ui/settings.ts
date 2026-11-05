// Settings (SPEC 9.1): colour-blind palette and a reduced-motion override. Changes apply at once.

import type { Settings } from "../storage/storage";
import { createDialog, type Dialog } from "./dialog";
import { h } from "./dom";

export function applySettings(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.palette = settings.colorBlind ? "colorblind" : "standard";
  root.dataset.motion = settings.motion;
}

export function createSettingsDialog(
  initial: Settings,
  onChange: (change: Pick<Settings, "colorBlind" | "motion">) => void,
): Dialog {
  const colorBlind = h("input", { type: "checkbox", id: "setting-colorblind" });
  colorBlind.checked = initial.colorBlind;
  const reduceMotion = h("input", { type: "checkbox", id: "setting-motion" });
  reduceMotion.checked = initial.motion === "reduce";

  const dialog = createDialog("settings", "Settings");
  dialog.setContent(
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
  );

  const emit = () =>
    onChange({
      colorBlind: colorBlind.checked,
      motion: reduceMotion.checked ? "reduce" : "system",
    });
  colorBlind.addEventListener("change", emit);
  reduceMotion.addEventListener("change", emit);
  return dialog;
}
