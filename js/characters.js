// 실제 인체 비율의 리깅 모델 + 모션 캡처 애니메이션 (three.js 예제의 Mixamo 캐릭터).
// 레드: 매트 블랙 실루엣(얼굴 없는 괴도) + 페도라·붉은 스카프 / 관리인: 제복 차림의 인물.
// 모델을 못 불러오면 예전 절차적 인물(Humanoid)로 자동 대체된다.
import { THREE, MAT } from './gfx.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { Humanoid } from './models.js';

const FILES = { red: 'Xbot.glb', guard: 'Soldier.glb' };
const HEIGHT = { red: 1.8, guard: 1.82 };
const src = {};
let ready = null;

function url(name) {
  const embedded = typeof window !== 'undefined' && window.__RED_MODELS && window.__RED_MODELS[name];
  return embedded || `./assets/models/${name}`;
}

export function preloadCharacters() {
  if (ready) return ready;
  const loader = new GLTFLoader();
  ready = Promise.all(Object.entries(FILES).map(([k, f]) => new Promise((res) => {
    loader.load(url(f), (g) => { src[k] = g; res(); }, undefined, (e) => { console.warn('character load failed', f, e); res(); });
  })));
  return ready;
}

export const charactersLoaded = () => !!(src.red && src.guard);

// ---------- 소품 ----------
function fedora() {
  const g = new THREE.Group();
  const felt = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.75, sheen: 0.8, sheenColor: 0x3a3a44 });
  const brimProf = [[0.07, 0.0], [0.17, 0.004], [0.2, 0.014], [0.205, 0.02], [0.17, 0.012], [0.07, 0.008]].map(([r, y]) => new THREE.Vector2(r, y));
  const brim = new THREE.Mesh(new THREE.LatheGeometry(brimProf, 48), felt);
  const prof = [[0, 0.14], [0.05, 0.135], [0.085, 0.122], [0.105, 0.09], [0.112, 0.02], [0.112, 0.0]].map(([r, y]) => new THREE.Vector2(r, y));
  const crown = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), felt);
  crown.scale.set(1, 1, 0.86);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.114, 0.114, 0.026, 48, 1, true), new THREE.MeshPhysicalMaterial({ color: 0x7c0a14, roughness: 0.4, sheen: 1, sheenColor: 0xff6070, side: THREE.DoubleSide }));
  band.scale.z = 0.86;
  band.position.y = 0.022;
  // 가운데가 살짝 패인 정수리
  const dent = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), felt);
  dent.scale.set(1, 0.15, 1.6);
  dent.position.y = 0.128;
  g.add(brim, crown, band, dent);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function scarf() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.03, 16, 40), new THREE.MeshPhysicalMaterial({ color: 0x8a0a16, roughness: 0.6, sheen: 1, sheenColor: 0xff5a6a }));
  m.rotation.x = Math.PI / 2;
  m.scale.set(1, 1.15, 1);
  m.castShadow = true;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.015), m.material);
  tail.position.set(0.04, -0.1, 0.08);
  tail.rotation.set(0.2, 0, -0.15);
  const g = new THREE.Group();
  g.add(m, tail);
  return g;
}

function findBone(root, name) {
  let b = null;
  root.traverse((o) => { if (!b && o.isBone && o.name.replace(/^mixamorig:?/, '') === name) b = o; });
  return b;
}

// ---------- 배우 ----------
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();

export class Actor {
  constructor(kind, { scale = 1 } = {}) {
    this.kind = kind;
    const gltf = src[kind];
    this.group = new THREE.Group();
    const model = cloneSkinned(gltf.scene);
    this.model = model;
    // 키 맞추기
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true); // 스킨 적용 후 실제 크기
    const h = box.max.y - box.min.y || 1;
    const k = (HEIGHT[kind] / h) * scale;
    model.scale.multiplyScalar(k);
    model.position.y -= box.min.y * k;
    this.group.add(model);
    this.mats = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
      if (kind === 'red') {
        // 관절과 몸을 같은 무광 원단으로: 마네킹이 아니라 검은 슈트를 입은 사람처럼
        const joint = /joint/i.test(o.material.name);
        o.material = new THREE.MeshPhysicalMaterial({ color: joint ? 0x0e0e11 : 0x0b0b0d, roughness: 0.82, sheen: 1, sheenColor: 0x5a5a68, sheenRoughness: 0.6 });
      } else {
        const m = o.material.clone();
        if (/visor/i.test(m.name)) {
          m.color = new THREE.Color(0x10141c);
          m.roughness = 0.15;
          m.metalness = 0.6;
        } else {
          m.color = new THREE.Color(0x5d6a8c);
          m.roughness = Math.max(0.55, m.roughness ?? 0.6);
        }
        o.material = m;
      }
      this.mats.push(o.material);
    });
    this.mat = this.mats[0];
    this.bones = {
      head: findBone(model, 'Head'),
      neck: findBone(model, 'Neck'),
      top: findBone(model, 'HeadTop_End'),
      hand: findBone(model, 'RightHand'),
    };
    // 애니메이션
    this.mixer = new THREE.AnimationMixer(model);
    const clips = {};
    for (const c of gltf.animations) clips[c.name.toLowerCase()] = c;
    this.actions = {};
    for (const n of ['idle', 'walk', 'run']) {
      if (!clips[n]) continue;
      const a = this.mixer.clipAction(clips[n]);
      a.play();
      a.setEffectiveWeight(n === 'idle' ? 1 : 0);
      this.actions[n] = a;
    }
    this.w = { idle: 1, walk: 0, run: 0 };
    // 살금 자세(가산 애니메이션)와 끄덕임
    for (const n of ['sneak_pose', 'agree']) {
      if (!clips[n]) continue;
      const c = clips[n].clone();
      THREE.AnimationUtils.makeClipAdditive(c);
      const a = this.mixer.clipAction(c);
      a.blendMode = THREE.AdditiveAnimationBlendMode;
      a.play();
      a.setEffectiveWeight(0);
      this.actions[n] = a;
    }
    this.sneakW = 0;
    // 레드의 모자·스카프
    if (kind === 'red') {
      this.hat = fedora();
      this.scarf = scarf();
      this.group.add(this.hat, this.scarf);
    }
    this.hatLift = 0;
    this.lastT = performance.now();
    this.mixer.update(0);
  }

  hold(obj) {
    if (!this.bones.hand) return;
    this.model.updateMatrixWorld(true);
    this.bones.hand.getWorldScale(_v);
    obj.scale.multiplyScalar(1 / _v.x);
    obj.position.set(0, 0.08 / _v.x, 0.03 / _v.x);
    this.bones.hand.add(obj);
  }

  // mode: idle | walk | sneak | dash, amt: 이동 속도(m/s) / 3.3
  animate(dt, mode, amt = 1) {
    const speed = mode === 'idle' ? 0 : Math.max(0, amt) * 3.3;
    const tw = { idle: 0, walk: 0, run: 0 };
    let ts = 1;
    if (mode === 'dash') { tw.run = 1; ts = 1.55; } else if (speed < 0.12) tw.idle = 1;
    else if (speed < 2.3 || mode === 'sneak') { tw.walk = 1; ts = clampN(speed / (mode === 'sneak' ? 1.15 : 1.45), 0.5, 1.6); } else { tw.run = 1; ts = clampN(speed / 3.6, 0.6, 1.4); }
    const k = Math.min(1, dt * 9);
    for (const n of ['idle', 'walk', 'run']) {
      const a = this.actions[n];
      if (!a) continue;
      this.w[n] += (tw[n] - this.w[n]) * k;
      a.setEffectiveWeight(this.w[n]);
      a.setEffectiveTimeScale(n === 'idle' ? 1 : ts);
    }
    const sn = this.actions.sneak_pose;
    if (sn) {
      this.sneakW += ((mode === 'sneak' ? 1 : 0) - this.sneakW) * k;
      sn.setEffectiveWeight(this.sneakW);
    }
    this.mixer.update(dt);
    this.attach();
  }

  // 모자·스카프를 뼈에 맞춘다 (뼈 크기 보정 없이 루트 기준으로)
  attach() {
    if (!this.hat) return;
    this.group.updateMatrixWorld(true);
    const inv = _m.copy(this.group.matrixWorld).invert();
    const { head, top, neck } = this.bones;
    if (head && top) {
      const pTop = top.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const pHead = head.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      head.getWorldQuaternion(_q);
      const gq = this.group.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.hat.quaternion.copy(gq.multiply(_q));
      const lift = this.hatLift;
      this.hat.position.copy(pHead.lerp(pTop, 0.78)).add(new THREE.Vector3(0, lift * 0.012, 0));
      if (lift) this.hat.rotateZ(-0.3 * Math.min(1, lift / 7));
    }
    if (neck) {
      const pn = neck.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      this.scarf.position.copy(pn).add(new THREE.Vector3(0, -0.015, 0.012));
      this.scarf.rotation.set(0, 0, 0);
      this.scarf.rotation.y = 0;
    }
  }

  // 연출용 호환: 'walk'(위상) · 'stand'(+모자 들기 = 끄덕이며 인사)
  setPose(mode, ph = 0, { hatLift = 0 } = {}) {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastT) / 1000);
    this.lastT = now;
    this.hatLift = hatLift;
    const ag = this.actions.agree;
    if (ag) ag.setEffectiveWeight(hatLift > 0 ? Math.min(1, hatLift / 5) : 0);
    if (mode === 'walk') this.animate(dt, 'walk', 1.35 / 3.3);
    else this.animate(dt, 'idle', 0);
  }

  setOpacity(a) {
    if (a >= 1 && !this.fading) return;
    if (!this.fading) {
      this.fading = true;
      this.group.traverse((o) => {
        if (!o.isMesh) return;
        o.material = o.material.clone();
        o.material.transparent = true;
      });
    }
    this.group.traverse((o) => { if (o.isMesh) o.material.opacity = a; });
  }
}

function clampN(v, a, b) { return v < a ? a : v > b ? b : v; }

// 모델이 있으면 실제 인물, 없으면 절차적 인물
export function makeRed(opts = {}) {
  return src.red ? new Actor('red', opts) : new Humanoid({ scarf: true, ...opts });
}
export function makeGuard(opts = {}) {
  return src.guard ? new Actor('guard', opts) : new Humanoid({ coat: 0x1b2233, hat: 'cap', coatLen: 0.3, ...opts });
}

export { MAT };
