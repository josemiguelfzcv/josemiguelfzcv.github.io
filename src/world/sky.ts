import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Gradient sky dome with a warm sun glow. Horizon colour = fog colour for a seamless blend. */
export function createSky(sunDir: THREE.Vector3, colors: { zenith: string; horizon: string; glow: string; ground: string }) {
  const uniforms = {
    uSunDir: { value: sunDir.clone().normalize() },
    uZenith: { value: new THREE.Color(colors.zenith) },
    uHorizon: { value: new THREE.Color(colors.horizon) },
    uGlow: { value: new THREE.Color(colors.glow) },
    uGround: { value: new THREE.Color(colors.ground) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uSunDir, uZenith, uHorizon, uGlow, uGround;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        // sky gradient
        float t = smoothstep(-0.05, 0.55, h);
        vec3 col = mix(uHorizon, uZenith, pow(t, 0.7));
        // warm band near the horizon
        float band = exp(-abs(h - 0.02) * 9.0);
        col = mix(col, uGlow, band * 0.55);
        // sun glow
        float s = max(dot(d, uSunDir), 0.0);
        col += uGlow * (pow(s, 6.0) * 0.35 + pow(s, 40.0) * 0.5 + pow(s, 400.0) * 0.5);
        // below horizon
        float g = smoothstep(0.0, -0.25, h);
        col = mix(col, uGround, g);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/** A square sun billboard, extra bright so bloom and god rays pick it up. */
export function createSun(sunDir: THREE.Vector3, distance = 700, size = 48, color = new THREE.Color(4.0, 3.2, 2.0)) {
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(sunDir).normalize().multiplyScalar(distance);
  mesh.lookAt(0, 0, 0);
  mesh.name = 'sun';
  mesh.frustumCulled = false;
  return mesh;
}

/** Flat Minecraft-style clouds: a sheet of rounded blobs made of merged boxes. */
export function createClouds(seedRng: () => number, opts: { y: number; count: number; spread: number; color: string; opacity: number }) {
  const geos: THREE.BufferGeometry[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < opts.count; i++) {
    const cx = (seedRng() - 0.5) * opts.spread, cz = (seedRng() - 0.5) * opts.spread;
    const blobs = 3 + Math.floor(seedRng() * 5);
    for (let b = 0; b < blobs; b++) {
      const w = 8 + seedRng() * 14, d = 6 + seedRng() * 12;
      const ox = (seedRng() - 0.5) * 16, oz = (seedRng() - 0.5) * 12;
      const g = box.clone();
      g.scale(w, 3.5, d);
      g.translate(cx + ox, opts.y + (seedRng() - 0.5) * 1.0, cz + oz);
      geos.push(g);
    }
  }
  const merged = mergeGeometries(geos);
  const mat = new THREE.MeshStandardMaterial({ color: opts.color, transparent: true, opacity: opts.opacity, roughness: 1, metalness: 0, depthWrite: false });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'clouds';
  mesh.frustumCulled = false;
  return mesh;
}

