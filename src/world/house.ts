/**
 * The manor: a tall gothic lake house — stone base, timber-framed upper walls, steep slate roofs,
 * a spired tower, a round turret, an east wing, arched windows glowing at golden hour.
 * Inside: a double-height great hall with the library wall, the fireplace + map, and the long desk.
 */
import { B } from '../engine/blocks';
import { World } from '../engine/world';
import { Rng } from '../engine/rng';
import { GeometryBuilder, addBox, addCross, addWallQuad, addFloorRect } from '../engine/mesher';
import { TILE_INDEX } from '../engine/textures';

export const LODGE = {
  x0: 55, x1: 73, z0: 41, z1: 55, floorY: 16,   // great hall: walls on x0/x1/z0/z1
  wallTop: 24,                                   // walls span floorY..wallTop (9 tall interior)
  door: { x: 64, z: 55 },
  deck: { z0: 56, z1: 58 },                      // stone terrace
  stairs: { x0: 70, z0: 42, z1: 44, steps: 9 },  // step i at x0+i has its top at floorY-1-i
  fireplace: { x: 72, z0: 46, z1: 48 },
  tower: { x0: 51, x1: 55, z0: 52, z1: 56, top: 33, spireTop: 47 },   // SW tower, on the lake front
  turret: { x0: 73, x1: 76, z0: 54, z1: 57, top: 27 },               // SE turret
  wing: { x0: 74, x1: 81, z0: 44, z1: 54, wallTop: 21 },             // east wing
};

const T = TILE_INDEX;
export type Attach = 'n' | 's' | 'w' | 'e' | 'floor';
export interface Lamp { x: number; y: number; z: number; kind: 'sconce' | 'pendant' | 'floor' | 'desk' | 'fire' | 'hidden'; attach?: Attach }

/** Main roof: 1:1 pitch, ridge along x at z = 48. Returns the slate block height for a row. */
export const roofY = (z: number) => LODGE.wallTop + 1 + (7 - Math.abs(z - 48));

const isWallBlock = (id: number) => id === B.StoneBricks || id === B.Plaster || id === B.DarkOakPlanks || id === B.SpruceLog || id === B.MossyStoneBricks || id === B.CrackedStoneBricks;

export function buildManor(w: World, rng: Rng) {
  const { x0, x1, z0, z1, floorY, wallTop } = LODGE;
  const S = LODGE.stairs, TW = LODGE.tower, TU = LODGE.turret, WG = LODGE.wing;
  const stoneOf = () => { const r = rng(); return r < 0.1 ? B.MossyStoneBricks : r < 0.16 ? B.CrackedStoneBricks : B.StoneBricks; };

  // ---- clear the volume ----
  w.fill(TW.x0 - 1, floorY - 1, z0 - 2, WG.x1 + 2, floorY + 40, LODGE.deck.z1 + 1, B.Air);

  // ---- plinth + floor + terrace ----
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    w.set(x, floorY - 1, z, edge ? B.StoneBricks : B.OakPlanks);
  }
  w.fill(x0 - 1, floorY - 2, z0 - 1, WG.x1 + 1, floorY - 2, z1 + 1, B.StoneBricks);
  w.fill(x0 - 1, floorY - 3, z0 - 1, WG.x1 + 1, floorY - 3, z1 + 1, B.Cobble);
  for (let z = LODGE.deck.z0; z <= LODGE.deck.z1; z++) for (let x = x0; x <= x1; x++) {
    w.set(x, floorY - 1, z, (x * 7 + z * 3) % 11 === 0 ? B.MossyStoneBricks : B.StoneBricks);
    for (let y = floorY - 6; y <= floorY - 2; y++) w.set(x, y, z, B.Cobble);
  }

  // ---- great hall walls: stone base, timber-framed render above ----
  const wallBlock = (x: number, y: number, z: number) => {
    const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
    if (corner) return B.SpruceLog;
    if (y <= floorY + 2) return stoneOf();
    const post = (z === z0 || z === z1) ? ((x - x0) % 4 === 0) : ((z - z0) % 4 === 0);
    if (post || y === floorY + 3 || y === wallTop) return B.DarkOakPlanks;
    return B.Plaster;
  };
  for (let y = floorY; y <= wallTop; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || z === z0 || z === z1;
    if (edge) w.set(x, y, z, wallBlock(x, y, z));
  }
  // arched window: 3 wide, pointed top, dark frame
  const arch3 = (axis: 'x' | 'z', a0: number, fixed: number, yb: number) => {
    const at = (i: number): [number, number] => (axis === 'x' ? [a0 + i, fixed] : [fixed, a0 + i]);
    for (let i = 0; i < 3; i++) for (let y = yb; y <= yb + 4; y++) { const [x, z] = at(i); w.set(x, y, z, B.Glass); }
    { const [x, z] = at(1); w.set(x, yb + 5, z, B.Glass); }
    for (let i = -1; i <= 3; i++) {
      const [x, z] = at(i);
      const top = i === -1 || i === 3 ? yb + 4 : i === 1 ? yb + 6 : yb + 5;
      if (i === -1 || i === 3) for (let y = yb - 1; y <= top; y++) w.set(x, y, z, B.DarkOakPlanks);
      else { w.set(x, yb - 1, z, B.DarkOakPlanks); w.set(x, top, z, B.DarkOakPlanks); }
    }
  };
  arch3('x', 58, z1, floorY + 1); arch3('x', 69, z1, floorY + 1);
  // the portal: double door, glass transom, pointed frame
  for (const x of [64, 65]) { w.set(x, floorY, z1, B.Air); w.set(x, floorY + 1, z1, B.Air); w.set(x, floorY + 2, z1, B.Glass); w.set(x, floorY + 3, z1, B.Glass); }
  for (const x of [63, 66]) for (let y = floorY; y <= floorY + 4; y++) w.set(x, y, z1, B.DarkOakPlanks);
  for (const x of [64, 65]) w.set(x, floorY + 4, z1, B.DarkOakPlanks);
  for (const x of [64, 65]) for (const y of [floorY + 6, floorY + 7]) w.set(x, y, z1, B.Glass);
  arch3('x', 58, z0, floorY + 1); arch3('x', 66, z0, floorY + 1);
  for (const z of [44, 45, 46, 50, 51, 52]) for (const y of [wallTop - 2, wallTop - 1]) w.set(x0, y, z, B.Glass);
  for (const z of [50, 51, 52]) for (const y of [wallTop - 2, wallTop - 1]) w.set(x1, y, z, B.Glass);

  // ---- main roof: slate over plank ceiling, steep 1:1, ridge along x ----
  for (let z = z0 - 1; z <= z1 + 1; z++) {
    const y = roofY(z);
    for (let x = x0 - 1; x <= x1 + 1; x++) { w.set(x, y, z, B.Slate); w.set(x, y - 1, z, B.SprucePlanks); }
    if (z >= z0 && z <= z1) for (const gx of [x0, x1]) for (let yy = wallTop + 1; yy < y - 1; yy++) {
      const stud = (z - z0) % 3 === 0 || yy === wallTop + 4;
      w.set(gx, yy, z, stud ? B.DarkOakPlanks : B.Plaster);
    }
  }
  for (const gx of [x0, x1]) { w.set(gx, wallTop + 2, 47, B.Glass); w.set(gx, wallTop + 2, 49, B.Glass); w.set(gx, wallTop + 2, 48, B.Glass); w.set(gx, wallTop + 3, 48, B.Glass); }
  for (let x = x0 - 1; x <= x1 + 1; x += 3) w.set(x, roofY(48) + 1, 48, B.DarkOakPlanks);
  // two gabled dormers on the lake-facing slope
  for (const dx0 of [59, 67]) {
    for (let z = 52; z <= 54; z++) for (let x = dx0; x <= dx0 + 2; x++) {
      for (let y = roofY(z); y <= wallTop + 5; y++) w.set(x, y, z, (x === dx0 + 1 && z === 53) ? B.Air : (x === dx0 || x === dx0 + 2 || z === 54 ? (z === 54 && x === dx0 + 1 && y >= wallTop + 3 && y <= wallTop + 4 ? B.Glass : B.Plaster) : B.Plaster));
      w.set(x, wallTop + 6, z, B.Slate);
    }
    for (let z = 52; z <= 54; z++) w.set(dx0 + 1, wallTop + 7, z, B.Slate);
    for (const z of [52, 53, 54]) for (const x of [dx0, dx0 + 2]) w.set(x, wallTop + 2, z, B.DarkOakPlanks);
    w.addEmitter(dx0 + 1, wallTop + 3, 53, 14, 11, 6);
  }

  // ---- fireplace + chimney ----
  const F = LODGE.fireplace;
  for (let z = F.z0; z <= F.z1; z++) for (let y = floorY; y <= wallTop; y++) w.set(F.x, y, z, B.StoneBricks);
  w.set(F.x, floorY, 47, B.Air); w.set(F.x, floorY + 1, 47, B.Air);
  for (let y = wallTop + 1; y <= roofY(47) + 3; y++) w.set(F.x, y, 47, B.StoneBricks);
  w.set(F.x, roofY(47) + 4, 47, B.Cobble);

  // ---- library wall ----
  for (let z = 43; z <= 51; z++) for (let y = floorY; y <= floorY + 5; y++) w.set(x0 + 1, y, z, B.Bookshelf);

  // ---- NW tower with spire ----
  const tcx = Math.floor((TW.x0 + TW.x1) / 2), tcz = Math.floor((TW.z0 + TW.z1) / 2);
  for (let y = floorY - 7; y <= TW.top; y++) for (let z = TW.z0; z <= TW.z1; z++) for (let x = TW.x0; x <= TW.x1; x++) {
    const edge = x === TW.x0 || x === TW.x1 || z === TW.z0 || z === TW.z1;
    if (!edge) { if (y >= floorY) w.set(x, y, z, B.Air); continue; }
    const corner = (x === TW.x0 || x === TW.x1) && (z === TW.z0 || z === TW.z1);
    const band = y === floorY + 3 || y === floorY + 10 || y === floorY + 17;
    w.set(x, y, z, corner ? B.DarkOakPlanks : band ? B.DarkOakPlanks : y <= floorY + 2 ? B.Cobble : stoneOf());
  }
  for (const yb of [floorY + 5, floorY + 12, floorY + 19]) {
    for (let y = yb; y <= yb + 1; y++) { w.set(tcx, y, TW.z1, B.Glass); w.set(TW.x0, y, tcz, B.Glass); }
    w.set(tcx, yb + 2, TW.z1, B.Glass); w.set(TW.x0, yb + 2, tcz, B.Glass);
    w.addEmitter(tcx, yb + 1, tcz, 14, 11, 6);
  }
  for (let z = TW.z0 - 1; z <= TW.z1 + 1; z++) for (let x = TW.x0 - 1; x <= TW.x1 + 1; x++) {
    w.set(x, TW.top + 1, z, B.StoneBricks);
    const edge = x === TW.x0 - 1 || x === TW.x1 + 1 || z === TW.z0 - 1 || z === TW.z1 + 1;
    if (edge && (x + z) % 2 === 0) w.set(x, TW.top + 2, z, B.StoneBricks);
  }
  for (let y = TW.top + 2; y <= TW.top + 6; y++) for (let z = tcz - 1; z <= tcz + 1; z++) for (let x = tcx - 1; x <= tcx + 1; x++) {
    const edge = x === tcx - 1 || x === tcx + 1 || z === tcz - 1 || z === tcz + 1;
    const win = y >= TW.top + 4 && y <= TW.top + 5 && (x === tcx || z === tcz);
    w.set(x, y, z, edge ? (win ? B.Glass : B.StoneBricks) : B.Air);
  }
  w.addEmitter(tcx, TW.top + 4, tcz, 15, 12, 7);
  for (let y = TW.top + 7; y <= TW.top + 9; y++) for (let z = tcz - 1; z <= tcz + 1; z++) for (let x = tcx - 1; x <= tcx + 1; x++) w.set(x, y, z, B.Slate);
  for (let y = TW.top + 10; y <= TW.spireTop; y++) w.set(tcx, y, tcz, B.Slate);
  w.set(tcx, TW.spireTop + 1, tcz, B.Gold);

  // ---- SE turret ----
  const ucx = 74.5, ucz = 55.5;
  for (let y = floorY - 6; y <= TU.top; y++) for (let z = TU.z0; z <= TU.z1; z++) for (let x = TU.x0; x <= TU.x1; x++) {
    const r = Math.hypot(x + 0.5 - ucx, z + 0.5 - ucz);
    if (r > 2.3) continue;
    const edge = r > 1.3;
    if (!edge) { if (y >= floorY) w.set(x, y, z, B.Air); continue; }
    w.set(x, y, z, y <= floorY + 1 ? B.Cobble : (y === floorY + 4 || y === floorY + 9 ? B.DarkOakPlanks : stoneOf()));
  }
  for (const yb of [floorY + 5, floorY + 10]) { w.set(75, yb, TU.z1, B.Glass); w.set(75, yb + 1, TU.z1, B.Glass); w.set(TU.x1, yb, 55, B.Glass); w.set(TU.x1, yb + 1, 55, B.Glass); }
  w.addEmitter(74, floorY + 6, 55, 14, 11, 6); w.addEmitter(74, floorY + 11, 55, 14, 11, 6);
  for (let k = 0; k <= 7; k++) {
    const y = TU.top + 1 + k, rr = 2.4 - k * 0.3;
    for (let z = TU.z0 - 1; z <= TU.z1 + 1; z++) for (let x = TU.x0 - 1; x <= TU.x1 + 1; x++) {
      if (Math.hypot(x + 0.5 - ucx, z + 0.5 - ucz) <= rr) w.set(x, y, z, B.Slate);
    }
  }
  w.set(74, TU.top + 9, 55, B.Slate); w.set(74, TU.top + 10, 55, B.Gold);

  // ---- east wing ----
  for (let y = floorY - 1; y <= WG.wallTop; y++) for (let z = WG.z0; z <= WG.z1; z++) for (let x = WG.x0; x <= WG.x1; x++) {
    const edge = x === WG.x1 || z === WG.z0 || z === WG.z1 || x === WG.x0;
    if (!edge) { w.set(x, y, z, y === floorY - 1 ? B.OakPlanks : B.Air); continue; }
    const corner = (x === WG.x1) && (z === WG.z0 || z === WG.z1);
    const timber = (z - WG.z0) % 3 === 0 || (x - WG.x0) % 3 === 0 || y === floorY + 3 || y === WG.wallTop;
    w.set(x, y, z, corner ? B.SpruceLog : y <= floorY + 2 ? stoneOf() : timber ? B.DarkOakPlanks : B.Plaster);
  }
  for (const xa of [76, 79]) for (let i = 0; i < 2; i++) for (let y = floorY + 1; y <= floorY + 3; y++) w.set(xa + i, y, WG.z1, B.Glass);
  for (const za of [46, 50]) for (let i = 0; i < 2; i++) for (let y = floorY + 1; y <= floorY + 3; y++) w.set(WG.x1, y, za + i, B.Glass);
  w.addEmitter(77, floorY + 2, 49, 14, 11, 6); w.addEmitter(79, floorY + 2, 46, 14, 11, 6);
  for (let x = WG.x0; x <= WG.x1 + 1; x++) {
    const y = WG.wallTop + 1 + (4 - Math.floor(Math.abs(x - 77.5)));
    for (let z = WG.z0 - 1; z <= WG.z1 + 1; z++) { w.set(x, y, z, B.Slate); w.set(x, y - 1, z, B.SprucePlanks); }
    if (x > WG.x0) for (const gz of [WG.z0, WG.z1]) for (let yy = WG.wallTop + 1; yy < y - 1; yy++) w.set(x, yy, gz, (x - WG.x0) % 2 === 0 ? B.DarkOakPlanks : B.Plaster);
  }

  // ---- staircase down to the dungeon (under the wing) ----
  const stone = (x: number, y: number, z: number) => { if (x > x1 || y < floorY - 1) w.set(x, y, z, rng() < 0.15 ? B.MossyStoneBricks : B.StoneBricks); };
  for (let i = 0; i < S.steps; i++) {
    const x = S.x0 + i, top = floorY - 2 - i;
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
export function furnishManor(det: GeometryBuilder, w: World) {
  const { x0, x1, z0, z1, floorY, wallTop } = LODGE;
  const F = LODGE.fireplace;
  const dark = T.dark_oak_planks, cream = T.wool_white, teal = T.wool_cyan;

  // ---- plaster on the inside faces of the solid walls ----
  // (timber in the outer wall shows inside as dark beams; stone shows as stone; the rest is rendered plaster)
  const inner = (wallId: number, cx: number, cy: number, cz: number, side: 'e' | 'w' | 's') => {
    if (!isWallBlock(wallId)) return;
    if (wallId === B.DarkOakPlanks || wallId === B.SpruceLog) {
      const d = 0.08;
      if (side === 'e') addBox(det, [cx, cy, cz], [cx + d, cy + 1, cz + 1], w, { tiles: dark });
      if (side === 'w') addBox(det, [cx + 1 - d, cy, cz], [cx + 1, cy + 1, cz + 1], w, { tiles: dark });
      if (side === 's') addBox(det, [cx, cy, cz], [cx + 1, cy + 1, cz + d], w, { tiles: dark });
      return;
    }
    if (wallId === B.StoneBricks || wallId === B.MossyStoneBricks || wallId === B.CrackedStoneBricks) return; // keep the stone base visible
    addWallQuad(det, cx, cy, cz, side, T.plaster, w, 0.02, 1, 1, undefined, true);
  };
  for (let y = floorY; y <= wallTop; y++) {
    for (let z = z0 + 1; z <= z1 - 1; z++) {
      if (w.get(x0 + 1, y, z) === B.Air) inner(w.get(x0, y, z), x0 + 1, y, z, 'e');
      if (w.get(x1 - 1, y, z) === B.Air) inner(w.get(x1, y, z), x1 - 1, y, z, 'w');
    }
    for (let x = x0 + 1; x <= x1 - 1; x++) if (w.get(x, y, z0 + 1) === B.Air) inner(w.get(x, y, z0), x, y, z0 + 1, 's');
  }
  addBox(det, [x0 + 1, floorY, z0 + 1], [x0 + 1 + 1 / 16, floorY + 3 / 16, z1], w, { tiles: dark });
  addBox(det, [x1 - 1 / 16, floorY, z0 + 1], [x1, floorY + 3 / 16, F.z0], w, { tiles: dark });
  addBox(det, [x1 - 1 / 16, floorY, F.z1 + 1], [x1, floorY + 3 / 16, z1], w, { tiles: dark });
  addBox(det, [x0 + 1, floorY, z0 + 1], [x1, floorY + 3 / 16, z0 + 1 + 1 / 16], w, { tiles: dark });

  // ---- beams + king posts ----
  const beam = (xa: number, xb: number, y: number, z: number) => addBox(det, [xa, y, z + 0.2], [xb, y + 0.7, z + 0.8], w, { tiles: [T.spruce_log, T.spruce_log, T.spruce_log, T.spruce_log, T.spruce_log_top, T.spruce_log_top] });
  for (const z of [44, 48, 52]) beam(x0 + 1, x1, wallTop + 1, z);
  beam(x0 + 1, x1, roofY(48) - 2, 48);
  for (const z of [44, 52]) for (const x of [60, 68]) addBox(det, [x + 0.3, wallTop + 1.7, z + 0.3], [x + 0.7, roofY(z) - 1, z + 0.7], w, { tiles: T.spruce_log });

  // ---- lounge ----
  addFloorRect(det, 65.6, floorY + 0.015, 44.6, 71.4, 51.0, T.rug, w);
  addBox(det, [66.1, floorY + 0.15, 45.2], [67.9, floorY + 0.55, 50.3], w, { tiles: cream });
  addBox(det, [66.1, floorY + 0.55, 45.2], [66.5, floorY + 1.15, 50.3], w, { tiles: cream });
  addBox(det, [66.1, floorY + 0.55, 45.2], [67.9, floorY + 0.9, 45.55], w, { tiles: cream });
  addBox(det, [66.1, floorY + 0.55, 49.95], [67.9, floorY + 0.9, 50.3], w, { tiles: cream });
  for (const z of [46.2, 48.2]) addBox(det, [66.5, floorY + 0.55, z], [67.4, floorY + 0.95, z + 1.2], w, { tiles: teal });
  for (const [lx, lz] of [[66.2, 45.3], [67.6, 45.3], [66.2, 50.0], [67.6, 50.0]]) addBox(det, [lx, floorY, lz], [lx + 0.15, floorY + 0.15, lz + 0.15], w, { tiles: dark });
  addBox(det, [68.2, floorY + 0.15, 50.3], [71.0, floorY + 0.55, 51.9], w, { tiles: cream });
  addBox(det, [68.2, floorY + 0.55, 51.5], [71.0, floorY + 1.15, 51.9], w, { tiles: cream });
  addBox(det, [68.9, floorY + 0.55, 50.6], [70.3, floorY + 0.9, 51.5], w, { tiles: teal });
  addBox(det, [68.4, floorY + 0.45, 46.6], [70.4, floorY + 0.55, 48.4], w, { tiles: dark });
  for (const [lx, lz] of [[68.5, 46.7], [70.2, 46.7], [68.5, 48.2], [70.2, 48.2]]) addBox(det, [lx, floorY, lz], [lx + 0.12, floorY + 0.45, lz + 0.12], w, { tiles: dark });
  addBox(det, [69.0, floorY + 0.55, 47.0], [69.7, floorY + 0.65, 47.6], w, { tiles: T.wool_blue });
  addBox(det, [69.9, floorY + 0.55, 47.7], [70.15, floorY + 0.85, 47.95], w, { tiles: T.quartz });
  addBox(det, [70.95, floorY, 44.45], [71.05, floorY + 1.7, 44.55], w, { tiles: T.black });
  addBox(det, [70.7, floorY + 1.7, 44.2], [71.3, floorY + 2.1, 44.8], w, { tiles: cream, light: [0.9, 0.7, 0.4, 1], shadeFaces: false });
  for (const [ly, lz] of [[0, 49.2], [0, 49.6], [0.3, 49.4]]) addBox(det, [71.3, floorY + ly, lz], [71.95, floorY + ly + 0.3, lz + 0.3], w, { tiles: [T.oak_log_top, T.oak_log_top, T.oak_log, T.oak_log, T.oak_log_top, T.oak_log_top] });
  addBox(det, [F.x - 0.6, floorY + 2, F.z0 - 0.2], [F.x, floorY + 2.15, F.z1 + 1.2], w, { tiles: dark });
  addBox(det, [F.x + 0.2, floorY + 0.05, 47.2], [F.x + 0.9, floorY + 0.3, 47.8], null, { tiles: T.oak_log, light: [0.9, 0.5, 0.15, 0.3] });
  addCross(det, F.x + 0.5, floorY + 0.15, 47.5, T.fire, null, 0.9, 0, [1, 0.8, 0.5, 1]);
  const fx = F.x - 0.04;
  addBox(det, [fx - 0.06, floorY + 2.95, 45.9], [fx, floorY + 3.05, 49.1], w, { tiles: dark });
  addBox(det, [fx - 0.06, floorY + 5.05, 45.9], [fx, floorY + 5.15, 49.1], w, { tiles: dark });
  addBox(det, [fx - 0.06, floorY + 2.95, 45.9], [fx, floorY + 5.15, 46.0], w, { tiles: dark });
  addBox(det, [fx - 0.06, floorY + 2.95, 49.0], [fx, floorY + 5.15, 49.1], w, { tiles: dark });

  // ---- library: tall rolling ladder + reading chair ----
  for (let y = floorY; y <= floorY + 5; y++) addWallQuad(det, x0 + 2, y, 47, 'e', T.ladder, w, 0.03);
  addBox(det, [x0 + 1.98, floorY + 6.02, 43], [x0 + 2.06, floorY + 6.1, 52], w, { tiles: T.iron });
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
  addBox(det, [dx0 + 1.4, floorY + 0.88, dz + 0.3], [dx0 + 1.5, floorY + 1.5, dz + 0.4], w, { tiles: T.black });
  addBox(det, [dx0 + 1.2, floorY + 1.45, dz + 0.1], [dx0 + 1.75, floorY + 1.6, dz + 0.6], w, { tiles: T.black });
  addBox(det, [dx0 + 1.3, floorY + 1.4, dz + 0.2], [dx0 + 1.65, floorY + 1.46, dz + 0.5], null, { tiles: T.quartz, light: [0.9, 0.7, 0.4, 1], shadeFaces: false });
  addBox(det, [dx1 - 2.2, floorY + 0.88, dz + 0.3], [dx1 - 1.5, floorY + 1.0, dz + 0.8], w, { tiles: T.wool_blue });
  addBox(det, [dx1 - 2.1, floorY + 1.0, dz + 0.35], [dx1 - 1.6, floorY + 1.08, dz + 0.75], w, { tiles: T.wool_red });
  addBox(det, [dx1 - 0.9, floorY + 0.88, dz + 0.35], [dx1 - 0.4, floorY + 1.18, dz + 0.85], w, { tiles: T.quartz });
  addCross(det, dx1 - 0.65, floorY + 1.15, dz + 0.6, T.fern, w, 0.7, 1);
  addBox(det, [mx + 0.2, floorY + 0.45, dz + 1.3], [mx + 0.8, floorY + 0.52, dz + 1.9], w, { tiles: dark });
  addBox(det, [mx + 0.2, floorY + 0.52, dz + 1.8], [mx + 0.8, floorY + 1.1, dz + 1.9], w, { tiles: dark });
  for (const [lx, lz] of [[mx + 0.22, dz + 1.32], [mx + 0.72, dz + 1.32], [mx + 0.22, dz + 1.82], [mx + 0.72, dz + 1.82]]) addBox(det, [lx, floorY, lz], [lx + 0.06, floorY + 0.45, lz + 0.06], w, { tiles: dark });

  // ---- plants ----
  for (const [px, pz] of [[56.5, 53.5], [71.5, 53.5], [58.5, 42.6]]) {
    addBox(det, [px - 0.3, floorY, pz - 0.3], [px + 0.3, floorY + 0.55, pz + 0.3], w, { tiles: T.quartz });
    addCross(det, px, floorY + 0.5, pz, T.fern, w, 1.2, 1);
  }

  // ---- stair railing ----
  const S = LODGE.stairs;
  for (let x = S.x0; x <= S.x0 + 2; x++) addBox(det, [x + 0.45, floorY, S.z1 + 1 - 0.1], [x + 0.55, floorY + 1, S.z1 + 1], w, { tiles: dark });
  addBox(det, [S.x0, floorY + 0.95, S.z1 + 1 - 0.12], [S.x0 + 3, floorY + 1.05, S.z1 + 1 - 0.02], w, { tiles: dark });

  // ---- terrace balustrade + lantern pedestals ----
  const dz1 = LODGE.deck.z1;
  const post = (x: number, z: number) => addBox(det, [x + 0.38, floorY, z + 0.38], [x + 0.62, floorY + 1.05, z + 0.62], w, { tiles: T.stone_bricks });
  for (let x = x0; x <= x1; x += 2) { if (x >= 62 && x <= 67) continue; post(x, dz1); }
  for (const [xa, xb] of [[x0, 61], [68, x1]] as [number, number][]) addBox(det, [xa + 0.3, floorY + 0.95, dz1 + 0.38], [xb + 0.7, floorY + 1.08, dz1 + 0.62], w, { tiles: T.stone_bricks });
  for (const x of [x0, x1]) addBox(det, [x + 0.38, floorY + 0.95, LODGE.deck.z0 + 0.3], [x + 0.62, floorY + 1.08, dz1 + 0.7], w, { tiles: T.stone_bricks });
  for (const x of [62, 67]) addBox(det, [x + 0.3, floorY, dz1 + 0.3], [x + 0.7, floorY + 1.2, dz1 + 0.7], w, { tiles: T.stone_bricks });
}

export function manorLamps(): Lamp[] {
  const { x0, x1, z0, floorY, wallTop } = LODGE;
  const F = LODGE.fireplace;
  return [
    { x: 59, y: floorY + 4.6, z: 48, kind: 'pendant' }, { x: 64, y: floorY + 4.6, z: 48, kind: 'pendant' }, { x: 69, y: floorY + 4.6, z: 48, kind: 'pendant' },
    { x: x0 + 1, y: floorY + 2.4, z: 53, kind: 'sconce', attach: 'w' }, { x: x0 + 1, y: floorY + 6.6, z: 47, kind: 'sconce', attach: 'w' },
    { x: F.x, y: floorY + 2.5, z: F.z0 - 1, kind: 'sconce', attach: 'e' }, { x: F.x, y: floorY + 2.5, z: F.z1 + 1, kind: 'sconce', attach: 'e' },
    { x: 56, y: floorY + 2.4, z: z0 + 1, kind: 'sconce', attach: 'n' }, { x: 62, y: floorY + 2.4, z: z0 + 1, kind: 'sconce', attach: 'n' },
    { x: 63, y: floorY + 2.4, z: z0 + 1, kind: 'sconce', attach: 'n' }, { x: 71, y: floorY + 2.4, z: z0 + 1, kind: 'sconce', attach: 'n' },
    { x: 64, y: wallTop - 1, z: 48, kind: 'hidden' }, { x: 58, y: wallTop - 2, z: 45, kind: 'hidden' }, { x: 70, y: wallTop - 2, z: 51, kind: 'hidden' },
    { x: 63, y: floorY + 2.6, z: 56, kind: 'sconce', attach: 'n' }, { x: 66, y: floorY + 2.6, z: 56, kind: 'sconce', attach: 'n' },
    { x: 62, y: floorY + 1.3, z: 58, kind: 'floor' }, { x: 67, y: floorY + 1.3, z: 58, kind: 'floor' },
    { x: x0 + 1, y: floorY + 2.3, z: 56, kind: 'sconce', attach: 'n' }, { x: x1 - 1, y: floorY + 2.3, z: 56, kind: 'sconce', attach: 'n' },
    { x: 71, y: floorY + 1.9, z: 44, kind: 'floor' }, { x: 60, y: floorY + 1.4, z: 42, kind: 'desk' },
    { x: F.x, y: floorY, z: 47, kind: 'fire' },
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
    case 'hidden': return [11, 9, 5];
  }
};

/** World-space point where the lamp's glow sprite goes (null = no sprite). */
export function lampGlow(l: Lamp): { x: number; y: number; z: number; size: number } | null {
  switch (l.kind) {
    case 'pendant': return { x: l.x + 0.5, y: l.y + 0.3, z: l.z + 0.5, size: 1.6 };
    case 'sconce': { const [ox, oz] = sconceOffset(l.attach ?? 'floor'); return { x: l.x + ox, y: l.y + 0.35, z: l.z + oz, size: 1.1 }; }
    case 'floor': return l.z >= LODGE.deck.z0 ? { x: l.x + 0.5, y: l.y + 0.25, z: l.z + 0.5, size: 1.3 } : { x: l.x, y: l.y, z: l.z + 0.5, size: 1.3 };
    case 'desk': return { x: l.x + 0.47, y: l.y + 0.05, z: l.z + 0.35, size: 0.8 };
    case 'fire': return { x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5, size: 2.2 };
    case 'hidden': return null;
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

/** Geometry for the lamps (pendants, sconces, pedestal lanterns). */
export function buildLampDetails(det: GeometryBuilder, w: World, lamps: Lamp[]) {
  const warm: [number, number, number, number] = [1, 0.8, 0.5, 1];
  for (const l of lamps) {
    if (l.kind === 'pendant') {
      const cx = l.x + 0.5, cz = l.z + 0.5;
      const top = roofY(l.z) - 1;
      addBox(det, [cx - 0.03, l.y + 0.6, cz - 0.03], [cx + 0.03, top, cz + 0.03], w, { tiles: T.black });
      addBox(det, [cx - 0.45, l.y + 0.55, cz - 0.45], [cx + 0.45, l.y + 0.62, cz + 0.45], w, { tiles: T.black });
      addBox(det, [cx - 0.2, l.y + 0.05, cz - 0.2], [cx + 0.2, l.y + 0.55, cz + 0.2], null, { tiles: T.quartz, light: warm, shadeFaces: false });
    } else if (l.kind === 'sconce') {
      const [ox, oz] = sconceOffset(l.attach ?? 'floor');
      const a = l.attach ?? 'n';
      const bx = l.x + ox, bz = l.z + oz;
      const wx = a === 'w' ? bx - 0.18 : a === 'e' ? bx + 0.18 : bx, wz = a === 'n' ? bz - 0.18 : a === 's' ? bz + 0.18 : bz;
      addBox(det, [Math.min(bx, wx) - 0.03, l.y + 0.55, Math.min(bz, wz) - 0.03], [Math.max(bx, wx) + 0.03, l.y + 0.61, Math.max(bz, wz) + 0.03], w, { tiles: T.black });
      addBox(det, [bx - 0.14, l.y, bz - 0.14], [bx + 0.14, l.y + 0.55, bz + 0.14], null, { tiles: T.quartz, light: warm, shadeFaces: false });
      addBox(det, [bx - 0.17, l.y + 0.5, bz - 0.17], [bx + 0.17, l.y + 0.56, bz + 0.17], w, { tiles: T.black });
      addBox(det, [bx - 0.17, l.y - 0.04, bz - 0.17], [bx + 0.17, l.y + 0.02, bz + 0.17], w, { tiles: T.black });
    } else if (l.kind === 'floor' && l.z >= LODGE.deck.z0) {
      const cx = l.x + 0.5, cz = l.z + 0.5;
      addBox(det, [cx - 0.16, l.y - 0.05, cz - 0.16], [cx + 0.16, l.y + 0.55, cz + 0.16], null, { tiles: T.quartz, light: warm, shadeFaces: false });
      addBox(det, [cx - 0.2, l.y + 0.5, cz - 0.2], [cx + 0.2, l.y + 0.58, cz + 0.2], w, { tiles: T.black });
      addBox(det, [cx - 0.2, l.y - 0.1, cz - 0.2], [cx + 0.2, l.y - 0.04, cz + 0.2], w, { tiles: T.black });
    }
  }
}
