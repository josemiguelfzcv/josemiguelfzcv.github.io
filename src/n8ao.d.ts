declare module 'n8ao' {
  import * as THREE from 'three';
  import { Pass } from 'postprocessing';
  export class N8AOPostPass extends Pass {
    constructor(scene: THREE.Scene, camera: THREE.Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number; distanceFalloff: number; intensity: number; color: THREE.Color;
      halfRes: boolean; gammaCorrection: boolean; screenSpaceRadius: boolean; aoSamples: number; denoiseSamples: number; denoiseRadius: number;
      renderMode: number; transparencyAware: boolean; depthAwareUpsampling: boolean; biasOffset: number; biasMultiplier: number;
    };
    setSize(w: number, h: number): void;
    dispose(): void;
  }
}
