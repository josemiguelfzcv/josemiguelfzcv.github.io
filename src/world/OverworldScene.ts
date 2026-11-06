import * as THREE from 'three';
import { SceneBundle, Quality } from '../engine/Experience';
import { createVoxelMaterial } from '../engine/voxelMaterial';
import type { HDAtlas } from '../engine/texturesHD';
import { generateOverworld, OW, buildTitleGeometry, OverworldBuild, torchOffset } from './overworld';
import { lampGlow, LODGE } from './house';
import { createGlowSprites } from './glow';
import { createMist } from './mist';
import { createSky, createSun, createClouds } from './sky';
import { createWater, createLakeGeometry } from './water';
import { mulberry32 } from '../engine/rng';
import { createDRMapTexture } from './drmap';
import { createPortalMaterial } from './portal';
import { TILE_INDEX } from '../engine/textures';
import { GeometryBuilder, addBox } from '../engine/mesher';
import { B } from '../engine/blocks';

export const SUN_DIR = new THREE.Vector3(-0.58, 0.27, -0.77).normalize();

export interface Overworld extends SceneBundle {
  build: OverworldBuild;
  door: THREE.Group;
  sunLight: THREE.DirectionalLight;
  water: THREE.Mesh;
  title: THREE.Mesh;
  portalMat: THREE.ShaderMaterial;
  setDoor(open01: number): void;
  /** keep the shadow frustum centred where the camera looks */
  follow(target: THREE.Vector3): void;
}

export function createOverworld(atlas: THREE.DataArrayTexture, quality: Quality, camera: THREE.PerspectiveCamera, hd?: HDAtlas): Overworld {
  const scene = new THREE.Scene();
  const build = generateOverworld();
  const horizon = '#f4b27c';
  scene.fog = new THREE.Fog(horizon, 40, quality === 'low' ? 150 : 210);

  // ---- voxel meshes ----
  const matOpaque = createVoxelMaterial({ atlas, hd, ambientFloor: 0.16 });
  const matGlass = createVoxelMaterial({ atlas, hd, transparent: true, ambientFloor: 0.16 });
  const matCutout = createVoxelMaterial({ atlas, hd, alphaTest: 0.5, doubleSide: true, ambientFloor: 0.16 });

  const addMesh = (geo: THREE.BufferGeometry | null, mat: THREE.Material, name: string, shadows = true) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = shadows; m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  addMesh(build.terrain, matOpaque, 'terrain');
  addMesh(build.details, matCutout, 'details', false);
  const glass = addMesh(build.glass, matGlass, 'glass', false);
  if (glass) glass.renderOrder = 5;
  const foliage = addMesh(build.foliage, matCutout, 'foliage', false);
  if (foliage) foliage.receiveShadow = true;

  // ---- title ----
  // "WELCOME TO" (small) over "JOSE'S / WORLD" (big), softly self-lit so it reads against the dusk sky
  const titleGeo = buildTitleGeometry(["JOSE'S", 'WORLD'], B.Gold, 11);
  const title = new THREE.Mesh(titleGeo.geo, matOpaque);
  title.castShadow = false; title.receiveShadow = false;
  title.scale.setScalar(0.85);
  title.position.set(70, 38, 40);
  scene.add(title);
  const welcomeGeo = buildTitleGeometry(['WELCOME TO'], B.Gold, 11);
  const welcome = new THREE.Mesh(welcomeGeo.geo, matOpaque);
  welcome.castShadow = false; welcome.receiveShadow = false;
  welcome.scale.setScalar(0.48);
  welcome.position.set(70, 38 + titleGeo.height * 0.85 + 1.4, 40);
  scene.add(welcome);

  // ---- sky / sun ----
  const sky = createSky(SUN_DIR, { zenith: '#6f8fcf', horizon, glow: '#ffd27a', ground: '#8a6a4a' });
  scene.add(sky.mesh);
  const sun = createSun(SUN_DIR, 760, 52, new THREE.Color(3.2, 2.3, 1.2));
  scene.add(sun);
  // the sky/sun follow the camera so they always appear infinitely far
  const followers = [sky.mesh, sun];

  const clouds = createClouds(mulberry32(5), { y: 58, count: quality === 'low' ? 12 : 26, spread: 420, color: '#ffe2c0', opacity: 0.85 });
  clouds.position.set(64, 0, 64);
  scene.add(clouds);

  // ---- lights ----
  const hemi = new THREE.HemisphereLight('#ffd6ad', '#4d3a2a', 0.78);
  scene.add(hemi);
  const sunLight = new THREE.DirectionalLight('#ffcf98', 4.6);
  sunLight.castShadow = true;
  const sm = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  sunLight.shadow.mapSize.set(sm, sm);
  const ext = quality === 'low' ? 48 : 64;
  sunLight.shadow.camera.left = -ext; sunLight.shadow.camera.right = ext;
  sunLight.shadow.camera.top = ext; sunLight.shadow.camera.bottom = -ext;
  sunLight.shadow.camera.near = 10; sunLight.shadow.camera.far = 400;
  sunLight.shadow.bias = -0.00035;
  sunLight.shadow.normalBias = 0.06;
  sunLight.shadow.radius = 2;
  scene.add(sunLight); scene.add(sunLight.target);
  // soft fill from the lake side so facades in shade stay legible (no shadows)
  const fill = new THREE.DirectionalLight('#ffd9b8', 0.7);
  fill.position.set(64 + 30, 40, 64 + 90);
  fill.target.position.set(64, 20, 50);
  scene.add(fill, fill.target);

  // ---- water ----
  const lakeGeo = createLakeGeometry((x, z) => build.world.heightAt(x, z) < OW.WATER_Y, OW.SX, OW.SZ, 600);
  const water = createWater({
    geometry: lakeGeo, size: 600, y: OW.WATER_Y, sunDir: SUN_DIR, sunColor: '#ffd9a0', waterColor: '#2a6a7a',
    textureSize: quality === 'high' ? 1024 : 512, fog: true, distortion: 1.3, alpha: 0.94,
  });
  {
    const wm = water.material as THREE.ShaderMaterial;
    wm.fragmentShader = wm.fragmentShader.replace('float rf0 = 0.3;', 'float rf0 = 0.14;').replace('reflectionSample * 0.9', 'reflectionSample * 0.75');
    wm.needsUpdate = true;
  }
  scene.add(water);

  // ---- double door (separate, animated) ----
  const door = new THREE.Group();
  const doorR = new THREE.Group();
  {
    const T = TILE_INDEX;
    const L: [number, number, number, number] = [0.25, 0.2, 0.12, 0.95];
    const panel = (sign: 1 | -1) => {
      const g = new GeometryBuilder();
      const xa = sign === 1 ? 0 : -1, xb = sign === 1 ? 1 : 0;
      addBox(g, [xa, 0, 0], [xb, 1, 3 / 16], null, { tiles: [T.door_bottom, T.door_bottom, T.door_bottom, T.door_bottom, T.door_bottom, T.door_bottom], light: L, shadeFaces: false });
      addBox(g, [xa, 1, 0], [xb, 2, 3 / 16], null, { tiles: [T.door_top, T.door_top, T.door_top, T.door_top, T.door_top, T.door_top], light: L, shadeFaces: false });
      const m = new THREE.Mesh(g.build(), matOpaque);
      m.castShadow = true;
      return m;
    };
    door.add(panel(1));
    doorR.add(panel(-1));
  }
  door.position.set(OW.DOOR.x, OW.HOUSE.floorY, OW.DOOR.z + 13 / 16);          // left leaf, hinge on the west jamb
  doorR.position.set(OW.DOOR.x + 2, OW.HOUSE.floorY, OW.DOOR.z + 13 / 16);     // right leaf, hinge on the east jamb
  scene.add(door, doorR);

  // ---- flame / lantern glows ----
  const flames = createGlowSprites(
    [...build.torches.map(t => { const [ox, oz] = torchOffset(t.attach); return { x: t.x + ox + 1 / 16, y: (t.attach === 'floor' ? t.y : t.y + 0.2) + 0.7, z: t.z + oz + 1 / 16, size: 1 }; }),
     ...build.lamps.map(l => lampGlow(l)).filter((g): g is { x: number; y: number; z: number; size: number } => !!g),
     ...build.lanterns.map(l => ({ x: l.x + 4 / 16, y: OW.GROUND + 2.3, z: l.z + 0.5, size: 1.6 }))],
    '#ffb347', 1.0, 1.2,
  );
  scene.add(flames.points);
  door.position.set(OW.DOOR.x, OW.HOUSE.floorY, OW.DOOR.z + 13 / 16);
  scene.add(door);

  // ---- the map of the Dominican Republic on the east wall ----
  {
    const tex = createDRMapTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 1, emissive: new THREE.Color('#2a1e14'), emissiveIntensity: 0.6 });
    const geo = new THREE.PlaneGeometry(3, 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = -Math.PI / 2;
    mesh.position.set(LODGE.fireplace.x - 0.05, LODGE.floorY + 4.05, 47.5);
    scene.add(mesh);
  }

  // ---- nether portal surface ----
  const portalMat = createPortalMaterial();
  {
    const P = OW.PORTAL;
    const geo = new THREE.PlaneGeometry(P.z1 - P.z0 + 1, P.y1 - P.y0 + 1);
    const mesh = new THREE.Mesh(geo, portalMat);
    mesh.rotation.y = -Math.PI / 2;
    mesh.position.set(P.x + 0.5, (P.y0 + P.y1 + 1) / 2, (P.z0 + P.z1 + 1) / 2);
    scene.add(mesh);
    const pl = new THREE.PointLight('#a24dff', 20, 14, 2);
    pl.position.set(P.x - 1, (P.y0 + P.y1 + 1) / 2, (P.z0 + P.z1 + 1) / 2);
    scene.add(pl);
  }

  // ---- ground mist over the lake and lawn ----
  const mist = createMist(new THREE.Vector3(64, OW.WATER_Y + 1.1, 78), [150, 110]);
  scene.add(mist.group);

  // ---- fireplace light ----
  const fireLight = new THREE.PointLight('#ff8a3c', 14, 12, 1.8);
  fireLight.position.set(LODGE.fireplace.x + 0.4, LODGE.floorY + 0.8, 47.5);
  scene.add(fireLight);

  // ---- ambient particles: pollen / fireflies in the golden light ----
  const particles = createMotes(quality === 'low' ? 250 : 700);
  scene.add(particles.points);

  const bundle: Overworld = {
    scene, sun, build, door, sunLight, water, title, portalMat,
    post: { bloom: 0.7, threshold: 0.86, vignette: 0.55, noise: 0.08, godRays: true, exposure: 1.0 },
    setDoor(open01: number) { door.rotation.y = open01 * Math.PI * 0.6; doorR.rotation.y = -open01 * Math.PI * 0.6; },
    follow(target: THREE.Vector3) {
      const alt = Math.max(0, camera.position.y - 20);
      const fog = scene.fog as THREE.Fog;
      fog.near = 40 + alt * 2.5;
      fog.far = (quality === 'low' ? 150 : 210) + alt * 5;
      sunLight.target.position.copy(target);
      sunLight.position.copy(target).addScaledVector(SUN_DIR, 160);
      for (const f of followers) f.position.set(camera.position.x, camera.position.y, camera.position.z);
      sun.position.copy(camera.position).addScaledVector(SUN_DIR, 760);
    },
    update(dt: number, t: number) {
      (water.material as THREE.ShaderMaterial).uniforms.time.value = t * 0.6;
      portalMat.uniforms.uTime.value = t;
      clouds.position.x = 64 + (t * 0.6) % 40;
      particles.update(t);
      flames.update(t);
      fireLight.intensity = 12 + Math.sin(t * 9.3) * 2 + Math.sin(t * 23.7) * 1.2;
      mist.update(t);
    },
  };
  return bundle;
}

function createMotes(count: number) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const rng = mulberry32(42);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = 20 + rng() * 90; pos[i * 3 + 1] = 15 + rng() * 10; pos[i * 3 + 2] = 40 + rng() * 75;
    seed[i] = rng() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color('#ffd27a') } },
    vertexShader: `
      attribute float seed; uniform float uTime; varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.3 + seed) * 1.5;
        p.y += sin(uTime * 0.5 + seed * 1.3) * 0.8;
        p.z += cos(uTime * 0.25 + seed * 0.7) * 1.5;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        gl_PointSize = clamp(90.0 / d, 1.5, 6.0);
        vA = (0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.7 + seed * 3.1))) * smoothstep(90.0, 30.0, d);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, r) * vA;
        gl_FragColor = vec4(uColor * 1.6, a);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return { points, update(t: number) { mat.uniforms.uTime.value = t; } };
}
