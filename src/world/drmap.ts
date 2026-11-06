import * as THREE from 'three';

// Rough outline of Hispaniola (lon, lat), clockwise from Haiti's north-west peninsula.
const HISPANIOLA: [number, number][] = [
  [-73.4, 19.9], [-72.8, 19.95], [-72.3, 19.8], [-71.75, 19.7], [-71.3, 19.85], [-70.9, 19.9], [-70.5, 19.75], [-70.0, 19.7],
  [-69.7, 19.4], [-69.3, 19.35], [-69.15, 19.2], [-69.4, 19.05], [-69.7, 19.05], [-69.4, 18.95], [-69.0, 19.0], [-68.6, 18.8],
  [-68.35, 18.6], [-68.45, 18.35], [-68.7, 18.2], [-69.0, 18.4], [-69.4, 18.42], [-69.9, 18.45], [-70.2, 18.25], [-70.5, 18.2],
  [-70.75, 18.3], [-71.0, 18.3], [-71.1, 18.2], [-71.2, 17.9], [-71.4, 17.6], [-71.7, 17.75], [-71.75, 18.03],
  [-72.0, 18.2], [-72.5, 18.2], [-73.0, 18.25], [-73.8, 18.05], [-74.4, 18.3], [-74.2, 18.6], [-73.6, 18.5], [-73.2, 18.5],
  [-72.7, 18.55], [-72.6, 18.9], [-72.75, 19.4], [-73.0, 19.6],
];
// Haiti/DR border, north to south
const BORDER: [number, number][] = [[-71.75, 19.7], [-71.7, 19.4], [-71.65, 19.1], [-71.8, 18.85], [-71.7, 18.6], [-71.65, 18.35], [-71.75, 18.03]];
const BARAHONA: [number, number] = [-71.1, 18.2];

export function createDRMapTexture(): THREE.CanvasTexture {
  const W = 96, Hh = 64;
  const small = document.createElement('canvas'); small.width = W; small.height = Hh;
  const c = small.getContext('2d')!;
  // parchment
  c.fillStyle = '#d9c39a'; c.fillRect(0, 0, W, Hh);
  for (let i = 0; i < 400; i++) { c.fillStyle = Math.random() < 0.5 ? '#cfb68c' : '#e3d0ad'; c.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * Hh), 1, 1); }
  c.fillStyle = '#7a5a36'; c.fillRect(0, 0, W, 2); c.fillRect(0, Hh - 2, W, 2); c.fillRect(0, 0, 2, Hh); c.fillRect(W - 2, 0, 2, Hh);
  // sea
  c.fillStyle = '#8fb6c9'; c.fillRect(4, 4, W - 8, Hh - 8);
  const sx = (lon: number) => 6 + ((lon + 74.6) / (74.6 - 68.0)) * (W - 12);
  const sy = (lat: number) => Hh - 8 - ((lat - 17.4) / (20.2 - 17.4)) * (Hh - 16);
  const poly = (pts: [number, number][]) => { c.beginPath(); pts.forEach(([lo, la], i) => (i ? c.lineTo(sx(lo), sy(la)) : c.moveTo(sx(lo), sy(la)))); c.closePath(); };
  // island
  poly(HISPANIOLA); c.fillStyle = '#9fb46a'; c.fill();
  // DR = island clipped east of the border
  c.save();
  poly(HISPANIOLA); c.clip();
  c.beginPath();
  c.moveTo(sx(BORDER[0][0]), sy(BORDER[0][1]));
  for (const [lo, la] of BORDER) c.lineTo(sx(lo), sy(la));
  c.lineTo(W, Hh); c.lineTo(W, 0); c.closePath();
  c.fillStyle = '#6fae5a'; c.fill();
  c.restore();
  // coast outline
  poly(HISPANIOLA); c.strokeStyle = '#3d5a3a'; c.lineWidth = 1; c.stroke();
  // Barahona marker
  const bx = Math.round(sx(BARAHONA[0])), by = Math.round(sy(BARAHONA[1]));
  c.fillStyle = '#d93b2b'; c.fillRect(bx - 1, by - 1, 3, 3); c.fillStyle = '#ffd1c6'; c.fillRect(bx, by, 1, 1);
  const big = document.createElement('canvas'); big.width = W * 6; big.height = Hh * 6;
  const bc = big.getContext('2d')!;
  bc.imageSmoothingEnabled = false;
  bc.drawImage(small, 0, 0, big.width, big.height);
  // labels at full resolution
  bc.fillStyle = '#2b1d10';
  bc.font = '700 30px "Pixelify Sans", monospace';
  bc.textAlign = 'center';
  bc.fillText('REPÚBLICA DOMINICANA', big.width / 2, 48);
  bc.font = '700 26px "Pixelify Sans", monospace';
  bc.textAlign = 'left';
  bc.fillStyle = '#7a1e14';
  bc.fillText('★ BARAHONA', bx * 6 + 14, by * 6 + 34);
  bc.font = '18px "Pixelify Sans", monospace';
  bc.fillStyle = '#2b1d10';
  bc.textAlign = 'right';
  bc.fillText('18.2° N · 71.1° W', big.width - 30, big.height - 26);
  const tex = new THREE.CanvasTexture(big);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  return tex;
}
