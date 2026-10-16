// 3D 렌더러, 환경광, 재질, 절차적 텍스처. 모든 장면이 이 렌더러 하나를 공유합니다.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';

export { THREE };

// 회랑 게임 단위(플레이어 키 60) → 미터
export const K = 1 / 33;

export const COLORS = {
  ivory: 0xf6f2eb,
  red: 0xa50f1e,
  gold: 0xe9c27a,
  rose: 0xf0b29a,
  white: 0xe6e6e3,
};

let renderer = null;
let env = null;
let W = 1;
let H = 1;

export function initGfx(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pmrem = new THREE.PMREMGenerator(renderer);
  env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return renderer;
}

export const getEnv = () => env;
export const getAspect = () => W / H;

// 세로 화면에서도 반폭·반높이가 모두 들어오도록 카메라 거리 계산
export function fitDist(cam, halfW, halfH) {
  const t = Math.tan((cam.fov * Math.PI) / 360);
  return Math.max(halfH / t, halfW / (t * (W / H)));
}
export const getRenderer = () => renderer;

export function resizeGfx(w, h, dpr) {
  W = w;
  H = h;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
}

// offsetY > 0 이면 피사체가 화면 위쪽으로 (메뉴 화면에서 위 40%에 보석을 띄울 때)
export function draw(scene, cam, offsetY = 0) {
  cam.aspect = W / H;
  if (offsetY) cam.setViewOffset(W, H, 0, offsetY * H, W, H);
  else if (cam.view) cam.clearViewOffset();
  cam.updateProjectionMatrix();
  renderer.render(scene, cam);
}

// ---------- 재질 ----------
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

export const MAT = {
  gold: () => once('gold', () => new THREE.MeshPhysicalMaterial({ color: COLORS.gold, metalness: 1, roughness: 0.2 })),
  goldSatin: () => once('goldSatin', () => new THREE.MeshPhysicalMaterial({ color: COLORS.gold, metalness: 1, roughness: 0.42 })),
  rose: () => once('rose', () => new THREE.MeshPhysicalMaterial({ color: COLORS.rose, metalness: 1, roughness: 0.2 })),
  white: () => once('white', () => new THREE.MeshPhysicalMaterial({ color: COLORS.white, metalness: 1, roughness: 0.16 })),
  onyx: () => once('onyx', () => new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.08, clearcoat: 1 })),
  emerald: () => once('emerald', () => new THREE.MeshPhysicalMaterial({ color: 0x0b8a4c, roughness: 0.04, clearcoat: 1, emissive: 0x03331b, emissiveIntensity: 0.6 })),
  lacquer: () => once('lacquer', () => new THREE.MeshPhysicalMaterial({ color: 0x5e0610, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.1, envMapIntensity: 0.35 })),
  suit: () => once('suit', () => new THREE.MeshStandardMaterial({ color: 0x0c0c0f, roughness: 0.55, metalness: 0.15 })),
  guard: () => once('guard', () => new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.7 })),
  velvet: () => once('velvet', () => new THREE.MeshPhysicalMaterial({ color: 0x0a0809, roughness: 1, sheen: 0.8, sheenColor: 0x3b2a2e, sheenRoughness: 0.5 })),
  velvetRed: () => once('velvetRed', () => new THREE.MeshPhysicalMaterial({ color: 0x22040a, roughness: 1, sheen: 1, sheenColor: 0x7a1c28, sheenRoughness: 0.45 })),
  suede: () => once('suede', () => new THREE.MeshPhysicalMaterial({ color: 0xf7f3ec, roughness: 1, sheen: 0.4, sheenColor: 0xffffff, envMapIntensity: 0.4 })),
  steel: () => once('steel', () => new THREE.MeshPhysicalMaterial({ color: 0x2a2b30, metalness: 1, roughness: 0.35 })),
  ivoryFloor: () => once('ivoryFloor', () => new THREE.MeshStandardMaterial({ color: COLORS.ivory, roughness: 0.9 })),
};

// ---------- 절차적 텍스처 ----------
function canvasTex(w, h, paint, { repeat, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 4;
  return t;
}

// 대리석: 바탕색 위에 가는 결
export function marbleTex(base, vein, repeat = [1, 1], density = 14) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.01})`;
      const r = Math.random() * 60 + 10;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = vein;
    for (let i = 0; i < density; i++) {
      let x = Math.random() * w;
      let y = Math.random() * h;
      let a = Math.random() * Math.PI * 2;
      g.lineWidth = Math.random() * 1.6 + 0.3;
      g.globalAlpha = Math.random() * 0.5 + 0.2;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 90; k++) {
        a += (Math.random() - 0.5) * 0.6;
        x += Math.cos(a) * 9;
        y += Math.sin(a) * 9;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.globalAlpha = 1;
  }, { repeat });
}

export const glowTex = () => once('glowTex', () => canvasTex(128, 128, (g, w) => {
  const rg = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, w, w);
}));

// 위(1) → 아래(0)로 옅어지는 세로 그라데이션 (빛줄기 원뿔용)
export const fadeTex = () => once('fadeTex', () => canvasTex(4, 128, (g, w, h) => {
  const lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0, 'rgba(255,255,255,0.0)');
  lg.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
}, { srgb: false }));

export function additive(color, opacity, map) {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, map: map || null,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  });
}

// 두 점 사이에 단위 박스를 늘여 놓는 행렬 (InstancedMesh용 금빛 선)
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
export function barMatrix(a, b, t = 0.02, d = t) {
  const dir = _v.subVectors(b, a);
  const len = dir.length();
  _q.setFromUnitVectors(_up, dir.normalize());
  const mid = a.clone().add(b).multiplyScalar(0.5);
  return new THREE.Matrix4().compose(mid, _q.clone(), new THREE.Vector3(t, len, d));
}

export function instanced(geo, mat, matrices) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, matrices.length));
  matrices.forEach((m, i) => im.setMatrixAt(i, m));
  im.count = matrices.length;
  im.instanceMatrix.needsUpdate = true;
  return im;
}

export { _m };
