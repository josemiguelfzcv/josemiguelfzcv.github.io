/**
 * All sound is synthesized with WebAudio at runtime (no audio files, nothing copied).
 * Wind during the fall, a calm generative pad in the overworld, a low drone in the Nether,
 * minecart rumble/clacks, door creak, chain snap, portal whoosh.
 */
export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  enabled = false;
  private wind?: { gain: GainNode; filter: BiquadFilterNode };
  private pad?: { gain: GainNode; stop: () => void };
  private drone?: { gain: GainNode; stop: () => void };
  private cart?: { gain: GainNode; clackTimer: number; speed: number };
  private reverb?: ConvolverNode;
  private noiseBuf?: AudioBuffer;
  private world: 'overworld' | 'nether' = 'overworld';

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) return;
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(2.8, 2.2);
    const rvGain = this.ctx.createGain(); rvGain.gain.value = 0.35;
    this.reverb.connect(rvGain).connect(this.master);
    this.noiseBuf = this.makeNoise(2);
    this.startWind();
    this.startPad();
    this.startCart();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!this.ctx) return;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.cancelScheduledValues(this.ctx.currentTime);
    this.master.gain.linearRampToValueAtTime(on ? 0.8 : 0, this.ctx.currentTime + 0.6);
  }

  /* ---------- helpers ---------- */
  private makeNoise(seconds: number) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3.5; }
    return buf;
  }
  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }
  private noiseSource(loop = true) {
    const s = this.ctx!.createBufferSource(); s.buffer = this.noiseBuf!; s.loop = loop; return s;
  }

  /* ---------- wind (fall) ---------- */
  private startWind() {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const filter = ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = 500; filter.Q.value = 0.8;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
    this.wind = { gain, filter };
  }
  /** 0..1 fall speed */
  setWind(speed: number) {
    if (!this.wind || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.wind.gain.gain.setTargetAtTime(speed * 0.9, t, 0.08);
    this.wind.filter.frequency.setTargetAtTime(300 + speed * 1400, t, 0.1);
  }

  /* ---------- generative pad ---------- */
  private startPad() {
    const ctx = this.ctx!;
    const gain = ctx.createGain(); gain.gain.value = 0.0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
    gain.connect(lp); lp.connect(this.master); lp.connect(this.reverb!);
    const scale = [0, 2, 4, 7, 9, 12, 14, 16]; // major pentatonic
    const base = 220 * Math.pow(2, -12 / 12); // A3 - octave
    let alive = true;
    const voice = (delay: number) => {
      if (!alive) return;
      const deg = scale[Math.floor(Math.random() * scale.length)];
      const freq = base * Math.pow(2, deg / 12) * (Math.random() < 0.3 ? 2 : 1);
      const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = freq;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 1.003;
      const g = ctx.createGain(); g.gain.value = 0;
      o1.connect(g); o2.connect(g); g.connect(gain);
      const t0 = ctx.currentTime + delay, dur = 6 + Math.random() * 6;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.09, t0 + dur * 0.4);
      g.gain.linearRampToValueAtTime(0, t0 + dur);
      o1.start(t0); o2.start(t0); o1.stop(t0 + dur + 0.1); o2.stop(t0 + dur + 0.1);
      setTimeout(() => voice(0), (delay + dur * 0.55) * 1000);
    };
    for (let i = 0; i < 3; i++) voice(i * 2.5);
    this.pad = { gain, stop: () => { alive = false; } };
  }

  /* ---------- nether drone ---------- */
  private startDrone() {
    const ctx = this.ctx!;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 55;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.4;
    const trem = ctx.createOscillator(); trem.frequency.value = 0.13;
    const tg = ctx.createGain(); tg.gain.value = 0.3;
    trem.connect(tg).connect(gain.gain);
    o.connect(lp); o2.connect(lp); lp.connect(gain); gain.connect(this.master); gain.connect(this.reverb!);
    // crackle of lava
    const n = this.noiseSource(); const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 160;
    const ng = ctx.createGain(); ng.gain.value = 0.25; n.connect(nf).connect(ng).connect(gain); n.start();
    o.start(); o2.start(); trem.start();
    this.drone = { gain, stop: () => { o.stop(); o2.stop(); trem.stop(); n.stop(); } };
  }

  setWorld(w: 'overworld' | 'nether') {
    if (!this.ctx || this.world === w) { this.world = w; return; }
    this.world = w;
    const t = this.ctx.currentTime;
    if (w === 'nether') {
      if (!this.drone) this.startDrone();
      this.drone!.gain.gain.setTargetAtTime(0.5, t, 1.5);
      this.pad?.gain.gain.setTargetAtTime(0, t, 1.0);
    } else {
      this.drone?.gain.gain.setTargetAtTime(0, t, 1.0);
      this.pad?.gain.gain.setTargetAtTime(1.0, t, 1.5);
    }
  }
  /** fade the ambient pad in after the landing */
  startAmbience() { if (this.pad && this.ctx) this.pad.gain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 2.0); }

  /* ---------- minecart ---------- */
  private startCart() {
    const ctx = this.ctx!;
    const src = this.noiseSource();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240;
    const gain = ctx.createGain(); gain.gain.value = 0;
    src.connect(lp).connect(gain).connect(this.master); src.start();
    this.cart = { gain, clackTimer: 0, speed: 0 };
  }
  /** speed in blocks per second, called every frame while riding */
  setCart(speed: number, dt: number) {
    if (!this.cart || !this.ctx) return;
    const s = Math.min(1, speed / 14);
    this.cart.speed = s;
    this.cart.gain.gain.setTargetAtTime(s * 0.5, this.ctx.currentTime, 0.1);
    this.cart.clackTimer -= dt * speed;
    if (this.cart.clackTimer <= 0 && speed > 0.5) {
      this.cart.clackTimer = 2.0; // one clack per rail joint
      this.click(0.08 + s * 0.12, 1800 + Math.random() * 400, 0.03);
    }
  }

  /* ---------- one-shots ---------- */
  private click(vol: number, freq: number, dur: number) {
    const ctx = this.ctx!;
    const n = this.noiseSource(false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 1.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur + 0.02);
    n.connect(bp).connect(g).connect(this.master); n.start(); n.stop(ctx.currentTime + dur + 0.05);
  }
  thud(vol = 0.6) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.55);
    this.click(vol * 0.5, 600, 0.12);
  }
  doorCreak() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(190, t); o.frequency.linearRampToValueAtTime(140, t + 0.7);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.8);
    o.connect(lp).connect(g).connect(this.master); g.connect(this.reverb!); o.start(t); o.stop(t + 0.85);
  }
  chainSnap() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // metallic clank
    for (const f of [920, 1380, 2100]) {
      const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f * (0.98 + Math.random() * 0.04);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.06, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(this.master); g.connect(this.reverb!); o.start(t); o.stop(t + 0.4);
    }
    this.thud(0.5);
    this.click(0.3, 3000, 0.08);
  }
  portal() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSource(false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(200, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.6); g.gain.linearRampToValueAtTime(0, t + 1.6);
    n.connect(bp).connect(g).connect(this.master); g.connect(this.reverb!); n.start(t); n.stop(t + 1.7);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(140, t + 1.4);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.25, t); og.gain.linearRampToValueAtTime(0, t + 1.5);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 1.5);
  }
  blip() { if (this.ctx) this.click(0.12, 2600, 0.04); }
}

export const audio = new AudioEngine();
