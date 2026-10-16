// 1단계 레이저 회랑 + 단계 사이 야간 관리인 순찰 구간 (같은 횡스크롤 엔진)
import { clamp, rand, pingpong, shuffle } from '../util.js';
import { THREE, K, MAT, getEnv, marbleTex, glowTex, fadeTex, additive, barMatrix, instanced, draw } from '../gfx.js';
import { Figure, buildBeam, buildChandelier } from '../models.js';
import { audio } from '../audio.js';
import { radio, hint } from '../ui.js';

const WALK = 92;
const SLIDE_K = 1.75;
const SLIDE_T = 0.55;
const JUMP_T = 0.7;
const JUMP_H = 46;
const HW = 8;
const HB = { walk: [0, 58], crouch: [0, 34], slide: [0, 19] };

function genLaser(d, warn) {
  const obs = [];
  let x = 150;
  // 첫 레이저는 누구나 30초 안에 첫 성공을 맛보도록 느린 문
  obs.push({ type: 'gate', x, period: 2.4, on: 0.5, phase: 0.2, warn: Math.max(warn, 0.3) });
  const rest = ['low', 'high'];
  const pool = d.sweepSpeed ? ['gate', 'high', 'low', 'sweep'] : ['gate', 'high', 'low'];
  while (rest.length < d.lasers - 1) rest.push(...shuffle(pool));
  rest.length = d.lasers - 1;
  for (const type of rest) {
    x += rand(d.spacing * 0.9, d.spacing * 1.15);
    const blink = d.id === 'legend' && Math.random() < 0.5;
    const period = d.period * rand(0.95, 1.15);
    if (type === 'gate') {
      // 꺼져 있는 시간은 최소 0.42초 보장 (멈춘 자리에서 걸어서 통과 가능)
      obs.push({ type, x, period, on: Math.min(0.55, 1 - 0.42 / period), phase: rand(0, period), warn });
    } else if (type === 'sweep') {
      // 위아래로 오르내리는 레이저: 머리 위로 올라간 순간 지나가거나, 낮을 때 넘거나, 높을 때 미끄러진다
      obs.push({ type, x, len: 18, lo: 6, hi: 82, speed: d.sweepSpeed, phase: rand(0, 76) });
    } else {
      const o = { type, x, len: 16, h: type === 'high' ? 30 : 9, warn };
      if (blink) Object.assign(o, { period: d.period * 1.8, on: 0.6, phase: rand(0, 2) });
      obs.push(o);
    }
  }
  return { obs, length: x + 170 };
}

function genPatrol(d) {
  const obs = [];
  const n = d.lights;
  const len = 260 + n * 170;
  for (let i = 0; i < n; i++) {
    const base = 200 + i * 170;
    const span = rand(110, 150);
    obs.push({
      type: 'light', x: base, x0: base - span / 2, x1: base + span / 2,
      speed: rand(42, 62) * (d.id === 'legend' ? 1.25 : 1), phase: rand(0, span), r: 34,
    });
  }
  return { obs, length: len };
}

export class Corridor {
  constructor(m, kind, end) {
    this.m = m;
    this.kind = kind;
    this.end = end;
    this.t = 0;
    const d = m.diff;
    const warn = d.warn + (m.mods.monocle ? 0.05 : 0);
    const gen = kind === 'laser' ? genLaser(d, warn) : genPatrol(d);
    this.obs = gen.obs;
    this.length = gen.length;
    this.p = { x: 20, jy: 0, mode: 'crouch', t: 0, inv: 0, stun: 0, ph: 0, slideFrom: 0 };
    this.holding = false;
    this.gs = null;
    this.hits = 0;
    this.lit = false;
    this.warnT = 0;
    this.cued = new Set();
    this.done = false;
    this.timeLimit = null;
  }

  enter() {
    const first = !this.m.store.tutorialDone;
    if (this.kind === 'laser') {
      radio('레드, 들리나. 붉은 복도다.', 2200);
      radio('화면을 누르고 있으면 전진. 손을 떼면 팬더 자세로 멈춘다.', 3400);
      hint('누르고 있기 — 전진 · 떼기 — 멈춤<br>위로 쓸기 — 도약 · 아래로 쓸기 — 슬라이딩', first ? 0 : 6000);
    } else {
      radio('관리인 순찰이다. 바닥의 불빛이 오면 손을 떼.', 3200);
      hint('불빛 안에서 움직이면 시선이 쌓인다 — 멈추면 안전', first ? 0 : 5000);
    }
  }

  hitbox() {
    const p = this.p;
    if (p.mode === 'jump') return [p.jy + 10, p.jy + 46];
    return HB[p.mode];
  }

  isOn(o) {
    if (!o.period) return true;
    const c = ((this.t + o.phase) % o.period) / o.period;
    return c < o.on;
  }

  dimmed(o) {
    if (!o.period) return false;
    const c = ((this.t + o.phase) % o.period);
    const onT = o.on * o.period;
    return c < onT && onT - c < o.warn;
  }

  sweepH(o) { return o.lo + pingpong(this.t * o.speed + o.phase, o.hi - o.lo); }
  lightX(o) { return o.x0 + pingpong(this.t * o.speed + o.phase, o.x1 - o.x0); }

  // ---------- 입력 ----------
  down(e) {
    this.holding = true;
    this.gs = { x: e.x, y: e.y, used: false };
    if (this.p.mode === 'crouch' && this.p.stun <= 0) this.p.mode = 'walk';
  }

  move(e) {
    const gs = this.gs;
    if (!gs || gs.used) return;
    const dx = e.x - gs.x;
    const dy = e.y - gs.y;
    if (dy < -24 && -dy > Math.abs(dx) * 0.8) {
      gs.used = true;
      this.jump();
    } else if ((dy > 24 && dy > Math.abs(dx) * 0.8) || (dx > 32 && dx > Math.abs(dy))) {
      gs.used = true;
      this.slide();
    }
  }

  up() {
    this.holding = false;
    this.gs = null;
    if (this.p.mode === 'walk') this.p.mode = 'crouch';
  }

  jump() {
    const p = this.p;
    if (p.stun > 0 || p.mode === 'jump' || p.mode === 'slide') return;
    p.mode = 'jump';
    p.t = 0;
  }

  slide() {
    const p = this.p;
    if (p.stun > 0 || p.mode === 'jump' || p.mode === 'slide') return;
    p.mode = 'slide';
    p.t = SLIDE_T;
    p.slideFrom = p.x;
    audio.swish();
  }

  // ---------- 진행 ----------
  update(dt) {
    if (this.done) return;
    this.t += dt;
    const p = this.p;
    const prevX = p.x;
    if (p.inv > 0) p.inv -= dt;
    if (p.stun > 0) {
      p.stun -= dt;
      if (p.stun <= 0 && this.holding) p.mode = 'walk';
    }
    switch (p.mode) {
      case 'walk':
        p.x += WALK * dt;
        p.ph += dt * 9;
        break;
      case 'slide':
        p.x += WALK * SLIDE_K * dt;
        p.t -= dt;
        if (p.t <= 0) p.mode = this.holding ? 'walk' : 'crouch';
        break;
      case 'jump': {
        p.t += dt;
        p.x += WALK * dt;
        const u = p.t / JUMP_T;
        p.jy = 4 * JUMP_H * u * (1 - u);
        if (u >= 1) {
          p.jy = 0;
          p.mode = this.holding ? 'walk' : 'crouch';
        }
        break;
      }
      default:
    }
    p.x = Math.max(0, p.x);

    if (this.kind === 'laser') this.checkLasers(prevX);
    else this.checkLights(dt);
    this.cues();

    if (p.x >= this.length) {
      this.done = true;
      hint('');
      this.m.stageClear({ hits: this.hits });
    }
  }

  checkLasers(prevX) {
    const p = this.p;
    const [lo, hi] = this.hitbox();
    for (const o of this.obs) {
      if (Math.abs(o.x - p.x) > 60) continue;
      let hit = false;
      if (o.type === 'gate') {
        hit = this.isOn(o) && Math.abs(p.x - o.x) < HW + 1;
      } else {
        const h = o.type === 'sweep' ? this.sweepH(o) : o.h;
        hit = this.isOn(o) && p.x + HW - 1 > o.x - o.len / 2 && p.x - HW + 1 < o.x + o.len / 2 && lo < h + 1.5 && hi > h - 1.5;
        if (!hit && o.type === 'high' && !o.passed && prevX < o.x && p.x >= o.x && p.mode === 'slide') {
          o.passed = true;
          if (o.x - p.slideFrom < 34) this.m.pantherStep();
        }
      }
      if (hit && p.inv <= 0) {
        this.onHit();
        break;
      }
    }
  }

  onHit() {
    const p = this.p;
    this.hits++;
    p.inv = 1.3;
    p.stun = 0.45;
    p.mode = 'crouch';
    p.jy = 0;
    p.x = Math.max(0, p.x - 24);
    audio.hit();
    this.m.addGaze(this.m.diff.hitGaze * (this.m.mods.easy ? 0.75 : 1), 'laser');
    if (this.m.state === 'play') radio(this.hits === 1 ? '닿았다. 호흡 가다듬고, 패턴을 봐.' : '조심해. 시선이 모이고 있어.', 2400);
  }

  checkLights(dt) {
    const p = this.p;
    let lit = false;
    for (const o of this.obs) {
      if (Math.abs(p.x - this.lightX(o)) < o.r * 0.8) lit = true;
    }
    this.lit = lit;
    const moving = p.stun <= 0 && p.mode !== 'crouch';
    if (lit && moving) {
      this.m.addGaze(this.m.diff.lightRate * (this.m.mods.easy ? 0.7 : 1) * dt, 'light', true);
      this.warnT -= dt;
      if (this.warnT <= 0) {
        this.m.warnPulse();
        this.warnT = 0.45;
      }
    } else this.warnT = 0;
  }

  cues() {
    const p = this.p;
    if (this.kind !== 'laser') return;
    for (const o of this.obs) {
      if (this.cued.has(o.type) || p.x < o.x - 115) continue;
      this.cued.add(o.type);
      const line = {
        gate: '문 레이저. 흐려지면 곧 꺼진다. 그때 지나가.',
        low: '발목 높이 레이저. 위로 쓸어 넘어.',
        high: '가슴 높이. 바로 앞에서 아래로 쓸어 미끄러져.',
        sweep: '오르내리는 레이저다. 머리 위로 올라갔을 때 지나가.',
      }[o.type];
      radio(line, 3000);
    }
  }

  // ---------- 3D ----------
  build() {
    const kind = this.kind;
    const L = (this.length + 400) * K;
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0x030303);
    scene.fog = new THREE.Fog(0x030303, 9, 26);
    scene.environment = getEnv();
    scene.environmentIntensity = 0.22;
    this.cam = new THREE.PerspectiveCamera(58, 0.5, 0.1, 60);

    // 바닥: 검은 대리석 + 흰 결
    const floorTex = marbleTex('#0d0c0d', '#d8d0c4', [L / 4, 1.5], 10);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(L + 20, 6),
      new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.06 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(L / 2 - 5, 0, 0.6);
    floor.receiveShadow = true;
    scene.add(floor);
    // 벽: 흰 대리석 패널을 어둠 속에
    const wallTex = marbleTex('#e7e1d6', '#8f8578', [L / 5, 1], 8);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(L + 20, 5), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.35, color: 0x6a645c }));
    wall.position.set(L / 2 - 5, 2.5, -2.1);
    scene.add(wall);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(L + 20, 6), new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(L / 2 - 5, 4.6, 0.6);
    scene.add(ceil);

    // 아르데코 금빛 선 (한 번의 드로우콜)
    const bars = [];
    const pil = [];
    const step = 3.3;
    for (let x = -4; x < L; x += step) {
      pil.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 2.3, -1.98), new THREE.Quaternion(), new THREE.Vector3(0.34, 4.6, 0.24)));
      bars.push(barMatrix(new THREE.Vector3(x - 0.17, 0.02, -1.85), new THREE.Vector3(x - 0.17, 4.5, -1.85), 0.012));
      bars.push(barMatrix(new THREE.Vector3(x + 0.17, 0.02, -1.85), new THREE.Vector3(x + 0.17, 4.5, -1.85), 0.012));
      const cx = x + step / 2;
      const z = -2.06;
      // 액자
      const fx0 = cx - 1.15;
      const fx1 = cx + 1.15;
      for (const [a, b] of [[[fx0, 0.45], [fx1, 0.45]], [[fx0, 3.7], [fx1, 3.7]], [[fx0, 0.45], [fx0, 3.7]], [[fx1, 0.45], [fx1, 3.7]]]) {
        bars.push(barMatrix(new THREE.Vector3(a[0], a[1], z), new THREE.Vector3(b[0], b[1], z), 0.014, 0.01));
      }
      // 부채꼴 햇살 문양
      const r = 0.95;
      for (let k = 0; k <= 8; k++) {
        const an = (k / 8) * Math.PI;
        bars.push(barMatrix(new THREE.Vector3(cx, 0.45, z), new THREE.Vector3(cx + Math.cos(an) * r, 0.45 + Math.sin(an) * r, z), 0.008, 0.008));
      }
      for (let k = 0; k < 16; k++) {
        const a0 = (k / 16) * Math.PI;
        const a1 = ((k + 1) / 16) * Math.PI;
        for (const rr of [r, r * 0.55]) {
          bars.push(barMatrix(new THREE.Vector3(cx + Math.cos(a0) * rr, 0.45 + Math.sin(a0) * rr, z), new THREE.Vector3(cx + Math.cos(a1) * rr, 0.45 + Math.sin(a1) * rr, z), 0.01, 0.008));
        }
      }
      // 마름모
      const dy = 2.75;
      const dd = 0.32;
      const pts = [[cx, dy + dd], [cx + dd, dy], [cx, dy - dd], [cx - dd, dy], [cx, dy + dd]];
      for (let k = 0; k < 4; k++) bars.push(barMatrix(new THREE.Vector3(pts[k][0], pts[k][1], z), new THREE.Vector3(pts[k + 1][0], pts[k + 1][1], z), 0.01, 0.008));
    }
    const box = new THREE.BoxGeometry(1, 1, 1);
    scene.add(instanced(box, MAT.gold(), bars));
    const pilMat = new THREE.MeshStandardMaterial({ map: marbleTex('#1a1817', '#cfc6b8', [1, 3], 6), roughness: 0.25 });
    scene.add(instanced(box, pilMat, pil));
    for (const y of [0.12, 4.15, 4.3]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(L + 20, y < 1 ? 0.24 : 0.05, 0.12), y < 1 ? pilMat : MAT.gold());
      c.position.set(L / 2 - 5, y, -2.02);
      scene.add(c);
    }

    // 조명: 따뜻한 키 라이트가 레드를 따라온다
    scene.add(new THREE.HemisphereLight(0x8a7560, 0x050403, 0.35));
    this.key = new THREE.PointLight(0xffd9a8, 16, 10, 1.6);
    this.key.castShadow = false;
    scene.add(this.key);

    // 레드
    this.fig = new Figure();
    scene.add(this.fig.group);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 32), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.005;
    scene.add(this.shadow);

    if (kind === 'laser') this.buildLasers(scene);
    else this.buildLights(scene);
    this.buildEnd(scene);
  }

  buildLasers(scene) {
    this.redLights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xff1a30, 0, 4.5, 1.8);
      scene.add(l);
      return l;
    });
    const gold = MAT.gold();
    const emitterGeo = new THREE.BoxGeometry(0.12, 0.06, 0.12);
    const postGeo = new THREE.CylinderGeometry(0.03, 0.035, 1, 16);
    for (const o of this.obs) {
      const x = o.x * K;
      const g = new THREE.Group();
      g.position.x = x;
      o.beams = [];
      if (o.type === 'gate') {
        for (const z of [-1.5, -0.75, 0, 0.75, 1.5]) {
          const b = buildBeam();
          b.position.set(0, 2.15, z);
          b.scale.y = 4.2;
          const e1 = new THREE.Mesh(emitterGeo, gold);
          e1.position.set(0, 4.27, z);
          const e2 = new THREE.Mesh(emitterGeo, gold);
          e2.position.set(0, 0.03, z);
          g.add(b, e1, e2);
          o.beams.push(b);
        }
      } else {
        const b = buildBeam();
        b.rotation.x = Math.PI / 2;
        b.scale.y = 3.9;
        g.add(b);
        o.beams.push(b);
        o.bar = b;
        const top = (o.type === 'sweep' ? o.hi : o.h) * K + 0.25;
        for (const z of [-1.95, 1.95]) {
          const post = new THREE.Mesh(postGeo, gold);
          post.scale.y = top;
          post.position.set(0, top / 2, z);
          post.castShadow = true;
          g.add(post);
          const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), gold);
          cap.position.set(0, top, z);
          g.add(cap);
        }
        o.heads = [-1.95, 1.95].map((z) => {
          const h = new THREE.Mesh(emitterGeo, MAT.onyx());
          h.position.set(0, 0, z);
          g.add(h);
          return h;
        });
      }
      // 바닥에 비치는 붉은 빛
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(o.type === 'gate' ? 0.9 : 1.1, 4.4), additive(0xff1030, 0.2, glowTex()));
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.006;
      g.add(pool);
      o.pool = pool;
      scene.add(g);
      o.g = g;
    }
  }

  buildLights(scene) {
    this.spot = new THREE.SpotLight(0xffe9c8, 0, 9, 0.42, 0.6, 1.2);
    scene.add(this.spot, this.spot.target);
    for (const o of this.obs) {
      const ch = buildChandelier(0.9);
      ch.position.set(((o.x0 + o.x1) / 2) * K, 3.95, -0.2);
      ch.userData.bulb.emissiveIntensity = 1.4;
      ch.userData.glow.material.opacity = 0.5;
      scene.add(ch);
      o.ch = ch;
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 1, 1, 32, 1, true), additive(0xffe2b8, 0.16, fadeTex()));
      scene.add(cone);
      o.cone = cone;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 48), additive(0xffe7c4, 0.32, glowTex()));
      pool.rotation.x = -Math.PI / 2;
      pool.scale.set(o.r * K * 1.3, o.r * K * 1.3 * 0.8, 1);
      scene.add(pool);
      o.pool = pool;
    }
  }

  buildEnd(scene) {
    const x = this.length * K + 0.6;
    const g = new THREE.Group();
    g.position.set(x, 0, -1.6);
    if (this.end === 'vault') {
      const door = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.3, 64), MAT.steel());
      door.rotation.x = Math.PI / 2;
      door.position.y = 1.7;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 12, 96), MAT.gold());
      rim.position.set(0, 1.7, 0.16);
      const hub = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 12, 64), MAT.gold());
      hub.position.set(0, 1.7, 0.17);
      g.add(door, rim, hub);
    } else if (this.end === 'curtain') {
      const geo = new THREE.PlaneGeometry(3, 4.3, 60, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 9) * 0.06);
      geo.computeVertexNormals();
      const c = new THREE.Mesh(geo, MAT.velvetRed());
      c.position.set(0.6, 2.15, 0.3);
      g.add(c);
    } else {
      const frame = [];
      const pts = [];
      for (let k = 0; k <= 16; k++) {
        const a = (k / 16) * Math.PI;
        pts.push(new THREE.Vector3(0.6 + Math.cos(a) * 0.9, 3 + Math.sin(a) * 0.9, 0.2));
      }
      frame.push(barMatrix(new THREE.Vector3(1.5, 0, 0.2), new THREE.Vector3(1.5, 3, 0.2), 0.05));
      frame.push(barMatrix(new THREE.Vector3(-0.3, 0, 0.2), new THREE.Vector3(-0.3, 3, 0.2), 0.05));
      for (let k = 0; k < 16; k++) frame.push(barMatrix(pts[k], pts[k + 1], 0.05));
      g.add(instanced(new THREE.BoxGeometry(1, 1, 1), MAT.gold(), frame));
      const dark = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.9), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      dark.position.set(0.6, 1.95, 0.15);
      g.add(dark);
    }
    scene.add(g);
  }

  render() {
    if (!this.scene) this.build();
    const p = this.p;
    const px = p.x * K;
    // 레드
    this.fig.group.position.set(px, p.jy * K, 0);
    this.fig.setPose(p.mode, p.ph);
    const blink = p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0;
    this.fig.group.visible = !blink;
    this.shadow.position.x = px + 0.05;
    this.shadow.scale.setScalar(1 - Math.min(0.6, p.jy * K));
    this.key.position.set(px + 1.2, 3.9, -0.9);

    if (this.kind === 'laser') {
      const near = [];
      for (const o of this.obs) {
        const on = this.isOn(o);
        const a = !on ? 0.06 : this.dimmed(o) ? 0.35 : 1;
        for (const b of o.beams) b.userData.set(a);
        o.pool.material.opacity = 0.12 * a;
        if (o.bar) {
          const h = (o.type === 'sweep' ? this.sweepH(o) : o.h) * K;
          o.bar.position.y = h;
          for (const hd of o.heads) hd.position.y = h;
          o.pool.position.y = 0.006;
        }
        const d = o.x * K - px;
        if (on && d > -2 && d < 7) near.push({ o, d, a });
      }
      near.sort((u, v) => Math.abs(u.d) - Math.abs(v.d));
      this.redLights.forEach((l, i) => {
        const n = near[i];
        if (!n) { l.intensity = 0; return; }
        l.position.set(n.o.x * K, n.o.bar ? n.o.bar.position.y + 0.3 : 1.6, 0.4);
        l.intensity = 9 * n.a;
      });
    } else {
      let best = null;
      for (const o of this.obs) {
        const cx = this.lightX(o) * K;
        const top = o.ch.position;
        const bottom = new THREE.Vector3(cx, 0, 0);
        const len = top.distanceTo(bottom);
        o.cone.position.copy(top).add(bottom).multiplyScalar(0.5);
        o.cone.scale.set(o.r * K * 1.1, len, o.r * K * 0.9);
        o.cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), bottom.clone().sub(top).normalize());
        o.pool.position.set(cx, 0.008, 0);
        if (!best || Math.abs(cx - px) < Math.abs(best.cx - px)) best = { o, cx };
      }
      if (best) {
        this.spot.position.copy(best.o.ch.position);
        this.spot.target.position.set(best.cx, 0, 0);
        this.spot.intensity = 30;
      }
      this.fig.mat.emissive?.setHex(this.lit ? 0x2a2216 : 0x000000);
    }

    // 카메라: 레드의 오른쪽 뒤에서 회랑 앞쪽을 내다보는 추적 시점
    const slow = this.m.timeScale < 1 ? 1 : 0;
    this.camK = (this.camK ?? 1) + ((slow ? 0.72 : 1) - (this.camK ?? 1)) * 0.08;
    const k = this.camK;
    this.camX = this.camX === undefined ? px : this.camX + (px - this.camX) * 0.15;
    const cx = this.camX;
    this.cam.position.set(cx - 5.4 * k, 2.7 * k + 0.4, 2.7 * k);
    this.cam.lookAt(cx + 3.6, 0.8, -0.7);
    draw(this.scene, this.cam);
  }

  dispose() {
    this.scene?.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
