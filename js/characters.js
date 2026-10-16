// 실제 인체 비율의 리깅 모델 + 모션 캡처 애니메이션 (three.js 예제의 Mixamo 캐릭터).
// 레드: 매트 블랙 실루엣(얼굴 없는 괴도) + 페도라·붉은 스카프 / 관리인: 제복 차림의 인물.
// 모델을 못 불러오면 예전 절차적 인물(Humanoid)로 자동 대체된다.
import { THREE, MAT } from './gfx.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { MeshoptDecoder } from '../vendor/jsm/libs/meshopt_decoder.module.js';
import { Humanoid } from './models.js';

const FILES = { red: 'Gentleman.glb', anim: 'Xbot.glb', guard: 'Soldier.glb' };
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
  loader.setMeshoptDecoder(MeshoptDecoder);
  const all = Promise.all(Object.entries(FILES).map(([k, f]) => new Promise((res) => {
    loader.load(url(f), (g) => { src[k] = g; res(); }, undefined, (e) => { console.warn('character load failed', f, e); res(); });
  })));
  // 느린 환경에서도 멈추지 않게: 8초가 지나면 예전 인물로 시작
  ready = Promise.race([all, new Promise((res) => setTimeout(res, 8000))]);
  return ready;
}

export const charactersLoaded = () => !!(src.red && src.guard);

// 동작 옮기기(리타기팅): 두 골격 모두 T자 기본 자세라는 점을 이용해,
// 원본 뼈가 기본 자세에서 회전한 만큼(월드 기준)을 대상 뼈의 기본 자세에 그대로 적용해 굽는다.
let redClips = null;
const strip = (n) => n.replace(/^mixamorig:?/, '');

function bakeRetarget(srcRoot, tgtRoot, clip, fps = 30) {
  srcRoot.updateMatrixWorld(true);
  tgtRoot.updateMatrixWorld(true);
  const sb = {};
  srcRoot.traverse((o) => { if (o.isBone) sb[strip(o.name)] = o; });
  const tbones = [];
  tgtRoot.traverse((o) => { if (o.isBone) tbones.push(o); });
  const srcBind = {};
  const tgtBind = {};
  for (const n in sb) srcBind[n] = sb[n].getWorldQuaternion(new THREE.Quaternion());
  for (const b of tbones) tgtBind[b.name] = b.getWorldQuaternion(new THREE.Quaternion());
  const sHip = sb.Hips;
  const tHip = tbones.find((b) => b.name === 'Hips');
  const sHip0 = sHip.getWorldPosition(new THREE.Vector3());
  const tHip0 = tHip.getWorldPosition(new THREE.Vector3());
  const ratio = tHip0.y / (sHip0.y || 1);
  const hipParentInv = new THREE.Matrix4().copy(tHip.parent.matrixWorld).invert();
  const staticParent = {};
  for (const b of tbones) if (!b.parent.isBone) staticParent[b.name] = b.parent.getWorldQuaternion(new THREE.Quaternion());

  const mixer = new THREE.AnimationMixer(srcRoot);
  const act = mixer.clipAction(clip);
  act.play();
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const qv = tbones.map(() => new Float32Array(frames * 4));
  const pv = new Float32Array(frames * 3);
  const world = {};
  const tmp = new THREE.Quaternion();
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * clip.duration;
    times[f] = t;
    mixer.setTime(t);
    srcRoot.updateMatrixWorld(true);
    tbones.forEach((b, i) => {
      const s = sb[b.name];
      const parentW = b.parent.isBone ? world[b.parent.name] : staticParent[b.name];
      let w;
      if (s) {
        w = s.getWorldQuaternion(new THREE.Quaternion()).multiply(tmp.copy(srcBind[b.name]).invert()).multiply(tgtBind[b.name]);
      } else {
        w = parentW.clone().multiply(b.quaternion);
      }
      world[b.name] = w;
      const local = parentW.clone().invert().multiply(w);
      local.toArray(qv[i], f * 4);
    });
    const hp = sHip.getWorldPosition(new THREE.Vector3()).sub(sHip0).multiplyScalar(ratio).add(tHip0).applyMatrix4(hipParentInv);
    hp.toArray(pv, f * 3);
  }
  act.stop();
  mixer.uncacheRoot(srcRoot);
  const tracks = tbones.map((b, i) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, qv[i]));
  tracks.push(new THREE.VectorKeyframeTrack(`${tHip.name}.position`, times, pv));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function retargeted() {
  if (redClips) return redClips;
  redClips = src.anim.animations
    .filter((c) => ['idle', 'walk', 'run', 'sneak_pose', 'agree'].includes(c.name))
    .map((c) => bakeRetarget(src.anim.scene, src.red.scene, c));
  // 원본 골격을 기본 자세로 되돌림
  src.anim.scene.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.pose(); });
  return redClips;
}

// ---------- 소품: 흰 실크해트 · 망토 · 외알 안경 · 붉은 넥타이 ----------
const WHITE = () => new THREE.MeshPhysicalMaterial({ color: 0xf2f0ea, roughness: 0.55, sheen: 0.7, sheenColor: 0xffffff, clearcoat: 0.15 });
const RED = () => new THREE.MeshPhysicalMaterial({ color: 0x9a0c1a, roughness: 0.5, sheen: 1, sheenColor: 0xff5566 });

function topHat() {
  const g = new THREE.Group();
  const white = WHITE();
  const brimProf = [[0.08, 0.0], [0.16, 0.003], [0.195, 0.012], [0.203, 0.028], [0.186, 0.021], [0.08, 0.01]].map(([r, y]) => new THREE.Vector2(r, y));
  const brim = new THREE.Mesh(new THREE.LatheGeometry(brimProf, 56), white);
  brim.scale.z = 0.88;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.094, 0.2, 56), white);
  crown.position.y = 0.11;
  crown.scale.z = 0.88;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0965, 0.0955, 0.034, 56, 1, true), RED());
  band.position.y = 0.03;
  band.scale.z = 0.88;
  g.add(brim, crown, band);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function monocle() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0042, 14, 48), MAT.gold());
  const rim2 = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0018, 8, 40), new THREE.MeshPhysicalMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.2 }));
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.028, 40), new THREE.MeshPhysicalMaterial({ color: 0xd8ecff, roughness: 0, transparent: true, opacity: 0.35, envMapIntensity: 2.5, clearcoat: 1 }));
  glass.position.z = 0.001;
  // 안경 아래쪽에서 곧게 늘어진 금 사슬과 작은 루비 장식
  const pts = [new THREE.Vector3(-0.024, -0.018, 0), new THREE.Vector3(-0.034, -0.08, 0.004), new THREE.Vector3(-0.036, -0.15, 0.01)];
  const chain = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.0013, 5), MAT.gold());
  const charm = new THREE.Mesh(new THREE.OctahedronGeometry(0.008), new THREE.MeshPhysicalMaterial({ color: 0xb0101e, roughness: 0.05, clearcoat: 1 }));
  charm.position.copy(pts[2]).add(new THREE.Vector3(0, -0.01, 0));
  charm.scale.y = 1.5;
  g.add(ring, rim2, glass, chain, charm);
  return g;
}

// 모자 아래로 보이는 짙은 갈색 머리 (옆·뒤, 살짝 뻗친 앞머리)
function hair() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x1d1611, roughness: 0.8 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.106, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.6), m);
  cap.scale.set(1.0, 1.0, 1.08);
  cap.rotation.x = -0.3;
  g.add(cap);
  // 뻗친 머리칼: 모자 테 아래로 빙 둘러 바깥·아래로
  const spike = new THREE.ConeGeometry(0.02, 0.085, 6);
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const front = Math.cos(a) > 0.55; // 앞머리
    const t = new THREE.Mesh(spike, m);
    const rr = 0.1;
    t.position.set(Math.sin(a) * rr, front ? -0.005 : -r() * 0.02, Math.cos(a) * rr * 1.05);
    const out = new THREE.Vector3(Math.sin(a), front ? -1.1 : -0.55 - r() * 0.4, Math.cos(a) * (front ? 1.4 : 1)).normalize();
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), out);
    t.rotateY((r() - 0.5) * 0.8);
    t.scale.set(1, front ? 0.55 + r() * 0.25 : 0.9 + r() * 0.5, 0.55);
    g.add(t);
  }
  return g;
}

function necktie() {
  const g = new THREE.Group();
  const red = RED();
  const knot = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.026, 0.02), red);
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.16, 4), red);
  blade.rotation.set(Math.PI, Math.PI / 4, 0);
  blade.scale.set(1, 1, 0.25);
  blade.position.y = -0.09;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.068, 0.014, 10, 32, Math.PI * 1.3), WHITE());
  collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.85 + Math.PI);
  collar.position.set(0, 0.01, -0.07);
  g.add(knot, blade, collar);
  return g;
}

// 망토: 어깨에서 종아리까지, 겉은 흰색 안감은 붉은색. 움직일수록 뒤로 나부낀다.
class Cape {
  constructor() {
    this.cols = 16;
    this.rows = 20;
    const n = (this.cols + 1) * (this.rows + 1);
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const idx = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const a = r * (this.cols + 1) + c;
        const b = a + this.cols + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.setIndex(idx);
    this.geo = geo;
    const outer = new THREE.Mesh(geo, Object.assign(WHITE(), { side: THREE.BackSide }));
    const inner = new THREE.Mesh(geo, Object.assign(RED(), { side: THREE.FrontSide }));
    outer.castShadow = true;
    this.group = new THREE.Group();
    this.group.add(outer, inner);
    for (const m of [outer, inner]) m.frustumCulled = false;
    // 목 뒤로 높이 선 주름 깃
    const cg = new THREE.CylinderGeometry(0.16, 0.115, 0.17, 64, 4, true, Math.PI * 0.42, Math.PI * 1.16);
    const cp = cg.attributes.position;
    for (let k = 0; k < cp.count; k++) {
      const x = cp.getX(k);
      const z = cp.getZ(k);
      const y = cp.getY(k);
      const a = Math.atan2(x, z);
      const f = 1 + Math.sin(a * 14) * 0.05 * (0.5 + (y + 0.08) * 4);
      cp.setXYZ(k, x * f, y, z * f);
    }
    cg.computeVertexNormals();
    const collarOut = new THREE.Mesh(cg, Object.assign(WHITE(), { side: THREE.FrontSide }));
    const collarIn = new THREE.Mesh(cg, Object.assign(RED(), { side: THREE.BackSide }));
    for (const c of [collarOut, collarIn]) { c.position.set(0, 0.06, -0.01); c.castShadow = true; }
    this.group.add(collarOut, collarIn);
    this.t = 0;
    this.sp = 0;
    this.update(0, 0);
  }

  update(dt, speed) {
    this.t += dt;
    this.sp += (speed - this.sp) * Math.min(1, dt * 4);
    const s = Math.min(1.6, this.sp / 3);
    const p = this.pos;
    let i = 0;
    for (let r = 0; r <= this.rows; r++) {
      const v = r / this.rows;
      for (let c = 0; c <= this.cols; c++) {
        const u = c / this.cols;
        const th = (u - 0.5) * Math.PI * 0.9;
        const rad = 0.15 + v * 0.13;
        let x = Math.sin(th) * rad * 1.25;
        let z = -Math.cos(th) * rad * 0.62 - 0.05;
        // 움직일수록 뒤로 들려 흘러가는 각도
        const lift = Math.min(1.1, 0.08 + s * 0.6) * Math.pow(v, 1.2);
        const len = v * 1.02;
        let y = -len * Math.cos(lift);
        z -= len * Math.sin(lift);
        x *= 1 - s * 0.18 * v;
        z += Math.sin(this.t * (5 + s * 4) - v * 4.5 + u * 3.2) * 0.03 * v * (0.35 + s);
        x += Math.sin(this.t * 3.1 + v * 3) * 0.012 * v * (0.3 + s);
        p[i++] = x;
        p[i++] = y;
        p[i++] = z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
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
        const n = o.material.name;
        if (/Headwear|Beard/i.test(n)) { o.visible = false; return; }
        if (/Outfit_(Top|Bottom)/i.test(n)) {
          // 흰 정장
          o.material = new THREE.MeshPhysicalMaterial({ color: 0xf1efe9, roughness: 0.6, sheen: 0.8, sheenColor: 0xffffff, sheenRoughness: 0.5, normalMap: o.material.normalMap || null });
        } else if (/Footwear/i.test(n)) {
          o.material = new THREE.MeshPhysicalMaterial({ color: 0xf4f2ee, roughness: 0.3, clearcoat: 0.8 });
        } else o.material = o.material.clone();
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
      spine: findBone(model, 'Spine2'),
      hand: findBone(model, 'RightHand'),
    };
    // 애니메이션
    this.mixer = new THREE.AnimationMixer(model);
    const clips = {};
    for (const c of kind === 'red' ? retargeted() : gltf.animations) clips[c.name.toLowerCase()] = c;
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
      this.hat = topHat();
      this.mono = monocle();
      this.hair = hair();
      this.cape = new Cape();
      this.group.add(this.hat, this.mono, this.hair, this.cape.group);
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
    if (this.cape) this.cape.update(dt, mode === 'dash' ? 7 : speed);
    this.attach();
  }

  // 모자·외알 안경·넥타이·망토를 뼈에 맞춘다 (루트 기준 좌표)
  attach() {
    if (!this.hat) return;
    this.group.updateMatrixWorld(true);
    const inv = _m.copy(this.group.matrixWorld).invert();
    const gq = this.group.getWorldQuaternion(new THREE.Quaternion()).invert();
    const { head, top, neck, spine } = this.bones;
    if (head && top) {
      const pTop = top.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const pHead = head.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const qh = gq.clone().multiply(head.getWorldQuaternion(_q));
      const lift = this.hatLift;
      this.hat.quaternion.copy(qh);
      this.hat.position.copy(pHead.clone().lerp(pTop, 0.6)).add(new THREE.Vector3(0.012, lift * 0.014, 0.012).applyQuaternion(qh));
      // 챙을 눈썹까지 눌러쓰고 살짝 비스듬히
      this.hat.rotateX(0.2 - Math.min(1, lift / 7) * 0.35);
      this.hat.rotateZ(-0.13);
      if (this.hair) {
        this.hair.quaternion.copy(qh);
        this.hair.position.copy(pHead).add(new THREE.Vector3(0, 0.1, -0.012).applyQuaternion(qh));
      }
      this.mono.quaternion.copy(qh);
      this.mono.position.copy(pHead).add(new THREE.Vector3(-0.036, 0.073, 0.098).applyQuaternion(qh));
    }
    if (neck && spine) {
      const pn = neck.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
      const qs = gq.clone().multiply(spine.getWorldQuaternion(_q));
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(qs);
      const yaw = Math.atan2(fwd.x, fwd.z);
      this.cape.group.position.copy(pn).add(new THREE.Vector3(0, -0.02, 0));
      this.cape.group.rotation.set(0, yaw, 0);
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
  return src.red ? new Actor('red', opts) : new Humanoid({ scarf: true, coat: 0xeeece6, ...opts });
}
export function makeGuard(opts = {}) {
  return src.guard ? new Actor('guard', opts) : new Humanoid({ coat: 0x1b2233, hat: 'cap', coatLen: 0.3, ...opts });
}

export { MAT };
