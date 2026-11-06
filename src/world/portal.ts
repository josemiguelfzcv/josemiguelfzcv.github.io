import * as THREE from 'three';

/** Swirling purple portal surface (procedural, animated). */
export function createPortalMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColorA: { value: new THREE.Color('#5b1a9e') }, uColorB: { value: new THREE.Color('#d08cff') } },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColorA, uColorB; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 p = vUv * vec2(3.0, 4.5);
        float t = uTime * 0.35;
        float n = noise(p + vec2(t, -t * 0.7)) * 0.6 + noise(p * 2.3 + vec2(-t * 1.3, t)) * 0.3 + noise(p * 5.1 + t) * 0.1;
        // pixelate a little, like block-game particles
        float q = floor(n * 7.0) / 7.0;
        vec3 col = mix(uColorA, uColorB, q);
        float sparkle = step(0.93, noise(floor(vUv * vec2(12.0, 18.0)) + floor(t * 6.0)));
        col += sparkle * 0.8;
        gl_FragColor = vec4(col * 1.6, 0.92);
      }`,
  });
}
