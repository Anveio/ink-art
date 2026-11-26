// Deterministic randomness and noise. Everything here is pure and position-based,
// so a crop of the page renders exactly the same pixels as the full page.

/** mulberry32: small fast seeded PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string into a 32-bit seed. */
export function seedOf(s: string | number): number {
  if (typeof s === 'number') return s >>> 0;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Integer lattice hash -> [0,1). */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash1(i: number, seed: number): number {
  return hash2(i, 0x5bd1e995, seed);
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/** 2D value noise in [0,1]. */
export function vnoise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fade(fx), v = fade(fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** 1D value noise in [-1,1]. */
export function vnoise1(x: number, seed: number): number {
  const i = Math.floor(x), f = x - i;
  const u = fade(f);
  const a = hash1(i, seed), b = hash1(i + 1, seed);
  return (a + (b - a) * u) * 2 - 1;
}

/** 1D fractal noise in roughly [-1,1]. */
export function fbm1(x: number, seed: number, octaves = 3): number {
  let s = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    s += vnoise1(x * f, seed + o * 101) * amp;
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return s / norm;
}
