import * as THREE from 'three';
import gsap from 'gsap';
gsap.ticker.lagSmoothing(0);
import { Experience } from '../engine/Experience';
import { Overworld } from '../world/OverworldScene';
import { OVERWORLD_KEYS } from './timeline';
import { audio } from '../ui/Audio';

/**
 * The opening: first person, falling out of the sky, braking just above the ground
 * in front of the house at golden hour. Ends exactly at the first scroll keyframe.
 */
export class Intro {
  private streaks: THREE.LineSegments;
  private streakPos: Float32Array;
  private speed = 0;
  done = false;

  constructor(private exp: Experience, private ow: Overworld) {
    const n = 160;
    this.streakPos = new Float32Array(n * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3));
    const mat = new THREE.LineBasicMaterial({ color: '#fff4dc', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.streaks = new THREE.LineSegments(geo, mat);
    this.streaks.frustumCulled = false;
    this.streaks.visible = false;
    ow.scene.add(this.streaks);
  }

  private seedStreaks(center: THREE.Vector3) {
    const n = this.streakPos.length / 6;
    for (let i = 0; i < n; i++) this.placeStreak(i, center, true);
  }
  private placeStreak(i: number, c: THREE.Vector3, randomY: boolean) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 14;
    const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    const y = randomY ? c.y - 30 + Math.random() * 45 : c.y - 32 + Math.random() * 6;
    const len = 1.5 + Math.random() * 3;
    this.streakPos.set([x, y, z, x, y + len, z], i * 6);
  }

  /** Resolves when the camera has landed. */
  run(skip = false): Promise<void> {
    const cam = this.exp.camera;
    const k0 = OVERWORLD_KEYS[0];
    const end = new THREE.Vector3().fromArray(k0.pos);
    const endLook = new THREE.Vector3().fromArray(k0.look);
    const start = end.clone().add(new THREE.Vector3(0, 150, 28));
    const state = { u: 0 };
    const look = new THREE.Vector3();
    const dirDown = new THREE.Vector3(0, -1, 0);
    const ground = new THREE.Vector3(64.5, 18, 22); // what we stare at while falling (oblique, horizon at the top)

    const apply = (u: number) => {
      const s = u * u * (3 - 2 * u);
      cam.position.lerpVectors(start, end, u);
      // where we look: ground while falling → horizon at the end
      look.lerpVectors(ground, endLook, Math.pow(s, 1.6));
      cam.lookAt(look);
      cam.rotateZ(Math.sin(u * 9) * 0.04 * (1 - s));
      const fov = 76 + Math.sin(u * Math.PI) * 22 * (1 - s * 0.5) - s * 8;
      cam.fov = fov + (1 - s) * 0; cam.updateProjectionMatrix();
      this.ow.follow(look);
      void dirDown;
    };

    if (skip) {
      apply(1);
      cam.fov = k0.fov ?? 70; cam.updateProjectionMatrix();
      this.done = true;
      return Promise.resolve();
    }

    apply(0);
    this.streaks.visible = true;
    this.seedStreaks(cam.position);
    let lastY = cam.position.y;
    const onFrame = (dt: number) => {
      const vy = (lastY - cam.position.y) / Math.max(dt, 1e-3);
      lastY = cam.position.y;
      this.speed = THREE.MathUtils.clamp(vy / 60, 0, 1);
      // move streaks with the camera
      const n = this.streakPos.length / 6;
      for (let i = 0; i < n; i++) {
        const y = this.streakPos[i * 6 + 1];
        if (y > cam.position.y + 12 || y < cam.position.y - 40) this.placeStreak(i, cam.position, false);
      }
      (this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.streaks.material as THREE.LineBasicMaterial).opacity = this.speed * 0.55;
      audio.setWind(this.speed);
    };
    this.exp.onFrame.push(onFrame);

    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({
        onUpdate: () => apply(state.u),
        onComplete: () => {
          this.exp.onFrame.splice(this.exp.onFrame.indexOf(onFrame), 1);
          this.streaks.visible = false;
          audio.setWind(0);
          audio.thud(0.7);
          audio.startAmbience();
          // landing dip, then hand over to the scroll director
          const dip = { v: 0 };
          gsap.to(dip, {
            v: 1, duration: 0.6, ease: 'power2.out',
            onUpdate: () => { cam.position.y = end.y - Math.sin(dip.v * Math.PI) * 0.35; cam.lookAt(endLook); },
            onComplete: () => { cam.position.copy(end); cam.lookAt(endLook); this.done = true; resolve(); },
          });
        },
      });
      tl.to(state, { u: 0.80, duration: 2.9, ease: 'power2.in' })
        .to(state, { u: 1.0, duration: 2.1, ease: 'power4.out' });
      (window as any).__jwIntro = { tl, apply };
      if (new URLSearchParams(location.search).has('introPause')) tl.pause(0);
    });
  }
}
