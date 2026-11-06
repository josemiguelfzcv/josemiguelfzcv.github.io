import * as THREE from 'three';
import { B } from '../engine/blocks';
import { World } from '../engine/world';
import { mulberry32, Noise2D, Rng } from '../engine/rng';
import { GeometryBuilder, addBox, addCross, addWallQuad, meshWorld } from '../engine/mesher';
import { TILE_INDEX } from '../engine/textures';
import { LODGE, Lamp, buildLodge, furnishLodge, lodgeLamps, lampLight, buildLampDetails } from './house';

export const OW = {
  SX: 128, SY: 48, SZ: 128,
  WATER_Y: 13.0,       // water surface height
  GROUND: 15,          // boardwalk / floor level (block y); the lawn around the lodge is one lower
  HOUSE: { x0: LODGE.x0, x1: LODGE.x1, z0: LODGE.z0, z1: LODGE.z1, floorY: LODGE.floorY },
  DOOR: LODGE.door,
  DUNGEON: { y: 6, z: 43, x0: 79, x1: 100 },
  PORTAL: { x: 99, z0: 42, z1: 43, y0: 8, y1: 10 },
  BRIDGE: { x: 64, z0: 59, z1: 104 },
};

export interface OverworldBuild {
  world: World;
  terrain: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
  details: THREE.BufferGeometry | null;
  foliage: THREE.BufferGeometry | null;
  torches: Torch[];
  lamps: Lamp[];
  lanterns: { x: number; y: number; z: number }[];
}

const T = TILE_INDEX;

export function generateOverworld(): OverworldBuild {
  const w = new World(OW.SX, OW.SY, OW.SZ);
  const rng = mulberry32(20260428);
  const noise = new Noise2D(7);
  const noise2 = new Noise2D(99);
  const H = OW.HOUSE;

  // ---------- terrain ----------
  const height = new Int16Array(OW.SX * OW.SZ);
  for (let z = 0; z < OW.SZ; z++) for (let x = 0; x < OW.SX; x++) {
    let h = 15 + (noise.fbm(x / 28, z / 28, 4) - 0.5) * 10;
    // backdrop hills to the north and the far sides
    const north = Math.max(0, (34 - z) / 34);
    h += north * north * 12 + noise2.fbm(x / 12, z / 12, 3) * north * 8;
    const edge = Math.max(0, (x - 108) / 20, (20 - x) / 20);
    h += edge * edge * 8;
    // flat lawn for the lodge (one below the boardwalk level so the deck reads as raised)
    const dx = x - 64, dz = z - 47;
    const plateau = 1 - THREE.MathUtils.smoothstep(Math.hypot(dx * 0.85, dz), 14, 23);
    h = h * (1 - plateau) + (OW.GROUND - 1) * plateau;
    // lake basin: an organic blob south of the house
    const lx = (x - 64) / 30, lz = (z - 80) / 17;
    const lake = 1 - THREE.MathUtils.smoothstep(Math.hypot(lx, lz) + (noise2.fbm(x / 10, z / 10, 2) - 0.5) * 0.5, 0.55, 1.05);
    h = h * (1 - lake) + 9.5 * lake;
    // spawn shore flat spot
    const sdx = x - 64, sdz = z - 103;
    const spawn = 1 - THREE.MathUtils.smoothstep(Math.hypot(sdx * 0.7, sdz), 5, 11);
    h = h * (1 - spawn) + 15 * spawn;
    // island coastline: sink the terrain under the water near the (rounded) edges of the map
    const r = Math.hypot((x - 64) / 72, (z - 80) / 92) + (noise.fbm(x / 16 + 9, z / 16 + 9, 3) - 0.5) * 0.3;
    const coast = THREE.MathUtils.smoothstep(r, 0.8, 1.02);
    h = h * (1 - coast) + 8 * coast;
    height[z * OW.SX + x] = Math.max(2, Math.min(OW.SY - 10, Math.round(h)));
  }

  for (let z = 0; z < OW.SZ; z++) for (let x = 0; x < OW.SX; x++) {
    const h = height[z * OW.SX + x];
    w.set(x, 0, z, B.Bedrock);
    for (let y = 1; y <= h; y++) {
      let id = B.Stone;
      if (y === h) id = h <= OW.WATER_Y - 0.5 ? (rng() < 0.8 ? B.Sand : B.Gravel) : B.Grass;
      else if (y >= h - 3) id = h <= OW.WATER_Y - 0.5 ? B.Sand : B.Dirt;
      w.set(x, y, z, id);
    }
  }

  // ---------- trees ----------
  const trees: [number, number][] = [];
  const canPlaceTree = (x: number, z: number) => {
    if (x < 3 || z < 3 || x > OW.SX - 4 || z > OW.SZ - 4) return false;
    const h = height[z * OW.SX + x];
    if (w.get(x, h, z) !== B.Grass) return false;
    if (x > H.x0 - 6 && x < H.x1 + 6 && z > H.z0 - 7 && z < H.z1 + 7) return false;   // around the lodge
    if (Math.abs(x - 64) < 7 && z > 50 && z < 112) return false;                         // view corridor + bridge
    for (const [tx, tz] of trees) if (Math.hypot(tx - x, tz - z) < 5) return false;
    return true;
  };
  let attempts = 0;
  while (trees.length < 150 && attempts++ < 6000) {
    const x = Math.floor(rng() * OW.SX), z = Math.floor(rng() * OW.SZ);
    // denser on the sides to frame the view, sparse near the lake shore
    const side = Math.abs(x - 64) > 22 || z < 40;
    if (!side && rng() < 0.75) continue;
    if (canPlaceTree(x, z)) { trees.push([x, z]); placeOak(w, x, height[z * OW.SX + x] + 1, z, rng); }
  }
  // two hero trees framing the spawn shot
  for (const [x, z] of [[50, 96], [79, 94], [44, 70], [86, 68]] as [number, number][]) {
    if (canPlaceTree(x, z)) { trees.push([x, z]); placeOak(w, x, height[z * OW.SX + x] + 1, z, rng, true); }
  }

  // ---------- the lodge ----------
  buildLodge(w, rng);

  // ---------- boardwalk from the deck across the lake ----------
  const bx = OW.BRIDGE.x;
  const bridgeZs: number[] = [];
  for (let z = OW.BRIDGE.z0; z <= OW.BRIDGE.z1; z++) {
    const hc = height[z * OW.SX + bx];
    if (hc >= OW.GROUND) continue; // reached the far shore
    for (let x = bx - 1; x <= bx + 1; x++) {
      const h = height[z * OW.SX + x];
      w.set(x, OW.GROUND, z, B.OakPlanks);
      for (let y = h + 1; y < OW.GROUND; y++) w.set(x, y, z, B.Air);
    }
    bridgeZs.push(z);
    // support posts
    if (bridgeZs.length % 4 === 1) {
      for (const x of [bx - 2, bx + 2]) {
        const h = height[z * OW.SX + x];
        for (let y = Math.max(h, 9); y <= OW.GROUND; y++) w.set(x, y, z, B.OakLog);
      }
    }
  }

  // ---------- dungeon ----------
  buildDungeon(w, rng);

  // ---------- title letters (big voxel text above the house) ----------
  // (built separately as its own small world so it can be scaled)

  // ---------- light ----------
  const torches = dungeonTorches();
  for (const t of torches) w.addEmitter(t.x, t.y, t.z, 14, 10, 5);
  const lamps = lodgeLamps();
  for (const l of lamps) { const c = lampLight(l); w.addEmitter(l.x, Math.floor(l.y), l.z, c[0], c[1], c[2]); }
  const lanterns: { x: number; y: number; z: number }[] = [];
  bridgeZs.forEach((z, i) => {
    if (i % 8 !== 0) return;
    for (const x of [bx - 2, bx + 2]) { lanterns.push({ x, y: OW.GROUND + 2, z }); w.addEmitter(x, OW.GROUND + 2, z, 14, 11, 6); }
  });
  // computer screen glow
  w.addEmitter(63, H.floorY + 1, H.z0 + 1, 2, 3, 5);
  // portal glow
  for (let y = OW.PORTAL.y0; y <= OW.PORTAL.y1; y++) for (let z = OW.PORTAL.z0; z <= OW.PORTAL.z1; z++) w.addEmitter(OW.PORTAL.x, y, z, 9, 4, 14);
  // screen glow in the house is a block (Screen)
  w.computeLight();

  // ---------- meshes ----------
  const meshes = meshWorld(w, { swayLeaves: true });

  // details: torches, fences, furniture, ladder, rails
  const det = new GeometryBuilder();
  for (const t of torches) {
    const [ox, oz] = torchOffset(t.attach);
    const y0 = t.attach === 'floor' ? t.y : t.y + 0.2;
    addBox(det, [t.x + ox, y0, t.z + oz], [t.x + ox + 2 / 16, y0 + 10 / 16, t.z + oz + 2 / 16], null, { tiles: T.torch, light: [1, 0.8, 0.45, 1], shadeFaces: false });
  }
  for (const l of lanterns) {
    // post + hanging lantern sprite
    addBox(det, [l.x + 6 / 16, OW.GROUND + 1, l.z + 6 / 16], [l.x + 10 / 16, OW.GROUND + 3, l.z + 10 / 16], w, { tiles: T.oak_planks });
    addBox(det, [l.x + 2 / 16, OW.GROUND + 2.7, l.z + 6 / 16], [l.x + 6 / 16, OW.GROUND + 2.85, l.z + 10 / 16], w, { tiles: T.oak_planks });
    addCross(det, l.x + 4 / 16, OW.GROUND + 1.9, l.z + 0.5, T.lantern, null, 0.8, 0, [1, 0.85, 0.5, 1]);
  }
  // bridge fence rails between posts
  for (const z of bridgeZs) {
    for (const x of [bx - 2, bx + 2]) {
      addBox(det, [x + 6 / 16, OW.GROUND + 1.3, z], [x + 10 / 16, OW.GROUND + 1.5, z + 1], w, { tiles: T.oak_planks });
      addBox(det, [x + 6 / 16, OW.GROUND + 0.6, z], [x + 10 / 16, OW.GROUND + 0.8, z + 1], w, { tiles: T.oak_planks });
    }
  }
  furnishLodge(det, w);
  buildLampDetails(det, w, lamps);
  furnishDungeon(det, w);

  // foliage: tall grass + flowers (cross sprites) on open grass
  const fol = new GeometryBuilder();
  for (let z = 2; z < OW.SZ - 2; z++) for (let x = 2; x < OW.SX - 2; x++) {
    const h = height[z * OW.SX + x];
    if (w.get(x, h, z) !== B.Grass || w.get(x, h + 1, z) !== B.Air) continue;
    const r = rng();
    const nearHouse = x > H.x0 - 3 && x < H.x1 + 3 && z > H.z0 - 3 && z < H.z1 + 5;
    if (nearHouse) continue;
    const density = noise2.fbm(x / 9, z / 9, 2);
    if (r < density * 0.55) {
      const fr = rng();
      const tile = fr < 0.84 ? T.tall_grass : fr < 0.92 ? T.dandelion : fr < 0.97 ? T.poppy : T.blue_orchid;
      addCross(fol, x + 0.5 + (rng() - 0.5) * 0.4, h + 1, z + 0.5 + (rng() - 0.5) * 0.4, tile, w, 0.9 + rng() * 0.3, 1);
    }
  }

  return {
    world: w,
    terrain: meshes.opaque, glass: meshes.transparent,
    details: det.empty ? null : det.build(),
    foliage: fol.empty ? null : fol.build(),
    torches, lamps, lanterns,
  };
}

/* ---------------- trees ---------------- */
function placeOak(w: World, x: number, y: number, z: number, rng: Rng, big = false) {
  const trunk = (big ? 6 : 4) + Math.floor(rng() * 2);
  for (let i = 0; i < trunk; i++) w.set(x, y + i, z, B.OakLog);
  const top = y + trunk - 1;
  const R = big ? 3 : 2;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy <= -1 ? R : dy === 0 ? R - 1 : 1;
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) === r && Math.abs(dz) === r && (dy > -2 || rng() < 0.6)) continue;
      if (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
      const px = x + dx, py = top + dy, pz = z + dz;
      if (w.get(px, py, pz) === B.Air) w.set(px, py, pz, B.OakLeaves);
    }
  }
  w.set(x, top + 1, z, B.OakLeaves);
  if (big) w.set(x, top + 2, z, B.OakLeaves);
}

export type Attach = 'n' | 's' | 'w' | 'e' | 'floor';
export interface Torch { x: number; y: number; z: number; attach: Attach }

function dungeonTorches(): Torch[] {
  const out: Torch[] = [];
  // along the staircase tunnel
  for (const i of [4, 7]) out.push({ x: LODGE.stairs.x0 + i, y: LODGE.floorY - 1 - i + 2, z: LODGE.stairs.z0, attach: 'n' });
  for (let x = OW.DUNGEON.x0 + 4; x < OW.DUNGEON.x1 - 6; x += 7) {
    const left = x % 2 === 1;
    out.push({ x, y: OW.DUNGEON.y + 2, z: OW.DUNGEON.z + (left ? -1 : 1), attach: left ? 'n' : 's' });
  }
  out.push({ x: OW.PORTAL.x - 3, y: OW.DUNGEON.y + 2, z: OW.DUNGEON.z - 3, attach: 'n' }, { x: OW.PORTAL.x - 3, y: OW.DUNGEON.y + 2, z: OW.DUNGEON.z + 3, attach: 's' });
  return out;
}

/** Torch box position inside its cell depending on which wall it hangs on. */
export function torchOffset(a: Attach): [number, number] {
  switch (a) {
    case 'n': return [7 / 16, 1 / 16];
    case 's': return [7 / 16, 13 / 16];
    case 'w': return [1 / 16, 7 / 16];
    case 'e': return [13 / 16, 7 / 16];
    default: return [7 / 16, 7 / 16];
  }
}

/* ---------------- dungeon ---------------- */
function buildDungeon(w: World, rng: Rng) {
  const D = OW.DUNGEON;
  const pick = () => { const r = rng(); return r < 0.6 ? B.StoneBricks : r < 0.8 ? B.MossyStoneBricks : r < 0.9 ? B.CrackedStoneBricks : B.Cobble; };
  // corridor: 3 wide (z-1..z+1), 3 tall (y+1..y+3), from the shaft eastward
  for (let x = D.x0 - 1; x <= D.x1; x++) {
    for (let z = D.z - 2; z <= D.z + 2; z++) for (let y = D.y; y <= D.y + 4; y++) {
      const edge = z === D.z - 2 || z === D.z + 2 || y === D.y || y === D.y + 4;
      w.set(x, y, z, edge ? pick() : B.Air);
    }
  }
  // portal room: 7x7 at the end
  const P = OW.PORTAL;
  for (let x = P.x - 6; x <= P.x + 1; x++) for (let z = D.z - 4; z <= D.z + 4; z++) for (let y = D.y; y <= D.y + 6; y++) {
    const edge = x === P.x - 6 || x === P.x + 1 || z === D.z - 4 || z === D.z + 4 || y === D.y || y === D.y + 6;
    w.set(x, y, z, edge ? pick() : B.Air);
  }
  // doorway from the corridor into the room
  w.fill(P.x - 6, D.y + 1, D.z - 1, P.x - 6, D.y + 3, D.z + 1, B.Air);
  // obsidian frame in the plane x = P.x, z from z0-1..z1+1, y from y0-1..y1+1
  for (let z = P.z0 - 1; z <= P.z1 + 1; z++) for (let y = P.y0 - 1; y <= P.y1 + 1; y++) {
    const frame = z === P.z0 - 1 || z === P.z1 + 1 || y === P.y0 - 1 || y === P.y1 + 1;
    w.set(P.x, y, z, frame ? ((z + y) % 5 === 0 ? B.CryingObsidian : B.Obsidian) : B.Air);
  }
  // decorations: iron bars window, cobwebs are added as details; a chest
  w.set(D.x0 + 10, D.y + 1, D.z + 1, B.Chest);
  w.set(D.x0 + 22, D.y + 1, D.z - 1, B.MossyCobble);
}

/* ---------------- dungeon details ---------------- */
function furnishDungeon(det: GeometryBuilder, w: World) {
  const D = OW.DUNGEON;
  for (let x = D.x0 + 6; x < D.x1 - 6; x += 9) addCross(det, x + 0.5, D.y + 3, D.z - 1 + 0.5, T.cobweb, w, 1, 0);
  for (let x = D.x0 + 8; x < D.x1 - 8; x += 12) addWallQuad(det, x, D.y + 2, D.z + 1, 'n', T.iron_bars, w, 0.03);
}

/* ---------------- voxel title ---------------- */
const GLYPHS: Record<string, string[]> = {
  J: ['11111', '00100', '00100', '00100', '00100', '10100', '01000'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  "'": ['00100', '00100', '01000', '00000', '00000', '00000', '00000'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/** Builds "JOSE'S / WORLD" as voxel letters in its own little world. Returns geometry centred at x=0. */
export function buildTitleGeometry(lines: string[], block = B.Quartz): { geo: THREE.BufferGeometry; width: number; height: number } {
  const maxLen = Math.max(...lines.map(l => l.length));
  const width = maxLen * 6 - 1, height = lines.length * 9 - 2;
  const tw = new World(width + 2, height + 2, 3);
  lines.forEach((line, li) => {
    const lineW = line.length * 6 - 1;
    const ox = Math.floor((width - lineW) / 2) + 1;
    const oy = height - li * 9 - 7 + 1; // top line first
    [...line].forEach((ch, ci) => {
      const g = GLYPHS[ch.toUpperCase()] ?? GLYPHS[' '];
      for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
        if (g[r][c] === '1') tw.set(ox + ci * 6 + c, oy + (6 - r), 1, block);
      }
    });
  });
  tw.computeLight();
  const m = meshWorld(tw);
  const geo = m.opaque!;
  geo.translate(-(width + 2) / 2, 0, -1.5);
  return { geo, width, height };
}
