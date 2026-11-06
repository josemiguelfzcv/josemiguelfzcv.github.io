import * as THREE from 'three';
import { B } from '../engine/blocks';
import { World } from '../engine/world';
import { mulberry32, Noise2D } from '../engine/rng';
import { GeometryBuilder, addBox, addFloorQuad, meshWorld } from '../engine/mesher';
import { TILE_INDEX } from '../engine/textures';

export const NW = {
  SX: 64, SY: 44, SZ: 224,
  RAIL_X: 32,          // rail runs along x = RAIL_X + 0.5
  RAIL_Y: 14,          // top surface of the causeway
  LAVA_Y: 10.0,
  Z_START: 10, Z_END: 206,
  CEIL: 34,
  SIGN_COUNT: 9,
};

export interface Gate { z: number; signX: number; side: 1 | -1 }

export interface NetherBuild {
  world: World;
  terrain: THREE.BufferGeometry | null;
  details: THREE.BufferGeometry | null;
  gates: Gate[];
  glowstones: { x: number; y: number; z: number }[];
  lavaFalls: { x: number; z: number; y0: number; y1: number; side: 1 | -1 }[];
}

const T = TILE_INDEX;

export function generateNether(): NetherBuild {
  const w = new World(NW.SX, NW.SY, NW.SZ);
  w.hasSky = false;
  const rng = mulberry32(777);
  const n1 = new Noise2D(31), n2 = new Noise2D(57), n3 = new Noise2D(91);
  const { SX, SY, SZ, RAIL_X, RAIL_Y, CEIL } = NW;

  const pickRock = () => { const r = rng(); return r < 0.8 ? B.Netherrack : r < 0.9 ? B.Blackstone : r < 0.96 ? B.Basalt : B.NetherWart; };

  // ---- lava floor + bedrock ----
  for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
    w.set(x, 0, z, B.Bedrock);
    for (let y = 1; y <= 7; y++) w.set(x, y, z, B.Netherrack);
  }

  // ---- cavern walls (eroded) ----
  for (let z = 0; z < SZ; z++) for (let y = 0; y < SY; y++) {
    const eroL = n1.fbm(z / 14, y / 9, 3) * 9 - 2;
    const eroR = n2.fbm(z / 14, y / 9, 3) * 9 - 2;
    const left = Math.round(13 + eroL), right = Math.round(SX - 14 - eroR);
    for (let x = 0; x < SX; x++) {
      if (x <= left || x >= right) {
        if (y > 7) w.set(x, y, z, pickRock());
      }
    }
    // ceiling with stalactites
    const c = CEIL - Math.round(Math.max(0, n3.fbm(z / 10, 0.5, 3) - 0.35) * 14);
    for (let x = 0; x < SX; x++) {
      const cc = c - Math.round(Math.max(0, n3.fbm(x / 6, z / 6, 3) - 0.5) * 10);
      if (y >= cc) w.set(x, y, z, y === cc && rng() < 0.08 ? B.Glowstone : pickRock());
    }
  }

  // ---- islands and pillars in the lava ----
  for (let i = 0; i < 70; i++) {
    const x = 6 + Math.floor(rng() * (SX - 12)), z = 6 + Math.floor(rng() * (SZ - 12));
    if (Math.abs(x - RAIL_X) < 5) continue;
    const r = 1 + Math.floor(rng() * 3), h = 8 + Math.floor(rng() * 4);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (dx * dx + dz * dz > r * r + 1) continue;
      for (let y = 8; y <= h; y++) w.set(x + dx, y, z + dz, y === h ? (rng() < 0.3 ? B.Magma : rng() < 0.5 ? B.SoulSand : B.Netherrack) : B.Netherrack);
    }
    if (rng() < 0.5) { const ph = h + 3 + Math.floor(rng() * 10); for (let y = h; y <= ph; y++) w.set(x, y, z, B.Basalt); }
  }

  // ---- the causeway with rails ----
  const gates: Gate[] = [];
  const gateZs: number[] = [];
  for (let i = 0; i < NW.SIGN_COUNT; i++) gateZs.push(34 + i * 18);
  for (let z = NW.Z_START - 2; z <= NW.Z_END + 8; z++) {
    const isGap = ((z % 37) < 3) && z > 40 && z < 190; // occasional broken edges
    for (let x = RAIL_X - 2; x <= RAIL_X + 2; x++) {
      const edge = Math.abs(x - RAIL_X) === 2;
      if (isGap && edge) continue;
      w.set(x, RAIL_Y - 1, z, edge ? B.RedNetherBricks : B.NetherBricks);
      // clear above
      for (let y = RAIL_Y; y < RAIL_Y + 9; y++) w.set(x, y, z, B.Air);
    }
    // supports down into the lava
    if (z % 12 === 0) for (const x of [RAIL_X - 2, RAIL_X + 2]) for (let y = 8; y < RAIL_Y - 1; y++) w.set(x, y, z, B.NetherBricks);
    // runway lights embedded in the causeway edge
    if (z % 12 === 6 && !isGap) for (const x of [RAIL_X - 2, RAIL_X + 2]) w.set(x, RAIL_Y - 1, z, B.Glowstone);
  }
  // gates (fortress arches) where the signs hang
  gateZs.forEach((z, i) => {
    const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
    for (const x of [RAIL_X - 4, RAIL_X + 4]) for (let y = RAIL_Y - 1; y <= RAIL_Y + 9; y++) w.set(x, y, z, B.NetherBricks);
    for (let x = RAIL_X - 4; x <= RAIL_X + 4; x++) { w.set(x, RAIL_Y + 8, z, B.NetherBricks); w.set(x, RAIL_Y + 9, z, B.RedNetherBricks); }
    for (const x of [RAIL_X - 3, RAIL_X + 3]) w.set(x, RAIL_Y + 7, z, B.NetherBricks);
    // small platform at the base of the pillars + cool soul lanterns for contrast
    for (const x of [RAIL_X - 4, RAIL_X - 3, RAIL_X + 3, RAIL_X + 4]) w.set(x, RAIL_Y - 1, z, B.NetherBricks);
    for (const x of [RAIL_X - 3, RAIL_X + 3]) w.set(x, RAIL_Y, z, B.SeaLantern);
    // clear a channel through the gate for the sign to fall into (above the rail)
    gates.push({ z, signX: RAIL_X + 0.5 + side * 1.75, side });
  });

  // ---- end platform ----
  for (let z = NW.Z_END - 4; z <= NW.Z_END + 8; z++) for (let x = RAIL_X - 6; x <= RAIL_X + 6; x++) {
    w.set(x, RAIL_Y - 1, z, (x + z) % 2 ? B.NetherBricks : B.RedNetherBricks);
    for (let y = RAIL_Y; y < RAIL_Y + 10; y++) w.set(x, y, z, B.Air);
  }
  // exit portal frame facing the rider at the end
  const pz = NW.Z_END + 7;
  for (let x = RAIL_X - 1; x <= RAIL_X + 2; x++) for (let y = RAIL_Y; y <= RAIL_Y + 4; y++) {
    const frame = x === RAIL_X - 1 || x === RAIL_X + 2 || y === RAIL_Y || y === RAIL_Y + 4;
    w.set(x, y, pz, frame ? B.Obsidian : B.Air);
  }
  for (const x of [RAIL_X - 6, RAIL_X + 6]) for (const z of [NW.Z_END - 2, NW.Z_END + 4]) { w.set(x, RAIL_Y, z, B.NetherBricks); w.set(x, RAIL_Y + 1, z, B.NetherBricks); w.set(x, RAIL_Y + 2, z, B.Glowstone); }
  // crying obsidian accents on the exit frame
  w.set(RAIL_X - 1, RAIL_Y + 2, pz, B.CryingObsidian); w.set(RAIL_X + 2, RAIL_Y + 2, pz, B.CryingObsidian);

  // ---- lights ----
  // lava emits light: sample the open lava surface
  for (let z = 0; z < SZ; z += 2) for (let x = 0; x < SX; x += 2) {
    if (w.get(x, 8, z) === B.Netherrack && w.get(x, 9, z) === B.Air && w.get(x, 10, z) === B.Air) w.addEmitter(x, 10, z, 13, 5, 1);
  }
  const glowstones: { x: number; y: number; z: number }[] = [];
  for (let z = 0; z < SZ; z++) for (let y = 0; y < SY; y++) for (let x = 0; x < SX; x++) if (w.get(x, y, z) === B.Glowstone) glowstones.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
  w.computeLight();

  // ---- meshes ----
  const m = meshWorld(w);
  const det = new GeometryBuilder();
  for (let z = NW.Z_START - 2; z <= NW.Z_END + 4; z++) addFloorQuad(det, RAIL_X, RAIL_Y + 0.02, z, z % 9 === 0 ? T.rail_powered : T.rail, w, 1);
  // lava falls from the walls
  const lavaFalls: NetherBuild['lavaFalls'] = [];
  for (let i = 0; i < 6; i++) {
    const z = 20 + Math.floor(rng() * (SZ - 40));
    const side: 1 | -1 = rng() < 0.5 ? 1 : -1;
    const x = side === 1 ? 12 : SX - 13;
    lavaFalls.push({ x: x + 0.5, z: z + 0.5, y0: 11, y1: 22 + Math.floor(rng() * 8), side });
  }
  void addBox;
  return { world: w, terrain: m.opaque, details: det.empty ? null : det.build(), gates, glowstones, lavaFalls };
}
