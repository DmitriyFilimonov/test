/** Детерминированный PRNG (mulberry32): одинаковый сид — одинаковая последовательность. */
export function createRandom(seed: number) {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  /** Целое в диапазоне [min, max] включительно. */
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));

  return { next, int };
}

export type Random = ReturnType<typeof createRandom>;
