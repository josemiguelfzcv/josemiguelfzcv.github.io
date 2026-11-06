import * as THREE from 'three';
import { Water } from 'three/examples/jsm/objects/Water.js';

/** Tileable procedural water normal map (sum of ripples). */
export function createWaterNormals(size = 256): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const h = new Float32Array(size * size);
  const waves = [
    { kx: 2, ky: 1, a: 1.0, ph: 0.3 }, { kx: -3, ky: 2, a: 0.7, ph: 1.7 }, { kx: 4, ky: -2, a: 0.5, ph: 0.9 },
    { kx: 1, ky: 5, a: 0.35, ph: 2.1 }, { kx: -6, ky: -3, a: 0.2, ph: 0.2 },
  ];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let s = 0;
    for (const w of waves) s += w.a * Math.sin(2 * Math.PI * (w.kx * u + w.ky * v) + w.ph);
    h[y * size + x] = s;
  }
  const strength = 2.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const d = h[((y - 1 + size) % size) * size + x], u = h[((y + 1) % size) * size + x];
    const nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz);
    const i = (y * size + x) * 4;
    data[i] = (nx / len * 0.5 + 0.5) * 255; data[i + 1] = (ny / len * 0.5 + 0.5) * 255; data[i + 2] = (nz / len * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Water surface geometry made of one quad per flooded cell plus an outer ocean ring,
 * built in the Water mesh's local frame (rotated -90° about X: local (x, y) → world (x, -y)).
 */
export function createLakeGeometry(isWater: (x: number, z: number) => boolean, sx: number, sz: number, oceanExtent = 600): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  let n = 0;
  const quad = (x0: number, z0: number, x1: number, z1: number) => {
    // local y = -world z
    pos.push(x0, -z0, 0, x1, -z0, 0, x1, -z1, 0, x0, -z1, 0);
    uv.push(x0, z0, x1, z0, x1, z1, x0, z1);
    idx.push(n, n + 2, n + 1, n, n + 3, n + 2);
    n += 4;
  };
  // merge runs of water cells along x for fewer quads
  for (let z = 0; z < sz; z++) {
    let run = -1;
    for (let x = 0; x <= sx; x++) {
      const w = x < sx && isWater(x, z);
      if (w && run < 0) run = x;
      if (!w && run >= 0) { quad(run, z, x, z + 1); run = -1; }
    }
  }
  const E = oceanExtent;
  quad(-E, -E, sx + E, 0);          // north
  quad(-E, sz, sx + E, sz + E);     // south
  quad(-E, 0, 0, sz);               // west
  quad(sx, 0, sx + E, sz);          // east
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function createWater(opts: { geometry?: THREE.BufferGeometry; size: number; y: number; sunDir: THREE.Vector3; sunColor: string; waterColor: string; textureSize: number; fog: boolean; distortion: number; alpha: number }) {
  const geo = opts.geometry ?? new THREE.PlaneGeometry(opts.size, opts.size);
  const water = new Water(geo, {
    textureWidth: opts.textureSize,
    textureHeight: opts.textureSize,
    waterNormals: createWaterNormals(256),
    sunDirection: opts.sunDir.clone().normalize(),
    sunColor: new THREE.Color(opts.sunColor),
    waterColor: new THREE.Color(opts.waterColor),
    distortionScale: opts.distortion,
    fog: opts.fog,
    alpha: opts.alpha,
  });
  water.rotation.x = -Math.PI / 2;
  water.position.y = opts.y;
  water.name = 'water';
  (water.material as THREE.ShaderMaterial).uniforms.size.value = 3.0;
  return water;
}
