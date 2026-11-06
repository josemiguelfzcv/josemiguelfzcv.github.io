import * as THREE from 'three';
import type { HDAtlas } from './texturesHD';

export interface VoxelMaterialOpts {
  atlas: THREE.DataArrayTexture;
  /** optional PBR maps (normal + occlusion/roughness/metalness) for the realistic look */
  hd?: HDAtlas;
  transparent?: boolean;
  alphaTest?: number;
  /** ambient multiplier where sky light is 0 (caves/interiors) */
  ambientFloor?: number;
  doubleSide?: boolean;
  /** strength of baked block light glow */
  glow?: number;
}

export const sharedUniforms = {
  uTime: { value: 0 },
};

const dummy = (r: number, g: number, b: number) => {
  const t = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
};

/**
 * MeshStandardMaterial patched to:
 *  - sample texture arrays by per-vertex tile index (albedo, and optionally normal + ORM)
 *  - multiply by per-vertex AO/shade (vertex colors)
 *  - add baked block light as emissive
 *  - scale ambient light by baked sky light
 *  - sway leaves/grass with time
 */
export function createVoxelMaterial(o: VoxelMaterialOpts): THREE.MeshStandardMaterial {
  const hd = !!o.hd;
  const mat = new THREE.MeshStandardMaterial({
    map: dummy(255, 255, 255),
    vertexColors: true,
    roughness: hd ? 1.0 : 0.95,
    metalness: hd ? 1.0 : 0.0,
    transparent: !!o.transparent,
    alphaTest: o.alphaTest ?? 0,
    side: o.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: !o.transparent,
  });
  if (hd) {
    mat.normalMap = dummy(128, 128, 255);
    mat.normalScale = new THREE.Vector2(1, 1);
    mat.roughnessMap = dummy(255, 255, 255);
    mat.metalnessMap = dummy(255, 255, 255);
    mat.aoMap = dummy(255, 255, 255);
    mat.aoMap.channel = 0;
    mat.aoMapIntensity = 0.9;
  }
  const ambientFloor = o.ambientFloor ?? 0.18;
  const glow = o.glow ?? 1.0;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tileMap = { value: o.hd ? o.hd.albedo : o.atlas };
    shader.uniforms.uTime = sharedUniforms.uTime;
    shader.uniforms.uAmbientFloor = { value: ambientFloor };
    shader.uniforms.uGlow = { value: glow };
    if (o.hd) {
      shader.uniforms.normalArray = { value: o.hd.normal };
      shader.uniforms.ormArray = { value: o.hd.orm };
    }

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float tile; attribute vec3 blight; attribute float sky; attribute float sway;
        varying float vTile; varying vec3 vBlight; varying float vSky;
        uniform float uTime;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTile = tile; vBlight = blight; vSky = sky;
        if (sway > 0.0) {
          float ph = uTime * 1.4 + position.x * 0.45 + position.z * 0.35 + position.y * 0.2;
          float w = (sin(ph) * 0.5 + sin(ph * 2.3 + 1.0) * 0.25) * 0.09 * sway;
          transformed.x += w; transformed.z += w * 0.5;
        }`);

    let fs = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler2DArray tileMap; uniform float uAmbientFloor; uniform float uGlow;
        ${o.hd ? 'uniform highp sampler2DArray normalArray; uniform highp sampler2DArray ormArray;' : ''}
        varying float vTile; varying vec3 vBlight; varying float vSky;`)
      .replace('#include <map_fragment>', `
        vec4 sampledDiffuseColor = texture(tileMap, vec3(vMapUv, vTile));
        diffuseColor *= sampledDiffuseColor;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vBlight * uGlow;`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        float skyK = mix(uAmbientFloor, 1.0, vSky);
        irradiance *= skyK; iblIrradiance *= skyK;`);
    if (o.hd) {
      // onBeforeCompile runs before #include resolution, so replace the whole chunks
      fs = fs
        .replace('#include <normal_fragment_maps>', `
          vec3 mapN = texture( normalArray, vec3( vNormalMapUv, vTile ) ).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          normal = normalize( tbn * mapN );`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness * texture( ormArray, vec3( vRoughnessMapUv, vTile ) ).g;`)
        .replace('#include <metalnessmap_fragment>', `
          float metalnessFactor = metalness * texture( ormArray, vec3( vMetalnessMapUv, vTile ) ).b;`)
        .replace('#include <aomap_fragment>', `
          float ambientOcclusion = ( texture( ormArray, vec3( vAoMapUv, vTile ) ).r - 1.0 ) * aoMapIntensity + 1.0;
          reflectedLight.indirectDiffuse *= ambientOcclusion;`);
    }
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => `voxel-${hd ? 'hd' : 'px'}-${ambientFloor}-${glow}-${o.transparent ? 1 : 0}-${o.alphaTest ?? 0}`;
  return mat;
}

/** Depth material for shadow casting that respects the array-texture alpha (for cutout geometry). */
export function createVoxelDepthMaterial(atlas: THREE.DataArrayTexture, alphaTest = 0.5) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tileMap = { value: atlas };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float tile; varying float vTile; varying vec2 vUvA;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vTile = tile; vUvA = uv;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform highp sampler2DArray tileMap; varying float vTile; varying vec2 vUvA;`)
      .replace('#include <alphatest_fragment>', `
        float a = texture(tileMap, vec3(vUvA, vTile)).a;
        if (a < ${alphaTest.toFixed(2)}) discard;`);
  };
  mat.customProgramCacheKey = () => 'voxel-depth';
  return mat;
}
