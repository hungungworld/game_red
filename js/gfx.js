// 3D 렌더러, 환경광, 재질, 절차적 텍스처. 모든 장면이 이 렌더러 하나를 공유합니다.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/RoomEnvironment.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';

// 필름 그레인 + 비네트 (출력 직후, sRGB 공간)
const FilmShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.045 }, uVignette: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVignette; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(q * vec2(1.0, 0.9)));
      c.rgb *= mix(1.0, v, uVignette);
      c.rgb += (rnd(vUv * 1000.0) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
};

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
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.45, 0.9);
  film = new ShaderPass(FilmShader);
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(film);
  return renderer;
}

let composer = null;
let renderPass = null;
let bloom = null;
let film = null;
let clock = 0;
export let quality = 'high';
export function setQuality(q) { quality = q; }

export const getEnv = () => env;
export const getAspect = () => W / H;
// 가로 화면(PC): 3D 보석은 왼쪽, 글은 오른쪽 기둥
export const isWide = () => W > 900 && W / H > 1.1;

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
  composer.setPixelRatio(dpr);
  composer.setSize(w, h);
  bloom.resolution.set(w / 2, h / 2);
}

// offsetY > 0 이면 피사체가 화면 위쪽으로 (메뉴 화면에서 위 40%에 보석을 띄울 때)
export function draw(scene, cam, offsetY = 0, offsetX = 0) {
  cam.aspect = W / H;
  if (offsetY || offsetX) cam.setViewOffset(W, H, offsetX * W, offsetY * H, W, H);
  else if (cam.view) cam.clearViewOffset();
  cam.updateProjectionMatrix();
  const fx = scene.userData.fx;
  if (quality === 'low' || !fx) {
    renderer.render(scene, cam);
    return;
  }
  renderPass.scene = scene;
  renderPass.camera = cam;
  bloom.strength = fx.bloom ?? 0.8;
  bloom.threshold = fx.threshold ?? 0.9;
  bloom.radius = fx.radius ?? 0.45;
  bloom.enabled = bloom.strength > 0;
  clock = (clock + 0.017) % 10;
  film.uniforms.uTime.value = clock;
  film.uniforms.uGrain.value = fx.grain ?? 0.045;
  film.uniforms.uVignette.value = fx.vignette ?? 0.35;
  composer.render();
}

// ---------- 재질 ----------
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

export const MAT = {
  gold: () => once('gold', () => new THREE.MeshPhysicalMaterial({ color: COLORS.gold, metalness: 1, roughness: 0.2 })),
  goldSatin: () => once('goldSatin', () => new THREE.MeshPhysicalMaterial({ color: COLORS.gold, metalness: 1, roughness: 0.42 })),
  rose: () => once('rose', () => new THREE.MeshPhysicalMaterial({ color: COLORS.rose, metalness: 1, roughness: 0.2 })),
  white: () => once('white', () => new THREE.MeshPhysicalMaterial({ color: COLORS.white, metalness: 1, roughness: 0.16 })),
  lacquerBlack: () => once('lacquerBlack', () => new THREE.MeshPhysicalMaterial({ color: 0x0a0909, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 })),
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
