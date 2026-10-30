// Small statistics helpers for the audit and the simulation.

/** Linear interpolation between closest ranks (R type 7). `sorted` must be ascending. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? NaN;
  const b = sorted[hi] ?? NaN;
  return a + (b - a) * (pos - lo);
}

export function counts<T>(values: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

/** Shannon entropy of the empirical distribution of `values`, in bits. */
export function entropyBits<T>(values: T[]): number {
  const n = values.length;
  let h = 0;
  for (const c of counts(values).values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** mulberry32: a tiny seeded PRNG, so simulation results are reproducible. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pct = (part: number, whole: number, digits = 1) =>
  whole === 0 ? "n/a" : `${((100 * part) / whole).toFixed(digits)}%`;
