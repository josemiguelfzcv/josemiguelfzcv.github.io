/**
 * The lodge: a spacious, double-height cabin with a glass wall facing the lake,
 * a stone fireplace, a library wall, a long desk under the north windows,
 * and a stone staircase down to the dungeon. Built from voxels + detail boxes.
 */
import { B } from '../engine/blocks';
import { World } from '../engine/world';
import { Rng } from '../engine/rng';
import { GeometryBuilder, addBox, addCross, addWallQuad, addFloorRect } from '../engine/mesher';
import { TILE_INDEX } from '../engine/textures';

export const LODGE = {
  x0: 55, x1: 73, z0: 41, z1: 55, floorY: 16,   // walls on x0/x1/z0/z1; interior x0+1..x1-1, z0+1..z1-1
  wallTop: 21,                                   // walls span floorY..wallTop (6 tall)
  door: { x: 64, z: 55 },
  deck: { z0: 56, z1: 58 },
  stairs: { x0: 70, z0: 42, z1: 44, steps: 9 },  // step i at x0+i has its top at floorY-1-i
  fireplace: { x: 72, z0: 46, z1: 48 },
};

const T = TILE_INDEX;
export type Attach = 'n' | 's' | 'w' | 'e' | 'floor';
export interface Lamp { x: number; y: number; z: number; kind: 'sconce' | 'pendant' | 'floor' | 'desk' | 'fire'; attach?: Attach }

const roofY = (z: number) => LODGE.wallTop + 1 + (4 - Math.floor(Math.abs(z - 48) / 2)); // shingles height per row

export function buildLodge(w: World, rng: Rng) {
  const { x0, x1, z0, z1, floorY, wallTop } = LODGE;
  const S = LODGE.stairs;
  // ---- clear the volume (and the deck) ----
  w.fill(x0 - 2, floorY - 1, z0 - 3, x1 + 2, floorY + 16, LODGE.deck.z1 + 1, B.Air);
  // ---- plinth + floor ----
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    w.set(x, floorY - 1, z, edge ? B.StoneBricks : B.OakPlanks);
  }
  w.fill(x0 - 1, floorY - 2, z0 - 1, x1 + 1, floorY - 2, z1 + 1, B.StoneBricks);
  // deck
  w.fill(x0 + 1, floorY - 1, LODGE.deck.z0, x1 - 1, floorY - 1, LODGE.deck.z1, B.OakPlanks);
  w.fill(x0 + 1, floorY - 2, LODGE.deck.z0, x1 - 1, floorY - 2, LODGE.deck.z1, B.StoneBricks);

  // ---- walls ----
  for (let y = floorY; y <= wallTop; y++) {
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || z === z0 || z === z1;
      if (!edge) continue;
      const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
      w.set(x, y, z, corner ? B.SpruceLog : B.SprucePlanks);
    }
  }
  const glass = (x: number, y: number, z: number) => w.set(x, y, z, B.Glass);
  // south: glass wall with posts and a double door
  for (let x = x0 + 1; x <= x1 - 1; x++) {
    const post = x === 59 || x === 63 || x === 66 || x === 70;
    for (let y = floorY; y <= wallTop; y++) {
      if (post) { w.set(x, y, z1, B.SpruceLog); continue; }
      if ((x === LODGE.door.x || x === LODGE.door.x + 1) && y <= floorY + 1) { w.set(x, y, z1, B.Air); continue; }
      glass(x, y, z1);
    }
  }
  // north: four wide windows between posts
  for (let x = x0 + 2; x <= x1 - 2; x++) {
    if (x === 60 || x === 64 || x === 68) continue;
    for (let y = floorY + 1; y <= floorY + 3; y++) glass(x, y, z0);
  }
  // east: windows beside the fireplace
  for (const z of [42, 43, 44, 50, 51, 52, 53]) for (let y = floorY + 1; y <= floorY + 3; y++) glass(x1, y, z);
  // west: a high strip window above the library
  for (let z = z0 + 2; z <= z1 - 2; z++) if (z !== 47 && z !== 48) glass(x0, floorY + 5, z);

  // ---- roof: shingles over a plank ceiling, ridge along x, 1:2 pitch, 2-block overhang ----
  for (let z = z0 - 2; z <= LODGE.deck.z1 - 1; z++) {
    const y = roofY(z);
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      w.set(x, y, z, B.Shingles);
      w.set(x, y - 1, z, B.SprucePlanks);
    }
    // gable fill
    if (z >= z0 && z <= z1) for (const gx of [x0, x1]) for (let yy = wallTop + 1; yy < y - 1; yy++) w.set(gx, yy, z, B.SprucePlanks);
  }
  // gable windows
  for (const gx of [x0, x1]) for (const z of [47, 48]) for (const y of [wallTop + 1, wallTop + 2]) w.set(gx, y, z, B.Glass);
  // porch columns under the front overhang
  for (const px of [x0 + 2, x1 - 2]) for (let y = floorY; y <= roofY(LODGE.deck.z1 - 1) - 2; y++) w.set(px, y, LODGE.deck.z1 - 1, B.SpruceLog);

  // ---- fireplace + chimney ----
  const F = LODGE.fireplace;
  for (let z = F.z0; z <= F.z1; z++) for (let y = floorY; y <= wallTop; y++) w.set(F.x, y, z, B.StoneBricks);
  w.set(F.x, floorY, 47, B.Air); w.set(F.x, floorY + 1, 47, B.Air);   // firebox
  for (let y = wallTop + 1; y <= roofY(47) + 3; y++) w.set(F.x, y, 47, B.StoneBricks);
  w.set(F.x, roofY(47) + 4, 47, B.Cobble);

  // ---- library wall (bookshelf blocks) ----
  for (let z = 43; z <= 51; z++) for (let y = floorY; y <= floorY + 3; y++) w.set(x0 + 1, y, z, B.Bookshelf);

  // ---- staircase down to the dungeon (through the east wall) ----
  const stone = (x: number, y: number, z: number) => { if (x > x1 || y < floorY - 1) w.set(x, y, z, rng() < 0.15 ? B.MossyStoneBricks : B.StoneBricks); };
  for (let i = 0; i < S.steps; i++) {
    const x = S.x0 + i, top = floorY - 2 - i;  // block y of the step
    for (let z = S.z0; z <= S.z1; z++) {
      w.set(x, top, z, i % 3 === 0 ? B.MossyStoneBricks : B.StoneBricks);
      for (let y = top + 1; y <= top + 4; y++) w.set(x, y, z, B.Air);
      stone(x, top - 1, z);
      if (x >= x1) stone(x, top + 5, z);
    }
    if (x >= x1) for (let y = top - 1; y <= top + 5; y++) { stone(x, y, S.z0 - 1); stone(x, y, S.z1 + 1); }
  }
}

/** Interior and exterior details (non-cubic). */
export function furnishLodge(det: GeometryBuilder, w: World) {
  const { x0, x1, z0, z1, floorY } = LODGE;
  const F = LODGE.fireplace;
  const dark = T.dark_oak_planks, oak = T.oak_planks, cream = T.wool_white, teal = T.wool_cyan;

  // ---- plaster on the inside faces of the solid walls ----
  for (let y = floorY; y <= LODGE.wallTop; y++) {
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      if (w.get(x0, y, z) === B.SprucePlanks || w.get(x0, y, z) === B.SpruceLog) if (w.get(x0 + 1, y, z) === B.Air) addWallQuad(det, x0 + 1, y, z, 'e', T.plaster, w, 0.02, 1, 1, undefined, true);
      if ((w.get(x1, y, z) === B.SprucePlanks || w.get(x1, y, z) === B.SpruceLog) && w.get(x1 - 1, y, z) === B.Air) addWallQuad(det, x1 - 1, y, z, 'w', T.plaster, w, 0.02, 1, 1, undefined, true);
    }
    for (let x = x0 + 1; x <= x1 - 1; x++) {
      if ((w.get(x, y, z0) === B.SprucePlanks || w.get(x, y, z0) === B.SpruceLog) && w.get(x, y, z0 + 1) === B.Air) addWallQuad(det, x, y, z0 + 1, 's', T.plaster, w, 0.02, 1, 1, undefined, true);
    }
  }
  // dark baseboards along the plastered walls
  addBox(det, [x0 + 1, floorY, z0 + 1], [x0 + 1 + 1 / 16, floorY + 3 / 16, z1], w, { tiles: dark });
  addBox(det, [x1 - 1 / 16, floorY, z0 + 1], [x1, floorY + 3 / 16, F.z0], w, { tiles: dark });
  addBox(det, [x1 - 1 / 16, floorY, F.z1 + 1], [x1, floorY + 3 / 16, z1], w, { tiles: dark });
  addBox(det, [x0 + 1, floorY, z0 + 1], [x1, floorY + 3 / 16, z0 + 1 + 1 / 16], w, { tiles: dark });

  // ---- beams ----
  const beam = (xa: number, xb: number, y: number, z: number) => addBox(det, [xa, y, z + 0.2], [xb, y + 0.7, z + 0.8], w, { tiles: [T.spruce_log, T.spruce_log, T.spruce_log, T.spruce_log, T.spruce_log_top, T.spruce_log_top] });
  for (const z of [44, 48, 52]) beam(x0 + 1, x1, LODGE.wallTop + 1, z);
  beam(x0 + 1, x1, roofY(48) - 2, 48); // ridge beam

  // ---- lounge: rug, L-sofa, coffee table, floor lamp ----
  addFloorRect(det, 65.6, floorY + 0.015, 44.6, 71.4, 51.0, T.rug, w);
  // sofa A: along the west side of the lounge, facing the fireplace (east)
  addBox(det, [66.1, floorY + 0.15, 45.2], [67.9, floorY + 0.55, 50.3], w, { tiles: cream });   // seat
  addBox(det, [66.1, floorY + 0.55, 45.2], [66.5, floorY + 1.15, 50.3], w, { tiles: cream });   // backrest
  addBox(det, [66.1, floorY + 0.55, 45.2], [67.9, floorY + 0.9, 45.55], w, { tiles: cream });   // armrest
  addBox(det, [66.1, floorY + 0.55, 49.95], [67.9, floorY + 0.9, 50.3], w, { tiles: cream });
  for (const z of [46.2, 48.2]) addBox(det, [66.5, floorY + 0.55, z], [67.4, floorY + 0.95, z + 1.2], w, { tiles: teal });  // cushions
  for (const [lx, lz] of [[66.2, 45.3], [67.6, 45.3], [66.2, 50.0], [67.6, 50.0]]) addBox(det, [lx, floorY, lz], [lx + 0.15, floorY + 0.15, lz + 0.15], w, { tiles: dark });
  // sofa B: along the south side, facing north
  addBox(det, [68.2, floorY + 0.15, 50.3], [71.0, floorY + 0.55, 51.9], w, { tiles: cream });
  addBox(det, [68.2, floorY + 0.55, 51.5], [71.0, floorY + 1.15, 51.9], w, { tiles: cream });
  addBox(det, [68.9, floorY + 0.55, 50.6], [70.3, floorY + 0.9, 51.5], w, { tiles: teal });
  // coffee table
  addBox(det, [68.4, floorY + 0.45, 46.6], [70.4, floorY + 0.55, 48.4], w, { tiles: dark });
  for (const [lx, lz] of [[68.5, 46.7], [70.2, 46.7], [68.5, 48.2], [70.2, 48.2]]) addBox(det, [lx, floorY, lz], [lx + 0.12, floorY + 0.45, lz + 0.12], w, { tiles: dark });
  addBox(det, [69.0, floorY + 0.55, 47.0], [69.7, floorY + 0.65, 47.6], w, { tiles: T.wool_blue });   // a book
  addBox(det, [69.9, floorY + 0.55, 47.7], [70.15, floorY + 0.85, 47.95], w, { tiles: T.quartz });     // a mug
  // floor lamp in the corner
  addBox(det, [70.95, floorY, 44.45], [71.05, floorY + 1.7, 44.55], w, { tiles: T.black });
  addBox(det, [70.7, floorY + 1.7, 44.2], [71.3, floorY + 2.1, 44.8], w, { tiles: cream, light: [0.9, 0.7, 0.4, 1], shadeFaces: false });
  // firewood stack beside the fireplace
  for (const [ly, lz] of [[0, 49.2], [0, 49.6], [0.3, 49.4]]) addBox(det, [71.3, floorY + ly, lz], [71.95, floorY + ly + 0.3, lz + 0.3], w, { tiles: [T.oak_log_top, T.oak_log_top, T.oak_log, T.oak_log, T.oak_log_top, T.oak_log_top] });
  // mantel + logs in the firebox + fire
  addBox(det, [F.x - 0.6, floorY + 2, F.z0 - 0.2], [F.x, floorY + 2.15, F.z1 + 1.2], w, { tiles: dark });
  addBox(det, [F.x + 0.2, floorY + 0.05, 47.2], [F.x + 0.9, floorY + 0.3, 47.8], null, { tiles: T.oak_log, light: [0.9, 0.5, 0.15, 0.3] });
  addCross(det, F.x + 0.5, floorY + 0.15, 47.5, T.fire, null, 0.9, 0, [1, 0.8, 0.5, 1]);
  // map frame above the mantel (the map itself is a separate mesh)
  const fx = F.x - 0.04;
  addBox(det, [fx - 0.06, floorY + 2.95, 45.9], [fx, floorY + 3.05, 49.1], w, { tiles: dark });
  addBox(det, [fx - 0.06, floorY + 5.05, 45.9], [fx, floorY + 5.15, 49.1], w, { tiles: dark });
  addBox(det, [fx - 0.06, floorY + 2.95, 45.9], [fx, floorY + 5.15, 46.0], w, { tiles: dark });
  addBox(det, [fx - 0.06, floorY + 2.95, 49.0], [fx, floorY + 5.15, 49.1], w, { tiles: dark });

  // ---- library: rolling ladder + reading chair ----
  for (let y = floorY; y <= floorY + 3; y++) addWallQuad(det, x0 + 2, y, 47, 'e', T.ladder, w, 0.03);
  addBox(det, [x0 + 2.2, floorY + 0.15, 52.3], [x0 + 3.4, floorY + 0.55, 53.5], w, { tiles: teal });
  addBox(det, [x0 + 2.2, floorY + 0.55, 53.2], [x0 + 3.4, floorY + 1.1, 53.5], w, { tiles: teal });
  addBox(det, [x0 + 3.7, floorY + 0.5, 52.5], [x0 + 4.3, floorY + 0.58, 53.1], w, { tiles: dark });
  addBox(det, [x0 + 3.95, floorY, 52.75], [x0 + 4.05, floorY + 0.5, 52.85], w, { tiles: dark });

  // ---- desk under the north windows ----
  const dx0 = 59, dx1 = 67, dz = z0 + 1;
  addBox(det, [dx0, floorY + 0.78, dz + 0.1], [dx1, floorY + 0.88, dz + 1.0], w, { tiles: dark });
  for (const lx of [dx0 + 0.1, 63, dx1 - 0.2]) for (const lz of [dz + 0.15, dz + 0.85]) addBox(det, [lx, floorY, lz], [lx + 0.1, floorY + 0.78, lz + 0.1], w, { tiles: dark });
  const mx = 63, screenLight: [number, number, number, number] = [0.25, 0.4, 0.7, 0.6];
  addBox(det, [mx + 7 / 16, floorY + 0.88, dz + 0.45], [mx + 9 / 16, floorY + 1.05, dz + 0.55], w, { tiles: T.black });
  addBox(det, [mx + 5 / 16, floorY + 0.88, dz + 0.35], [mx + 11 / 16, floorY + 0.92, dz + 0.65], w, { tiles: T.black });
  addBox(det, [mx + 1 / 16, floorY + 1.05, dz + 0.42], [mx + 15 / 16, floorY + 1.6, dz + 0.48], w, { tiles: [T.black, T.black, T.black, T.screen, T.black, T.black], light: screenLight, shadeFaces: false });
  addBox(det, [mx + 3 / 16, floorY + 0.88, dz + 0.62], [mx + 13 / 16, floorY + 0.93, dz + 0.86], w, { tiles: T.iron });
  // desk lamp
  addBox(det, [dx0 + 1.4, floorY + 0.88, dz + 0.3], [dx0 + 1.5, floorY + 1.5, dz + 0.4], w, { tiles: T.black });
  addBox(det, [dx0 + 1.2, floorY + 1.45, dz + 0.1], [dx0 + 1.75, floorY + 1.6, dz + 0.6], w, { tiles: T.black });
  addBox(det, [dx0 + 1.3, floorY + 1.4, dz + 0.2], [dx0 + 1.65, floorY + 1.46, dz + 0.5], null, { tiles: T.quartz, light: [0.9, 0.7, 0.4, 1], shadeFaces: false });
  // books, notebook, plant
  addBox(det, [dx1 - 2.2, floorY + 0.88, dz + 0.3], [dx1 - 1.5, floorY + 1.0, dz + 0.8], w, { tiles: T.wool_blue });
  addBox(det, [dx1 - 2.1, floorY + 1.0, dz + 0.35], [dx1 - 1.6, floorY + 1.08, dz + 0.75], w, { tiles: T.wool_red });
  addBox(det, [dx1 - 0.9, floorY + 0.88, dz + 0.35], [dx1 - 0.4, floorY + 1.18, dz + 0.85], w, { tiles: T.quartz });
  addCross(det, dx1 - 0.65, floorY + 1.15, dz + 0.6, T.fern, w, 0.7, 1);
  // chair
  addBox(det, [mx + 0.2, floorY + 0.45, dz + 1.3], [mx + 0.8, floorY + 0.52, dz + 1.9], w, { tiles: dark });
  addBox(det, [mx + 0.2, floorY + 0.52, dz + 1.8], [mx + 0.8, floorY + 1.1, dz + 1.9], w, { tiles: dark });
  for (const [lx, lz] of [[mx + 0.22, dz + 1.32], [mx + 0.72, dz + 1.32], [mx + 0.22, dz + 1.82], [mx + 0.72, dz + 1.82]]) addBox(det, [lx, floorY, lz], [lx + 0.06, floorY + 0.45, lz + 0.06], w, { tiles: dark });

  // ---- plants in the corners ----
  for (const [px, pz] of [[56.5, 53.5], [71.5, 53.5], [58.5, 42.6]]) {
    addBox(det, [px - 0.3, floorY, pz - 0.3], [px + 0.3, floorY + 0.55, pz + 0.3], w, { tiles: T.quartz });
    addCross(det, px, floorY + 0.5, pz, T.fern, w, 1.2, 1);
  }

  // ---- stair railing + hand rail ----
  const S = LODGE.stairs;
  for (let x = S.x0; x <= S.x0 + 2; x++) {
    addBox(det, [x + 0.45, floorY, S.z1 + 1 - 0.1], [x + 0.55, floorY + 1, S.z1 + 1], w, { tiles: dark });
  }
  addBox(det, [S.x0, floorY + 0.95, S.z1 + 1 - 0.12], [S.x0 + 3, floorY + 1.05, S.z1 + 1 - 0.02], w, { tiles: dark });

  // ---- deck railing + planters ----
  const dz0 = LODGE.deck.z0, dz1 = LODGE.deck.z1;
  const post = (x: number, z: number) => addBox(det, [x + 0.42, floorY, z + 0.42], [x + 0.58, floorY + 1.05, z + 0.58], w, { tiles: dark });
  for (let x = x0 + 1; x <= x1 - 1; x += 2) { if (x >= 62 && x <= 67) continue; post(x, dz1); }
  for (const z of [dz0, dz1]) { post(x0 + 1, z); post(x1 - 1, z); }
  for (const [xa, xb] of [[x0 + 1, 61], [68, x1 - 1]] as [number, number][]) {
    addBox(det, [xa + 0.42, floorY + 0.95, dz1 + 0.44], [xb + 0.58, floorY + 1.05, dz1 + 0.56], w, { tiles: dark });
    addBox(det, [xa + 0.42, floorY + 0.5, dz1 + 0.46], [xb + 0.58, floorY + 0.56, dz1 + 0.54], w, { tiles: dark });
  }
  for (const x of [x0 + 1, x1 - 1]) {
    addBox(det, [x + 0.44, floorY + 0.95, dz0 + 0.42], [x + 0.56, floorY + 1.05, dz1 + 0.58], w, { tiles: dark });
    addBox(det, [x + 0.46, floorY + 0.5, dz0 + 0.42], [x + 0.54, floorY + 0.56, dz1 + 0.58], w, { tiles: dark });
  }
  // deck chairs
  for (const cx of [58.5, 69.5]) {
    addBox(det, [cx - 0.5, floorY + 0.35, dz0 + 0.3], [cx + 0.5, floorY + 0.45, dz0 + 1.3], w, { tiles: oak });
    addBox(det, [cx - 0.5, floorY + 0.45, dz0 + 0.3], [cx + 0.5, floorY + 1.0, dz0 + 0.45], w, { tiles: oak });
  }
  void z1;
}

export function lodgeLamps(): Lamp[] {
  const { x0, x1, z0, floorY } = LODGE;
  const F = LODGE.fireplace;
  return [
    // pendants along the ridge
    { x: 59, y: floorY + 4.2, z: 48, kind: 'pendant' }, { x: 64, y: floorY + 4.2, z: 48, kind: 'pendant' }, { x: 69, y: floorY + 4.2, z: 48, kind: 'pendant' },
    // sconces
    { x: x0 + 1, y: floorY + 2.4, z: 53, kind: 'sconce', attach: 'w' }, { x: x0 + 1, y: floorY + 4.4, z: 47, kind: 'sconce', attach: 'w' },
    { x: F.x, y: floorY + 2.5, z: F.z0 - 1, kind: 'sconce', attach: 'e' }, { x: F.x, y: floorY + 2.5, z: F.z1 + 1, kind: 'sconce', attach: 'e' },
    { x: 60, y: floorY + 2.4, z: z0 + 1, kind: 'sconce', attach: 'n' }, { x: 68, y: floorY + 2.4, z: z0 + 1, kind: 'sconce', attach: 'n' },
    // outside, flanking the door, and on the deck columns
    { x: 63, y: floorY + 2.2, z: 56, kind: 'sconce', attach: 'n' }, { x: 66, y: floorY + 2.2, z: 56, kind: 'sconce', attach: 'n' },
    { x: x0 + 3, y: floorY + 2.4, z: 57, kind: 'sconce', attach: 'w' }, { x: x1 - 3, y: floorY + 2.4, z: 57, kind: 'sconce', attach: 'e' },
    // floor + desk lamps, fire
    { x: 71, y: floorY + 1.9, z: 44, kind: 'floor' }, { x: 60, y: floorY + 1.4, z: 42, kind: 'desk' },
    { x: F.x, y: floorY, z: 47, kind: 'fire' },
    // stairwell
    { x: 72, y: floorY + 1.0, z: 42, kind: 'sconce', attach: 'n' },
  ];
}

export const lampLight = (l: Lamp): [number, number, number] => {
  switch (l.kind) {
    case 'pendant': return [15, 12, 7];
    case 'sconce': return [13, 10, 6];
    case 'floor': return [12, 9, 5];
    case 'desk': return [10, 8, 5];
    case 'fire': return [14, 8, 2];
  }
};

/** World-space point where the lamp's glow sprite goes. */
export function lampGlow(l: Lamp): { x: number; y: number; z: number; size: number } {
  switch (l.kind) {
    case 'pendant': return { x: l.x + 0.5, y: l.y + 0.3, z: l.z + 0.5, size: 1.6 };
    case 'sconce': { const [ox, oz] = sconceOffset(l.attach ?? 'floor'); return { x: l.x + ox, y: l.y + 0.35, z: l.z + oz, size: 1.1 }; }
    case 'floor': return { x: l.x, y: l.y, z: l.z + 0.5, size: 1.3 };
    case 'desk': return { x: l.x + 0.47, y: l.y + 0.05, z: l.z + 0.35, size: 0.8 };
    case 'fire': return { x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5, size: 2.2 };
  }
}

function sconceOffset(a: Attach): [number, number] {
  switch (a) {
    case 'n': return [0.5, 0.18];
    case 's': return [0.5, 0.82];
    case 'w': return [0.18, 0.5];
    case 'e': return [0.82, 0.5];
    default: return [0.5, 0.5];
  }
}

/** Geometry for the lamps (pendants, sconces). */
export function buildLampDetails(det: GeometryBuilder, w: World, lamps: Lamp[]) {
  const warm: [number, number, number, number] = [1, 0.8, 0.5, 1];
  for (const l of lamps) {
    if (l.kind === 'pendant') {
      const cx = l.x + 0.5, cz = l.z + 0.5;
      const top = roofY(l.z) - 1; // ceiling planks
      addBox(det, [cx - 0.03, l.y + 0.6, cz - 0.03], [cx + 0.03, top, cz + 0.03], w, { tiles: T.black });
      addBox(det, [cx - 0.45, l.y + 0.55, cz - 0.45], [cx + 0.45, l.y + 0.62, cz + 0.45], w, { tiles: T.black });
      addBox(det, [cx - 0.2, l.y + 0.05, cz - 0.2], [cx + 0.2, l.y + 0.55, cz + 0.2], null, { tiles: T.quartz, light: warm, shadeFaces: false });
    } else if (l.kind === 'sconce') {
      const [ox, oz] = sconceOffset(l.attach ?? 'floor');
      const a = l.attach ?? 'n';
      // bracket against the wall + lantern body
      const bx = l.x + ox, bz = l.z + oz;
      const wx = a === 'w' ? bx - 0.18 : a === 'e' ? bx + 0.18 : bx, wz = a === 'n' ? bz - 0.18 : a === 's' ? bz + 0.18 : bz;
      addBox(det, [Math.min(bx, wx) - 0.03, l.y + 0.55, Math.min(bz, wz) - 0.03], [Math.max(bx, wx) + 0.03, l.y + 0.61, Math.max(bz, wz) + 0.03], w, { tiles: T.black });
      addBox(det, [bx - 0.14, l.y, bz - 0.14], [bx + 0.14, l.y + 0.55, bz + 0.14], null, { tiles: T.quartz, light: warm, shadeFaces: false });
      addBox(det, [bx - 0.17, l.y + 0.5, bz - 0.17], [bx + 0.17, l.y + 0.56, bz + 0.17], w, { tiles: T.black });
      addBox(det, [bx - 0.17, l.y - 0.04, bz - 0.17], [bx + 0.17, l.y + 0.02, bz + 0.17], w, { tiles: T.black });
    }
  }
}
