// 3D 모델: 레드(와 관리인), 컬렉션 피스 5종, 레드 박스, 샹들리에, 방문 카드
import { THREE, MAT, glowTex } from './gfx.js';
import { drawCard } from './figures.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

// ---------- 인물 (레드 · 관리인) ----------
// 키 약 1.8m. 루트는 바닥, +z 방향을 바라본다. 코트는 선반(lathe) 실루엣.
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);

function coatGeo(len) {
  const pts = [[0, 0.64], [0.12, 0.66], [0.2, 0.6], [0.205, 0.45], [0.18, 0.25], [0.165, 0.08], [0.19, -0.1], [0.23, -len + 0.06], [0.235, -len], [0, -len]];
  const g = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 28);
  g.scale(1, 1, 0.68);
  return g;
}

export class Humanoid {
  constructor({ coat = 0x0b0b0e, hat = 'fedora', scarf = false, scale = 1, coatLen = 0.46, material } = {}) {
    const coatMat = material || new THREE.MeshPhysicalMaterial({ color: coat, roughness: 0.62, sheen: 0.6, sheenColor: 0x444455, clearcoat: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.45, metalness: 0.2 });
    const skin = new THREE.MeshStandardMaterial({ color: 0x3b2b24, roughness: 0.7 });
    this.mats = [coatMat, dark, skin];
    this.mat = coatMat;
    const g = new THREE.Group();
    this.group = g;
    const root = new THREE.Group();
    root.scale.setScalar(scale);
    g.add(root);
    this.root = root;
    const hips = new THREE.Group();
    hips.position.y = 0.95;
    root.add(hips);
    this.hips = hips;
    // 다리
    this.legs = [-1, 1].map((sx) => {
      const thigh = new THREE.Group();
      thigh.position.set(sx * 0.1, 0, 0);
      const t = new THREE.Mesh(cap(0.075, 0.34), dark);
      t.position.y = -0.22;
      thigh.add(t);
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      thigh.add(knee);
      const sh = new THREE.Mesh(cap(0.062, 0.36), dark);
      sh.position.y = -0.23;
      knee.add(sh);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.07, 0.24), MAT.onyx());
      shoe.position.set(0, -0.46, 0.05);
      knee.add(shoe);
      hips.add(thigh);
      return { thigh, knee };
    });
    // 몸통
    const torso = new THREE.Group();
    hips.add(torso);
    this.torso = torso;
    const body = new THREE.Mesh(coatGeo(coatLen), coatMat);
    torso.add(body);
    this.coat = body;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 20), scarf ? new THREE.MeshPhysicalMaterial({ color: 0x8a0a16, roughness: 0.55, sheen: 1, sheenColor: 0xff5060 }) : coatMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.66;
    torso.add(collar);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), skin);
    head.position.y = 0.8;
    head.scale.set(0.95, 1.08, 1);
    torso.add(head);
    this.head = head;
    // 모자
    const hatG = new THREE.Group();
    hatG.position.y = 0.87;
    if (hat === 'cap') {
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.112, 0.09, 24), coatMat);
      crown.position.y = 0.03;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.115, 0.03, 24), coatMat);
      top.position.y = 0.085;
      const bill = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 20, 1, false, -Math.PI / 2, Math.PI), MAT.onyx());
      bill.position.set(0, -0.005, 0.06);
      const badge = new THREE.Mesh(new THREE.CircleGeometry(0.022, 12), MAT.gold());
      badge.position.set(0, 0.04, 0.114);
      hatG.add(crown, top, bill, badge);
    } else {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.012, 32), dark);
      const prof = [[0, 0.15], [0.07, 0.15], [0.105, 0.12], [0.115, 0.0], [0, 0]].map(([r, y]) => new THREE.Vector2(r, y));
      const crown = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), dark);
      crown.scale.z = 0.9;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.117, 0.117, 0.03, 24), scarf ? new THREE.MeshStandardMaterial({ color: 0x8a0a16, roughness: 0.5 }) : MAT.onyx());
      band.position.y = 0.02;
      hatG.add(brim, crown, band);
      hatG.rotation.x = -0.08;
    }
    torso.add(hatG);
    this.hat = hatG;
    // 팔
    this.arms = [-1, 1].map((sx) => {
      const sh = new THREE.Group();
      sh.position.set(sx * 0.2, 0.58, 0);
      const up = new THREE.Mesh(cap(0.058, 0.24), coatMat);
      up.position.y = -0.15;
      sh.add(up);
      const el = new THREE.Group();
      el.position.y = -0.3;
      sh.add(el);
      const fo = new THREE.Mesh(cap(0.05, 0.22), coatMat);
      fo.position.y = -0.13;
      el.add(fo);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), dark);
      hand.position.y = -0.29;
      el.add(hand);
      torso.add(sh);
      return { sh, el, hand };
    });
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.ph = 0;
    this.blend = 0;
    this.setPose('stand', 0);
  }

  // 손에 물건 들기 (관리인 손전등)
  hold(obj) { this.arms[1].hand.add(obj); }

  // mode: idle | walk | sneak | dash, amt: 0..1 이동량
  animate(dt, mode, amt = 1) {
    const rate = mode === 'dash' ? 16 : mode === 'sneak' ? 7 : 9.5;
    this.ph += dt * rate * Math.max(0.15, amt);
    const s = Math.sin(this.ph);
    const c = Math.cos(this.ph);
    const k = mode === 'idle' ? 0 : amt;
    const crouch = mode === 'sneak' ? 1 : 0;
    this.blend += (crouch - this.blend) * Math.min(1, dt * 8);
    const b = this.blend;
    const stride = (mode === 'dash' ? 0.9 : mode === 'sneak' ? 0.45 : 0.62) * k;
    this.hips.position.y = 0.95 - b * 0.2 + Math.abs(c) * 0.03 * k;
    this.torso.rotation.x = b * 0.42 + (mode === 'dash' ? 0.38 : 0.06 * k);
    this.legs.forEach(({ thigh, knee }, i) => {
      const ss = i ? -s : s;
      thigh.rotation.x = -ss * stride - b * 0.75;
      knee.rotation.x = Math.max(0, ss) * stride * 1.3 + b * 1.15 + 0.05;
    });
    this.arms.forEach(({ sh, el }, i) => {
      const ss = i ? s : -s;
      sh.rotation.x = -ss * stride * 0.8 - b * 0.3;
      sh.rotation.z = (i ? -1 : 1) * 0.06;
      el.rotation.x = -0.25 - k * 0.3 - b * 0.4;
    });
    this.head.rotation.x = -b * 0.3;
    this.hat.position.y = 0.87;
    this.hat.rotation.z = 0;
    if (mode === 'idle') this.hips.position.y += Math.sin(this.ph * 0.25) * 0.004;
  }

  // 연출용: 'walk'(위상 지정) · 'stand'(+모자 들기)
  setPose(mode, ph = 0, { hatLift = 0 } = {}) {
    if (mode === 'walk') {
      this.ph = ph;
      this.animate(0, 'walk', 1);
      return;
    }
    this.blend = 0;
    this.animate(0, 'idle', 0);
    if (hatLift > 0) {
      const u = Math.min(1, hatLift / 7);
      const arm = this.arms[1];
      arm.sh.rotation.x = -2.6 * u;
      arm.sh.rotation.z = -0.25 * u;
      arm.el.rotation.x = -0.9 * u;
      this.hat.position.y = 0.87 + 0.1 * u;
      this.hat.rotation.z = -0.35 * u;
      this.torso.rotation.x = 0.15 * u;
    }
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

// ---------- 컬렉션 피스 (지름 약 1) ----------
// 경로를 따라 단면을 쓸어 만드는 범용 형상. frame(u) -> {p, n, b}, profile(v) -> [n방향, b방향]
function sweep(N, M, frame, profile, closed = true) {
  const pos = [];
  const uvs = [];
  const idx = [];
  const rows = closed ? N : N + 1;
  for (let i = 0; i < rows; i++) {
    const u = i / N;
    const { p, n, b } = frame(u);
    for (let j = 0; j < M; j++) {
      const [a, c] = profile(j / M, u);
      pos.push(p.x + n.x * a + b.x * c, p.y + n.y * a + b.y * c, p.z + n.z * a + b.z * c);
      uvs.push(u, j / M);
    }
  }
  for (let i = 0; i < N; i++) {
    const i2 = closed ? (i + 1) % N : i + 1;
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M;
      const a = i * M + j;
      const b2 = i2 * M + j;
      const c = i2 * M + j2;
      const d = i * M + j2;
      idx.push(a, b2, d, b2, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 둥근 사각 단면 (반폭 w, 반두께 h, 모서리 r)
function roundRect(w, h, r) {
  const pts = [];
  const seg = 6;
  const corners = [[h - r, w - r, 0], [-(h - r), w - r, Math.PI / 2], [-(h - r), -(w - r), Math.PI], [h - r, -(w - r), Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) {
    for (let k = 0; k <= seg; k++) {
      const a = a0 + (k / seg) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return (v) => pts[Math.min(pts.length - 1, Math.floor(v * pts.length))];
}

function screwHead(mat, r = 0.035) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, r * 0.32, 32), mat);
  head.rotation.x = Math.PI / 2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.98, 24, 8, 0, Math.PI * 2, 0, Math.PI * 0.18), mat);
  dome.rotation.x = Math.PI / 2;
  dome.position.z = -r * 0.82;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(r * 1.6, r * 0.2, r * 0.12), MAT.onyx());
  slot.position.z = r * 0.17;
  slot.rotation.z = 0.7;
  g.add(head, slot);
  return g;
}

function loveBracelet() {
  const g = new THREE.Group();
  const A = 0.46;
  const B = 0.39;
  const T = 0.024;
  const W = 0.068;
  const frame = (u) => {
    const t = u * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(t) * A, Math.sin(t) * B, 0);
    const n = new THREE.Vector3(Math.cos(t) / A, Math.sin(t) / B, 0).normalize();
    return { p, n, b: new THREE.Vector3(0, 0, 1) };
  };
  const band = new THREE.Mesh(sweep(240, 28, frame, roundRect(W, T, 0.018)), MAT.gold());
  g.add(band);
  // 가장자리를 따라 가는 홈 두 줄
  for (const z of [-W * 0.72, W * 0.72]) {
    const line = new THREE.Mesh(sweep(240, 8, frame, (v) => [T + Math.cos(v * Math.PI * 2) * 0.002, z + Math.sin(v * Math.PI * 2) * 0.002]), MAT.goldSatin());
    g.add(line);
  }
  for (let k = 0; k < 10; k++) {
    const { p, n } = frame(k / 10 + 0.05);
    const sc = screwHead(MAT.gold(), 0.024);
    sc.position.copy(p).addScaledVector(n, T - 0.002);
    sc.lookAt(sc.position.clone().add(n));
    g.add(sc);
  }
  g.rotation.set(-0.55, 0.35, 0);
  return g;
}

// 세 링이 서로를 하나씩 통과하는 배치 (중심 오프셋 0.5R, 관 두께 < 0.14R 이면 닿지 않음)
function trinityRing() {
  const g = new THREE.Group();
  const R = 0.29;
  const t = 0.034;
  const o = R * 0.5;
  const geo = new THREE.TorusGeometry(R, t, 48, 220);
  const a = new THREE.Mesh(geo, MAT.rose());
  a.position.set(o, 0, 0);
  const b = new THREE.Mesh(geo, MAT.gold());
  b.rotation.y = Math.PI / 2;
  b.position.set(0, o, 0);
  const c = new THREE.Mesh(geo, MAT.white());
  c.rotation.x = Math.PI / 2;
  c.position.set(0, 0, o);
  const inner = new THREE.Group();
  inner.add(a, b, c);
  inner.position.set(-o / 3, -o / 3, -o / 3);
  g.add(inner);
  // (1,1,1) 축을 위로: 세 링이 고르게 보이는 각도
  g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0.25, 1, 0.45).normalize());
  return g;
}

function clouBracelet() {
  const g = new THREE.Group();
  const R = 0.37;
  const turn = Math.PI * 2 + 0.55;
  const r0 = 0.026;
  const frame = (u) => {
    const t = u * turn;
    const p = new THREE.Vector3(Math.cos(t) * R, Math.sin(t) * R * 0.86, -0.045 + u * 0.09);
    const T = new THREE.Vector3(-Math.sin(t) * R, Math.cos(t) * R * 0.86, 0.09 / turn).normalize();
    let n = new THREE.Vector3(Math.cos(t), Math.sin(t), 0);
    n.addScaledVector(T, -n.dot(T)).normalize();
    const b = new THREE.Vector3().crossVectors(T, n);
    return { p, n, b, T };
  };
  // 끝 10%는 뾰족하게
  const prof = (v, u) => {
    const k = u > 0.9 ? Math.max(0, 1 - (u - 0.9) / 0.1) ** 0.9 : 1;
    const a = v * Math.PI * 2;
    return [Math.cos(a) * r0 * k, Math.sin(a) * r0 * k];
  };
  g.add(new THREE.Mesh(sweep(260, 24, frame, prof, false), MAT.gold()));
  // 못 머리
  const f0 = frame(0);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.054, 0.02, 40), MAT.gold());
  head.position.copy(f0.p).addScaledVector(f0.T, -0.008);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), f0.T.clone().negate());
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.02, 32), MAT.gold());
  collar.position.copy(f0.p).addScaledVector(f0.T, 0.006);
  collar.quaternion.copy(head.quaternion);
  g.add(head, collar);
  g.rotation.set(-0.6, 0.25, 0.3);
  return g;
}

// 팬더 머리: 구를 조각해 만든다. z 앞, y 위.
function headShape(x, y, z) {
  let X = x * 0.86;
  let Y = y * 0.74;
  let Z = z * 0.8;
  // 길게 나온 주둥이
  const m = Math.exp(-((x / 0.36) ** 2 + ((y + 0.28) / 0.28) ** 2)) * Math.max(0, z);
  Z += m * 0.5;
  Y -= m * 0.06;
  // 광대
  X *= 1 + 0.2 * Math.exp(-(((y + 0.05) / 0.3) ** 2)) * (0.6 + 0.4 * Math.max(0, z));
  // 넓고 평평한 이마
  if (y > 0.3) Y = 0.222 + (y - 0.3) * 0.74 * 0.62;
  // 좁은 턱, 납작한 뒤통수
  if (y < -0.4) X *= 1 - (-0.4 - y) * 0.7;
  if (z < 0) Z *= 0.7;
  // 눈썹뼈
  Z += Math.exp(-((x / 0.55) ** 2 + ((y - 0.24) / 0.1) ** 2)) * Math.max(0, z) * 0.07;
  // 눈자리 오목하게
  for (const sx of [-1, 1]) Z -= Math.exp(-(((x - sx * 0.36) / 0.13) ** 2 + ((y - 0.1) / 0.1) ** 2)) * Math.max(0, z) * 0.05;
  return new THREE.Vector3(X, Y, Z);
}
const onHead = (x, y, z, k = 1) => {
  const v = new THREE.Vector3(x, y, z).normalize();
  return headShape(v.x, v.y, v.z).multiplyScalar(k);
};

let spotTex = null;
function spots() {
  if (spotTex) return spotTex;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 1024, 512);
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#0d0d0d';
  for (let i = 0; i < 46; i++) {
    const u = r();
    const v = 0.1 + r() * 0.78;
    // 얼굴 앞(u≈0.25) 가운데는 비운다
    if (Math.abs(u - 0.25) < 0.13 && v > 0.28 && v < 0.85) continue;
    const cx = u * 1024;
    const cy = v * 512;
    const rad = 9 + r() * 12;
    g.beginPath();
    for (let k = 0; k <= 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const rr = rad * (0.75 + r() * 0.45);
      g.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr);
    }
    g.fill();
  }
  spotTex = new THREE.CanvasTexture(c);
  spotTex.colorSpace = THREE.SRGBColorSpace;
  spotTex.anisotropy = 8;
  return spotTex;
}

function pantherHead(scale = 1) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 128, 96);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = headShape(pos.getX(i), pos.getY(i), pos.getZ(i));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const skin = MAT.gold().clone();
  skin.map = spots();
  const head = new THREE.Mesh(geo, skin);
  g.add(head);
  for (const sx of [-1, 1]) {
    // 둥근 삼각 귀: 납작한 원뿔 + 오닉스 안쪽
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.38, 48, 1), MAT.gold());
    ear.scale.set(1, 1, 0.36);
    ear.position.copy(onHead(sx * 0.52, 0.85, -0.02, 1)).add(new THREE.Vector3(sx * 0.03, 0.11, 0));
    ear.rotation.set(-0.3, sx * 0.25, -sx * 0.5);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.27, 40, 1), MAT.onyx());
    inner.scale.set(1, 1, 0.22);
    inner.position.copy(ear.position).add(new THREE.Vector3(sx * 0.01, -0.03, 0.06));
    inner.rotation.copy(ear.rotation);
    // 아몬드 모양 에메랄드 눈 + 금 테
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.105, 48, 24), MAT.emerald());
    eye.scale.set(1.55, 0.62, 0.5);
    eye.position.copy(onHead(sx * 0.36, 0.1, 0.93, 0.97));
    eye.rotation.set(-0.1, sx * 0.42, sx * 0.3);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), MAT.onyx());
    pupil.scale.set(0.5, 1.7, 0.4);
    pupil.position.copy(eye.position).add(new THREE.Vector3(0, 0, 0.035));
    pupil.rotation.copy(eye.rotation);
    g.add(ear, inner, eye, pupil);
  }
  // 오닉스 코 (둥근 역삼각)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 3, 1), MAT.onyx());
  nose.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI);
  nose.scale.set(1, 1, 0.8);
  nose.position.copy(onHead(0, -0.14, 1, 1.0)).add(new THREE.Vector3(0, 0, 0.01));
  g.add(nose);
  g.scale.setScalar(scale);
  return g;
}

export function buildPiece(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'love-bracelet': g.add(loveBracelet()); break;
    case 'trinity-ring': g.add(trinityRing()); break;
    case 'clou': g.add(clouBracelet()); break;
    case 'panthere-ring': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.032, 32, 160), MAT.gold());
      band.rotation.x = Math.PI / 2 - 0.3;
      band.position.y = -0.16;
      const h = pantherHead(0.24);
      h.position.set(0, 0.02, 0.17);
      h.rotation.x = -0.15;
      g.add(band, h);
      break;
    }
    default: {
      const h = pantherHead(0.36);
      h.rotation.x = 0.08;
      g.add(h);
    }
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- 레드 박스 ----------
export function buildRedBox() {
  const g = new THREE.Group();
  const w = 1;
  const d = 0.72;
  const hb = 0.34;
  const hl = 0.14;
  const lac = MAT.lacquer();
  const gold = MAT.gold();
  // 바닥 상자 (위가 열린 틀)
  const wall = 0.035;
  const parts = [
    [w, 0.02, d, 0, 0.01, 0],
    [w, hb, wall, 0, hb / 2, d / 2 - wall / 2],
    [w, hb, wall, 0, hb / 2, -d / 2 + wall / 2],
    [wall, hb, d, w / 2 - wall / 2, hb / 2, 0],
    [wall, hb, d, -w / 2 + wall / 2, hb / 2, 0],
  ];
  for (const [sx, sy, sz, x, y, z] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), lac);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  }
  const inside = new THREE.Mesh(new THREE.BoxGeometry(w - wall * 2, 0.16, d - wall * 2), MAT.suede());
  inside.position.y = 0.1;
  inside.receiveShadow = true;
  g.add(inside);
  // 금빛 띠
  const bandGeo = new THREE.BoxGeometry(w + 0.004, 0.012, d + 0.004);
  const band = new THREE.Mesh(bandGeo, gold);
  band.position.y = hb - 0.04;
  g.add(band);
  // 뚜껑 (뒤쪽 경첩)
  const lid = new THREE.Group();
  lid.position.set(0, hb, -d / 2);
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, hl, d + 0.02), lac);
  top.position.set(0, hl / 2, d / 2);
  top.castShadow = true;
  lid.add(top);
  const lidBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.024, 0.012, d + 0.024), gold);
  lidBand.position.set(0, 0.03, d / 2);
  lid.add(lidBand);
  const lidIn = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, 0.01, d - 0.06), MAT.suede());
  lidIn.position.set(0, -0.004, d / 2);
  lid.add(lidIn);
  // 윗면 금선 테두리
  const edge = 0.008;
  for (const [sx, sz, x, z] of [[w - 0.12, edge, 0, -d / 2 + 0.06], [w - 0.12, edge, 0, d / 2 - 0.06], [edge, d - 0.12, -w / 2 + 0.06, 0], [edge, d - 0.12, w / 2 - 0.06, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.004, sz), gold);
    m.position.set(x, hl + 0.002, d / 2 + z);
    lid.add(m);
  }
  g.add(lid);
  g.userData.lid = lid;
  g.userData.seat = V(0, 0.22, 0.04);
  return g;
}

// ---------- 샹들리에 ----------
export function buildChandelier(scale = 1) {
  const g = new THREE.Group();
  const gold = MAT.gold();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 8), gold);
  rod.position.y = 0.6;
  g.add(rod);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.018, 8, 48), gold);
  ring.rotation.x = Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.014, 8, 40), gold);
  ring2.rotation.x = Math.PI / 2;
  ring2.position.y = -0.22;
  g.add(ring, ring2);
  const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 0.35, roughness: 0.3 });
  const crystal = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0.2, clearcoat: 1, emissive: 0x664a30, emissiveIntensity: 0.2 });
  const cg = new THREE.OctahedronGeometry(0.035);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), bulbMat);
    b.position.set(Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.42);
    const c = new THREE.Mesh(cg, crystal);
    c.scale.y = 1.8;
    c.position.set(Math.cos(a) * 0.42, -0.1, Math.sin(a) * 0.42);
    g.add(b, c);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd9a0, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(2.4);
  g.add(glow);
  g.userData.bulb = bulbMat;
  g.userData.glow = glow;
  g.scale.setScalar(scale);
  return g;
}

// ---------- 방문 카드 ----------
let cardTex = null;
export function buildCard() {
  if (!cardTex) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 318;
    const g = c.getContext('2d');
    drawCard(g, 256, 159, 512, 0, 1);
    cardTex = new THREE.CanvasTexture(c);
    cardTex.colorSpace = THREE.SRGBColorSpace;
  }
  const side = new THREE.MeshStandardMaterial({ color: 0xefe8dc, roughness: 0.8 });
  const face = new THREE.MeshStandardMaterial({ map: cardTex, roughness: 0.7 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.004, 0.224), [side, side, face, side, side, side]);
  m.castShadow = true;
  return m;
}
