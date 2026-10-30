// Shared data and feedback types (SPEC 4, 5.2).

export const ORIGINS = ["base", "far-harbor", "nuka-world", "creation-club"] as const;
/** In release order: "earliest origin" (SPEC 5.3) means lowest index. */
export type Origin = (typeof ORIGINS)[number];

export const COMPONENT_NAMES = [
  "Acid",
  "Adhesive",
  "Aluminum",
  "Antiseptic",
  "Asbestos",
  "Ballistic fiber",
  "Bone",
  "Ceramic",
  "Circuitry",
  "Cloth",
  "Concrete",
  "Copper",
  "Cork",
  "Crystal",
  "Fertilizer",
  "Fiber optics",
  "Fiberglass",
  "Gears",
  "Glass",
  "Gold",
  "Lead",
  "Leather",
  "Nuclear material",
  "Oil",
  "Plastic",
  "Rubber",
  "Screw",
  "Silver",
  "Spring",
  "Steel",
  "Wood",
] as const;
export type ComponentName = (typeof COMPONENT_NAMES)[number];

export interface Item {
  /** Slug of the name; stable forever once published. */
  id: string;
  name: string;
  /** Caps, integer >= 0. */
  value: number;
  /** Pounds, >= 0, at most 2 decimal places. Compare via weightHundredths(). */
  weight: number;
  components: Partial<Record<ComponentName, number>>;
  totalComponents: number;
  uniqueComponents: number;
  origin: Origin;
  /** Provenance only; never shown in the UI. */
  formIds: string[];
  inTargetPool: boolean;
}

export interface Dataset {
  schemaVersion: 1;
  source: { title: string; url: string; revisionId: number; retrievedAt: string };
  generatedAt: string;
  items: Item[];
}

export type CellState = "match" | "close" | "miss";
/** "higher" means the target's value is larger than the guess's. */
export type Direction = "higher" | "lower";

export interface NumericCell {
  state: CellState;
  /** null exactly when state is "match". */
  direction: Direction | null;
}

export interface ComponentChip {
  name: ComponentName;
  /** The guess's own quantity: shown for information, never affects state (SPEC 4.2). */
  quantity: number;
  /** The target contains this component type in any quantity. */
  present: boolean;
}

export interface Feedback {
  weight: NumericCell;
  value: NumericCell;
  components: { state: CellState; chips: ComponentChip[] };
  total: NumericCell;
  unique: NumericCell;
  origin: { state: "match" | "miss" };
}

export function weightHundredths(item: Pick<Item, "weight">): number {
  return Math.round(item.weight * 100);
}

/** Component types in a fixed (alphabetical) order. */
export function componentTypes(item: Pick<Item, "components">): ComponentName[] {
  return (Object.keys(item.components) as ComponentName[]).sort();
}
