import * as THREE from 'three';

/** Scroll progress ranges for each chapter (0..1). */
export const SEG = {
  SPAWN: [0.0, 0.1],
  APPROACH: [0.1, 0.245],
  DOOR: [0.205, 0.245],
  HOUSE: [0.27, 0.52],
  BEAT1: [0.29, 0.37],   // map of DR
  BEAT2: [0.37, 0.445],  // bookshelf
  BEAT3: [0.445, 0.52],  // desk
  SHAFT: [0.52, 0.585],
  DUNGEON: [0.585, 0.665],
  PORTAL: [0.655, 0.685],
  NETHER: [0.68, 0.965],
  END: [0.955, 1.0],
} as const;

export const CHAPTERS = [
  { id: 'spawn', at: 0.0, key: 'chapterSpawn', icon: 'grass_top', ready: true },
  { id: 'house', at: 0.26, key: 'chapterHouse', icon: 'door_top', ready: true },
  { id: 'mine', at: 0.70, key: 'chapterMine', icon: 'rail', ready: true },
  { id: 'workshop', at: 0.97, key: 'chapterWorkshop', icon: 'crafting_top', ready: false },
  { id: 'library', at: 0.97, key: 'chapterLibrary', icon: 'bookshelf', ready: false },
  { id: 'enchant', at: 0.97, key: 'chapterEnchant', icon: 'crying_obsidian', ready: false },
  { id: 'portal', at: 0.97, key: 'chapterPortal', icon: 'obsidian', ready: false },
] as const;

export interface Key { at: number; pos: [number, number, number]; look: [number, number, number]; fov?: number }

/** Overworld camera path (first person). Positions are world units; eye height ≈ 1.6 above the floor. */
export const OVERWORLD_KEYS: Key[] = [
  { at: 0.00, pos: [64.5, 17.7, 98.5], look: [64.5, 25.5, 50], fov: 68 },
  { at: 0.10, pos: [64.5, 17.7, 95.0], look: [64.5, 23.0, 50], fov: 68 },
  { at: 0.17, pos: [64.6, 17.65, 78.0], look: [65.0, 19.0, 52], fov: 70 },
  { at: 0.22, pos: [64.9, 17.6, 62.0], look: [65.0, 18.0, 52], fov: 70 },
  { at: 0.245, pos: [65.0, 17.6, 57.4], look: [65.0, 17.6, 50], fov: 70 },
  { at: 0.27, pos: [65.0, 17.6, 53.4], look: [66.5, 18.4, 46.0], fov: 74 },
  { at: 0.31, pos: [66.0, 17.6, 50.6], look: [72.5, 19.8, 47.4], fov: 70 },
  { at: 0.36, pos: [67.3, 17.6, 49.6], look: [72.5, 19.9, 47.5], fov: 64 },
  { at: 0.39, pos: [65.0, 17.6, 48.6], look: [56.0, 18.6, 47.0], fov: 70 },
  { at: 0.43, pos: [61.5, 17.6, 48.2], look: [55.8, 18.3, 46.5], fov: 66 },
  { at: 0.46, pos: [62.6, 17.6, 46.2], look: [63.6, 17.9, 41.6], fov: 70 },
  { at: 0.50, pos: [63.4, 17.6, 44.4], look: [63.5, 17.4, 41.8], fov: 64 },
  { at: 0.53, pos: [66.0, 17.6, 43.8], look: [71.5, 16.4, 43.5], fov: 72 },
  { at: 0.555, pos: [69.4, 17.3, 43.5], look: [74.0, 13.8, 43.5], fov: 76 },
  { at: 0.585, pos: [78.2, 9.0, 43.5], look: [84.0, 8.6, 43.5], fov: 72 },
  { at: 0.60, pos: [81.0, 8.6, 43.5], look: [90.0, 8.6, 43.5], fov: 70 },
  { at: 0.64, pos: [90.0, 8.6, 43.5], look: [99.5, 9.3, 43.5], fov: 70 },
  { at: 0.665, pos: [97.6, 9.1, 43.5], look: [101.0, 9.3, 43.5], fov: 74 },
  { at: 0.685, pos: [99.8, 9.3, 43.5], look: [103.0, 9.3, 43.5], fov: 80 },
];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();

/** Non-uniform Catmull-Rom (cubic Hermite with finite-difference tangents) across keys. */
export function sampleKeys(keys: Key[], p: number, outPos: THREE.Vector3, outLook: THREE.Vector3): number {
  if (p <= keys[0].at) { outPos.fromArray(keys[0].pos); outLook.fromArray(keys[0].look); return keys[0].fov ?? 70; }
  const last = keys[keys.length - 1];
  if (p >= last.at) { outPos.fromArray(last.pos); outLook.fromArray(last.look); return last.fov ?? 70; }
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].at <= p) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(keys.length - 1, i + 2)];
  const t = (p - k1.at) / (k2.at - k1.at);
  hermite(k0, k1, k2, k3, t, 'pos', outPos);
  hermite(k0, k1, k2, k3, t, 'look', outLook);
  const s = t * t * (3 - 2 * t);
  return THREE.MathUtils.lerp(k1.fov ?? 70, k2.fov ?? 70, s);
}

function hermite(k0: Key, k1: Key, k2: Key, k3: Key, t: number, f: 'pos' | 'look', out: THREE.Vector3) {
  _a.fromArray(k0[f]); _b.fromArray(k1[f]); _c.fromArray(k2[f]); _d.fromArray(k3[f]);
  const dt = k2.at - k1.at;
  // tangents scaled to this segment's parameter length (finite differences over progress)
  const m1 = k0 === k1 ? _c.clone().sub(_b) : _c.clone().sub(_a).multiplyScalar(dt / (k2.at - k0.at));
  const m2 = k3 === k2 ? _c.clone().sub(_b) : _d.clone().sub(_b).multiplyScalar(dt / (k3.at - k1.at));
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  out.set(
    h00 * _b.x + h10 * m1.x + h01 * _c.x + h11 * m2.x,
    h00 * _b.y + h10 * m1.y + h01 * _c.y + h11 * m2.y,
    h00 * _b.z + h10 * m1.z + h01 * _c.z + h11 * m2.z,
  );
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0..1 inside [a,b] */
export const range = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
