import * as THREE from 'three';
import Lenis from 'lenis';
import { Experience } from '../engine/Experience';
import { Overworld } from '../world/OverworldScene';
import { Nether } from '../world/NetherScene';
import { NW } from '../world/nether';
import { Hud } from '../ui/Hud';
import { Overlays, BEAT_RANGES } from '../ui/Overlays';
import { audio } from '../ui/Audio';
import { OVERWORLD_KEYS, SEG, sampleKeys, range, smooth, clamp01 } from './timeline';

const SCROLL_SCREENS = 22; // total scroll length in viewport heights

/**
 * Turns scroll progress into camera motion, scene switches, animations and UI state.
 * Everything is a pure function of progress (scrub-safe), except one-shot sounds.
 */
export class Director {
  lenis: Lenis;
  progress = 0;        // smoothed
  rawProgress = 0;
  enabled = false;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private curPos = new THREE.Vector3();
  private curLook = new THREE.Vector3();
  private curFov = 70;
  private inNether = false;
  private scroller = document.getElementById('scroller')!;
  private lastSignSnap = new Set<number>();
  private doorSounded = false;
  private portalSounded = false;
  private lastCartZ = 0;
  shake = 0;

  constructor(private exp: Experience, private ow: Overworld, private ne: Nether, private hud: Hud, private ov: Overlays) {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9, touchMultiplier: 1.4, smoothWheel: true });
    this.lenis.stop();
    hud.onNavigate = (p) => this.goTo(p);
    ov.onNavigate = (p) => this.goTo(p);
    document.getElementById('start-btn')!.addEventListener('click', () => { audio.blip(); this.goTo(SEG.APPROACH[0] + 0.02); });
  }

  private resize() {
    const vh = window.innerHeight;
    this.scroller.style.height = `${SCROLL_SCREENS * vh}px`;
  }

  private maxScroll() { return Math.max(1, this.scroller.offsetHeight - window.innerHeight); }

  goTo(p: number) { this.lenis.scrollTo(p * this.maxScroll(), { duration: 1.6 + Math.abs(p - this.progress) * 4, easing: (x: number) => 1 - Math.pow(1 - x, 3) }); }

  /** Called once the intro has finished: hands control to the scroll. */
  activate(startPos: THREE.Vector3, startLook: THREE.Vector3, fov: number) {
    this.curPos.copy(startPos); this.curLook.copy(startLook); this.curFov = fov;
    this.enabled = true;
    document.body.classList.remove('locked');
    this.lenis.start();
    this.hud.show();
  }

  /** Jump straight to a progress value (used by tests and deep links). */
  snap(p: number) {
    this.lenis.scrollTo(p * this.maxScroll(), { immediate: true, force: true });
    this.progress = p; this.rawProgress = p;
    for (let i = 0; i < 6; i++) this.update(0.5, performance.now() / 1000 + i * 0.5);
  }

  update(dt: number, t: number) {
    this.lenis.raf(t * 1000);
    if (!this.enabled) return;
    const ms = this.maxScroll();
    this.rawProgress = clamp01((this.lenis.scroll || window.scrollY) / ms);
    // extra smoothing so scrubbing feels weighty
    const k = 1 - Math.pow(0.0005, dt);
    this.progress += (this.rawProgress - this.progress) * k;
    const p = this.progress;
    const velocity = Math.abs(this.lenis.velocity || 0);

    // ---- scene selection ----
    const toNether = p >= 0.672;
    let switched = false;
    if (toNether !== this.inNether) {
      this.inNether = toNether;
      switched = true;
      this.exp.setScene(toNether ? this.ne : this.ow);
      audio.setWorld(toNether ? 'nether' : 'overworld');
    }

    const cam = this.exp.camera;
    let fov = 70;
    if (!this.inNether) {
      fov = sampleKeys(OVERWORLD_KEYS, p, this.pos, this.look);
      // door
      const d = smooth(range(p, SEG.DOOR[0], SEG.DOOR[1]));
      this.ow.setDoor(d);
      if (d > 0.05 && !this.doorSounded) { this.doorSounded = true; audio.doorCreak(); }
      if (d < 0.02) this.doorSounded = false;
      this.ow.follow(this.look);
    } else {
      const u = range(p, SEG.NETHER[0], SEG.NETHER[1]);
      const rp = this.ne.railPoint(u);
      const speed = switched ? 0 : Math.abs(rp.z - this.lastCartZ) / Math.max(dt, 1e-3);
      this.lastCartZ = rp.z;
      audio.setCart(speed, dt);
      // first person in the cart
      const bob = Math.min(1, speed / 10);
      this.pos.set(rp.x, rp.y + 1.6 + Math.sin(t * 15) * 0.02 * bob, rp.z - 0.45);
      this.look.set(rp.x + Math.sin(t * 0.7) * 0.4, rp.y + 1.0 + Math.sin(t * 1.1) * 0.15, rp.z + 20);
      fov = 72 + bob * 4;
      // signs
      let duck = 0;
      this.ne.signs.forEach((s, i) => {
        const k = clamp01((rp.z - (s.gate.z - 17)) / 9);
        s.set(k, t);
        if (k > 0.72 && !this.lastSignSnap.has(i)) { this.lastSignSnap.add(i); audio.chainSnap(); this.shake = 0.6; }
        if (k < 0.3) this.lastSignSnap.delete(i);
        if (k > 0.55 && k < 1) duck = Math.max(duck, Math.sin(range(k, 0.55, 1) * Math.PI) * 0.28);
        // look at the sign a little while it hangs in front
        if (k >= 1 && rp.z < s.gate.z - 1) {
          const w = smooth(range(rp.z, s.gate.z - 9, s.gate.z - 4)) * (1 - smooth(range(rp.z, s.gate.z - 3, s.gate.z - 1)));
          this.look.x += (s.gate.signX - this.look.x) * 0.35 * w;
          this.look.y += (rp.y + 2.4 - this.look.y) * 0.5 * w;
        }
      });
      this.pos.y -= duck;
      // end platform: slow look-around
      const e = range(p, SEG.END[0], SEG.END[1]);
      if (e > 0) { this.look.x += Math.sin(e * Math.PI) * 3; this.look.y += e * 1.5; }
    }

    // smooth camera (snap when the world changes so we never fly across the map)
    const ck = switched ? 1 : 1 - Math.pow(0.002, dt);
    this.curPos.lerp(this.pos, ck);
    this.curLook.lerp(this.look, ck);
    this.curFov += (fov - this.curFov) * ck;
    cam.position.copy(this.curPos);
    if (this.inNether) {
      // the cart rides with the (smoothed) camera so it never drifts away from the eye
      const bobK = Math.min(1, Math.abs(this.lenis.velocity || 0) / 30);
      this.ne.setCartAt(this.curPos.x, this.curPos.z + 0.45, t, bobK);
    }
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake * this.shake * 0.25;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
    }
    cam.lookAt(this.curLook);
    if (Math.abs(cam.fov - this.curFov) > 0.01) { cam.fov = this.curFov; cam.updateProjectionMatrix(); }

    // ---- UI state ----
    this.hud.update(p);
    this.ov.setTitleCard(p < 0.04);
    // about beats
    let beat = -1;
    BEAT_RANGES.forEach((r, i) => { if (p >= r[0] && p < r[1]) beat = i; });
    this.ov.setBeat(beat);
    this.ov.updateHotspots(cam, p > SEG.HOUSE[0] && p < SEG.HOUSE[1] && !this.inNether, window.innerWidth, window.innerHeight);
    // captions
    let cap: string | null = null;
    if (p > 0.50 && p < 0.56) cap = 'descend';
    else if (p > 0.63 && p < 0.668) cap = 'portalHint';
    this.ov.setCaption(cap);
    this.ov.setChapterCard(p > 0.684 && p < 0.712);
    // portal fade
    const pf = p < 0.672 ? smooth(range(p, 0.655, 0.672)) : 1 - smooth(range(p, 0.672, 0.70));
    this.ov.setPortalFade(pf);
    if (pf > 0.5 && !this.portalSounded) { this.portalSounded = true; audio.portal(); }
    if (pf < 0.1) this.portalSounded = false;
    // courses panel
    if (this.inNether) {
      const u = range(p, SEG.NETHER[0], SEG.NETHER[1]);
      const z = this.ne.railPoint(u).z;
      let active = null as null | typeof this.ne.signs[number];
      for (const s of this.ne.signs) if (z > s.gate.z - 11 && z < s.gate.z + 3) active = s;
      this.ov.setCourse(active ? active.course : null, active ? (active.gate.side === 1 ? -1 : 1) : 1);
      this.ov.setEnd(p > SEG.END[0] + 0.012);
    } else {
      this.ov.setCourse(null);
      this.ov.setEnd(false);
    }
    void velocity; void NW;
  }
}
