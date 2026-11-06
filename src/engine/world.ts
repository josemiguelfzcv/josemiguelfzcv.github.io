import { B, BLOCKS, isOpaque } from './blocks';

/**
 * A dense voxel grid with Minecraft-style light propagation:
 * - block light (RGB, 0..15) flood-filled from emitting blocks
 * - sky light (0..15) falling from the top and spreading sideways
 * Light is baked into the mesh as vertex data (see mesher.ts).
 */
export class World {
  data: Uint8Array;
  lightR: Uint8Array; lightG: Uint8Array; lightB: Uint8Array;
  sky: Uint8Array;
  /** extra emitters not represented by blocks (torches, portals...) */
  emitters: { x: number; y: number; z: number; r: number; g: number; b: number }[] = [];
  /** whether this world has a sky above (overworld) */
  hasSky = true;

  constructor(public sx: number, public sy: number, public sz: number) {
    const n = sx * sy * sz;
    this.data = new Uint8Array(n);
    this.lightR = new Uint8Array(n); this.lightG = new Uint8Array(n); this.lightB = new Uint8Array(n);
    this.sky = new Uint8Array(n);
  }

  idx(x: number, y: number, z: number) { return (y * this.sz + z) * this.sx + x; }
  inBounds(x: number, y: number, z: number) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }

  get(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return B.Air;
    return this.data[this.idx(x, y, z)];
  }
  set(x: number, y: number, z: number, id: number) {
    if (!this.inBounds(x, y, z)) return;
    this.data[this.idx(x, y, z)] = id;
  }
  fill(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, id);
  }
  /** hollow box (walls only) */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          const edge = x === x0 || x === x1 || z === z0 || z === z1 || y === y0 || y === y1;
          if (edge) this.set(x, y, z, id);
        }
  }
  addEmitter(x: number, y: number, z: number, r: number, g: number, b: number) {
    this.emitters.push({ x, y, z, r, g, b });
  }

  opaqueAt(x: number, y: number, z: number) { return isOpaque(this.get(x, y, z)); }

  /** Highest non-air block y at (x,z), or -1 */
  heightAt(x: number, z: number) {
    for (let y = this.sy - 1; y >= 0; y--) if (this.get(x, y, z) !== B.Air) return y;
    return -1;
  }

  /** Light value for a cell (block light channels and sky), 0..15 */
  light(x: number, y: number, z: number): [number, number, number, number] {
    if (!this.inBounds(x, y, z)) return [0, 0, 0, this.hasSky ? 15 : 0];
    const i = this.idx(x, y, z);
    return [this.lightR[i], this.lightG[i], this.lightB[i], this.sky[i]];
  }

  computeLight() {
    const n = this.data.length;
    this.lightR.fill(0); this.lightG.fill(0); this.lightB.fill(0); this.sky.fill(0);
    const { sx, sy, sz } = this;

    // ---- block light: BFS per channel ----
    const channels: [Uint8Array, number][] = [[this.lightR, 0], [this.lightG, 1], [this.lightB, 2]];
    for (const [arr, ch] of channels) {
      const queue: number[] = [];
      for (let i = 0; i < n; i++) {
        const d = BLOCKS[this.data[i]];
        if (d?.light && d.light[ch] > 0) { arr[i] = d.light[ch]; queue.push(i); }
      }
      for (const e of this.emitters) {
        const v = [e.r, e.g, e.b][ch];
        if (v <= 0 || !this.inBounds(e.x, e.y, e.z)) continue;
        const i = this.idx(e.x, e.y, e.z);
        if (arr[i] < v) { arr[i] = v; queue.push(i); }
      }
      this.bfs(arr, queue);
    }

    // ---- sky light ----
    if (this.hasSky) {
      const queue: number[] = [];
      for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
        for (let y = sy - 1; y >= 0; y--) {
          const i = this.idx(x, y, z);
          if (isOpaque(this.data[i])) break;
          this.sky[i] = 15;
          queue.push(i);
        }
      }
      this.bfs(this.sky, queue);
    }
  }

  private bfs(arr: Uint8Array, queue: number[]) {
    const { sx, sy, sz } = this;
    const plane = sx * sz;
    let qh = 0;
    while (qh < queue.length) {
      const i = queue[qh++];
      const v = arr[i];
      if (v <= 1) continue;
      const x = i % sx, z = ((i - x) / sx) % sz, y = Math.floor(i / plane);
      const nv = v - 1;
      const tryN = (nx: number, ny: number, nz: number) => {
        if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) return;
        const j = (ny * sz + nz) * sx + nx;
        if (isOpaque(this.data[j])) return;
        if (arr[j] < nv) { arr[j] = nv; queue.push(j); }
      };
      tryN(x - 1, y, z); tryN(x + 1, y, z);
      tryN(x, y - 1, z); tryN(x, y + 1, z);
      tryN(x, y, z - 1); tryN(x, y, z + 1);
    }
  }
}
