/**
 * Procedural 16x16 pixel-art tiles → one DataArrayTexture (one layer per tile).
 * Everything here is original, generated at runtime: no game assets are used.
 */
import * as THREE from 'three';
import { mulberry32, Rng } from './rng';

export const TILE = 16;

type RGB = [number, number, number];
type RGBA = [number, number, number, number];

class Px {
  data: Uint8ClampedArray;
  constructor(public rng: Rng) {
    this.data = new Uint8ClampedArray(TILE * TILE * 4);
  }
  set(x: number, y: number, c: RGB | RGBA) {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2];
    this.data[i + 3] = c.length > 3 ? (c as RGBA)[3] : 255;
  }
  get(x: number, y: number): RGBA {
    const i = (((y + TILE) % TILE) * TILE + ((x + TILE) % TILE)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  fill(c: RGB | RGBA) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) this.set(x, y, c);
  }
  /** Fill with per-pixel brightness noise. */
  noise(base: RGB, variance = 0.12, alpha = 255) {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const k = 1 + (this.rng() * 2 - 1) * variance;
      this.set(x, y, [base[0] * k, base[1] * k, base[2] * k, alpha]);
    }
  }
  rect(x0: number, y0: number, w: number, h: number, c: RGB | RGBA) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
  }
  speckle(c: RGB, count: number, alpha = 255) {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(this.rng() * TILE), y = Math.floor(this.rng() * TILE);
      this.set(x, y, [c[0], c[1], c[2], alpha]);
    }
  }
  /** Multiply a pixel's brightness. */
  shade(x: number, y: number, k: number) {
    const c = this.get(x, y);
    this.set(x, y, [c[0] * k, c[1] * k, c[2] * k, c[3]]);
  }
  shadeRect(x0: number, y0: number, w: number, h: number, k: number) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.shade(x, y, k);
  }
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

/* ---------- tile painters ---------- */

function stoneLike(p: Px, base: RGB, variance = 0.1) {
  p.noise(base, variance);
  // soft blotches
  for (let i = 0; i < 5; i++) {
    const cx = p.rng() * TILE, cy = p.rng() * TILE, r = 2 + p.rng() * 3, k = 0.86 + p.rng() * 0.22;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const dx = ((x - cx + 24) % 16) - 8, dy = ((y - cy + 24) % 16) - 8;
      if (dx * dx + dy * dy < r * r) p.shade(x, y, k);
    }
  }
}

function cobble(p: Px, base: RGB, mortar: RGB) {
  p.noise(mortar, 0.08);
  // irregular stones on a jittered 4x4 grid
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const x0 = gx * 4 + (p.rng() < 0.5 ? 0 : 1), y0 = gy * 4 + (p.rng() < 0.5 ? 0 : 1);
    const w = 2 + Math.floor(p.rng() * 2), h = 2 + Math.floor(p.rng() * 2);
    const k = 0.85 + p.rng() * 0.3;
    const c = scale(base, k);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const kk = 1 + (p.rng() * 2 - 1) * 0.08;
      p.set(x % 16, y % 16, scale(c, kk));
    }
    // highlight top-left, shadow bottom-right
    for (let x = x0; x < x0 + w; x++) { p.shade(x % 16, y0 % 16, 1.12); p.shade(x % 16, (y0 + h - 1) % 16, 0.82); }
  }
}

function planks(p: Px, base: RGB, rows = 4) {
  p.noise(base, 0.06);
  const rowH = TILE / rows;
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    // grain
    for (let y = y0; y < y0 + rowH; y++) for (let x = 0; x < TILE; x++) {
      const g = Math.sin((x * 0.9 + y * 2.1 + r * 7) * 0.7) * 0.5 + 0.5;
      p.shade(x, y, 0.94 + g * 0.1);
    }
    // seam between planks
    for (let x = 0; x < TILE; x++) p.shade(x, y0 + rowH - 1, 0.68);
    for (let x = 0; x < TILE; x++) p.shade(x, y0, 1.06);
    // vertical joint
    const jx = (r * 7 + 3) % TILE;
    for (let y = y0; y < y0 + rowH - 1; y++) p.shade(jx, y, 0.72);
  }
}

function logSide(p: Px, bark: RGB) {
  p.noise(bark, 0.1);
  for (let x = 0; x < TILE; x++) {
    const k = 0.8 + 0.35 * (Math.sin(x * 1.9) * 0.5 + 0.5);
    for (let y = 0; y < TILE; y++) p.shade(x, y, k * (0.94 + p.rng() * 0.1));
  }
  // horizontal cracks
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(p.rng() * TILE), y = Math.floor(p.rng() * TILE), len = 2 + Math.floor(p.rng() * 3);
    for (let d = 0; d < len; d++) p.shade((x + d) % TILE, y, 0.7);
  }
}

function logTop(p: Px, bark: RGB, inner: RGB) {
  p.noise(bark, 0.1);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const ring = Math.floor(d) % 2 === 0 ? 1.0 : 0.86;
    p.set(x, y, scale(inner, ring * (0.95 + p.rng() * 0.1)));
  }
}

function leaves(p: Px, dark: RGB, light: RGB) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const r = p.rng();
    const c = r < 0.45 ? dark : r < 0.85 ? mix(dark, light, 0.5) : light;
    p.set(x, y, scale(c, 0.92 + p.rng() * 0.16));
  }
  // a few very dark "holes" for depth (still opaque)
  for (let i = 0; i < 10; i++) p.set(Math.floor(p.rng() * 16), Math.floor(p.rng() * 16), scale(dark, 0.55));
}

function bricks(p: Px, brick: RGB, mortar: RGB, rows = 4, perRow = 2, variance = 0.1) {
  p.noise(brick, variance);
  const bh = TILE / rows, bw = TILE / perRow;
  // per-brick brightness
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : Math.floor(bw / 2);
    for (let b = -1; b <= perRow; b++) {
      const x0 = b * bw + off;
      const k = 0.9 + p.rng() * 0.2;
      for (let y = r * bh; y < r * bh + bh; y++) for (let x = x0; x < x0 + bw; x++) {
        if (x < 0 || x >= TILE) continue;
        p.shade(x, y, k);
      }
    }
  }
  // mortar: one pixel line under each row and between bricks
  for (let r = 0; r < rows; r++) {
    const y = r * bh + bh - 1;
    for (let x = 0; x < TILE; x++) p.set(x, y, scale(mortar, 0.95 + p.rng() * 0.1));
    const off = r % 2 === 0 ? 0 : Math.floor(bw / 2);
    for (let b = -1; b <= perRow; b++) {
      const x = b * bw + off + bw - 1;
      if (x < 0 || x >= TILE) continue;
      for (let yy = r * bh; yy < r * bh + bh - 1; yy++) p.set(x, yy, scale(mortar, 0.95 + p.rng() * 0.1));
    }
  }
  // subtle bevel highlight on the top-left of each brick
  for (let r = 0; r < rows; r++) {
    const off = r % 2 === 0 ? 0 : Math.floor(bw / 2);
    for (let b = -1; b <= perRow; b++) {
      const x0 = b * bw + off;
      for (let x = x0; x < x0 + bw - 1; x++) if (x >= 0 && x < TILE) p.shade(x, r * bh, 1.08);
    }
  }
}

function glass(p: Px) {
  p.fill([220, 240, 250, 0]);
  const edge: RGBA = [56, 44, 38, 240];
  for (let i = 0; i < TILE; i++) { p.set(i, 0, edge); p.set(i, 15, edge); p.set(0, i, edge); p.set(15, i, edge); }
  // diagonal highlight streaks
  for (let i = 2; i < 9; i++) p.set(i, 11 - i + 2, [255, 255, 255, 110]);
  for (let i = 5; i < 13; i++) p.set(i, 16 - i + 3, [255, 255, 255, 70]);
}

function bookshelf(p: Px, plank: RGB) {
  planks(p, plank, 4);
  const spines: RGB[] = [[170, 60, 50], [60, 90, 160], [70, 130, 70], [190, 160, 70], [120, 70, 140], [200, 200, 190], [40, 40, 40]];
  for (let row = 0; row < 2; row++) {
    const y0 = 2 + row * 7;
    p.rect(0, y0 - 1, 16, 7, scale(plank, 0.45));
    let x = 1;
    while (x < 15) {
      const w = 1 + Math.floor(p.rng() * 2);
      const c = spines[Math.floor(p.rng() * spines.length)];
      const h = 4 + Math.floor(p.rng() * 2);
      p.rect(x, y0 + 5 - h, w, h, c);
      p.shadeRect(x, y0 + 5 - h, 1, h, 1.15);
      x += w + (p.rng() < 0.3 ? 1 : 0);
    }
  }
}

function glowstone(p: Px) {
  p.noise([230, 180, 90], 0.15);
  for (let i = 0; i < 12; i++) {
    const x = Math.floor(p.rng() * 16), y = Math.floor(p.rng() * 16);
    p.rect(x, y, 2, 2, [255, 236, 170]);
  }
  p.speckle([180, 120, 50], 20);
}

function craftingTop(p: Px, plank: RGB) {
  planks(p, plank, 4);
  const dark = scale(plank, 0.5), light = scale(plank, 1.3);
  for (let i = 0; i < 4; i++) {
    const v = 2 + i * 4;
    for (let t = 2; t < 14; t++) { p.set(t, v, dark); p.set(v, t, dark); }
  }
  p.rect(3, 3, 1, 1, light);
}

function craftingSide(p: Px, plank: RGB) {
  planks(p, plank, 4);
  p.rect(0, 0, 16, 2, scale(plank, 0.55));
  // abstract tools
  p.rect(3, 4, 2, 8, [120, 120, 125]); p.rect(2, 3, 4, 2, [150, 150, 155]);
  p.rect(10, 4, 2, 8, [140, 100, 60]); p.rect(9, 3, 4, 2, [90, 60, 35]);
}

function chestFront(p: Px) {
  p.noise([150, 100, 50], 0.08);
  p.rect(0, 0, 16, 1, [90, 60, 30]); p.rect(0, 15, 16, 1, [90, 60, 30]);
  p.rect(0, 0, 1, 16, [90, 60, 30]); p.rect(15, 0, 1, 16, [90, 60, 30]);
  p.rect(1, 6, 14, 1, [70, 45, 20]);
  p.rect(6, 4, 4, 5, [60, 60, 65]); p.rect(7, 5, 2, 3, [40, 40, 45]);
}

function chestSide(p: Px) {
  p.noise([150, 100, 50], 0.08);
  p.rect(0, 0, 16, 1, [90, 60, 30]); p.rect(0, 15, 16, 1, [90, 60, 30]);
  p.rect(0, 0, 1, 16, [90, 60, 30]); p.rect(15, 0, 1, 16, [90, 60, 30]);
  p.rect(1, 6, 14, 1, [70, 45, 20]);
}

function obsidian(p: Px, cry = false) {
  p.noise([28, 18, 40], 0.25);
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(p.rng() * 16), y = Math.floor(p.rng() * 16);
    p.rect(x, y, 3, 2, [50, 30, 70]);
  }
  if (cry) {
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(p.rng() * 16), y = Math.floor(p.rng() * 16);
      p.rect(x, y, 1, 2, [150, 70, 230]); p.set(x, y, [200, 130, 255]);
    }
  }
}

function furnaceFront(p: Px) {
  cobble(p, [110, 110, 115], [70, 70, 75]);
  p.rect(4, 2, 8, 5, [40, 40, 45]);
  p.rect(4, 9, 8, 5, [30, 25, 25]);
  p.rect(5, 10, 6, 3, [230, 120, 40]); p.rect(6, 10, 2, 1, [255, 220, 90]); p.rect(9, 11, 2, 2, [255, 200, 60]);
}

function lantern(p: Px) {
  p.fill([0, 0, 0, 0]);
  p.rect(5, 2, 6, 11, [60, 60, 70]);
  p.rect(6, 4, 4, 7, [255, 200, 110]);
  p.rect(7, 5, 2, 3, [255, 240, 190]);
  p.rect(7, 0, 2, 2, [60, 60, 70]);
}

function torch(p: Px) {
  p.fill([0, 0, 0, 0]);
  p.rect(7, 6, 2, 10, [120, 85, 45]);
  p.rect(7, 4, 2, 2, [255, 170, 60]);
  p.rect(7, 3, 2, 1, [255, 230, 120]);
  p.rect(6, 5, 1, 1, [255, 140, 40]); p.rect(9, 5, 1, 1, [255, 140, 40]);
}

function rail(p: Px, powered = false) {
  p.fill([0, 0, 0, 0]);
  const tie: RGB = [100, 70, 40], metal: RGB = powered ? [190, 160, 90] : [150, 150, 160];
  for (const y of [1, 7, 13]) p.rect(0, y, 16, 2, tie);
  p.rect(3, 0, 2, 16, metal); p.rect(11, 0, 2, 16, metal);
  if (powered) p.rect(7, 0, 2, 16, [220, 60, 50]);
}

function ladder(p: Px) {
  p.fill([0, 0, 0, 0]);
  p.rect(2, 0, 2, 16, [150, 110, 60]); p.rect(12, 0, 2, 16, [150, 110, 60]);
  for (const y of [1, 5, 9, 13]) p.rect(2, y, 12, 2, [185, 140, 80]);
}

function doorTile(p: Px, plank: RGB, top: boolean) {
  planks(p, plank, 4);
  const frame = scale(plank, 0.7), panel = scale(plank, 1.12), lineD = scale(plank, 0.5);
  p.rect(0, 0, 16, 1, frame); p.rect(0, 0, 1, 16, frame); p.rect(15, 0, 1, 16, frame);
  if (top) {
    p.rect(2, 2, 12, 6, lineD);
    p.rect(3, 3, 4, 4, [210, 236, 246, 255]); p.rect(9, 3, 4, 4, [210, 236, 246, 255]);
    p.rect(2, 10, 12, 5, panel); p.rect(2, 10, 12, 1, lineD); p.rect(2, 10, 1, 5, lineD);
  } else {
    p.rect(2, 1, 12, 5, panel); p.rect(2, 1, 12, 1, lineD); p.rect(2, 1, 1, 5, lineD);
    p.rect(2, 9, 12, 6, panel); p.rect(2, 9, 12, 1, lineD); p.rect(2, 9, 1, 6, lineD);
    p.rect(12, 0, 2, 2, [120, 120, 125]);
  }
}

function tallGrass(p: Px) {
  p.fill([0, 0, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const x = 1 + Math.floor(p.rng() * 14), h = 5 + Math.floor(p.rng() * 10);
    const c: RGB = [70 + p.rng() * 40, 140 + p.rng() * 50, 50 + p.rng() * 30];
    let xx = x;
    for (let y = 15; y > 15 - h; y--) {
      p.set(xx, y, scale(c, 0.8 + (15 - y) / h * 0.4));
      if (p.rng() < 0.25) xx += p.rng() < 0.5 ? -1 : 1;
    }
  }
}

function flower(p: Px, petal: RGB, center: RGB) {
  p.fill([0, 0, 0, 0]);
  p.rect(7, 8, 2, 8, [70, 130, 50]);
  p.rect(5, 11, 2, 1, [80, 150, 60]); p.rect(9, 12, 2, 1, [80, 150, 60]);
  p.rect(6, 4, 4, 4, petal); p.rect(5, 5, 6, 2, petal); p.rect(7, 3, 2, 6, petal);
  p.rect(7, 5, 2, 2, center);
}

function ironBars(p: Px) {
  p.fill([0, 0, 0, 0]);
  for (const x of [1, 7, 13]) p.rect(x, 0, 2, 16, [110, 110, 115]);
  p.rect(0, 0, 16, 1, [90, 90, 95]); p.rect(0, 15, 16, 1, [90, 90, 95]);
}

function cobweb(p: Px) {
  p.fill([0, 0, 0, 0]);
  const c: RGBA = [200, 200, 195, 120];
  for (let i = 0; i < 16; i += 1) { if (i % 2 === 0) { p.set(i, i, c); p.set(15 - i, i, c); } if (i % 3 === 0) { p.set(i, 7, c); p.set(7, i, c); } }
  for (let i = 4; i < 12; i += 2) { p.set(i, 4, c); p.set(i, 11, c); p.set(4, i, c); p.set(11, i, c); }
}

function magma(p: Px) {
  p.noise([60, 40, 35], 0.2);
  for (let i = 0; i < 5; i++) {
    let x = Math.floor(p.rng() * 16), y = Math.floor(p.rng() * 16);
    for (let d = 0; d < 8; d++) {
      p.set(x, y, [240, 120, 30]); p.set(x + 1, y, [255, 180, 60]);
      x = (x + (p.rng() < 0.5 ? 1 : 0) + 16) % 16; y = (y + (p.rng() < 0.6 ? 1 : -1) + 16) % 16;
    }
  }
}

function basaltSide(p: Px) {
  p.noise([75, 75, 80], 0.08);
  for (const x of [0, 5, 10, 15]) p.shadeRect(x, 0, 1, 16, 0.6);
  for (let i = 0; i < 6; i++) p.shadeRect(Math.floor(p.rng() * 16), Math.floor(p.rng() * 16), 1, 3, 0.8);
}

function soulSand(p: Px) {
  p.noise([80, 60, 48], 0.15);
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(p.rng() * 12), y = Math.floor(p.rng() * 12);
    p.rect(x, y, 1, 1, [40, 28, 22]); p.rect(x + 2, y, 1, 1, [40, 28, 22]); p.rect(x, y + 2, 3, 1, [40, 28, 22]);
  }
}

function hay(p: Px) {
  p.noise([210, 170, 60], 0.12);
  for (let y = 0; y < 16; y += 4) p.shadeRect(0, y, 16, 1, 0.7);
  p.speckle([240, 210, 110], 24);
}

function quartz(p: Px) {
  p.noise([236, 230, 222], 0.03);
  p.speckle([248, 244, 238], 14);
}

function metal(p: Px, base: RGB) {
  p.noise(base, 0.03);
  p.rect(0, 0, 16, 1, scale(base, 1.15)); p.rect(0, 0, 1, 16, scale(base, 1.15));
  p.rect(0, 15, 16, 1, scale(base, 0.7)); p.rect(15, 0, 1, 16, scale(base, 0.7));
  p.rect(2, 2, 12, 12, scale(base, 1.04));
}

function wool(p: Px, base: RGB) {
  p.noise(base, 0.05);
  for (let y = 0; y < 16; y += 2) for (let x = 0; x < 16; x++) if ((x + y / 2) % 3 === 0) p.shade(x, y, 0.93);
}

function painting(p: Px) {
  // tiny abstract landscape (an original "painting")
  p.noise([120, 80, 40], 0.1);
  p.rect(1, 1, 14, 14, [130, 190, 230]);
  p.rect(1, 9, 14, 6, [90, 150, 70]);
  p.rect(3, 3, 3, 3, [255, 220, 120]);
  p.rect(9, 7, 5, 3, [70, 110, 60]); p.rect(10, 6, 3, 1, [70, 110, 60]);
}

function netherrack(p: Px) {
  p.noise([110, 45, 45], 0.2);
  for (let i = 0; i < 6; i++) p.rect(Math.floor(p.rng() * 16), Math.floor(p.rng() * 16), 2, 1, [70, 25, 28]);
  p.speckle([150, 70, 65], 14);
}

function redSand(p: Px) {
  p.noise([190, 100, 50], 0.08);
}

/* ---------- registry ---------- */

export const TILES = {
  grass_top: (p: Px) => { p.noise([104, 148, 66], 0.11); p.speckle([126, 168, 78], 18); p.speckle([86, 128, 56], 18); },
  grass_side: (p: Px) => {
    p.noise([130, 94, 62], 0.12); p.speckle([100, 70, 45], 20);
    for (let x = 0; x < 16; x++) { const h = 3 + (p.rng() < 0.35 ? 1 : 0); for (let y = 0; y < h; y++) p.set(x, y, scale([104, 148, 66], 0.9 + p.rng() * 0.2)); }
  },
  dirt: (p: Px) => { p.noise([130, 94, 62], 0.12); p.speckle([100, 70, 45], 24); p.speckle([155, 115, 80], 12); },
  dirt_path: (p: Px) => { p.noise([150, 125, 80], 0.1); p.speckle([120, 98, 60], 16); },
  stone: (p: Px) => stoneLike(p, [125, 125, 125]),
  cobble: (p: Px) => cobble(p, [120, 120, 122], [70, 70, 72]),
  mossy_cobble: (p: Px) => { cobble(p, [120, 120, 122], [70, 70, 72]); for (let i = 0; i < 5; i++) p.rect(Math.floor(p.rng() * 14), Math.floor(p.rng() * 14), 2 + Math.floor(p.rng() * 2), 2, [85, 120, 60]); },
  sand: (p: Px) => { p.noise([222, 206, 160], 0.06); p.speckle([200, 185, 140], 12); },
  gravel: (p: Px) => { p.noise([125, 118, 112], 0.18); p.speckle([90, 85, 80], 18); p.speckle([165, 160, 150], 12); },
  oak_log: (p: Px) => logSide(p, [100, 78, 46]),
  oak_log_top: (p: Px) => logTop(p, [100, 78, 46], [190, 150, 95]),
  oak_leaves: (p: Px) => leaves(p, [40, 95, 32], [90, 160, 60]),
  oak_planks: (p: Px) => planks(p, [182, 146, 90]),
  spruce_planks: (p: Px) => planks(p, [118, 86, 50]),
  spruce_log: (p: Px) => logSide(p, [62, 42, 24]),
  spruce_log_top: (p: Px) => logTop(p, [62, 42, 24], [140, 105, 62]),
  birch_planks: (p: Px) => planks(p, [204, 188, 140]),
  stone_bricks: (p: Px) => bricks(p, [122, 122, 124], [78, 78, 80], 2, 2, 0.06),
  mossy_stone_bricks: (p: Px) => { bricks(p, [122, 122, 124], [78, 78, 80], 2, 2, 0.06); for (let i = 0; i < 6; i++) p.rect(Math.floor(p.rng() * 14), Math.floor(p.rng() * 14), 2, 1 + Math.floor(p.rng() * 2), [90, 125, 65]); },
  cracked_stone_bricks: (p: Px) => { bricks(p, [118, 118, 120], [78, 78, 80], 2, 2, 0.06); let x = 3; for (let y = 2; y < 14; y++) { p.set(x, y, [60, 60, 62]); x += p.rng() < 0.5 ? 1 : (p.rng() < 0.5 ? -1 : 0); } },
  bricks: (p: Px) => bricks(p, [160, 85, 65], [150, 140, 130], 4, 2, 0.1),
  glass: (p: Px) => glass(p),
  bookshelf: (p: Px) => bookshelf(p, [182, 146, 90]),
  crafting_top: (p: Px) => craftingTop(p, [182, 146, 90]),
  crafting_side: (p: Px) => craftingSide(p, [182, 146, 90]),
  chest_front: (p: Px) => chestFront(p),
  chest_side: (p: Px) => chestSide(p),
  furnace_front: (p: Px) => furnaceFront(p),
  furnace_side: (p: Px) => cobble(p, [110, 110, 115], [70, 70, 75]),
  netherrack: (p: Px) => netherrack(p),
  nether_bricks: (p: Px) => bricks(p, [60, 30, 36], [36, 18, 22], 4, 2, 0.08),
  red_nether_bricks: (p: Px) => bricks(p, [110, 30, 34], [60, 16, 20], 4, 2, 0.08),
  glowstone: (p: Px) => glowstone(p),
  obsidian: (p: Px) => obsidian(p),
  crying_obsidian: (p: Px) => obsidian(p, true),
  bedrock: (p: Px) => { p.noise([70, 70, 72], 0.35); },
  magma: (p: Px) => magma(p),
  basalt: (p: Px) => basaltSide(p),
  basalt_top: (p: Px) => { p.noise([80, 80, 85], 0.1); for (let i = 0; i < 4; i++) p.shadeRect(i * 4, 0, 1, 16, 0.7); for (let i = 0; i < 4; i++) p.shadeRect(0, i * 4, 16, 1, 0.7); },
  blackstone: (p: Px) => { stoneLike(p, [45, 42, 48], 0.2); },
  gilded_blackstone: (p: Px) => { stoneLike(p, [45, 42, 48], 0.2); for (let i = 0; i < 5; i++) p.rect(Math.floor(p.rng() * 15), Math.floor(p.rng() * 15), 2, 1, [240, 200, 70]); },
  soul_sand: (p: Px) => soulSand(p),
  nether_wart: (p: Px) => { p.noise([120, 20, 25], 0.15); p.speckle([170, 40, 45], 20); },
  warped_nylium: (p: Px) => { p.noise([30, 120, 110], 0.12); p.speckle([60, 170, 150], 16); },
  quartz: (p: Px) => quartz(p),
  sea_lantern: (p: Px) => { p.noise([40, 44, 56], 0.1); p.rect(3, 3, 10, 10, [90, 170, 190]); p.rect(5, 5, 6, 6, [170, 235, 245]); p.rect(7, 7, 2, 2, [235, 255, 255]); for (let i = 0; i < 16; i += 4) { p.rect(i, 0, 1, 16, [28, 30, 40]); p.rect(0, i, 16, 1, [28, 30, 40]); } },
  gold: (p: Px) => metal(p, [240, 200, 70]),
  iron: (p: Px) => metal(p, [215, 215, 215]),
  hay: (p: Px) => hay(p),
  red_sand: (p: Px) => redSand(p),
  wool_white: (p: Px) => wool(p, [232, 232, 228]),
  wool_red: (p: Px) => wool(p, [170, 45, 40]),
  wool_blue: (p: Px) => wool(p, [50, 70, 160]),
  wool_black: (p: Px) => wool(p, [30, 30, 34]),
  wool_cyan: (p: Px) => wool(p, [30, 130, 140]),
  wool_yellow: (p: Px) => wool(p, [230, 190, 60]),
  painting: (p: Px) => painting(p),
  lantern: (p: Px) => lantern(p),
  torch: (p: Px) => torch(p),
  rail: (p: Px) => rail(p, false),
  rail_powered: (p: Px) => rail(p, true),
  ladder: (p: Px) => ladder(p),
  door_top: (p: Px) => doorTile(p, [182, 146, 90], true),
  door_bottom: (p: Px) => doorTile(p, [182, 146, 90], false),
  tall_grass: (p: Px) => tallGrass(p),
  dandelion: (p: Px) => flower(p, [240, 210, 60], [255, 240, 150]),
  poppy: (p: Px) => flower(p, [210, 40, 40], [30, 30, 30]),
  blue_orchid: (p: Px) => flower(p, [70, 160, 230], [240, 240, 200]),
  iron_bars: (p: Px) => ironBars(p),
  cobweb: (p: Px) => cobweb(p),
  plaster: (p: Px) => { p.noise([236, 230, 220], 0.025); p.speckle([226, 220, 208], 10); },
  dark_oak_planks: (p: Px) => planks(p, [72, 48, 26]),
  slate: (p: Px) => { p.noise([54, 58, 72], 0.1); for (let r = 0; r < 4; r++) { const y0 = r * 4; for (let x = 0; x < 16; x++) p.shade(x, y0 + 3, 0.6); const off = r % 2 ? 2 : 0; for (let x = off; x < 16; x += 4) p.shadeRect(x, y0, 1, 3, 0.75); p.shadeRect(0, y0, 16, 1, 1.12); } },
  spruce_leaves: (p: Px) => leaves(p, [28, 62, 44], [60, 110, 78]),
  shingles: (p: Px) => { p.noise([62, 50, 44], 0.1); for (let r = 0; r < 4; r++) { const y0 = r * 4; for (let x = 0; x < 16; x++) p.shade(x, y0 + 3, 0.55); const off = r % 2 ? 2 : 0; for (let x = off; x < 16; x += 4) p.shadeRect(x, y0, 1, 3, 0.7); p.shadeRect(0, y0, 16, 1, 1.15); } },
  rug: (p: Px) => { p.noise([214, 196, 168], 0.05); p.rect(0, 0, 16, 2, [160, 74, 52]); p.rect(0, 14, 16, 2, [160, 74, 52]); p.rect(0, 0, 2, 16, [160, 74, 52]); p.rect(14, 0, 2, 16, [160, 74, 52]); for (let i = 0; i < 4; i++) { p.set(4 + i, 7 - i, [160, 74, 52]); p.set(4 + i, 8 + i, [160, 74, 52]); p.set(11 - i, 7 - i, [160, 74, 52]); p.set(11 - i, 8 + i, [160, 74, 52]); } },
  fire: (p: Px) => { p.fill([0, 0, 0, 0]); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const cx = Math.abs(x - 7.5) / 7.5, t = y / 16; const w = 1 - t * 0.9; if (cx < w && p.rng() < 0.85) p.set(x, 15 - y, t > 0.55 ? [255, 230, 120] : t > 0.25 ? [255, 160, 50] : [230, 80, 20]); } },
  fern: (p: Px) => { p.fill([0, 0, 0, 0]); p.rect(7, 6, 2, 10, [60, 110, 45]); for (let i = 0; i < 5; i++) { const y = 3 + i * 2; for (let d = 0; d < 6 - i; d++) { p.set(7 - d, y + Math.floor(d / 2), [70 + d * 8, 140 + i * 6, 55]); p.set(8 + d, y + Math.floor(d / 2), [70 + d * 8, 140 + i * 6, 55]); } } },
  white: (p: Px) => p.fill([255, 255, 255]),
  black: (p: Px) => p.fill([12, 12, 14]),
  screen: (p: Px) => { p.fill([20, 24, 34]); p.rect(2, 2, 12, 9, [40, 90, 140]); p.rect(3, 3, 5, 1, [120, 200, 255]); p.rect(3, 5, 8, 1, [200, 220, 240]); p.rect(3, 7, 6, 1, [120, 220, 160]); p.rect(3, 9, 9, 1, [200, 220, 240]); p.rect(6, 13, 4, 2, [60, 60, 70]); },
} as const;

export type TileName = keyof typeof TILES;
export const TILE_NAMES = Object.keys(TILES) as TileName[];
export const TILE_INDEX: Record<TileName, number> = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i])) as any;

export function createTileArray(): THREE.DataArrayTexture {
  const n = TILE_NAMES.length;
  const data = new Uint8Array(TILE * TILE * 4 * n);
  TILE_NAMES.forEach((name, layer) => {
    const px = new Px(mulberry32(1000 + layer * 7919));
    TILES[name](px);
    // flip rows so the drawn image is upright (texture arrays have flipY = false)
    for (let y = 0; y < TILE; y++) {
      const src = (TILE - 1 - y) * TILE * 4;
      data.set(px.data.subarray(src, src + TILE * 4), layer * TILE * TILE * 4 + y * TILE * 4);
    }
  });
  const tex = new THREE.DataArrayTexture(data, TILE, TILE, n);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/** Raw 16x16 RGBA pixels of a tile (row 0 = top). */
export function tilePixels(name: TileName): Uint8ClampedArray {
  const px = new Px(mulberry32(1000 + TILE_INDEX[name] * 7919));
  TILES[name](px);
  return px.data;
}

/** A regular 2D canvas texture for a single tile (used by sprite-like meshes). */
export function createTileTexture(name: TileName, scaleUp = 1): THREE.CanvasTexture {
  const px = new Px(mulberry32(1000 + TILE_INDEX[name] * 7919));
  TILES[name](px);
  const c = document.createElement('canvas');
  c.width = TILE * scaleUp; c.height = TILE * scaleUp;
  const ctx = c.getContext('2d')!;
  const img = new ImageData(px.data, TILE, TILE);
  if (scaleUp === 1) ctx.putImageData(img, 0, 0);
  else {
    const tmp = document.createElement('canvas'); tmp.width = TILE; tmp.height = TILE;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, c.width, c.height);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Draw a tile into a 2D canvas context (for HUD icons etc). */
export function drawTileTo(ctx: CanvasRenderingContext2D, name: TileName, x: number, y: number, size: number) {
  const px = new Px(mulberry32(1000 + TILE_INDEX[name] * 7919));
  TILES[name](px);
  const tmp = document.createElement('canvas'); tmp.width = TILE; tmp.height = TILE;
  tmp.getContext('2d')!.putImageData(new ImageData(px.data, TILE, TILE), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, x, y, size, size);
}
