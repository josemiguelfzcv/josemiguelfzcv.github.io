/** Deterministic PRNG + 2D noise helpers (so the world is identical on every visit). */

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export function rngRange(r: Rng, min: number, max: number) {
  return min + (max - min) * r();
}

export function rngInt(r: Rng, min: number, max: number) {
  return Math.floor(rngRange(r, min, max + 1));
}

/** Hash-based 2D value noise with smooth interpolation. */
export class Noise2D {
  private perm: Uint8Array;
  constructor(seed: number) {
    const r = mulberry32(seed);
    const p = new Uint8Array(512);
    const base = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [base[i], base[j]] = [base[j], base[i]];
    }
    for (let i = 0; i < 512; i++) p[i] = base[i & 255];
    this.perm = p;
  }

  private hash(x: number, y: number) {
    return this.perm[(this.perm[x & 255] + y) & 255] / 255;
  }

  /** Smooth value noise in [0,1]. */
  value(x: number, y: number) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = this.hash(xi, yi), b = this.hash(xi + 1, yi);
    const c = this.hash(xi, yi + 1), d = this.hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  /** Fractal Brownian motion in [0,1]-ish. */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.value(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
