// Every tunable game constant lives here (SPEC 0.6, 4.1). Changing a default is a one-line edit.

export interface Tolerance {
  /** Absolute floor, in the column's own unit (hundredths of a pound for weight, caps for value). */
  floor: number;
  /** Fraction of the target's value. */
  ratio: number;
}

export interface FeedbackConfig {
  weight: Tolerance;
  value: Tolerance;
  /** Total components: close when within this many of the target. */
  totalCloseWithin: number;
}

/** SPEC 4.1 [DEFAULT]. Weight floor 0.5 lb is 50 hundredths. */
export const DEFAULT_FEEDBACK: FeedbackConfig = {
  weight: { floor: 50, ratio: 0.25 },
  value: { floor: 2, ratio: 0.25 },
  totalCloseWithin: 1,
};

/** SPEC 3.3, decided at the Phase 1 gate: 6 for now, revisit after real play. */
export const GUESS_LIMIT = 6;

/** SPEC 5.3, 13.1 (decided: out): Creation Club items are parsed but kept out of both sets. */
export const INCLUDE_CREATION_CLUB = false;
