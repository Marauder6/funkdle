// SPEC 6.2: the tuple of everything feedback can distinguish, serialized. Same equality
// semantics as compare(): weight in integer hundredths, component types as a sorted list.

import { componentTypes, weightHundredths, type Item } from "./types";

export function fingerprint(item: Item): string {
  return [
    `w${weightHundredths(item)}`,
    `v${item.value}`,
    `c${componentTypes(item).join("+")}`,
    `t${item.totalComponents}`,
    `u${item.uniqueComponents}`,
    `o${item.origin}`,
  ].join("|");
}

/** Groups items by fingerprint. Map order follows first appearance in `items`. */
export function collisionClasses(items: Item[]): Map<string, Item[]> {
  const classes = new Map<string, Item[]>();
  for (const item of items) {
    const key = fingerprint(item);
    const members = classes.get(key);
    if (members) members.push(item);
    else classes.set(key, [item]);
  }
  return classes;
}
