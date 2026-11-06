import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, BloomEffect, GodRaysEffect, VignetteEffect, NoiseEffect,
  ToneMappingEffect, ToneMappingMode, BlendFunction, KernelSize, SMAAEffect, SMAAPreset, EdgeDetectionMode,
} from 'postprocessing';
import { sharedUniforms } from './voxelMaterial';
import { N8AOPostPass } from 'n8ao';

export type Quality = 'high' | 'medium' | 'low';

export function detectQuality(): Quality {
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);
  const mem = (navigator as any).deviceMemory as number | undefined;
  if (mobile) return 'low';
  if (mem && mem <= 4) return 'medium';
  if (window.innerWidth * window.innerHeight > 2_600_000) return 'medium';
  return 'high';
}

export interface SceneBundle {
  scene: THREE.Scene;
  /** optional sun mesh for god rays */
  sun?: THREE.Mesh;
  /** per-frame hook */
  update?: (dt: number, t: number) => void;
  /** called when this scene becomes active */
  onEnter?: () => void;
  onLeave?: () => void;
  /** post-processing flavour */
  post: { bloom: number; threshold: number; vignette: number; noise: number; godRays: boolean; exposure: number };
}

export class Experience {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  clock = new THREE.Clock();
  quality: Quality;
  active: SceneBundle | null = null;
  private renderPass: RenderPass;
  private effectPass: EffectPass | null = null;
  private bloom!: BloomEffect;
  private vignette!: VignetteEffect;
  private noise!: NoiseEffect;
  private tone!: ToneMappingEffect;
  private smaa!: SMAAEffect;
  private godRays: GodRaysEffect | null = null;
  onFrame: ((dt: number, t: number) => void)[] = [];
  paused = false;
  /** optional fixed clear scene */
  private emptyScene = new THREE.Scene();
  private ao: N8AOPostPass | null = null;
  ssao: boolean;

  constructor(public canvas: HTMLCanvasElement, quality?: Quality, opts: { ssao?: boolean } = {}) {
    this.quality = quality ?? detectQuality();
    this.ssao = !!opts.ssao && this.quality !== 'low';
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false,
    });
    const pr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.75 : this.quality === 'medium' ? 1.25 : 1.0);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: this.quality === 'high' && !this.ssao ? 4 : 0,
    });
    this.renderPass = new RenderPass(this.emptyScene, this.camera);
    this.composer.addPass(this.renderPass);

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.ao?.setSize(w, h);
  }

  setScene(bundle: SceneBundle) {
    if (this.active === bundle) return;
    this.active?.onLeave?.();
    this.active = bundle;
    this.renderPass.mainScene = bundle.scene;
    this.rebuildEffects(bundle);
    bundle.onEnter?.();
  }

  private rebuildEffects(b: SceneBundle) {
    if (this.effectPass) { this.composer.removePass(this.effectPass); this.effectPass.dispose(); this.effectPass = null; }
    if (this.ao) { this.composer.removePass(this.ao); this.ao.dispose(); this.ao = null; }
    this.godRays?.dispose();
    this.godRays = null;
    if (this.ssao) {
      const ao = new N8AOPostPass(b.scene, this.camera, window.innerWidth, window.innerHeight);
      ao.configuration.aoRadius = 2.2;
      ao.configuration.distanceFalloff = 1.0;
      ao.configuration.intensity = 3.0;
      ao.configuration.halfRes = this.quality !== 'high';
      ao.configuration.gammaCorrection = false;
      ao.configuration.color = new THREE.Color(0, 0, 0);
      ao.configuration.screenSpaceRadius = false;
      this.composer.addPass(ao);
      this.ao = ao;
    }
    const effects: any[] = [];
    if (b.post.godRays && b.sun && this.quality !== 'low') {
      this.godRays = new GodRaysEffect(this.camera, b.sun, {
        height: this.quality === 'high' ? 480 : 320,
        kernelSize: KernelSize.SMALL,
        density: 0.96, decay: 0.93, weight: 0.35, exposure: 0.55, samples: this.quality === 'high' ? 60 : 32, clampMax: 1.0,
        blendFunction: BlendFunction.SCREEN,
      });
      effects.push(this.godRays);
    }
    this.bloom = new BloomEffect({
      luminanceThreshold: b.post.threshold, luminanceSmoothing: 0.25, intensity: b.post.bloom,
      mipmapBlur: true, radius: 0.7, levels: this.quality === 'low' ? 5 : 7,
    });
    effects.push(this.bloom);
    this.tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
    effects.push(this.tone);
    this.vignette = new VignetteEffect({ darkness: b.post.vignette, offset: 0.3 });
    effects.push(this.vignette);
    this.noise = new NoiseEffect({ blendFunction: BlendFunction.SOFT_LIGHT, premultiply: true });
    this.noise.blendMode.opacity.value = b.post.noise;
    effects.push(this.noise);
    if (this.quality !== 'high' || this.ssao) {
      this.smaa = new SMAAEffect({ preset: this.quality === 'high' ? SMAAPreset.HIGH : SMAAPreset.MEDIUM, edgeDetectionMode: EdgeDetectionMode.COLOR });
      effects.push(this.smaa);
    }
    this.effectPass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(this.effectPass);
    this.renderer.toneMappingExposure = b.post.exposure;
  }

  start() {
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    sharedUniforms.uTime.value = t;
    if (this.paused) return;
    for (const f of this.onFrame) f(dt, t);
    this.active?.update?.(dt, t);
    this.composer.render(dt);
  }
}
