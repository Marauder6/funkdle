// A modal dialog on the native <dialog> element: it traps focus, closes on Escape, and here also
// closes on a backdrop click and returns focus to whatever opened it.

import { h } from "./dom";

export interface Dialog {
  element: HTMLDialogElement;
  setContent(...nodes: Node[]): void;
  /** `returnFocusTo` gets focus back when the dialog closes: usually the button that opened it. */
  open(returnFocusTo: HTMLElement): void;
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
  // A click on the backdrop lands on the dialog element itself, outside the padded body. So does
  // the click that ends a text selection dragged out of the body, so the press must have started
  // on the backdrop too.
  let pressedOnBackdrop = false;
  element.addEventListener("pointerdown", (e) => {
    pressedOnBackdrop = e.target === element;
  });
  element.addEventListener("click", (e) => {
    if (e.target === element && pressedOnBackdrop) element.close();
    pressedOnBackdrop = false;
  });
  element.addEventListener("close", () => {
    opener?.focus();
    onClose?.();
  });

  return {
    element,
    setContent: (...nodes) => content.replaceChildren(...nodes),
    open(returnFocusTo) {
      opener = returnFocusTo;
      element.showModal();
      // Start at the top: focusing the first button would scroll a long dialog to its end.
      element.scrollTop = 0;
      element.querySelector<HTMLElement>("h2")?.focus();
    },
  };
}
