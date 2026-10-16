// 3D 모델: 레드(와 관리인), 컬렉션 피스 5종, 레드 박스, 샹들리에, 방문 카드
import { THREE, K, MAT, additive, glowTex } from './gfx.js';
import { drawCard } from './figures.js';

const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

// ---------- 레드 ----------
// 발 위치 기준, +x 방향을 바라보는 포즈 (단위: 게임 단위, 키 60)
export function pose(mode, ph, hatLift = 0) {
  const s = Math.sin(ph);
  switch (mode) {
    case 'walk':
      return {
        head: [5, -53],
        limbs: [
          [[2, -46], [-1, -27], 8.5],
          [[-1, -27], [2 + s * 5, -14], [s * 10, 0], 5.5],
          [[-1, -27], [2 - s * 5, -14], [-s * 10, 0], 5.5],
          [[2, -43], [3 - s * 4, -35], [2 - s * 8, -29], 3.6],
        ],
      };
    case 'crouch':
      return {
        head: [16, -26],
        limbs: [
          [[10, -24], [-8, -23], 8.5],
          [[-8, -23], [-15, -11], [-9, 0], 5.5],
          [[-8, -23], [-2, -12], [-4, 0], 5.5],
          [[9, -22], [14, -11], [17, 0], 3.6],
        ],
      };
    case 'slide':
      return {
        head: [-13, -15],
        limbs: [
          [[-9, -12], [4, -6], 8.5],
          [[4, -6], [11, -5], [18, -3], 5.5],
          [[4, -6], [12, -9], [19, -6], 5.5],
          [[-8, -11], [-12, -6], [-15, -2], 3.6],
        ],
      };
    case 'jump':
      return {
        head: [5, -42],
        limbs: [
          [[3, -35], [-1, -21], 8.5],
          [[-1, -21], [8, -16], [-1, -8], 5.5],
          [[-1, -21], [5, -13], [-6, -9], 5.5],
          [[3, -33], [8, -33], [11, -31], 3.6],
        ],
      };
    default: {
      const arm = hatLift > 0
        ? [[1, -44], [8, -50], [5, -60 - hatLift], 3.6]
        : [[1, -44], [2, -35], [1, -27], 3.6];
      return {
        head: [2, -54],
        limbs: [
          [[1, -47], [0, -27], 8.5],
          [[0, -27], [-2, -13], [-3, 0], 5.5],
          [[0, -27], [2, -13], [3, 0], 5.5],
          arm,
        ],
      };
    }
  }
}

const cyl = new THREE.CylinderGeometry(1, 1, 1, 12);
const sph = new THREE.SphereGeometry(1, 16, 12);

export class Figure {
  constructor({ material = MAT.suit(), hat = 'fedora', scale = 1 } = {}) {
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.group.add(this.root);
    this.mat = material;
    this.segs = [];
    this.joints = [];
    const LZ = [0, 0.09, -0.09, 0.17];
    this.limbZ = LZ;
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(cyl, material);
        m.castShadow = true;
        this.root.add(m);
        this.segs.push(m);
      }
      for (let k = 0; k < 3; k++) {
        const j = new THREE.Mesh(sph, material);
        j.castShadow = true;
        this.root.add(j);
        this.joints.push(j);
      }
    }
    this.head = new THREE.Mesh(sph, material);
    this.head.scale.setScalar(5.4 * K);
    this.head.castShadow = true;
    this.root.add(this.head);
    this.hat = new THREE.Group();
    const hatMat = material;
    if (hat === 'cap') {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(5.6 * K, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat);
      const bill = new THREE.Mesh(new THREE.BoxGeometry(6 * K, 0.6 * K, 7 * K), hatMat);
      bill.position.set(5 * K, 0, 0);
      this.hat.add(crown, bill);
    } else {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(9 * K, 9 * K, 0.5 * K, 24), hatMat);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(4.3 * K, 5.2 * K, 6.5 * K, 20), hatMat);
      crown.position.y = 3.3 * K;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(5.05 * K, 5.25 * K, 1.2 * K, 20), MAT.onyx());
      band.position.y = 0.9 * K;
      this.hat.add(brim, crown, band);
    }
    this.hat.traverse((o) => { o.castShadow = true; });
    this.root.add(this.hat);
    this.setPose('stand', 0);
  }

  setPose(mode, ph = 0, { hatLift = 0 } = {}) {
    const P = pose(mode, ph, hatLift);
    let si = 0;
    let ji = 0;
    P.limbs.forEach((limb, li) => {
      const w = limb[limb.length - 1];
      const pts = limb.slice(0, -1).map(([x, y]) => V(x * K, -y * K, this.limbZ[li]));
      const r = (w / 2) * K;
      for (let k = 0; k < 2; k++) {
        const m = this.segs[si++];
        if (k >= pts.length - 1) { m.visible = false; continue; }
        m.visible = true;
        const a = pts[k];
        const b = pts[k + 1];
        const len = a.distanceTo(b);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.scale.set(r, len, r * (li === 0 ? 0.75 : 1));
        m.rotation.set(0, 0, Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2);
      }
      for (let k = 0; k < 3; k++) {
        const j = this.joints[ji++];
        if (k >= pts.length) { j.visible = false; continue; }
        j.visible = true;
        j.position.copy(pts[k]);
        j.scale.set(r, r, r * (li === 0 ? 0.75 : 1));
      }
    });
    const [hx, hy] = P.head;
    this.head.position.set(hx * K, -hy * K, 0);
    this.hat.position.set(hx * K, (-hy + 3.6 + hatLift) * K, 0);
    this.hat.rotation.set(0, 0, hatLift ? 0.3 : mode === 'slide' ? 0.35 : 0);
  }

  setOpacity(a) {
    if (a >= 1 && !this.fading) return;
    if (!this.fading) {
      this.fading = true;
      const m = this.mat.clone();
      m.transparent = true;
      this.group.traverse((o) => { if (o.isMesh) o.material = m; });
      this.fadeMat = m;
    }
    this.fadeMat.opacity = a;
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
