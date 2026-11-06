import * as THREE from 'three';
import { B, BLOCKS } from './blocks';
import { World } from './world';

/**
 * Accumulates quads into typed arrays. Attributes:
 *  position(3) normal(3) uv(2) tile(1) color(3) blight(3) sky(1) sway(1)
 */
export class GeometryBuilder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; tile: number[] = [];
  col: number[] = []; bl: number[] = []; sky: number[] = []; sway: number[] = [];
  idx: number[] = [];
  private vcount = 0;

  /**
   * Add a quad. verts: 4 positions CCW from outside. uvs: 4 [u,v]. ao: 4 (0..1).
   * light: 4 x [r,g,b,sky] in 0..1. flip: choose diagonal.
   */
  quad(
    verts: number[][], normal: number[], uvs: number[][], tile: number,
    ao: number[], light: number[][], shade: number, sway = 0, tint: [number, number, number] = [1, 1, 1],
  ) {
    const base = this.vcount;
    for (let i = 0; i < 4; i++) {
      this.pos.push(verts[i][0], verts[i][1], verts[i][2]);
      this.nor.push(normal[0], normal[1], normal[2]);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.tile.push(tile);
      const k = ao[i] * shade;
      this.col.push(tint[0] * k, tint[1] * k, tint[2] * k);
      this.bl.push(light[i][0], light[i][1], light[i][2]);
      this.sky.push(light[i][3]);
      this.sway.push(sway);
    }
    // flip the diagonal to avoid AO anisotropy artefacts
    if (ao[0] + ao[2] > ao[1] + ao[3]) {
      this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      this.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    }
    this.vcount += 4;
  }

  get empty() { return this.vcount === 0; }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('tile', new THREE.Float32BufferAttribute(this.tile, 1));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('blight', new THREE.Float32BufferAttribute(this.bl, 3));
    g.setAttribute('sky', new THREE.Float32BufferAttribute(this.sky, 1));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Face table. Each face: normal, 4 vertex offsets (CCW from outside), 4 uvs. */
export interface Face { n: [number, number, number]; v: number[][]; uv: number[][]; shade: number; tileIndex: number }
export const FACES: Face[] = [
  { n: [0, 1, 0], v: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]], uv: [[0, 1], [0, 0], [1, 0], [1, 1]], shade: 1.0, tileIndex: 0 },   // top
  { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], shade: 0.55, tileIndex: 1 }, // bottom
  { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.78, tileIndex: 2 }, // north
  { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.78, tileIndex: 3 },  // south
  { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.68, tileIndex: 4 }, // west
  { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], uv: [[0, 0], [1, 0], [1, 1], [0, 1]], shade: 0.68, tileIndex: 5 },  // east
];

const AO_CURVE = [0.42, 0.62, 0.82, 1.0];

export interface MeshResult { opaque: THREE.BufferGeometry | null; transparent: THREE.BufferGeometry | null }

/** Sample smooth light for a vertex from the 4 cells touching it in front of the face. */
function vertexLight(world: World, cells: number[][]): [number, number, number, number] {
  let r = 0, g = 0, b = 0, s = 0, n = 0;
  for (const c of cells) {
    if (world.inBounds(c[0], c[1], c[2]) && world.opaqueAt(c[0], c[1], c[2])) continue;
    const l = world.light(c[0], c[1], c[2]);
    r += l[0]; g += l[1]; b += l[2]; s += l[3]; n++;
  }
  if (n === 0) { const l = world.light(cells[0][0], cells[0][1], cells[0][2]); return [l[0] / 15, l[1] / 15, l[2] / 15, l[3] / 15]; }
  return [r / n / 15, g / n / 15, b / n / 15, s / n / 15];
}

/** Convert a 0..1 light level into a glow intensity curve (Minecraft-like falloff). */
export function lightCurve(v: number) { return Math.pow(Math.max(0, v), 1.6); }

export function meshWorld(world: World, opts: { swayLeaves?: boolean } = {}): MeshResult {
  const op = new GeometryBuilder();
  const tr = new GeometryBuilder();
  const { sx, sy, sz } = world;

  for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const id = world.data[world.idx(x, y, z)];
    if (id === B.Air) continue;
    const def = BLOCKS[id];
    if (!def) continue;
    const builder = def.transparent ? tr : op;

    for (const f of FACES) {
      const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
      const nid = world.get(nx, ny, nz);
      if (nid !== B.Air) {
        const nd = BLOCKS[nid];
        if (nd?.opaque) continue;            // hidden by opaque neighbour
        if (nid === id) continue;            // glass next to glass
        if (def.transparent && nd && !nd.opaque) continue;
      }
      // world edge: don't draw downward faces at the bottom or side faces at the border
      if (!world.inBounds(nx, ny, nz) && f.n[1] !== 1) continue;

      // tangent axes for AO sampling
      const axis = f.n[0] !== 0 ? 0 : f.n[1] !== 0 ? 1 : 2;
      const tA = axis === 0 ? 1 : 0;
      const tB = axis === 2 ? 1 : 2;
      const front = [nx, ny, nz];
      const ao: number[] = [];
      const light: number[][] = [];
      const verts: number[][] = [];
      for (let i = 0; i < 4; i++) {
        const v = f.v[i];
        verts.push([x + v[0], y + v[1], z + v[2]]);
        const dA = v[tA] === 0 ? -1 : 1;
        const dB = v[tB] === 0 ? -1 : 1;
        const s1 = front.slice(); s1[tA] += dA;
        const s2 = front.slice(); s2[tB] += dB;
        const c = front.slice(); c[tA] += dA; c[tB] += dB;
        const o1 = world.opaqueAt(s1[0], s1[1], s1[2]) ? 1 : 0;
        const o2 = world.opaqueAt(s2[0], s2[1], s2[2]) ? 1 : 0;
        const oc = world.opaqueAt(c[0], c[1], c[2]) ? 1 : 0;
        const level = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
        ao.push(AO_CURVE[level]);
        const l = vertexLight(world, [front, s1, s2, c]);
        light.push([lightCurve(l[0]), lightCurve(l[1]), lightCurve(l[2]), l[3]]);
      }
      const sway = opts.swayLeaves && id === B.OakLeaves ? 1 : 0;
      builder.quad(verts, f.n, f.uv, def.tiles[f.tileIndex], ao, light, f.shade, sway);
    }
  }
  return { opaque: op.empty ? null : op.build(), transparent: tr.empty ? null : tr.build() };
}

/* ------------------------------------------------------------------ */
/* Detail boxes (non-cubic shapes: torches, fences, slabs, doors, signs) */

export interface BoxOpts {
  /** tile per face [top,bottom,n,s,w,e] or single tile */
  tiles: number | number[];
  /** light [r,g,b,sky] 0..1 applied to all vertices (sampled from world if omitted) */
  light?: [number, number, number, number];
  /** uv crop in tile pixels [u0,v0,u1,v1] per face or shared; default = box extent */
  cropToSize?: boolean;
  shadeFaces?: boolean;
  tint?: [number, number, number];
}

/**
 * Add an axis-aligned box from min to max (world units) to a builder.
 * UVs are cropped so that textures stay pixel-aligned (a 2px-wide torch samples 2px of the tile).
 */
export function addBox(b: GeometryBuilder, min: number[], max: number[], world: World | null, o: BoxOpts) {
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const tiles = typeof o.tiles === 'number' ? [o.tiles, o.tiles, o.tiles, o.tiles, o.tiles, o.tiles] : o.tiles;
  const cx = Math.floor((min[0] + max[0]) / 2), cy = Math.floor((min[1] + max[1]) / 2), cz = Math.floor((min[2] + max[2]) / 2);
  let light: [number, number, number, number] = o.light ?? [0, 0, 0, 1];
  if (!o.light && world) {
    const l = world.light(cx, cy, cz);
    light = [lightCurve(l[0] / 15), lightCurve(l[1] / 15), lightCurve(l[2] / 15), l[3] / 15];
  }
  for (const f of FACES) {
    const verts = f.v.map(v => [min[0] + v[0] * size[0], min[1] + v[1] * size[1], min[2] + v[2] * size[2]]);
    let uvs = f.uv;
    if (o.cropToSize !== false) {
      // crop uv to the box footprint on that face so textures stay 1 px = 1/16 unit
      const axis = f.n[0] !== 0 ? 0 : f.n[1] !== 0 ? 1 : 2;
      const uAxis = axis === 0 ? 2 : 0;      // u runs along z for x-faces, along x otherwise
      const vAxis = axis === 1 ? 2 : 1;      // v runs along z for y-faces, along y otherwise
      const u0 = min[uAxis] - Math.floor(min[uAxis]), u1 = u0 + size[uAxis];
      const v0 = min[vAxis] - Math.floor(min[vAxis]), v1 = v0 + size[vAxis];
      uvs = f.uv.map(([u, v]) => [u0 + (u1 - u0) * u, v0 + (v1 - v0) * v]);
    }
    const shade = o.shadeFaces === false ? 1 : f.shade;
    b.quad(verts, f.n, uvs, tiles[f.tileIndex], [1, 1, 1, 1], [light, light, light, light], shade, 0, o.tint);
  }
}

/** Two crossed quads (tall grass, flowers, torches as sprites). */
export function addCross(b: GeometryBuilder, x: number, y: number, z: number, tile: number, world: World | null, size = 1, sway = 0, lightOverride?: [number, number, number, number]) {
  let light: [number, number, number, number] = lightOverride ?? [0, 0, 0, 1];
  if (!lightOverride && world) {
    const l = world.light(Math.floor(x), Math.floor(y), Math.floor(z));
    light = [lightCurve(l[0] / 15), lightCurve(l[1] / 15), lightCurve(l[2] / 15), l[3] / 15];
  }
  const h = size, w = size / 2;
  const L = [light, light, light, light];
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  // diagonal 1
  b.quad([[x - w, y, z - w], [x + w, y, z + w], [x + w, y + h, z + w], [x - w, y + h, z - w]], [0.707, 0, -0.707], uv, tile, [1, 1, 1, 1], L, 1, sway);
  b.quad([[x + w, y, z + w], [x - w, y, z - w], [x - w, y + h, z - w], [x + w, y + h, z + w]], [-0.707, 0, 0.707], uv, tile, [1, 1, 1, 1], L, 1, sway);
  // diagonal 2
  b.quad([[x - w, y, z + w], [x + w, y, z - w], [x + w, y + h, z - w], [x - w, y + h, z + w]], [0.707, 0, 0.707], uv, tile, [1, 1, 1, 1], L, 1, sway);
  b.quad([[x + w, y, z - w], [x - w, y, z + w], [x - w, y + h, z + w], [x + w, y + h, z - w]], [-0.707, 0, -0.707], uv, tile, [1, 1, 1, 1], L, 1, sway);
}

/** A flat quad lying on the floor at height y (rails, carpets). */
export function addFloorQuad(b: GeometryBuilder, x: number, y: number, z: number, tile: number, world: World | null, rot = 0, light?: [number, number, number, number]) {
  let L: [number, number, number, number] = light ?? [0, 0, 0, 1];
  if (!light && world) {
    const l = world.light(x, Math.floor(y), z);
    L = [lightCurve(l[0] / 15), lightCurve(l[1] / 15), lightCurve(l[2] / 15), l[3] / 15];
  }
  const uv = rot === 0 ? [[0, 1], [0, 0], [1, 0], [1, 1]] : [[0, 0], [1, 0], [1, 1], [0, 1]];
  b.quad([[x, y, z], [x, y, z + 1], [x + 1, y, z + 1], [x + 1, y, z]], [0, 1, 0], uv, tile, [1, 1, 1, 1], [L, L, L, L], 1, 0);
}

/** Smooth light at a vertex: average of the non-opaque cells touching the vertex (within the given cell plane). */
export function lightAtVertex(world: World, vx: number, vy: number, vz: number, axis: 'x' | 'y' | 'z', cellCoord: number): [number, number, number, number] {
  const cells: number[][] = [];
  const xs = axis === 'x' ? [cellCoord] : [Math.floor(vx) - 1, Math.floor(vx)];
  const ys = axis === 'y' ? [cellCoord] : [Math.floor(vy) - 1, Math.floor(vy)];
  const zs = axis === 'z' ? [cellCoord] : [Math.floor(vz) - 1, Math.floor(vz)];
  for (const x of xs) for (const y of ys) for (const z of zs) cells.push([x, y, z]);
  const l = vertexLight(world, cells);
  return [lightCurve(l[0]), lightCurve(l[1]), lightCurve(l[2]), l[3]];
}

/** A vertical quad on the given face of a cell (ladders, wall signs, paintings). side: 'n'|'s'|'w'|'e' */
export function addWallQuad(b: GeometryBuilder, x: number, y: number, z: number, side: 'n' | 's' | 'w' | 'e', tile: number, world: World | null, inset = 0.02, w = 1, h = 1, light?: [number, number, number, number], smoothLight = false) {
  let L: [number, number, number, number] = light ?? [0, 0, 0, 1];
  if (!light && world) {
    const l = world.light(x, Math.floor(y), z);
    L = [lightCurve(l[0] / 15), lightCurve(l[1] / 15), lightCurve(l[2] / 15), l[3] / 15];
  }
  const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
  let verts: number[][] = [], normal: number[] = [0, 0, 1];
  if (side === 's') { verts = [[x, y, z + inset], [x + w, y, z + inset], [x + w, y + h, z + inset], [x, y + h, z + inset]]; normal = [0, 0, 1]; }
  if (side === 'n') { verts = [[x + w, y, z + 1 - inset], [x, y, z + 1 - inset], [x, y + h, z + 1 - inset], [x + w, y + h, z + 1 - inset]]; normal = [0, 0, -1]; }
  if (side === 'e') { verts = [[x + inset, y, z + w], [x + inset, y, z], [x + inset, y + h, z], [x + inset, y + h, z + w]]; normal = [1, 0, 0]; }
  if (side === 'w') { verts = [[x + 1 - inset, y, z], [x + 1 - inset, y, z + w], [x + 1 - inset, y + h, z + w], [x + 1 - inset, y + h, z]]; normal = [-1, 0, 0]; }
  let LL = [L, L, L, L];
  if (smoothLight && world) {
    const axis = side === 'n' || side === 's' ? 'z' : 'x';
    LL = verts.map(v => lightAtVertex(world, v[0], v[1], v[2], axis, axis === 'z' ? z : x));
  }
  b.quad(verts, normal, uv, tile, [1, 1, 1, 1], LL, 1);
}

/** One big floor quad spanning several cells, with the texture stretched once across it (rugs). */
export function addFloorRect(b: GeometryBuilder, x0: number, y: number, z0: number, x1: number, z1: number, tile: number, world: World | null) {
  const verts = [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]];
  const LL = world ? verts.map(v => lightAtVertex(world, v[0], v[1], v[2], 'y', Math.floor(y))) : [[0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1], [0, 0, 0, 1]] as [number, number, number, number][];
  b.quad(verts, [0, 1, 0], [[0, 1], [0, 0], [1, 0], [1, 1]], tile, [1, 1, 1, 1], LL, 1, 0);
}
