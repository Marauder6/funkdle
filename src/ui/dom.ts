// A tiny element builder. Children that are strings become text nodes, never HTML, so item names
// and other data are escaped by construction (U-untrusted-data).

type AttrValue = string | number | boolean | null | undefined;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, AttrValue> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (name === "class") el.className = String(value);
    else el.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children)
    if (child !== null && child !== undefined && child !== false) el.append(child);
  return el;
}

/** Text only screen readers hear. */
export const srOnly = (text: string) => h("span", { class: "sr-only" }, text);
