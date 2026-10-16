// 2단계 컬렉션 금고 (Love · Trinity). 정답 각도 3개를 소리·진동·금빛 번짐으로 찾는다.
import { clamp, lerp, rand, angDiff } from '../util.js';
import { THREE, MAT, getEnv, marbleTex, additive, barMatrix, instanced, draw, fitDist } from '../gfx.js';
import { audio } from '../audio.js';
import { haptics } from '../haptics.js';
import { radio, hint, edge } from '../ui.js';
import { input, isTouch } from '../input.js';
import { L as T } from '../lines.js';

const NEAR = 8;
const OVERSHOOT = 38;

export class Vault {
  constructor(m) {
    this.m = m;
    this.type = m.piece.vault;
    const d = m.diff;
    this.tol = d.tol + (m.mods.easy ? 2 : 0);
    this.timeLimit = d.vaultTime;
    this.timeLeft = this.timeLimit;
    this.range = m.mods.loupe ? 135 : 115;
    this.angles = [0, 0, 0]; // trinity 각 링 / love는 0번만 사용
    this.idx = 0; // 찾고 있는 정답 번호
    this.targets = [];
    this.newTarget();
    this.t = 0;
    this.pulseT = 0.6;
    this.pulseFx = 0;
    this.stillT = 0;
    this.nearAt = null;
    this.moveAcc = 0;
    this.drag = null;
    this.opening = -1;
    this.lockFx = 0;
    this.overshoots = 0;
    this.done = false;
    this.watch = null;
    this.stepT = m.diff.id === 'apprentice' ? 999 : 9 + Math.random() * 4;
    this.turnedInWatch = 0;
  }

  get ring() { return this.type === 'love' ? 0 : this.idx; }
  get angle() { return this.angles[this.ring]; }
  set angle(v) { this.angles[this.ring] = v; }
  get target() { return this.targets[this.idx]; }

  newTarget() {
    const cur = this.type === 'love' ? this.angles[0] : this.angles[this.idx] || 0;
    let t;
    do t = rand(0, 360); while (Math.abs(angDiff(t, cur)) < 80);
    this.targets[this.idx] = t;
  }

  enter() {
    const name = this.type === 'love' ? 'Love 금고' : 'Trinity 금고';
    const [l1, l2] = T.vault.intro(name);
    radio(l1, 2200);
    radio(l2, 3600);
    hint(isTouch ? '<span class="kc">드래그</span> 다이얼 돌리기 · 신호가 꽉 차면 손 떼고 기다리기'
      : '<kbd>A</kbd><kbd>D</kbd> 또는 <kbd>드래그</kbd> · <kbd>휠</kbd> 돌리기 <kbd>Shift</kbd> 정밀 · 신호가 꽉 차면 멈추기', this.m.store.tutorialDone ? 6000 : 10000);
    const el = document.createElement('div');
    el.id = 'vaultui';
    el.innerHTML = '<p class="lb">신호</p><div class="bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="steady"><b></b><span>멈춰서 기다리기</span></div>';
    document.getElementById('app').appendChild(el);
    this.ui = { el, bars: [...el.querySelectorAll('.bars i')], steady: el.querySelector('.steady'), ring: el.querySelector('.steady b') };
  }

  // ---------- 입력 ----------
  down(e) {
    const { cx, cy } = this.screenCenter();
    const r = Math.hypot(e.x - cx, e.y - cy);
    this.drag = r > 18 ? { a: Math.atan2(e.y - cy, e.x - cx) } : null;
  }

  move(e) {
    if (this.opening >= 0) return;
    const { cx, cy } = this.screenCenter();
    const r = Math.hypot(e.x - cx, e.y - cy);
    if (r < 18) return;
    const a = Math.atan2(e.y - cy, e.x - cx);
    if (!this.drag) {
      this.drag = { a };
      return;
    }
    let d = ((a - this.drag.a) * 180) / Math.PI;
    d = angDiff(d, 0);
    this.drag.a = a;
    this.turn(d);
  }

  // 모든 입력(드래그·키보드·휠)이 이 한 곳으로 모인다
  turn(d) {
    if (this.opening >= 0 || !d) return;
    this.angle = (this.angle + d + 360) % 360;
    if (Math.abs(d) > 0.3) this.stillT = 0;
    this.moveAcc += Math.abs(d);
    this.turnedInWatch += Math.abs(d);
    if (this.moveAcc >= 4) {
      this.moveAcc = 0;
      audio.tick(this.prox() * 0.6, 'move');
    }
  }

  wheel(dy) { this.turn(Math.sign(dy) * 1.5); }

  // 키보드: A/D · ←/→ (Shift = 정밀)
  keys(dt) {
    const dir = (input.down('KeyD') || input.down('ArrowRight') ? 1 : 0) - (input.down('KeyA') || input.down('ArrowLeft') ? 1 : 0);
    if (!dir) { this.keyHold = 0; return; }
    this.keyHold = (this.keyHold || 0) + dt;
    const fine = input.down('ShiftLeft') || input.down('ShiftRight');
    const sp = fine ? 10 : Math.min(90, 25 + this.keyHold * 60);
    this.turn(dir * sp * dt);
  }

  // 단계 중간에 관리인 발소리: 신호 뒤 2초 동안은 다이얼에서 손을 떼야 한다
  footsteps(dt) {
    this.stepT -= dt;
    if (this.watch === 'warn' && this.stepT <= 0) {
      this.watch = 'hold';
      this.stepT = 2.2;
      this.turnedInWatch = 0;
      this.warnedTurn = false;
      document.getElementById('app').classList.add('hush');
    } else if (this.watch === 'hold') {
      if (this.turnedInWatch > 3 && !this.warnedTurn) {
        this.warnedTurn = true;
        this.m.addGaze(20, 'vault');
        if (this.m.state === 'play') radio(T.vault.stepsHeard, 2000);
      }
      if (this.stepT <= 0) {
        this.watch = null;
        this.stepT = 11 + Math.random() * 6;
        document.getElementById('app').classList.remove('hush');
        radio(T.vault.stepsGone, 1500);
      }
    } else if (!this.watch && this.stepT <= 0) {
      this.watch = 'warn';
      this.stepT = 1.4;
      audio.warn();
      haptics.warn();
      radio(T.vault.stepsWarn, 2400);
    }
  }

  up() { this.drag = null; }

  prox() {
    const dist = Math.abs(angDiff(this.angle, this.target));
    return clamp(1 - dist / this.range, 0, 1);
  }

  // ---------- 진행 ----------
  update(dt) {
    if (this.done) return;
    this.t += dt;
    this.pulseFx = Math.max(0, this.pulseFx - dt * 2.2);
    this.lockFx = Math.max(0, this.lockFx - dt * 1.4);

    if (this.opening >= 0) {
      this.opening += dt;
      if (this.opening > 1.5) {
        this.done = true;
        hint('');
        this.m.stageClear({ gaze: this.m.stageGaze, timeLeft: this.timeLeft });
      }
      return;
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.m.reveal('time');
      return;
    }
    this.keys(dt);
    this.footsteps(dt);
    if (this.timeLeft < 10 && !this.warned10) {
      this.warned10 = true;
      radio(T.vault.ten, 1800);
    }

    const dist = Math.abs(angDiff(this.angle, this.target));
    const prox = clamp(1 - dist / this.range, 0, 1);

    // 째깍: 가까울수록 간격이 짧아진다
    this.pulseT -= dt;
    if (this.pulseT <= 0) {
      const k = this.m.mods.loupe ? 1.25 : 1;
      this.pulseT = lerp(1.0, 0.085, Math.pow(prox, 1.4 / k));
      audio.tick(prox, 'pulse');
      if (prox > 0.35) haptics.tick();
      this.pulseFx = 1;
    }

    // 크게 지나치면 시선
    if (dist < NEAR) this.nearAt = this.t;
    else if (this.nearAt !== null) {
      if (dist > OVERSHOOT && this.t - this.nearAt < 1.4) {
        this.nearAt = null;
        this.overshoots++;
        this.m.addGaze(15, 'vault');
        if (this.m.state === 'play') radio(T.vault.over, 2000);
      } else if (this.t - this.nearAt >= 1.4) this.nearAt = null;
    }

    // 정답에서 0.5초 멈추면 딸깍
    this.stillT += dt;
    if (dist <= this.tol && this.stillT >= 0.5) this.lock();
  }

  lock() {
    audio.clunk();
    haptics.clunk();
    edge('gold');
    this.lockFx = 1;
    this.nearAt = null;
    this.stillT = 0;
    this.idx++;
    if (this.idx >= 3) {
      this.opening = 0;
      setTimeout(() => audio.door(), 250);
      radio(T.vault.open, 1800);
      return;
    }
    this.newTarget();
    radio(T.vault.locks[this.idx - 1], 1600);
  }

  // ---------- 3D ----------
  build() {
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.userData.fx = { bloom: 0.35, threshold: 0.95, grain: 0.04, vignette: 0.5 };
    scene.background = new THREE.Color(0x040404);
    scene.environment = getEnv();
    scene.environmentIntensity = 0.55;
    this.cam = new THREE.PerspectiveCamera(38, 0.5, 0.1, 50);

    // 금고실 벽
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshStandardMaterial({ map: marbleTex('#141313', '#bfb5a6', [3, 3], 10), roughness: 0.3 }));
    wall.position.z = -0.6;
    scene.add(wall);
    // 거대한 원형 금고 문
    this.door = new THREE.Group();
    scene.add(this.door);
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.6, 0.5, 96), MAT.steel());
    slab.rotation.x = Math.PI / 2;
    this.door.add(slab);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.06, 16, 128), MAT.gold());
    rim.position.z = 0.26;
    this.door.add(rim);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.02, 12, 128), MAT.goldSatin());
    rim2.position.z = 0.26;
    this.door.add(rim2);
    const bolt = new THREE.CylinderGeometry(0.07, 0.07, 0.08, 24);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const b = new THREE.Mesh(bolt, MAT.gold());
      b.rotation.x = Math.PI / 2;
      b.position.set(Math.cos(a) * 2.45, Math.sin(a) * 2.45, 0.27);
      this.door.add(b);
    }

    // 다이얼
    const R = 1.75;
    this.R = R;
    this.dials = [];
    const ring = (ro, ri, depth, mat) => {
      const shape = new THREE.Shape();
      shape.absarc(0, 0, ro, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, ri, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 96 });
      return new THREE.Mesh(geo, mat);
    };
    const ticks = (ro, ri, n, mat, z) => {
      const ms = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const big = k % 6 === 0;
        const r1 = ro - 0.03;
        const r0 = ro - (ro - ri) * (big ? 0.42 : 0.22);
        ms.push(barMatrix(new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, z), new THREE.Vector3(Math.cos(a) * r1, Math.sin(a) * r1, z), big ? 0.014 : 0.007, 0.01));
      }
      return instanced(new THREE.BoxGeometry(1, 1, 1), mat, ms);
    };
    if (this.type === 'love') {
      const d = new THREE.Group();
      d.position.z = 0.3;
      d.add(ring(R, R * 0.66, 0.12, MAT.gold()));
      d.add(ticks(R, R * 0.66, 72, MAT.onyx(), 0.155));
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const sc = screw(R * 0.07);
        sc.position.set(Math.cos(a) * R * 0.83, Math.sin(a) * R * 0.83, 0.16);
        sc.rotation.z = a;
        d.add(sc);
      }
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.08, 96), MAT.onyx());
      plate.rotation.x = Math.PI / 2;
      plate.position.z = 0.04;
      d.add(plate);
      const center = screw(R * 0.17);
      center.position.z = 0.1;
      d.add(center);
      // 전용 드라이버
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, R * 0.5, 16), MAT.white());
      shaft.rotation.z = -Math.PI / 2;
      shaft.position.set(R * 0.25, 0, 0.3);
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.38, 8, 24), MAT.onyx());
      grip.rotation.z = -Math.PI / 2;
      grip.position.set(R * 0.64, 0, 0.3);
      const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.06, 24), MAT.gold());
      ferrule.rotation.z = -Math.PI / 2;
      ferrule.position.set(R * 0.47, 0, 0.3);
      d.add(shaft, grip, ferrule);
      this.door.add(d);
      this.dials = [d];
    } else {
      const bands = [[R, R * 0.78, MAT.rose()], [R * 0.74, R * 0.52, MAT.gold()], [R * 0.48, R * 0.27, MAT.white()]];
      bands.forEach(([ro, ri, mat], i) => {
        const d = new THREE.Group();
        d.position.z = 0.3 + i * 0.04;
        d.add(ring(ro, ri, 0.1, mat));
        d.add(ticks(ro, ri, 48 - i * 12, MAT.onyx(), 0.135));
        this.door.add(d);
        this.dials.push(d);
      });
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.24, R * 0.24, 0.12, 64), MAT.onyx());
      cap.rotation.x = Math.PI / 2;
      cap.position.z = 0.4;
      this.door.add(cap);
    }
    // 금빛 번짐 링 · 째깍 파동
    this.glow = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 8, 160), additive(0xffc977, 0));
    this.glow.position.z = 0.55;
    this.door.add(this.glow);
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.08, 160), additive(0xffc977, 0, null));
    this.halo.position.z = 0.54;
    this.door.add(this.halo);
    this.wave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 160), additive(0xffffff, 0));
    this.wave.position.z = 0.5;
    this.door.add(this.wave);
    // 12시 표시
    const mark = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.2, 3), MAT.gold());
    mark.rotation.z = Math.PI;
    mark.position.set(0, R + 0.22, 0.5);
    this.door.add(mark);
    // 진행 표시 3개
    this.dots = [-1, 0, 1].map((k) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 32), MAT.gold());
      m.position.set(k * 0.32, -2.95, 0.3);
      scene.add(m);
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), MAT.gold());
      f.position.copy(m.position);
      f.visible = false;
      scene.add(f);
      return f;
    });

    scene.add(new THREE.HemisphereLight(0xfff1dd, 0x0a0806, 0.25));
    const key = new THREE.SpotLight(0xffe6c0, 120, 20, 0.55, 0.7, 1.3);
    key.position.set(-3, 5, 7);
    key.target.position.set(0, 0, 0);
    scene.add(key, key.target);
    const rimL = new THREE.PointLight(0xc8d4ff, 8, 12);
    rimL.position.set(4, -3, 3);
    scene.add(rimL);
    this.flood = new THREE.PointLight(0xffd9a0, 0, 12);
    this.flood.position.set(0, 0, -0.3);
    scene.add(this.flood);
  }

  // 화면 좌표의 다이얼 중심
  screenCenter() {
    if (!this.scene) this.build();
    this.cam.aspect = this.m.W / this.m.H;
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    const v = new THREE.Vector3(0, 0, 0.3).project(this.cam);
    return { cx: (v.x * 0.5 + 0.5) * this.m.W, cy: (-v.y * 0.5 + 0.5) * this.m.H };
  }

  render() {
    if (!this.scene) this.build();
    const open = this.opening >= 0 ? clamp(this.opening / 1.2, 0, 1) : 0;
    const prox = this.opening >= 0 ? 0 : this.prox();
    if (this.type === 'love') this.dials[0].rotation.z = (-this.angles[0] * Math.PI) / 180;
    else this.dials.forEach((d, i) => {
      d.rotation.z = (-this.angles[i] * Math.PI) / 180;
      d.position.z = 0.3 + i * 0.04 + (i === this.idx ? 0.06 : 0);
    });
    const rr = this.type === 'love' ? this.R : [this.R, this.R * 0.74, this.R * 0.48][Math.min(this.idx, 2)];
    const assist = this.m.store.settings.assist;
    const p2 = prox * prox;
    this.glow.scale.setScalar(rr + 0.05);
    this.glow.material.opacity = assist ? 0.08 + p2 * 0.45 : 0;
    this.halo.scale.setScalar(rr + 0.05);
    this.halo.material.opacity = assist ? p2 * 0.12 : 0;
    this.wave.scale.setScalar(rr * (1.04 + (1 - this.pulseFx) * 0.12));
    this.wave.material.opacity = this.pulseFx * 0.25 + this.lockFx * 0.6;
    this.dots.forEach((d, i) => { d.visible = i < this.idx; });
    if (this.ui) {
      const n = Math.round(prox * 7);
      this.ui.bars.forEach((b, i) => b.classList.toggle('on', i < n));
      const dist = this.opening >= 0 ? 999 : Math.abs(angDiff(this.angle, this.target));
      const inTol = dist <= this.tol;
      this.ui.steady.classList.toggle('on', inTol);
      this.ui.ring.style.setProperty('--p', inTol ? Math.min(100, (this.stillT / 0.5) * 100) : 0);
      this.ui.el.classList.toggle('hold', this.watch === 'hold' || this.watch === 'warn');
    }
    // 문이 열린다
    this.door.rotation.y = open * 1.2;
    this.door.position.x = -open * 1.8;
    this.door.position.z = open * 0.8;
    this.flood.intensity = open * 60;
    const dist = fitDist(this.cam, 2.95, 3.6);
    this.cam.position.set(0, -0.3, dist * (1 - open * 0.15));
    this.cam.lookAt(0, -0.25, 0);
    draw(this.scene, this.cam);
  }

  dispose() {
    document.getElementById('app').classList.remove('hush');
    this.ui?.el.remove();
  }
}

function screw(r) {
  const g = new THREE.Group();
  const head = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, r * 0.45, 32), MAT.gold());
  head.rotation.x = Math.PI / 2;
  const slot = new THREE.Mesh(new THREE.BoxGeometry(r * 1.55, r * 0.22, r * 0.3), MAT.onyx());
  slot.position.z = r * 0.2;
  g.add(head, slot);
  return g;
}
