import * as THREE from 'three';
import { SceneBundle, Quality } from '../engine/Experience';
import { createVoxelMaterial } from '../engine/voxelMaterial';
import type { HDAtlas } from '../engine/texturesHD';
import { generateNether, NW, NetherBuild, Gate } from './nether';
import { createLavaMaterial } from './lava';
import { createGlowSprites, createEmbers } from './glow';
import { GeometryBuilder, addBox } from '../engine/mesher';
import { TILE_INDEX, drawTileTo } from '../engine/textures';
import { mulberry32 } from '../engine/rng';
import { COURSES, Course } from '../content';
import { createPortalMaterial } from './portal';

const T = TILE_INDEX;

export interface FallingSign {
  group: THREE.Group;
  course: Course;
  gate: Gate;
  /** 0 = hidden in the arch, 1 = hanging */
  set(k: number, t: number): void;
}

export interface Nether extends SceneBundle {
  build: NetherBuild;
  cart: THREE.Group;
  signs: FallingSign[];
  /** rail position for progress 0..1 along the ride */
  railPoint(p: number): THREE.Vector3;
  setCartAt(x: number, z: number, t: number, bob: number): void;
}

export function createNether(atlas: THREE.DataArrayTexture, quality: Quality, hd?: HDAtlas): Nether {
  const scene = new THREE.Scene();
  const build = generateNether();
  scene.fog = new THREE.Fog('#1b0806', 10, quality === 'low' ? 90 : 120);
  scene.background = new THREE.Color('#1b0806');

  const matOpaque = createVoxelMaterial({ atlas, hd, ambientFloor: 1.0, glow: 1.35 });
  const matCutout = createVoxelMaterial({ atlas, hd, alphaTest: 0.5, doubleSide: true, ambientFloor: 1.0, glow: 1.35 });

  const terrain = new THREE.Mesh(build.terrain!, matOpaque);
  terrain.frustumCulled = false;
  scene.add(terrain);
  if (build.details) { const d = new THREE.Mesh(build.details, matCutout); d.frustumCulled = false; scene.add(d); }

  // ---- lava ----
  const lavaMat = createLavaMaterial();
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(NW.SX + 40, NW.SZ + 60), lavaMat);
  lava.rotation.x = -Math.PI / 2;
  lava.position.set(NW.SX / 2, NW.LAVA_Y, NW.SZ / 2);
  scene.add(lava);
  // lava falls: vertical strips
  for (const f of build.lavaFalls) {
    const g = new THREE.PlaneGeometry(1.2, f.y1 - f.y0);
    const m = new THREE.Mesh(g, lavaMat);
    m.position.set(f.x + f.side * 0.6, (f.y0 + f.y1) / 2, f.z);
    m.rotation.y = f.side === 1 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(m);
  }

  // ---- lights ----
  scene.add(new THREE.HemisphereLight('#6a2a18', '#1a0604', 0.6));
  const lavaLightA = new THREE.PointLight('#ff6a1a', 60, 30, 1.6);
  const lavaLightB = new THREE.PointLight('#ff8a2a', 40, 26, 1.6);
  scene.add(lavaLightA, lavaLightB);

  // ---- glows ----
  const gs = createGlowSprites(build.glowstones.map(g => ({ ...g, size: 2.2 })), '#ffcf7a', 1.0, 0.7);
  scene.add(gs.points);
  const rng = mulberry32(9);
  const embers = createEmbers(quality === 'low' ? 300 : 900, { min: new THREE.Vector3(4, NW.LAVA_Y, 0), max: new THREE.Vector3(NW.SX - 4, NW.LAVA_Y + 14, NW.SZ) }, '#ff9a3c', rng);
  scene.add(embers.points);

  // ---- exit portal at the end of the line ----
  const portalMat = createPortalMaterial();
  {
    const pz = NW.Z_END + 7;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), portalMat);
    mesh.position.set(NW.RAIL_X + 1, NW.RAIL_Y + 2.5, pz + 0.5);
    scene.add(mesh);
    const pl = new THREE.PointLight('#a24dff', 30, 16, 2);
    pl.position.set(NW.RAIL_X + 1, NW.RAIL_Y + 2.5, pz - 1.5);
    scene.add(pl);
  }

  // ---- minecart ----
  const cart = buildCart(matOpaque);
  scene.add(cart);

  // ---- signs ----
  const signs: FallingSign[] = build.gates.map((gate, i) => createFallingSign(gate, COURSES[i % COURSES.length], matOpaque));
  for (const s of signs) scene.add(s.group);

  // ---- "courses ahead" banner hanging from the welcome arch ----
  {
    const tex = createBannerTexture('Courses', 'Williams College · scroll to ride');
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.6, roughness: 0.9 });
    const side = new THREE.MeshStandardMaterial({ color: '#3a2415' });
    const board = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.75, 0.14), [side, side, side, side, mat, mat]);
    board.position.set(NW.RAIL_X + 0.5, NW.RAIL_Y + 4.6, NW.BANNER_Z + 0.5);
    scene.add(board);
    const chainG = new GeometryBuilder();
    const cl: [number, number, number, number] = [0.3, 0.15, 0.08, 1];
    for (const dx of [-2.4, 2.4]) addBox(chainG, [NW.RAIL_X + 0.5 + dx - 0.04, NW.RAIL_Y + 5.45, NW.BANNER_Z + 0.46], [NW.RAIL_X + 0.5 + dx + 0.04, NW.RAIL_Y + 7, NW.BANNER_Z + 0.54], null, { tiles: T.blackstone, light: cl });
    scene.add(new THREE.Mesh(chainG.build(), matOpaque));
  }

  const railPoint = (p: number) => new THREE.Vector3(NW.RAIL_X + 0.5, NW.RAIL_Y, THREE.MathUtils.lerp(NW.Z_START, NW.Z_END, p));

  const bundle: Nether = {
    scene, build, cart, signs, railPoint,
    post: { bloom: 1.1, threshold: 0.6, vignette: 0.7, noise: 0.1, godRays: false, exposure: 1.0 },
    setCartAt(x: number, z: number, t: number, bob: number) {
      cart.position.set(NW.RAIL_X + 0.5, NW.RAIL_Y + Math.abs(Math.sin(t * 16)) * 0.02 * bob, z);
      cart.rotation.z = Math.sin(t * 11) * 0.012 * bob;
      lavaLightA.position.set(x - 6, NW.LAVA_Y + 2, z + 6);
      lavaLightB.position.set(x + 7, NW.LAVA_Y + 2, z - 4);
    },
    update(dt: number, t: number) {
      lavaMat.uniforms.uTime.value = t;
      portalMat.uniforms.uTime.value = t;
      gs.update(t);
      embers.update(t);
      for (const s of signs) s.set(-1, t); // -1 = keep state, just animate sway
    },
  };
  return bundle;
}

function buildCart(mat: THREE.Material) {
  const g = new GeometryBuilder();
  const L: [number, number, number, number] = [0.25, 0.12, 0.05, 1];
  const o = { tiles: T.iron, light: L };
  const dark = { tiles: T.blackstone, light: L };
  // floor
  addBox(g, [-0.6, 0.08, -0.9], [0.6, 0.2, 0.9], null, o);
  // walls
  addBox(g, [-0.6, 0.2, -0.9], [-0.52, 0.8, 0.9], null, o);
  addBox(g, [0.52, 0.2, -0.9], [0.6, 0.8, 0.9], null, o);
  addBox(g, [-0.6, 0.2, -0.9], [0.6, 0.8, -0.82], null, o);
  addBox(g, [-0.6, 0.2, 0.82], [0.6, 0.8, 0.9], null, o);
  // rim
  addBox(g, [-0.65, 0.8, -0.95], [0.65, 0.88, 0.95], null, dark);
  // wheels
  for (const z of [-0.45, 0.45]) for (const x of [-0.5, 0.42]) addBox(g, [x, 0, z - 0.12], [x + 0.08, 0.16, z + 0.12], null, dark);
  const mesh = new THREE.Mesh(g.build(), mat);
  mesh.castShadow = false;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

/* ------------------------- hanging course signs ------------------------- */

/** A wide static banner with a title and a subtitle (the "courses ahead" announcement). */
function createBannerTexture(title: string, sub: string): THREE.CanvasTexture {
  const W = 1024, H = 320;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < H; y += 64) for (let x = 0; x < W; x += 64) drawTileTo(ctx, 'spruce_planks', x, y, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255, 210, 140, 0.45)'; ctx.lineWidth = 8; ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.strokeStyle = 'rgba(255, 210, 140, 0.25)'; ctx.lineWidth = 2; ctx.strokeRect(30, 30, W - 60, H - 60);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '600 118px "Cormorant Garamond", "Pixelify Sans", serif';
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(title, W / 2 + 4, 128 + 4);
  ctx.fillStyle = '#fff1d6'; ctx.fillText(title, W / 2, 128);
  ctx.font = '500 44px "Inter", sans-serif';
  ctx.fillStyle = '#ffd27a'; ctx.fillText(sub.toUpperCase(), W / 2, 236);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

function createSignTexture(course: Course): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  // plank background from our own tile
  for (let y = 0; y < H; y += 64) for (let x = 0; x < W; x += 64) drawTileTo(ctx, 'spruce_planks', x, y, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, W, H);
  // frame
  ctx.strokeStyle = 'rgba(255, 210, 140, 0.35)'; ctx.lineWidth = 6; ctx.strokeRect(10, 10, W - 20, H - 20);
  // dept chip
  const chip: Record<string, string> = { CS: '#4fa3ff', MATH: '#ffb84f', STAT: '#7bd88f', ECON: '#ff7a7a' };
  ctx.fillStyle = chip[course.dept] ?? '#fff';
  ctx.font = '700 22px "Pixelify Sans", monospace';
  const label = course.dept;
  const lw = ctx.measureText(label).width + 20;
  ctx.fillRect(W / 2 - lw / 2, 26, lw, 30);
  ctx.fillStyle = '#1a0d06'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, 42);
  // title lines
  const lines = course.sign.split('\n');
  let size = lines.length > 1 ? 54 : 62;
  ctx.font = `700 ${size}px "Pixelify Sans", monospace`;
  while (lines.some(l => ctx.measureText(l).width > W - 60) && size > 30) { size -= 2; ctx.font = `700 ${size}px "Pixelify Sans", monospace`; }
  const lineH = size * 1.05;
  const y0 = H / 2 + 22 - ((lines.length - 1) * lineH) / 2;
  lines.forEach((l, i) => {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(l, W / 2 + 3, y0 + i * lineH + 3);
    ctx.fillStyle = '#fff1d6'; ctx.fillText(l, W / 2, y0 + i * lineH);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function createFallingSign(gate: Gate, course: Course, voxelMat: THREE.Material): FallingSign {
  const group = new THREE.Group();
  const pivotY = NW.RAIL_Y + 8; // bottom of the lintel
  group.position.set(gate.signX, pivotY, gate.z + 0.5);
  const L = 5.6; // drop length to the sign centre

  // chains (two thin dark boxes), scaled from the pivot
  const chainG = new GeometryBuilder();
  const cl: [number, number, number, number] = [0.3, 0.15, 0.08, 1];
  addBox(chainG, [-0.8, -1, -0.04], [-0.72, 0, 0.04], null, { tiles: T.blackstone, light: cl });
  addBox(chainG, [0.72, -1, -0.04], [0.8, 0, 0.04], null, { tiles: T.blackstone, light: cl });
  const chains = new THREE.Mesh(chainG.build(), voxelMat);
  group.add(chains);

  // the broken piece of arch + the sign board hang together
  const hanging = new THREE.Group();
  const chunkG = new GeometryBuilder();
  const chl: [number, number, number, number] = [0.5, 0.2, 0.1, 1];
  addBox(chunkG, [-1.0, 0.55, -0.5], [1.0, 1.35, 0.5], null, { tiles: [T.red_nether_bricks, T.nether_bricks, T.nether_bricks, T.nether_bricks, T.nether_bricks, T.nether_bricks], light: chl });
  addBox(chunkG, [-0.3, 1.35, -0.3], [0.5, 1.9, 0.3], null, { tiles: T.nether_bricks, light: chl });
  const chunk = new THREE.Mesh(chunkG.build(), voxelMat);
  hanging.add(chunk);
  // board
  const tex = createSignTexture(course);
  const boardMat = new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.9 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.12), [
    new THREE.MeshStandardMaterial({ color: '#3a2415' }), new THREE.MeshStandardMaterial({ color: '#3a2415' }),
    new THREE.MeshStandardMaterial({ color: '#3a2415' }), new THREE.MeshStandardMaterial({ color: '#3a2415' }),
    boardMat, boardMat,
  ]);
  hanging.add(board);
  // angle the board toward the rider a little
  hanging.rotation.y = -gate.side * 0.35;
  group.add(hanging);
  group.visible = false;

  let state = 0;
  const api: FallingSign = {
    group, course, gate,
    set(k: number, t: number) {
      if (k >= 0) state = k;
      const s = state;
      if (s <= 0.001) { group.visible = false; return; }
      group.visible = true;
      // fall with a snap at the end, then settle
      let drop: number, swing = 0;
      if (s < 0.7) {
        const u = s / 0.7;
        drop = u * u * (3 - 2 * u) * 1.06;          // overshoot slightly past the chain length
      } else {
        const u = (s - 0.7) / 0.3;
        drop = 1.06 - 0.06 * (1 - Math.exp(-u * 6)) + Math.sin(u * Math.PI * 4) * 0.025 * (1 - u);
        swing = Math.sin(u * Math.PI * 3) * 0.18 * (1 - u);
      }
      const y = -L * drop;
      hanging.position.y = y;
      chains.scale.y = Math.max(0.01, -y);
      // gentle sway once hanging + the snap swing
      const sway = Math.sin(t * 1.3 + gate.z) * 0.03 * Math.min(1, s * 2);
      group.rotation.z = swing * gate.side + sway;
      group.rotation.x = Math.sin(t * 0.9 + gate.z * 0.3) * 0.02;
    },
  };
  return api;
}
