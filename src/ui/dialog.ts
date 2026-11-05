// A modal dialog on the native <dialog> element: it traps focus, closes on Escape, and here also
// closes on a backdrop click and returns focus to whatever opened it.

import { h } from "./dom";

export interface Dialog {
  element: HTMLDialogElement;
  setContent(...nodes: Node[]): void;
  open(opener: HTMLElement): void;
}

export function createDialog(id: string, title: string, onClose?: () => void): Dialog {
  const content = h("div", { class: "dialog-content" });
  const close = h("button", { type: "button", class: "dialog-close" }, "Close");
  const element = h(
    "dialog",
    { class: "dialog", "aria-labelledby": `${id}-title` },
    h(
      "div",
      { class: "dialog-body" },
      h("h2", { id: `${id}-title`, tabindex: "-1" }, title),
      content,
      close,
    ),
  );
  let opener: HTMLElement | null = null;

  close.addEventListener("click", () => element.close());
  // A click on the backdrop lands on the dialog element itself, outside the padded body.
  element.addEventListener("click", (e) => {
    if (e.target === element) element.close();
  });
  element.addEventListener("close", () => {
    opener?.focus();
    onClose?.();
  });

  return {
    element,
    setContent: (...nodes) => content.replaceChildren(...nodes),
    open(from) {
      opener = from;
      element.showModal();
      // Start at the top: focusing the first button would scroll a long dialog to its end.
      element.scrollTop = 0;
      element.querySelector<HTMLElement>("h2")?.focus();
    },
  };
}
