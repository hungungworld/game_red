// 3D 모델: 레드(와 관리인), 컬렉션 피스 5종, 레드 박스, 샹들리에, 방문 카드
import { THREE, MAT, additive, glowTex } from './gfx.js';
import { drawCard } from './figures.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

// ---------- 인물 (레드 · 관리인) ----------
// 키 약 1.8m. 루트는 바닥, +z 방향을 바라본다. 코트는 선반(lathe) 실루엣.
const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
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

// 이전 이름 호환
export class Figure extends Humanoid {
  constructor({ material, hat = 'fedora', scale = 1 } = {}) {
    super({ hat, scale, scarf: hat !== 'cap', coat: hat === 'cap' ? 0x1b2233 : 0x0b0b0e, coatLen: hat === 'cap' ? 0.3 : 0.46 });
    void material;
  }
}

// ---------- 컬렉션 피스 (지름 약 1) ----------
function ellipsePoint(a, rx, ry) { return V(Math.cos(a) * rx, Math.sin(a) * ry, 0); }

function screwHead(mat, r = 0.035) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r, r * 0.5, 20), mat);
  head.rotation.x = Math.PI / 2;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(r * 1.5, r * 0.25, r * 0.3), MAT.onyx());
  slot.position.z = r * 0.25;
  slot.rotation.z = 0.6;
  g.add(head, slot);
  return g;
}

function pantherHead(scale = 1) {
  const g = new THREE.Group();
  const gold = MAT.gold();
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 28), gold);
  skull.scale.set(1, 0.9, 0.85);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.16, 32, 20), gold);
  muzzle.position.set(0, -0.1, 0.2);
  muzzle.scale.set(1.15, 0.8, 0.9);
  g.add(skull, muzzle);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 16), gold);
    ear.position.set(0.19 * sx, 0.24, -0.02);
    ear.rotation.z = -0.5 * sx;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 14), MAT.emerald());
    eye.position.set(0.11 * sx, 0.02, 0.24);
    eye.scale.set(1.3, 0.75, 0.6);
    eye.rotation.z = 0.25 * sx;
    g.add(ear, eye);
  }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.05, 3), MAT.onyx());
  nose.rotation.x = Math.PI;
  nose.position.set(0, -0.06, 0.34);
  g.add(nose);
  // 오닉스 반점
  const spot = new THREE.SphereGeometry(0.022, 10, 8);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const th = rnd() * Math.PI * 1.1 - Math.PI * 0.55;
    const ph = rnd() * Math.PI * 0.75 + Math.PI * 0.05;
    const p = V(Math.sin(ph) * Math.sin(th) * 0.3, Math.cos(ph) * 0.27, Math.sin(ph) * Math.cos(th) * 0.255);
    if (Math.abs(p.x) < 0.17 && p.y < 0.12 && p.y > -0.1) continue; // 눈 주변 비우기
    const s = new THREE.Mesh(spot, MAT.onyx());
    s.position.copy(p);
    s.scale.setScalar(0.7 + rnd() * 0.6);
    g.add(s);
  }
  g.scale.setScalar(scale);
  return g;
}

export function buildPiece(id) {
  const g = new THREE.Group();
  switch (id) {
    case 'love-bracelet': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 32, 160), MAT.gold());
      band.scale.set(1, 0.8, 2.3);
      g.add(band);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const p = ellipsePoint(a, 0.47, 0.376);
        const s = screwHead(MAT.gold(), 0.03);
        s.position.copy(p);
        s.lookAt(p.clone().multiplyScalar(2));
        g.add(s);
      }
      g.rotation.x = -0.5;
      break;
    }
    case 'trinity-ring': {
      const geo = new THREE.TorusGeometry(0.27, 0.05, 32, 120);
      const a = new THREE.Mesh(geo, MAT.rose());
      a.position.set(-0.09, -0.04, 0);
      a.rotation.set(0.2, 0.9, 0);
      const b = new THREE.Mesh(geo, MAT.gold());
      b.position.set(0.09, -0.04, 0);
      b.rotation.set(0.2, -0.9, 0);
      const c = new THREE.Mesh(geo, MAT.white());
      c.position.set(0, 0.1, 0);
      c.rotation.set(1.35, 0, 0);
      g.add(a, b, c);
      break;
    }
    case 'clou': {
      const arc = Math.PI * 1.82;
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.035, 24, 160, arc), MAT.gold());
      band.scale.set(1, 0.82, 1);
      g.add(band);
      const end = ellipsePoint(arc, 0.4, 0.328);
      const headM = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 32), MAT.gold());
      headM.position.copy(end);
      headM.rotation.z = arc;
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 24), MAT.gold());
      tip.position.set(0.43, -0.04, 0);
      tip.rotation.z = Math.PI;
      g.add(headM, tip);
      g.rotation.x = -0.7;
      break;
    }
    case 'panthere-ring': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 24, 120), MAT.gold());
      band.rotation.x = Math.PI / 2 - 0.35;
      band.position.y = -0.18;
      const h = pantherHead(0.72);
      h.position.set(0, 0.12, 0.1);
      g.add(band, h);
      break;
    }
    default:
      g.add(pantherHead(1.15));
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

// 레이저 한 줄 (Y축 방향 길이 1, 위치·크기는 바깥에서)
export function buildBeam() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(cyl, new THREE.MeshBasicMaterial({ color: 0xffd6d6, transparent: true, toneMapped: false }));
  core.scale.set(0.006, 1, 0.006);
  const glow = new THREE.Mesh(cyl, additive(0xff1030, 0.4));
  glow.scale.set(0.014, 1, 0.014);
  const halo = new THREE.Mesh(cyl, additive(0xff0020, 0.08));
  halo.scale.set(0.04, 1, 0.04);
  g.add(core, glow, halo);
  g.userData.set = (a) => {
    core.material.opacity = a > 0.1 ? a : 0;
    glow.material.opacity = 0.4 * a + 0.02;
    halo.material.opacity = 0.08 * a;
  };
  return g;
}
