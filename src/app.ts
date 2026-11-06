import * as THREE from 'three';
import { Experience, Quality } from './engine/Experience';
import { createTileArray } from './engine/textures';
import { createHDAtlas, HDAtlas } from './engine/texturesHD';
import { createOverworld } from './world/OverworldScene';
import { createNether } from './world/NetherScene';
import { Loader } from './ui/Loader';
import { Hud } from './ui/Hud';
import { Overlays } from './ui/Overlays';
import { initLang, applyStatic } from './ui/i18n';
import { Director } from './director/Director';
import { Intro } from './director/Intro';
import { OVERWORLD_KEYS } from './director/timeline';
import { renderFallback } from './ui/Fallback';

const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export async function startApp() {
  initLang();
  applyStatic();
  document.body.classList.add('locked');
  const params = new URLSearchParams(location.search);
  const quality = (params.get('q') as Quality) || undefined;
  const canvas = document.getElementById('gl') as HTMLCanvasElement;

  // WebGL2 is required (texture arrays). Otherwise show the classic version.
  const gl = canvas.getContext('webgl2');
  if (!gl) { renderFallback(); return; }

  const loader = new Loader();
  loader.set(0.05, 'gen1');
  await nextFrame();

  const lookMode = params.get('look') || 'hd';
  const exp = new Experience(canvas, quality, { ssao: lookMode === 'hd' && params.get('ao') !== '0' });
  const atlas = createTileArray();
  let hd: HDAtlas | undefined;
  if (lookMode === 'hd') { hd = await createHDAtlas((d, t) => loader.set(0.08 + 0.12 * d / t)); }
  loader.set(0.2, 'gen2');
  try {
    await Promise.race([
      Promise.all([(document as any).fonts.load('700 48px "Pixelify Sans"'), (document as any).fonts.load('400 16px "Inter"')]),
      wait(2500),
    ]);
  } catch { /* fonts are optional */ }
  await nextFrame();

  const ow = createOverworld(atlas, exp.quality, exp.camera, hd);
  loader.set(0.6, 'gen3');
  await nextFrame(); await wait(120);
  loader.set(0.7, 'gen4');
  await nextFrame();

  const ne = createNether(atlas, exp.quality, hd);
  loader.set(0.9, 'gen5');
  await nextFrame();

  const hud = new Hud();
  const ov = new Overlays();
  const director = new Director(exp, ow, ne, hud, ov);
  const intro = new Intro(exp, ow);

  // pre-compile shaders for both scenes so the first frames don't stutter
  exp.setScene(ne); exp.renderer.compile(ne.scene, exp.camera);
  exp.setScene(ow); exp.renderer.compile(ow.scene, exp.camera);
  // warm up the overworld (water reflection target, shadow map)
  const k0 = OVERWORLD_KEYS[0];
  exp.camera.position.fromArray(k0.pos); exp.camera.lookAt(new THREE.Vector3().fromArray(k0.look));
  ow.follow(new THREE.Vector3().fromArray(k0.look));
  exp.onFrame.push((dt, t) => director.update(dt, t));
  exp.start();
  await wait(300);
  loader.ready();

  const withSound = await loader.entered;
  hud.setSound(withSound);
  loader.hide();

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('skip');
  await intro.run(reduce);
  const look = new THREE.Vector3().fromArray(k0.look);
  director.activate(new THREE.Vector3().fromArray(k0.pos), look, k0.fov ?? 70);
  ov.setTitleCard(true);

  // debug handle for tests
  (window as any).__jw = {
    exp, ow, ne, director,
    setProgress(p: number) { director.snap(p); },
    stats() { return { calls: exp.renderer.info.render.calls, tris: exp.renderer.info.render.triangles, p: director.progress }; },
  };
}
