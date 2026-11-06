import * as THREE from 'three';

/** Animated, emissive, slightly pixelated lava surface. */
export function createLavaMaterial(scrollY = 0) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 }, uScroll: { value: scrollY } },
    ]),
    vertexShader: `
      varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uScroll; varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        // pixelate to a 16px-per-block grid for the blocky feel
        vec2 p = floor((vWorld.xz + vec2(0.0, uScroll)) * 8.0) / 8.0;
        float t = uTime * 0.12;
        float n = noise(p * 0.55 + vec2(t, -t * 0.6)) * 0.55 + noise(p * 1.3 + vec2(-t * 0.8, t * 0.5)) * 0.3 + noise(p * 3.1 + t) * 0.15;
        float crust = smoothstep(0.38, 0.6, n);
        vec3 hot = vec3(1.0, 0.42, 0.08) * 1.25;
        vec3 mid = vec3(0.8, 0.2, 0.03) * 0.9;
        vec3 dark = vec3(0.35, 0.08, 0.02);
        vec3 col = mix(hot, mid, crust);
        col = mix(col, dark, smoothstep(0.56, 0.74, n));
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }`,
  });
}
