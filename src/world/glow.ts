import * as THREE from 'three';

/** Soft additive glow sprites (torch flames, lantern halos, glowstone). Flickers gently. */
export function createGlowSprites(points: { x: number; y: number; z: number; size?: number }[], color: string, baseSize = 1.2, intensity = 1.0) {
  const n = points.length;
  const pos = new Float32Array(n * 3), seed = new Float32Array(n), size = new Float32Array(n);
  points.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; seed[i] = (i * 17.3) % 100; size[i] = (p.size ?? 1) * baseSize; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uScale: { value: 1 } },
    vertexShader: `
      attribute float seed; attribute float size; uniform float uTime; uniform float uScale; varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float flick = 0.85 + 0.15 * sin(uTime * 9.0 + seed * 7.0) * sin(uTime * 5.3 + seed * 3.0);
        vF = flick;
        gl_PointSize = size * uScale * 260.0 / max(1.0, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uIntensity; varying float vF;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - r), 2.2);
        gl_FragColor = vec4(uColor * uIntensity * vF * 1.5, a * 0.9);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { points: pts, update(t: number, scale = 1) { mat.uniforms.uTime.value = t; mat.uniforms.uScale.value = scale; } };
}

/** Rising ember particles (lava, fireplaces). */
export function createEmbers(count: number, box: { min: THREE.Vector3; max: THREE.Vector3 }, color = '#ff9a3c', seedRng: () => number) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = THREE.MathUtils.lerp(box.min.x, box.max.x, seedRng());
    pos[i * 3 + 1] = THREE.MathUtils.lerp(box.min.y, box.max.y, seedRng());
    pos[i * 3 + 2] = THREE.MathUtils.lerp(box.min.z, box.max.z, seedRng());
    seed[i] = seedRng() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const h = box.max.y - box.min.y;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uH: { value: h }, uMinY: { value: box.min.y } },
    vertexShader: `
      attribute float seed; uniform float uTime, uH, uMinY; varying float vA;
      void main() {
        vec3 p = position;
        float life = fract(uTime * (0.05 + 0.03 * fract(seed * 0.37)) + seed * 0.013);
        p.y = uMinY + life * uH;
        p.x += sin(uTime * 0.7 + seed) * 0.8 + sin(uTime * 2.1 + seed * 2.0) * 0.2;
        p.z += cos(uTime * 0.6 + seed * 1.7) * 0.8;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (1.0 - life) * smoothstep(0.0, 0.1, life);
        gl_PointSize = clamp(120.0 / max(1.0, -mv.z), 1.5, 7.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.2, r) * vA;
        gl_FragColor = vec4(uColor * 2.2, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { points: pts, update(t: number) { mat.uniforms.uTime.value = t; } };
}
