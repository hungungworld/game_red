// 잠입 스테이지 소품: 체커 대리석 바닥, 벽, 기둥, 유리 진열장, 퓨즈함, 감시 카메라, 시야 부채꼴, 레이저
import { THREE, MAT, glowTex, additive } from './gfx.js';
import { buildPiece } from './models.js';

const T = 96; // 타일당 텍스처 픽셀

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

// 흑백 체커 대리석 + 가는 금빛 줄눈
export function checkerFloor(map, seed = 3) {
  const h = map.length;
  const w = map[0].length;
  const c = document.createElement('canvas');
  c.width = w * T;
  c.height = h * T;
  const g = c.getContext('2d');
  const r = rand(seed);
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      const white = (x + z) % 2 === 0;
      const px = x * T;
      const pz = z * T;
      const lg = g.createLinearGradient(px, pz, px + T, pz + T);
      if (white) { lg.addColorStop(0, '#c9c2b6'); lg.addColorStop(1, '#b8b0a3'); } else { lg.addColorStop(0, '#141314'); lg.addColorStop(1, '#0b0a0b'); }
      g.fillStyle = lg;
      g.fillRect(px, pz, T, T);
      g.save();
      g.beginPath();
      g.rect(px, pz, T, T);
      g.clip();
      g.strokeStyle = white ? 'rgba(90,80,70,0.35)' : 'rgba(230,220,205,0.28)';
      for (let k = 0; k < 3; k++) {
        let vx = px + r() * T;
        let vz = pz + r() * T;
        let a = r() * Math.PI * 2;
        g.lineWidth = 0.4 + r() * 1.1;
        g.beginPath();
        g.moveTo(vx, vz);
        for (let i = 0; i < 18; i++) {
          a += (r() - 0.5) * 0.7;
          vx += Math.cos(a) * 7;
          vz += Math.sin(a) * 7;
          g.lineTo(vx, vz);
        }
        g.stroke();
      }
      g.restore();
    }
  }
  g.strokeStyle = 'rgba(201,163,92,0.55)';
  g.lineWidth = 1.2;
  for (let x = 0; x <= w; x++) { g.beginPath(); g.moveTo(x * T, 0); g.lineTo(x * T, h * T); g.stroke(); }
  for (let z = 0; z <= h; z++) { g.beginPath(); g.moveTo(0, z * T); g.lineTo(w * T, z * T); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.5 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(w / 2, 0, h / 2);
  mesh.receiveShadow = true;
  return mesh;
}

// 벽 패널 텍스처: 상아색 판넬과 몰딩
let panelTex = null;
function wallPanel() {
  if (panelTex) return panelTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#a69d8f';
  g.fillRect(0, 0, 128, 256);
  g.fillStyle = '#2a2420';
  g.fillRect(0, 226, 128, 30);
  g.strokeStyle = 'rgba(120,100,70,0.55)';
  g.lineWidth = 2;
  g.strokeRect(14, 24, 100, 120);
  g.strokeRect(14, 158, 100, 56);
  g.strokeStyle = '#b8954f';
  g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 224); g.lineTo(128, 224); g.stroke();
  g.beginPath(); g.moveTo(0, 6); g.lineTo(128, 6); g.stroke();
  panelTex = new THREE.CanvasTexture(c);
  panelTex.colorSpace = THREE.SRGBColorSpace;
  return panelTex;
}

export function buildWalls(map, height = 2.2) {
  const pos = [];
  map.forEach((row, z) => [...row].forEach((ch, x) => { if (ch === '#') pos.push([x, z]); }));
  const geo = new THREE.BoxGeometry(1, height, 1);
  const side = new THREE.MeshStandardMaterial({ map: wallPanel(), roughness: 0.55 });
  const top = new THREE.MeshStandardMaterial({ color: 0x121012, roughness: 0.8 });
  const walls = new THREE.InstancedMesh(geo, [side, side, top, side, side, side], pos.length);
  const m = new THREE.Matrix4();
  pos.forEach(([x, z], i) => {
    m.makeTranslation(x + 0.5, height / 2, z + 0.5);
    walls.setMatrixAt(i, m);
  });
  walls.castShadow = true;
  walls.receiveShadow = true;
  const grp = new THREE.Group();
  grp.add(walls);
  // 위 테두리 금선: 바닥과 맞닿은 벽면만
  const trims = [];
  const isWall = (x, z) => map[z] && map[z][x] === '#';
  pos.forEach(([x, z]) => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (isWall(x + dx, z + dz) || !map[z + dz] || map[z + dz][x + dx] === undefined) continue;
      const tm = new THREE.Matrix4();
      const cx = x + 0.5 + dx * 0.5;
      const cz = z + 0.5 + dz * 0.5;
      tm.compose(new THREE.Vector3(cx, height + 0.005, cz), new THREE.Quaternion(), new THREE.Vector3(dx ? 0.03 : 1.02, 0.02, dz ? 0.03 : 1.02));
      trims.push(tm);
    }
  });
  const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), MAT.gold(), trims.length);
  trims.forEach((tm, i) => trim.setMatrixAt(i, tm));
  grp.add(trim);
  return grp;
}

export function buildColumn() {
  const g = new THREE.Group();
  const marble = new THREE.MeshPhysicalMaterial({ color: 0xece6dc, roughness: 0.25, clearcoat: 0.6 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.3, 2.6, 24), marble);
  shaft.position.y = 1.4;
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.18, 0.72), marble);
  base.position.y = 0.09;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.03, 8, 32), MAT.gold());
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.22;
  const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.28, 0.16, 24), MAT.gold());
  capital.position.y = 2.76;
  g.add(shaft, base, ring, capital);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

const glassMat = () => new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false });

export function buildCase(pieceId) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.9, 0.82), MAT.lacquerBlack());
  base.position.y = 0.45;
  base.castShadow = base.receiveShadow = true;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.03, 0.86), MAT.gold());
  trim.position.y = 0.9;
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.7), MAT.velvet());
  pad.position.y = 0.93;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.55, 0.78), glassMat());
  glass.position.y = 1.2;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: 0xd8b878, transparent: true, opacity: 0.7 }));
  edges.position.copy(glass.position);
  const jewel = buildPiece(pieceId);
  jewel.scale.setScalar(0.32);
  jewel.position.y = 1.15;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(1.6, 1.3, 0.9), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.8);
  halo.position.y = 1.15;
  halo.material.opacity = 0.22;
  g.add(base, trim, pad, glass, edges, jewel, halo);
  g.userData.jewel = jewel;
  return g;
}

export function buildFuse() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 0.4), MAT.steel());
  box.position.y = 0.65;
  box.castShadow = true;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.02), MAT.goldSatin());
  plate.position.set(0, 0.75, 0.21);
  const lever = new THREE.Group();
  lever.position.set(0, 0.85, 0.24);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.05), MAT.onyx());
  arm.position.y = 0.13;
  lever.add(arm);
  lever.rotation.x = -0.5;
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.4) });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 10), lampMat);
  lamp.position.set(0.16, 1.15, 0.22);
  g.add(box, plate, lever, lamp);
  g.userData = { lever, lamp };
  return g;
}

export function buildExit() {
  const g = new THREE.Group();
  const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2.2, 0.12), new THREE.MeshPhysicalMaterial({ color: 0x1a0d0a, roughness: 0.35, clearcoat: 1 }));
  door.position.y = 1.1;
  const frameM = MAT.gold();
  const fl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.18), frameM);
  fl.position.set(-0.52, 1.15, 0);
  const fr = fl.clone();
  fr.position.x = 0.52;
  const ft = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.18), frameM);
  ft.position.y = 2.3;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.3, 1.2) }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(0, 0.01, 0.12);
  g.add(door, fl, fr, ft, glow);
  return g;
}

export function buildCamera() {
  const g = new THREE.Group();
  const mount = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), MAT.goldSatin());
  const head = new THREE.Group();
  head.position.y = -0.05;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.38), new THREE.MeshPhysicalMaterial({ color: 0xe8e2d8, roughness: 0.3, clearcoat: 1 }));
  body.position.z = 0.15;
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.04, 16), MAT.onyx());
  lens.rotation.x = Math.PI / 2;
  lens.position.z = 0.35;
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.3, 0.3) }));
  led.position.set(0.06, 0.06, 0.3);
  head.add(body, lens, led);
  g.add(mount, head);
  g.userData.head = head;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function buildEmblem() {
  const g = new THREE.Group();
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 32), MAT.gold());
  coin.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 8, 32), MAT.onyx());
  ring.position.z = 0.014;
  const paw = new THREE.Group();
  const dot = (x, y, r) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), MAT.onyx());
    m.position.set(x, y, 0.014);
    paw.add(m);
  };
  dot(0, -0.03, 0.045);
  dot(-0.055, 0.03, 0.02);
  dot(-0.018, 0.06, 0.02);
  dot(0.018, 0.06, 0.02);
  dot(0.055, 0.03, 0.02);
  const back = paw.clone();
  back.rotation.y = Math.PI;
  const holder = new THREE.Group();
  holder.add(coin, ring, paw, back);
  holder.position.y = 0.6;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.2, 1.7, 0.9), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(0.9);
  halo.position.y = 0.6;
  g.add(holder, halo);
  g.userData.spin = holder;
  return g;
}

// 레이저 빔: 단위 길이(X축), 밝기 1 이상으로 블룸을 받는다
const unitBox = new THREE.BoxGeometry(1, 1, 1);
export function buildLaser() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.9, 1.0), transparent: true }));
  core.scale.set(1, 0.018, 0.018);
  const glow = new THREE.Mesh(unitBox, additive(new THREE.Color(1.6, 0.05, 0.14), 0.25));
  glow.scale.set(1, 0.07, 0.07);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.35), additive(new THREE.Color(1.2, 0.04, 0.1), 0.12, glowTex()));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.69;
  g.add(core, glow, floor);
  g.userData.set = (a) => {
    core.material.opacity = a > 0.08 ? Math.min(1, a) : 0;
    glow.material.opacity = 0.25 * a;
    floor.material.opacity = 0.12 * a;
  };
  return g;
}

// 두 점 사이에 레이저 배치 (높이 y)
export function placeLaser(l, ax, az, bx, bz, y = 0.7) {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  l.position.set((ax + bx) / 2, y, (az + bz) / 2);
  l.rotation.set(0, -Math.atan2(dz, dx), 0);
  l.scale.set(Math.max(0.001, len), 1, 1);
  l.children[2].scale.y = 1 / 1; // 바닥 빛은 길이만 따라감
}

export function buildEmitter() {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.95, 16), MAT.gold());
  post.position.y = 0.475;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), MAT.onyx());
  head.position.y = 0.72;
  g.add(post, head);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// 시야 부채꼴 (바닥에 그려지는 반투명 영역). 매 프레임 꼭짓점 갱신
export class VisionFan {
  constructor(n = 28) {
    this.n = n;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array((n + 2) * 3);
    this.alpha = new Float32Array(n + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('a', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 1; i <= n; i++) idx.push(0, i, i + 1);
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(1, 0.93, 0.8) }, uOpacity: { value: 0.3 } },
      vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ gl_FragColor = vec4(uColor, uOpacity * vA); }',
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = 0.02;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  // pts: [[x,z]...] 가장자리 점들, origin [x,z]
  set(origin, pts) {
    const p = this.pos;
    p[0] = origin[0]; p[1] = 0; p[2] = origin[1];
    this.alpha[0] = 1;
    for (let i = 0; i < pts.length && i <= this.n; i++) {
      p[(i + 1) * 3] = pts[i][0];
      p[(i + 1) * 3 + 1] = 0;
      p[(i + 1) * 3 + 2] = pts[i][1];
      this.alpha[i + 1] = 0.45;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.a.needsUpdate = true;
    this.mesh.geometry.computeBoundingSphere();
  }

  color(hex, op) {
    this.mat.uniforms.uColor.value.setHex(hex);
    this.mat.uniforms.uOpacity.value = op;
  }
}

// 머리 위 상태 표시 (? / !)
const markTex = {};
export function markSprite() {
  const mk = (ch, col) => {
    if (markTex[ch]) return markTex[ch];
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.font = 'italic 300 104px "Cormorant Garamond", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = col;
    g.fillText(ch, 64, 70);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    markTex[ch] = t;
    return t;
  };
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
  s.scale.setScalar(0.7);
  s.renderOrder = 10;
  s.userData.set = (state) => {
    if (!state) { s.visible = false; return; }
    s.visible = true;
    s.material.map = state === 'alert' ? mk('!', '#ff3346') : mk('?', '#f3e6c8');
    s.material.needsUpdate = true;
  };
  s.visible = false;
  return s;
}

// 공기 중 먼지
export function buildDust(w, h, n = 260) {
  const geo = new THREE.BufferGeometry();
  const p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    p[i * 3] = Math.random() * w;
    p[i * 3 + 1] = Math.random() * 2.4 + 0.2;
    p[i * 3 + 2] = Math.random() * h;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.PointsMaterial({ size: 0.035, color: new THREE.Color(1.4, 1.25, 1.0), transparent: true, opacity: 0.45, depthWrite: false, map: glowTex(), blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, m);
  pts.userData.tick = (t) => { pts.position.y = Math.sin(t * 0.3) * 0.08; pts.rotation.y = 0; };
  return pts;
}
