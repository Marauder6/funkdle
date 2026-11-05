// The guess input: an editable combobox with list autocomplete and automatic selection of the
// first match (WAI-ARIA APG combobox pattern, SPEC 9.1). Arrow keys move, Enter chooses, Escape
// closes then clears. Choosing submits the guess.

import type { Item } from "../core/types";
import { h } from "./dom";

export interface ComboboxOptions {
  id: string;
  label: string;
  placeholder: string;
  /** Matching items, best first, already-guessed ones left out. */
  search: (query: string) => Item[];
  /** The item named exactly by the text, if any. */
  resolve: (text: string) => Item | null;
  onChoose: (item: Item) => void;
  /** Feedback for the player, e.g. "No items match". Empty string clears it. */
  onHint: (text: string) => void;
}

export interface Combobox {
  root: HTMLElement;
  input: HTMLInputElement;
  /** Re-run the search, e.g. after a guess changes what is excluded. */
  refresh(): void;
  setDisabled(disabled: boolean): void;
}

export function createCombobox(opts: ComboboxOptions): Combobox {
  const listId = `${opts.id}-list`;
  const input = h("input", {
    id: opts.id,
    type: "text",
    role: "combobox",
    "aria-autocomplete": "list",
    "aria-expanded": "false",
    "aria-controls": listId,
    autocomplete: "off",
    autocapitalize: "none",
    spellcheck: "false",
    enterkeyhint: "go",
    placeholder: opts.placeholder,
  });
  const list = h("ul", {
    id: listId,
    role: "listbox",
    "aria-label": "Matching items",
    hidden: true,
  });
  const root = h("div", { class: "combo" }, h("label", { for: opts.id }, opts.label), input, list);

  let options: Item[] = [];
  let active = -1;
  let open = false;
  const optionId = (i: number) => `${listId}-${i}`;

  function render() {
    list.replaceChildren(
      ...options.map((item, i) => {
        const li = h(
          "li",
          { id: optionId(i), role: "option", "aria-selected": i === active ? "true" : "false" },
          item.name,
        );
        // Keep focus in the input so typing can continue after a mouse or touch choice.
        li.addEventListener("mousedown", (e) => e.preventDefault());
        li.addEventListener("click", () => choose(item));
        return li;
      }),
    );
    list.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    if (open && active >= 0) {
      input.setAttribute("aria-activedescendant", optionId(active));
      document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function update() {
    const query = input.value;
    options = query.trim() ? opts.search(query) : [];
    active = options.length ? 0 : -1;
    open = options.length > 0;
    opts.onHint(query.trim() && !options.length ? "No items match. Check the spelling." : "");
    render();
  }

  function close() {
    open = false;
    render();
  }

  function choose(item: Item) {
    input.value = "";
    options = [];
    active = -1;
    open = false;
    render();
    opts.onChoose(item);
  }

  input.addEventListener("input", update);
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open && options.length) open = true;
        else if (options.length) active = (active + 1) % options.length;
        render();
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open && options.length) open = true;
        else if (options.length) active = active <= 0 ? options.length - 1 : active - 1;
        render();
        break;
      case "Enter": {
        e.preventDefault();
        const picked = open && active >= 0 ? options[active] : opts.resolve(input.value);
        if (picked) choose(picked);
        else if (input.value.trim()) opts.onHint("That isn't an item. Pick one from the list.");
        break;
      }
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        } else if (input.value) {
          e.preventDefault();
          input.value = "";
          update();
        }
        break;
    }
  });

  return {
    root,
    input,
    refresh: () => {
      if (input.value.trim()) update();
    },
    setDisabled(disabled) {
      input.disabled = disabled;
      if (disabled) close();
    },
  };
}
