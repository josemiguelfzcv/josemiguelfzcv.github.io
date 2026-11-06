/**
 * "Realistic pack": 64x64 procedural PBR materials (albedo + normal + ORM) for every tile,
 * generated at runtime from height fields. Same tile order as textures.ts so the mesher is untouched.
 */
import * as THREE from 'three';
import { mulberry32, Noise2D } from './rng';
import { TILE_NAMES, TileName, TILE, tilePixels } from './textures';

export const HD = 64;

type V3 = [number, number, number];
interface Px { alb: V3; a: number; h: number; rough: number; metal: number }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const rgb = (r: number, g: number, b: number): V3 => [r / 255, g / 255, b / 255];

/** Tileable fbm on the unit square (period 1). */
function tfbm(n: Noise2D, u: number, v: number, freq: number, oct = 4, gain = 0.5, ax = 1, ay = 1) {
  // tile by sampling four shifted copies and blending (cheap and seamless enough at these scales)
  let sum = 0, amp = 1, norm = 0, f = freq;
  for (let i = 0; i < oct; i++) {
    const x = u * f * ax, y = v * f * ay;
    const p = f * ax, q = f * ay;
    const a = n.value(x, y), b = n.value(x - p, y), c = n.value(x, y - q), d = n.value(x - p, y - q);
    const s = (1 - u), t = (1 - v);
    const val = (a * u * v + b * s * v + c * u * t + d * s * t) / Math.max(1e-6, (u * v + s * v + u * t + s * t));
    sum += amp * val; norm += amp; amp *= gain; f *= 2;
  }
  return sum / norm;
}

/** Tileable Worley (cellular) noise: returns distance to nearest and second-nearest feature point, and cell id. */
function worley(u: number, v: number, cells: number, seed: number, jitter = 1): { d1: number; d2: number; id: number } {
  const cx = Math.floor(u * cells), cy = Math.floor(v * cells);
  let d1 = 9, d2 = 9, id = 0;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const gx = (cx + ox + cells) % cells, gy = (cy + oy + cells) % cells;
    const h = hash2(gx, gy, seed);
    const px = cx + ox + 0.5 + (h - 0.5) * jitter, py = cy + oy + 0.5 + (hash2(gy, gx, seed + 7) - 0.5) * jitter;
    const dx = u * cells - px, dy = v * cells - py;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < d1) { d2 = d1; d1 = d; id = gx * 131 + gy * 17 + seed; } else if (d < d2) d2 = d;
  }
  return { d1, d2, id };
}
function hash2(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const idRand = (id: number, k = 0) => hash2(id & 0xffff, (id >> 8) & 0xffff, 91 + k);

/** Brick / plank layout helper. Returns which cell a point is in and the distance to the mortar line (0 at the line). */
function bricks(u: number, v: number, rows: number, cols: number, mortar: number, offsetHalf = true) {
  const row = Math.floor(v * rows);
  const off = offsetHalf && row % 2 === 1 ? 0.5 : 0;
  const cu = u * cols + off;
  const col = Math.floor(cu);
  const fu = cu - col, fv = v * rows - row;
  const w = mortar * cols, h = mortar * rows;
  const du = Math.min(fu, 1 - fu) / w, dv = Math.min(fv, 1 - fv) / h; // 1 = one mortar width away
  const edge = Math.min(du, dv);
  return { row, col: ((col % cols) + cols) % cols, edge, fu, fv, id: row * 977 + ((col % cols) + cols) % cols * 31 };
}

/* --------------------------------------------------------------------- */
type Recipe = (u: number, v: number, n: Noise2D, n2: Noise2D, seed: number) => Px;

const px = (alb: V3, h: number, rough = 0.85, a = 1, metal = 0): Px => ({ alb, a, h, rough, metal });

function woodPlanks(base: V3, rows: number, dark = 0.55, knots = true): Recipe {
  return (u, v, n, n2, seed) => {
    const b = bricks(u, v, rows, 1, 0.04, false);
    // per-plank tone + horizontal joint every plank (and one vertical joint per plank)
    const tone = 0.85 + idRand(b.id + seed) * 0.3;
    const jointU = (b.row * 0.37 + 0.2) % 1;
    const dj = Math.min(Math.abs(u - jointU), 1 - Math.abs(u - jointU)) / 0.02;
    const edge = Math.min(b.edge, dj);
    const grain = tfbm(n, (u + idRand(b.id, 1)) * 1, v * 1, 6, 4, 0.55, 1, 9) ;       // stretched along u
    const fine = tfbm(n2, u, v, 24, 2, 0.5, 1, 6);
    let h = 0.5 + (grain - 0.5) * 0.35 + (fine - 0.5) * 0.12;
    let alb = mul3(base, tone * (0.78 + grain * 0.42) * (0.92 + fine * 0.16));
    // knots
    if (knots) {
      const w = worley(u, v * rows / rows, 3, seed + b.row, 1);
      const kr = 0.06 + idRand(w.id) * 0.05;
      if (idRand(w.id, 3) < 0.25 && w.d1 < kr * 3) {
        const ring = Math.sin(w.d1 / kr * 9) * 0.5 + 0.5;
        const k = smooth(kr * 3, kr, w.d1);
        alb = mix3(alb, mul3(base, 0.45 + ring * 0.3), k * 0.9);
        h -= k * 0.15;
      }
    }
    // joint groove with bevel
    const groove = 1 - smooth(0, 1.0, edge);
    h -= groove * 0.5;
    alb = mul3(alb, 1 - groove * dark);
    return px(alb, h, 0.72 + (1 - grain) * 0.18 + groove * 0.1);
  };
}

function barkSide(base: V3): Recipe {
  return (u, v, n, n2, seed) => {
    const ridges = tfbm(n, u, v, 10, 4, 0.5, 14, 1); // stretched vertically
    const cracks = tfbm(n2, u + seed * 0.1, v, 5, 3, 0.6, 3, 1);
    const crack = smooth(0.62, 0.72, cracks);
    let h = 0.5 + (ridges - 0.5) * 0.6 - crack * 0.5;
    const alb = mul3(base, (0.7 + ridges * 0.6) * (1 - crack * 0.6));
    return px(alb, h, 0.9);
  };
}
function logTop(bark: V3, inner: V3): Recipe {
  return (u, v, n) => {
    const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy) * 2;
    const ringN = tfbm(n, u, v, 3, 2) * 0.08;
    const rings = Math.sin((r + ringN) * 34) * 0.5 + 0.5;
    const isBark = r > 0.86;
    const alb = isBark ? mul3(bark, 0.8 + rings * 0.3) : mul3(inner, 0.8 + rings * 0.3);
    const h = isBark ? 0.35 + rings * 0.2 : 0.55 + rings * 0.08 - (r > 0.8 ? (r - 0.8) * 1.5 : 0);
    return px(alb, h, 0.75);
  };
}

function stone(base: V3, rough = 0.9, crackAmt = 1): Recipe {
  return (u, v, n, n2, seed) => {
    const big = tfbm(n, u, v, 3, 4, 0.55);
    const fine = tfbm(n2, u, v, 16, 3, 0.5);
    const w = worley(u, v, 4, seed, 1);
    const crack = smooth(0.0, 0.08, w.d2 - w.d1) * crackAmt; // 0 at cell borders
    let h = 0.5 + (big - 0.5) * 0.5 + (fine - 0.5) * 0.25 - (1 - crack) * 0.25;
    const alb = mul3(base, (0.82 + big * 0.36) * (0.9 + fine * 0.2) * (1 - (1 - crack) * 0.35));
    return px(alb, h, rough + (1 - fine) * 0.08);
  };
}

function cobble(base: V3, mortar: V3, cells = 4): Recipe {
  return (u, v, n, n2, seed) => {
    const w = worley(u, v, cells, seed, 0.9);
    const gap = w.d2 - w.d1;             // 0 at borders
    const inStone = smooth(0.05, 0.22, gap);
    const dome = smooth(0.0, 0.6, gap);
    const tone = 0.75 + idRand(w.id) * 0.5;
    const fine = tfbm(n2, u, v, 18, 3, 0.5);
    const h = 0.25 + dome * 0.55 + (fine - 0.5) * 0.1;
    const alb = mix3(mul3(mortar, 0.9 + fine * 0.2), mul3(base, tone * (0.9 + fine * 0.2)), inStone);
    return px(alb, h, 0.95 - inStone * 0.1);
  };
}

function brickWall(brick: V3, mortar: V3, rows: number, cols: number, variance = 0.25, bevel = 0.35): Recipe {
  return (u, v, n, n2, seed) => {
    const b = bricks(u, v, rows, cols, 0.035);
    const inB = smooth(0.6, 1.4, b.edge);
    const bev = smooth(0.6, 2.4, b.edge);
    const tone = 1 - variance / 2 + idRand(b.id + seed) * variance;
    const fine = tfbm(n2, u * 1 + idRand(b.id, 2), v, 20, 3, 0.5);
    const big = tfbm(n, u, v, 4, 3, 0.5);
    const h = 0.2 + bev * bevel + inB * 0.3 + (fine - 0.5) * 0.08;
    const alb = mix3(mul3(mortar, 0.85 + fine * 0.3), mul3(brick, tone * (0.85 + fine * 0.3) * (0.9 + big * 0.2)), inB);
    return px(alb, h, 0.9 - inB * 0.05);
  };
}

function grassTop(): Recipe {
  return (u, v, n, n2) => {
    const clump = tfbm(n, u, v, 5, 4, 0.5);
    const blades = tfbm(n2, u, v, 40, 2, 0.5, 1, 3);
    const g = clump * 0.6 + blades * 0.4;
    const alb = mix3(rgb(70, 108, 44), rgb(132, 168, 72), g);
    const h = 0.4 + blades * 0.35 + clump * 0.2;
    return px(alb, h, 0.85);
  };
}
function dirt(withGrassFringe = false): Recipe {
  return (u, v, n, n2, seed) => {
    const soil = tfbm(n, u, v, 6, 4, 0.5);
    const w = worley(u, v, 9, seed, 1);
    const pebble = smooth(0.3, 0.12, w.d1) * (idRand(w.id) < 0.35 ? 1 : 0);
    let alb = mix3(rgb(92, 64, 40), rgb(148, 110, 72), soil);
    alb = mix3(alb, rgb(120, 112, 100), pebble * 0.8);
    let h = 0.45 + (soil - 0.5) * 0.3 + pebble * 0.3;
    if (withGrassFringe) {
      const edge = 0.78 + (tfbm(n2, u, 0.3, 7, 2) - 0.5) * 0.14;
      if (v > edge) { const g = tfbm(n2, u, v, 30, 2, 0.5, 1, 3); alb = mix3(rgb(70, 108, 44), rgb(130, 165, 70), g); h = 0.55 + g * 0.3; }
    }
    return px(alb, h, 0.95 - pebble * 0.2);
  };
}
function sand(): Recipe {
  return (u, v, n, n2) => {
    const rip = Math.sin((u * 6 + tfbm(n, u, v, 3, 2) * 1.2) * Math.PI * 2) * 0.5 + 0.5;
    const grain = tfbm(n2, u, v, 40, 2);
    const alb = mix3(rgb(206, 186, 140), rgb(232, 216, 170), rip * 0.5 + grain * 0.5);
    return px(alb, 0.45 + rip * 0.15 + grain * 0.1, 0.9);
  };
}
function gravel(): Recipe {
  return (u, v, n, n2, seed) => {
    const w = worley(u, v, 7, seed, 1);
    const dome = smooth(0.42, 0.05, w.d1);
    const tone = 0.7 + idRand(w.id) * 0.6;
    const fine = tfbm(n2, u, v, 24, 2);
    const alb = mix3(rgb(80, 74, 68), mul3(rgb(150, 142, 132), tone), dome * 0.9 + fine * 0.1);
    return px(alb, 0.3 + dome * 0.5 + fine * 0.1, 0.9);
  };
}
function leaves(dark: V3, light: V3): Recipe {
  return (u, v, n, n2, seed) => {
    // overlapping leaf discs
    let best = 0, tone = 0, hh = 0;
    for (let layer = 0; layer < 3; layer++) {
      const w = worley(u + layer * 0.33, v + layer * 0.21, 5 + layer * 2, seed + layer, 1);
      const r = 0.55 - layer * 0.08;
      const inside = smooth(r, r - 0.12, w.d1);
      if (inside > best) { best = inside; tone = idRand(w.id); hh = 0.3 + layer * 0.2 + inside * 0.2; }
    }
    const vein = tfbm(n2, u, v, 22, 2, 0.5, 1, 4);
    const alb = mix3(mix3(dark, light, tone), mul3(light, 1.1), vein * 0.25 * best);
    return px(mul3(alb, 0.85 + best * 0.3), hh + vein * 0.05, 0.75);
  };
}
function glass(): Recipe {
  return (u, v, n) => {
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const frame = smooth(0.07, 0.045, edge);
    const smudge = tfbm(n, u, v, 3, 2);
    const a = frame * 0.95 + 0.1 + smudge * 0.05;
    const alb: V3 = frame > 0.5 ? rgb(52, 42, 36) : rgb(200, 220, 232);
    return px(alb, 0.5 + frame * 0.15, frame > 0.5 ? 0.7 : 0.04 + smudge * 0.08, a);
  };
}
function wool(base: V3): Recipe {
  return (u, v, n) => {
    const weave = (Math.sin(u * Math.PI * 64) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 64) * 0.5 + 0.5);
    const fuzz = tfbm(n, u, v, 14, 3);
    return px(mul3(base, 0.93 + weave * 0.05 + fuzz * 0.08), 0.48 + weave * 0.06 + fuzz * 0.08, 1.0);
  };
}
function metal(base: V3, rough = 0.35): Recipe {
  return (u, v, n) => {
    const scratch = tfbm(n, u, v, 30, 2, 0.5, 1, 12);
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const bevel = smooth(0.0, 0.08, edge);
    return px(mul3(base, 0.85 + scratch * 0.3), 0.3 + bevel * 0.5, rough + scratch * 0.2, 1, 1);
  };
}
function netherrack(): Recipe {
  return (u, v, n, n2, seed) => {
    const w = worley(u, v, 8, seed, 1);
    const pore = smooth(0.18, 0.05, w.d1) * (idRand(w.id) < 0.5 ? 1 : 0);
    const big = tfbm(n, u, v, 4, 4, 0.55);
    const fine = tfbm(n2, u, v, 20, 2);
    const alb = mix3(rgb(74, 24, 26), rgb(150, 56, 52), big * 0.7 + fine * 0.3);
    return px(mul3(alb, 1 - pore * 0.6), 0.5 + (big - 0.5) * 0.4 - pore * 0.4 + (fine - 0.5) * 0.1, 0.95);
  };
}
function glowstone(): Recipe {
  return (u, v, n, n2, seed) => {
    const w = worley(u, v, 5, seed, 1);
    const facet = smooth(0.0, 0.1, w.d2 - w.d1);
    const tone = 0.75 + idRand(w.id) * 0.5;
    const alb = mix3(rgb(120, 80, 30), mul3(rgb(255, 200, 110), tone), facet);
    return px(alb, 0.3 + facet * 0.5, 0.4);
  };
}
function obsidian(cry = false): Recipe {
  return (u, v, n, n2, seed) => {
    const w = worley(u, v, 3, seed, 1);
    const facet = (w.d2 - w.d1);
    const sheen = tfbm(n, u, v, 4, 3);
    let alb = mix3(rgb(10, 6, 18), rgb(52, 32, 78), facet * 1.5 + sheen * 0.3);
    let h = 0.5 + facet * 0.8;
    if (cry) { const c = smooth(0.08, 0.0, worley(u, v, 7, seed + 3, 1).d1) * (idRand(w.id) < 0.6 ? 1 : 0); alb = mix3(alb, rgb(190, 110, 255), c); }
    return px(alb, h, 0.22 + sheen * 0.15);
  };
}
function quartz(): Recipe {
  return (u, v, n) => { const m = tfbm(n, u, v, 5, 3); const vein = smooth(0.52, 0.6, tfbm(n, u * 2, v, 4, 2)); return px(mix3(rgb(232, 226, 216), rgb(246, 243, 238), m * 0.6 + vein * 0.4), 0.5 + m * 0.05, 0.3); };
}
function basaltSide(): Recipe {
  return (u, v, n) => { const col = Math.sin(u * Math.PI * 4); const ridge = smooth(0.6, 1.0, Math.abs(col)); const f = tfbm(n, u, v, 14, 3, 0.5, 1, 6); return px(mul3(rgb(84, 84, 90), (0.75 + f * 0.3) * (1 - ridge * 0.35)), 0.5 - ridge * 0.4 + f * 0.1, 0.9); };
}
function magma(): Recipe {
  return (u, v, n, n2, seed) => {
    const w = worley(u, v, 4, seed, 1); const crack = 1 - smooth(0.0, 0.1, w.d2 - w.d1);
    const f = tfbm(n2, u, v, 16, 2);
    const alb = mix3(rgb(50, 32, 28), rgb(255, 150, 40), crack);
    return px(mul3(alb, 0.9 + f * 0.2), 0.5 - crack * 0.4, 0.9 - crack * 0.4);
  };
}
function soulSand(): Recipe {
  return (u, v, n, n2, seed) => { const f = tfbm(n, u, v, 8, 4); const w = worley(u, v, 4, seed, 1); const face = smooth(0.2, 0.1, w.d1) * (idRand(w.id) < 0.4 ? 1 : 0); return px(mix3(rgb(58, 40, 30), rgb(96, 72, 54), f * (1 - face)), 0.5 + (f - 0.5) * 0.3 - face * 0.3, 0.98); };
}
function planksWithBooks(plank: V3): Recipe {
  const base = woodPlanks(plank, 4, 0.55, false);
  const spines: V3[] = [rgb(170, 60, 50), rgb(60, 90, 160), rgb(70, 130, 70), rgb(190, 160, 70), rgb(120, 70, 140), rgb(200, 200, 190), rgb(40, 40, 40), rgb(210, 120, 60)];
  return (u, v, n, n2, seed) => {
    const shelfRow = v > 0.1 && v < 0.46 ? 0 : v > 0.56 && v < 0.92 ? 1 : -1;
    if (shelfRow < 0) return base(u, v, n, n2, seed);
    // books: variable widths via worley columns
    const col = Math.floor(u * 11 + shelfRow * 3.7);
    const id = col * 17 + shelfRow * 101 + seed;
    const w = 1 / 11, fu = (u * 11 + shelfRow * 3.7) % 1;
    const top = (shelfRow === 0 ? 0.46 : 0.92) - 0.02 - idRand(id, 1) * 0.1;
    if (v > top || idRand(id, 2) < 0.1) return px(rgb(26, 18, 12), 0.1, 0.95); // gap / shadow behind
    const c = spines[Math.floor(idRand(id) * spines.length)];
    const bevel = smooth(0.0, 0.12, Math.min(fu, 1 - fu));
    const band = Math.abs(v - (top - 0.06)) < 0.012 || Math.abs(v - (top - 0.28)) < 0.012 ? 1 : 0;
    void w;
    return px(mul3(mix3(c, rgb(240, 220, 150), band * 0.6), 0.8 + bevel * 0.3), 0.5 + bevel * 0.3, 0.6);
  };
}
function painting(): Recipe {
  return (u, v, n) => {
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge < 0.07) return px(rgb(90, 60, 30), 0.6 + smooth(0.07, 0.0, edge) * 0.3, 0.6);
    const sky = mix3(rgb(120, 170, 220), rgb(250, 200, 140), smooth(0.9, 0.35, v));
    const hill = smooth(0.42, 0.38, v + Math.sin(u * 6) * 0.05 + tfbm(n, u, v, 3, 2) * 0.1);
    const c = mix3(sky, rgb(60, 110, 50), hill);
    const sun = smooth(0.1, 0.06, Math.hypot(u - 0.7, v - 0.68));
    return px(mix3(c, rgb(255, 230, 150), sun), 0.5 + tfbm(n, u, v, 12, 2) * 0.04, 0.5);
  };
}
function screen(): Recipe {
  return (u, v) => {
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge < 0.08) return px(rgb(20, 20, 24), 0.5, 0.4);
    const line = Math.floor((v - 0.1) / 0.09);
    const w = [0.5, 0.7, 0.4, 0.62, 0.3, 0.55, 0.75, 0.45][line & 7];
    const on = u > 0.14 && u < 0.14 + w && ((v - 0.1) % 0.09) > 0.03;
    const c = on ? ([rgb(120, 200, 255), rgb(200, 220, 240), rgb(120, 220, 160), rgb(255, 200, 120)][line & 3]) : rgb(24, 34, 50);
    return px(c, 0.5, 0.15);
  };
}
function sprite(draw: (u: number, v: number, n: Noise2D, seed: number) => [V3, number] | null, rough = 0.8): Recipe {
  return (u, v, n, _n2, seed) => { const r = draw(u, v, n, seed); return r ? px(r[0], 0.5 + r[1] * 0.3, rough, 1) : px([0, 0, 0], 0.5, 1, 0); };
}
/** tall grass: tapered blades */
const tallGrass: Recipe = sprite((u, v, n, seed) => {
  const rr = mulberry32(seed);
  const t = v; // v = 0 at the bottom of the sprite
  for (let i = 0; i < 8; i++) {
    const x0 = 0.1 + rr() * 0.8, h = 0.5 + rr() * 0.5, lean = (rr() - 0.5) * 0.45, w0 = 0.06 + rr() * 0.04;
    const tone = 0.85 + rr() * 0.3;
    if (t > h) continue;
    const k = t / h;
    const cx = x0 + lean * k * k;
    const w = w0 * (1 - k * 0.85);
    const d = Math.abs(u - cx) / w;
    if (d < 1) { const shade = (0.8 + k * 0.5) * tone * (1.05 - d * 0.25); return [mul3(rgb(112, 172, 66), shade), 1 - d]; }
  }
  return null;
});
function flower(petal: V3, center: V3, petals = 5): Recipe {
  return sprite((u, v, n, seed) => {
    const t = v;
    // stem
    if (Math.abs(u - 0.5 - Math.sin(t * 3) * 0.03) < 0.025 && t < 0.62) return [rgb(70, 130, 50), 0.5];
    // leaf
    if (t > 0.2 && t < 0.3 && u > 0.3 && u < 0.5 && Math.abs((u - 0.4) / 0.1) + Math.abs((t - 0.25) / 0.05) < 1) return [rgb(80, 150, 60), 0.3];
    const dx = u - 0.5, dy = t - 0.72, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const pr = 0.12 + Math.cos(ang * petals) * 0.07;
    if (r < 0.06) return [center, 1];
    if (r < pr + 0.04) return [mul3(petal, 0.85 + (1 - r / pr) * 0.3), 0.6];
    return null;
  });
}
const torch: Recipe = sprite((u, v) => {
  if (u > 0.44 && u < 0.56 && v < 0.62) return [mul3(rgb(120, 85, 45), 0.8 + (1 - Math.abs(u - 0.5) / 0.06) * 0.4), 0.5];
  const dy = v - 0.74, dx = u - 0.5; const r = Math.hypot(dx * 1.4, dy);
  if (r < 0.1) return [r < 0.05 ? rgb(255, 240, 180) : rgb(255, 170, 60), 1];
  return null;
});
function railR(powered: boolean): Recipe {
  return sprite((u, v) => {
    const tie = ((v * 3) % 1) < 0.22;
    if (tie) return [rgb(90, 62, 36), 0.4];
    if (Math.abs(u - 0.2) < 0.045 || Math.abs(u - 0.8) < 0.045) return [powered ? rgb(190, 160, 90) : rgb(150, 150, 160), 0.8];
    if (powered && Math.abs(u - 0.5) < 0.04) return [rgb(220, 60, 50), 0.6];
    return null;
  }, 0.4);
}
const ladder: Recipe = sprite((u, v) => {
  if (Math.abs(u - 0.15) < 0.06 || Math.abs(u - 0.85) < 0.06) return [rgb(150, 110, 60), 0.6];
  if (((v * 4 + 0.1) % 1) < 0.18) return [rgb(185, 140, 80), 0.5];
  return null;
});
const ironBars: Recipe = sprite((u, v) => {
  for (const x of [0.12, 0.5, 0.88]) if (Math.abs(u - x) < 0.05) return [rgb(110, 110, 118), 0.7];
  if (v < 0.05 || v > 0.95) return [rgb(90, 90, 96), 0.6];
  return null;
}, 0.4);
const cobweb: Recipe = sprite((u, v) => {
  const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  const spoke = Math.abs(Math.sin(ang * 4)) < 0.025 || Math.abs(Math.cos(ang * 4)) < 0.025;
  const ring = Math.abs(((r * 6) % 1) - 0.5) < 0.03 && r < 0.7;
  if (spoke || ring) return [rgb(205, 205, 200), 0.2];
  return null;
}, 0.9);
function door(top: boolean): Recipe {
  const base = woodPlanks(rgb(182, 146, 90), 4, 0.5, false);
  return (u, v, n, n2, seed) => {
    const b = base(u, v, n, n2, seed);
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge < 0.05) return px(mul3(b.alb, 0.7), 0.6, 0.7);
    const panel = (pu0: number, pv0: number, pu1: number, pv1: number) => (u > pu0 && u < pu1 && v > pv0 && v < pv1 ? Math.min(u - pu0, pu1 - u, v - pv0, pv1 - v) : -1);
    if (top) {
      const win = panel(0.15, 0.55, 0.85, 0.9);
      if (win > 0) { const mull = Math.abs(u - 0.5) < 0.03 || Math.abs(v - 0.725) < 0.03; return mull ? px(mul3(b.alb, 0.55), 0.45, 0.7) : px(rgb(210, 236, 246), 0.4, 0.05, 1); }
      const p = panel(0.15, 0.1, 0.85, 0.45);
      if (p > 0) return px(mul3(b.alb, 1.08), 0.5 + smooth(0, 0.04, p) * 0.2, 0.6);
      return px(mul3(b.alb, 0.8), 0.45, 0.7);
    }
    const p1 = panel(0.15, 0.55, 0.85, 0.92), p2 = panel(0.15, 0.08, 0.85, 0.45);
    const p = Math.max(p1, p2);
    if (p > 0) return px(mul3(b.alb, 1.08), 0.5 + smooth(0, 0.04, p) * 0.2, 0.6);
    if (Math.hypot(u - 0.78, v - 0.5) < 0.05) return px(rgb(200, 200, 205), 0.9, 0.3, 1, 1);
    return px(mul3(b.alb, 0.8), 0.45, 0.7);
  };
}
function chest(front: boolean): Recipe {
  const base = woodPlanks(rgb(150, 100, 50), 2, 0.5, false);
  return (u, v, n, n2, seed) => {
    const b = base(u, v, n, n2, seed);
    const edge = Math.min(u, 1 - u, v, 1 - v);
    if (edge < 0.06) return px(rgb(70, 48, 24), 0.6, 0.6);
    if (Math.abs(v - 0.6) < 0.025) return px(rgb(60, 40, 20), 0.3, 0.7);
    if (front && Math.abs(u - 0.5) < 0.1 && v > 0.5 && v < 0.75) return px(rgb(70, 70, 76), 0.8, 0.35, 1, 1);
    return b;
  };
}
function craftingTop(): Recipe {
  const base = woodPlanks(rgb(182, 146, 90), 4, 0.5, false);
  return (u, v, n, n2, seed) => {
    const b = base(u, v, n, n2, seed);
    const gu = Math.abs(((u - 0.125) * 4) % 1 - 0.5) > 0.44, gv = Math.abs(((v - 0.125) * 4) % 1 - 0.5) > 0.44;
    if ((gu || gv) && u > 0.1 && u < 0.9 && v > 0.1 && v < 0.9) return px(mul3(b.alb, 0.5), 0.3, 0.8);
    return b;
  };
}
function craftingSide(): Recipe {
  const base = woodPlanks(rgb(182, 146, 90), 4, 0.5, false);
  return (u, v, n, n2, seed) => {
    const b = base(u, v, n, n2, seed);
    if (v > 0.88) return px(mul3(b.alb, 0.55), 0.4, 0.8);
    if (Math.abs(u - 0.25) < 0.05 && v > 0.25 && v < 0.75) return px(rgb(130, 130, 136), 0.7, 0.35, 1, 1);
    if (Math.abs(u - 0.25) < 0.12 && v > 0.72 && v < 0.82) return px(rgb(150, 150, 156), 0.75, 0.35, 1, 1);
    if (Math.abs(u - 0.7) < 0.05 && v > 0.25 && v < 0.75) return px(rgb(140, 100, 60), 0.7, 0.6);
    if (Math.abs(u - 0.7) < 0.12 && v > 0.72 && v < 0.82) return px(rgb(90, 60, 35), 0.75, 0.6);
    return b;
  };
}
function furnaceFront(): Recipe {
  const base = cobble(rgb(118, 118, 122), rgb(66, 66, 70), 5);
  return (u, v, n, n2, seed) => {
    if (u > 0.25 && u < 0.75 && v > 0.55 && v < 0.85) return px(rgb(30, 30, 34), 0.2, 0.9);
    if (u > 0.25 && u < 0.75 && v > 0.12 && v < 0.42) { const f = tfbm(n, u * 3, v * 3, 4, 2); return px(mix3(rgb(255, 120, 30), rgb(255, 220, 90), f), 0.2, 0.6); }
    return base(u, v, n, n2, seed);
  };
}
function hay(): Recipe { return (u, v, n) => { const s = Math.sin(v * Math.PI * 10) * 0.5 + 0.5; const f = tfbm(n, u, v, 20, 2, 0.5, 6, 1); return px(mix3(rgb(170, 130, 40), rgb(230, 195, 90), s * 0.5 + f * 0.5), 0.4 + s * 0.3 + f * 0.1, 0.9); }; }
function seaLantern(): Recipe { return (u, v) => { const e = Math.min(u, 1 - u, v, 1 - v); if (e < 0.12) return px(rgb(40, 44, 56), 0.6, 0.5); const c = Math.hypot(u - 0.5, v - 0.5); return px(mix3(rgb(170, 235, 245), rgb(90, 170, 190), smooth(0.15, 0.4, c)), 0.5, 0.2); }; }
function lanternT(): Recipe { return sprite((u, v) => { if (u > 0.3 && u < 0.7 && v > 0.15 && v < 0.85) { const inner = u > 0.36 && u < 0.64 && v > 0.22 && v < 0.72; return inner ? [rgb(255, 205, 120), 0.8] : [rgb(60, 60, 70), 0.6]; } if (Math.abs(u - 0.5) < 0.06 && v > 0.85) return [rgb(60, 60, 70), 0.6]; return null; }); }
function warped(): Recipe { return (u, v, n, n2, seed) => { const f = tfbm(n, u, v, 8, 4); const w = worley(u, v, 6, seed, 1); const spot = smooth(0.25, 0.1, w.d1); return px(mix3(rgb(26, 110, 100), rgb(70, 180, 160), f * 0.6 + spot * 0.4), 0.45 + f * 0.2 + spot * 0.2, 0.85); }; }

/* ---------------------- registry ---------------------- */
const RECIPES: Partial<Record<TileName, Recipe>> = {
  grass_top: grassTop(),
  grass_side: dirt(true),
  dirt: dirt(),
  dirt_path: (u, v, n, n2, s) => { const d = dirt()(u, v, n, n2, s); return px(mix3(d.alb, rgb(160, 136, 90), 0.5), d.h, 0.9); },
  stone: stone(rgb(128, 128, 128)),
  cobble: cobble(rgb(122, 122, 124), rgb(64, 64, 66)),
  mossy_cobble: (u, v, n, n2, s) => { const c = cobble(rgb(122, 122, 124), rgb(64, 64, 66))(u, v, n, n2, s); const m = smooth(0.55, 0.7, tfbm(n2, u, v, 5, 3)); return px(mix3(c.alb, rgb(86, 122, 60), m), c.h, c.rough); },
  sand: sand(),
  gravel: gravel(),
  oak_log: barkSide(rgb(100, 78, 46)),
  oak_log_top: logTop(rgb(100, 78, 46), rgb(190, 150, 95)),
  oak_leaves: leaves(rgb(36, 84, 30), rgb(96, 160, 62)),
  oak_planks: woodPlanks(rgb(182, 146, 90), 4),
  spruce_planks: woodPlanks(rgb(118, 86, 50), 4),
  spruce_log: barkSide(rgb(62, 42, 24)),
  spruce_log_top: logTop(rgb(62, 42, 24), rgb(140, 105, 62)),
  birch_planks: woodPlanks(rgb(204, 188, 140), 4),
  stone_bricks: brickWall(rgb(124, 124, 126), rgb(74, 74, 76), 4, 2, 0.18, 0.3),
  mossy_stone_bricks: (u, v, n, n2, s) => { const b = brickWall(rgb(124, 124, 126), rgb(74, 74, 76), 4, 2, 0.18, 0.3)(u, v, n, n2, s); const m = smooth(0.52, 0.68, tfbm(n2, u, v, 4, 3)); return px(mix3(b.alb, rgb(90, 125, 65), m), b.h, b.rough); },
  cracked_stone_bricks: (u, v, n, n2, s) => { const b = brickWall(rgb(120, 120, 122), rgb(74, 74, 76), 4, 2, 0.18, 0.3)(u, v, n, n2, s); const c = smooth(0.03, 0.0, Math.abs(u - 0.5 - Math.sin(v * 9) * 0.06)); return px(mul3(b.alb, 1 - c * 0.6), b.h - c * 0.3, b.rough); },
  bricks: brickWall(rgb(160, 85, 65), rgb(160, 150, 140), 4, 2, 0.25),
  glass: glass(),
  bookshelf: planksWithBooks(rgb(182, 146, 90)),
  crafting_top: craftingTop(),
  crafting_side: craftingSide(),
  chest_front: chest(true),
  chest_side: chest(false),
  furnace_front: furnaceFront(),
  furnace_side: cobble(rgb(118, 118, 122), rgb(66, 66, 70), 5),
  netherrack: netherrack(),
  nether_bricks: brickWall(rgb(62, 30, 36), rgb(32, 14, 18), 4, 2, 0.2),
  red_nether_bricks: brickWall(rgb(112, 30, 34), rgb(58, 14, 18), 4, 2, 0.2),
  glowstone: glowstone(),
  obsidian: obsidian(false),
  crying_obsidian: obsidian(true),
  bedrock: stone(rgb(66, 66, 68), 0.95, 1),
  magma: magma(),
  basalt: basaltSide(),
  basalt_top: (u, v, n, n2, s) => { const w = worley(u, v, 4, s, 0.6); const e = smooth(0.0, 0.08, w.d2 - w.d1); return px(mul3(rgb(84, 84, 90), 0.7 + e * 0.4), 0.3 + e * 0.5, 0.9); },
  blackstone: stone(rgb(44, 42, 48), 0.9, 1),
  gilded_blackstone: (u, v, n, n2, s) => { const b = stone(rgb(44, 42, 48), 0.9, 1)(u, v, n, n2, s); const g = smooth(0.12, 0.04, worley(u, v, 6, s + 5, 1).d1) * (tfbm(n2, u, v, 6, 2) > 0.55 ? 1 : 0); return px(mix3(b.alb, rgb(240, 200, 70), g), b.h, b.rough - g * 0.5, 1, g); },
  soul_sand: soulSand(),
  nether_wart: (u, v, n, n2, s) => { const w = worley(u, v, 8, s, 1); const bump = smooth(0.35, 0.1, w.d1); return px(mix3(rgb(90, 14, 18), rgb(170, 40, 45), bump), 0.3 + bump * 0.5, 0.7); },
  warped_nylium: warped(),
  quartz: quartz(),
  sea_lantern: seaLantern(),
  gold: metal(rgb(240, 200, 70), 0.3),
  iron: metal(rgb(205, 205, 208), 0.4),
  hay: hay(),
  red_sand: (u, v, n, n2, s) => { const d = sand()(u, v, n, n2, s); return px(mix3(d.alb, rgb(190, 100, 50), 0.7), d.h, d.rough); },
  wool_white: wool(rgb(232, 232, 228)), wool_red: wool(rgb(170, 45, 40)), wool_blue: wool(rgb(50, 70, 160)),
  wool_black: wool(rgb(30, 30, 34)), wool_cyan: wool(rgb(30, 130, 140)), wool_yellow: wool(rgb(230, 190, 60)),
  painting: painting(),
  lantern: lanternT(),
  torch: torch,
  rail: railR(false), rail_powered: railR(true),
  ladder: ladder,
  door_top: door(true), door_bottom: door(false),
  tall_grass: tallGrass,
  dandelion: flower(rgb(240, 210, 60), rgb(255, 240, 150), 8),
  poppy: flower(rgb(210, 40, 40), rgb(30, 30, 30), 5),
  blue_orchid: flower(rgb(70, 160, 230), rgb(240, 240, 200), 6),
  iron_bars: ironBars,
  cobweb: cobweb,
  plaster: (u, v, n, n2) => { const f = tfbm(n, u, v, 12, 3); const g = tfbm(n2, u, v, 40, 2); return px(mix3(rgb(228, 222, 210), rgb(240, 236, 228), f * 0.6 + g * 0.4), 0.5 + f * 0.06 + g * 0.03, 0.92); },
  dark_oak_planks: woodPlanks(rgb(72, 48, 26), 4),
  shingles: (u, v, n, n2, s) => {
    const rows = 4, row = Math.floor(v * rows), off = row % 2 ? 0.5 : 0;
    const cu = u * 4 + off, col = Math.floor(cu), fu = cu - col, fv = v * rows - row;
    const id = row * 53 + ((col % 4) + 4) % 4 * 7 + s;
    const tone = 0.8 + idRand(id) * 0.4;
    const f = tfbm(n2, u + idRand(id, 1), v, 16, 3, 0.5, 1, 4);
    const gap = Math.min(fu, 1 - fu) < 0.04 ? 1 : 0;
    const lip = smooth(0.0, 0.1, fv);
    return px(mul3(rgb(74, 58, 50), tone * (0.85 + f * 0.3) * (1 - gap * 0.5)), 0.3 + lip * 0.4 + f * 0.08 - gap * 0.3, 0.85);
  },
  slate: (u, v, n, n2, s) => {
    const rows = 4, row = Math.floor(v * rows), off = row % 2 ? 0.5 : 0;
    const cu = u * 4 + off, col = Math.floor(cu), fu = cu - col, fv = v * rows - row;
    const id = row * 53 + ((col % 4) + 4) % 4 * 7 + s;
    const tone = 0.8 + idRand(id) * 0.4;
    const f = tfbm(n2, u + idRand(id, 1), v, 14, 3, 0.5, 1, 3);
    const gap = Math.min(fu, 1 - fu) < 0.035 ? 1 : 0;
    const lip = smooth(0.0, 0.1, fv);
    return px(mul3(rgb(58, 62, 78), tone * (0.85 + f * 0.3) * (1 - gap * 0.5)), 0.3 + lip * 0.4 + f * 0.08 - gap * 0.3, 0.6);
  },
  spruce_leaves: leaves(rgb(24, 58, 42), rgb(64, 118, 84)),
  rug: (u, v, n) => {
    const weave = (Math.sin(u * Math.PI * 48) * 0.5 + 0.5) * (Math.sin(v * Math.PI * 48) * 0.5 + 0.5);
    const edge = Math.min(u, 1 - u, v, 1 - v);
    const border = edge < 0.1 ? 1 : 0;
    const dia = Math.abs(Math.abs(u - 0.5) + Math.abs(v - 0.5) - 0.25) < 0.025 ? 1 : 0;
    const c = (border || dia) ? rgb(160, 74, 52) : rgb(214, 196, 168);
    return px(mul3(c, 0.9 + weave * 0.15 + tfbm(n, u, v, 10, 2) * 0.05), 0.45 + weave * 0.15, 1.0);
  },
  fire: sprite((u, v, n, seed) => {
    const t = v, cx = Math.abs(u - 0.5);
    const flick = tfbm(n, u * 2 + seed, v * 2, 3, 3) - 0.5;
    const w = (1 - t) * (0.5 + flick * 0.4) * 0.5;
    if (cx > w) return null;
    const core = 1 - cx / Math.max(w, 1e-3);
    const c = t > 0.6 ? rgb(255, 232, 140) : mix3(rgb(230, 70, 20), rgb(255, 180, 60), core);
    return [c, 1];
  }, 0.5),
  fern: sprite((u, v) => {
    const t = v;
    if (Math.abs(u - 0.5) < 0.03 && t < 0.8) return [rgb(60, 110, 45), 0.5];
    for (let i = 0; i < 6; i++) {
      const y0 = 0.15 + i * 0.12, len = 0.42 - i * 0.05;
      const dy = t - y0 - Math.abs(u - 0.5) * 0.35;
      if (Math.abs(u - 0.5) < len && Math.abs(dy) < 0.03 - Math.abs(u - 0.5) * 0.04) return [mul3(rgb(80, 150, 60), 0.8 + i * 0.05 + Math.abs(u - 0.5)), 0.4];
    }
    return null;
  }),
  white: () => px([1, 1, 1], 0.5, 0.8),
  black: () => px(rgb(12, 12, 14), 0.5, 0.5),
  screen: screen(),
};

export interface HDAtlas { albedo: THREE.DataArrayTexture; normal: THREE.DataArrayTexture; orm: THREE.DataArrayTexture }

export async function createHDAtlas(onProgress?: (done: number, total: number) => void): Promise<HDAtlas> {
  const n = TILE_NAMES.length, S = HD, px2 = S * S;
  const alb = new Uint8Array(px2 * 4 * n), nor = new Uint8Array(px2 * 4 * n), orm = new Uint8Array(px2 * 4 * n);
  const height = new Float32Array(px2);
  const noiseA = new Noise2D(11), noiseB = new Noise2D(23);
  const t0 = performance.now();

  for (let layer = 0; layer < n; layer++) {
    const name = TILE_NAMES[layer];
    const recipe = RECIPES[name] ?? upscaled(name);
    const seed = 100 + layer * 13;
    const base = layer * px2 * 4;
    // pass 1: albedo / height / rough / metal
    const rough = new Float32Array(px2), metal = new Float32Array(px2);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S, v = (y + 0.5) / S; // v up (row 0 = bottom, matches flipY=false)
      const p = recipe(u, v, noiseA, noiseB, seed);
      const i = y * S + x;
      alb[base + i * 4] = clamp01(p.alb[0]) * 255; alb[base + i * 4 + 1] = clamp01(p.alb[1]) * 255; alb[base + i * 4 + 2] = clamp01(p.alb[2]) * 255; alb[base + i * 4 + 3] = clamp01(p.a) * 255;
      height[i] = p.a > 0.5 ? p.h : 0.5; rough[i] = p.rough; metal[i] = p.metal * 0.5;
    }
    // pass 2: normals (Sobel, wrapping) + cavity AO
    const strength = 2.6;
    const H = (xx: number, yy: number) => height[((yy + S) % S) * S + ((xx + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1));
      const dy = (H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1));
      const nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = y * S + x;
      nor[base + i * 4] = (nx / len * 0.5 + 0.5) * 255; nor[base + i * 4 + 1] = (ny / len * 0.5 + 0.5) * 255; nor[base + i * 4 + 2] = (nz / len * 0.5 + 0.5) * 255; nor[base + i * 4 + 3] = 255;
      let mean = 0; for (let oy = -3; oy <= 3; oy += 3) for (let ox = -3; ox <= 3; ox += 3) mean += H(x + ox, y + oy); mean /= 9;
      const ao = clamp01(1 - Math.max(0, mean - height[i]) * 2.2);
      orm[base + i * 4] = ao * 255; orm[base + i * 4 + 1] = clamp01(rough[i]) * 255; orm[base + i * 4 + 2] = clamp01(metal[i]) * 255; orm[base + i * 4 + 3] = 255;
    }
    onProgress?.(layer + 1, n);
    if (layer % 6 === 5) await new Promise<void>(r => requestAnimationFrame(() => r()));
  }
  if (location.search.includes('debug')) console.log('HD atlas generated in', Math.round(performance.now() - t0), 'ms');

  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataArrayTexture(data, S, S, n);
    t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 8;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.needsUpdate = true;
    return t;
  };
  return { albedo: make(alb, true), normal: make(nor, false), orm: make(orm, false) };
}

/** Fallback: the 16px pixel-art tile, upscaled with a little surface noise. */
function upscaled(name: TileName): Recipe {
  const data = tilePixels(name);
  return (u, v, n) => {
    const x = Math.floor(u * TILE), y = TILE - 1 - Math.floor(v * TILE);
    const i = (y * TILE + x) * 4;
    const f = tfbm(n, u, v, 16, 2);
    const k = 0.95 + f * 0.1;
    return px([data[i] / 255 * k, data[i + 1] / 255 * k, data[i + 2] / 255 * k], 0.5 + f * 0.05, 0.85, data[i + 3] / 255);
  };
}
