import * as THREE from 'three';

/** Low, slow-drifting ground mist over the lake and lawn (two translucent noise layers). */
export function createMist(center: THREE.Vector3, size: [number, number], color = '#ffe6c8') {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0); vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vWorld.xz * 0.045;
        float t = uTime * 0.02;
        float n = noise(p + vec2(t, -t * 0.6)) * 0.5 + noise(p * 2.1 + vec2(-t * 1.4, t * 0.8)) * 0.3 + noise(p * 4.3 + t) * 0.2;
        float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.75, vUv.y);
        float a = smoothstep(0.42, 0.75, n) * 0.28 * edge;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
      }`,
  });
  const group = new THREE.Group();
  for (const [dy, scale] of [[0, 1], [0.7, 0.8]] as [number, number][]) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size[0] * scale, size[1] * scale), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(center.x, center.y + dy, center.z);
    mesh.renderOrder = 4;
    group.add(mesh);
  }
  return { group, update(t: number) { uniforms.uTime.value = t; } };
}
