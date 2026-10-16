// 3단계 벨벳 레플리카 바꿔치기. 길게 눌러 무게를 채우고 금빛 띠 안에서 손을 뗀다.
import { clamp, rand } from '../util.js';
import { THREE, MAT, getEnv, marbleTex, additive, fadeTex, draw, fitDist } from '../gfx.js';
import { Figure, buildPiece, buildCard } from '../models.js';
import { audio } from '../audio.js';
import { haptics } from '../haptics.js';
import { radio, hint, edge } from '../ui.js';
import { input, isTouch } from '../input.js';

const ROUNDS = 3;
const GUARD_CYCLE = 5.2;
const GUARD_OPEN = 2.0;

export class Swap {
  constructor(m) {
    this.m = m;
    const d = m.diff;
    this.timeLimit = d.swapTime;
    this.timeLeft = this.timeLimit;
    this.round = 0;
    this.state = 'idle'; // idle | fill | result | card
    this.v = 0;
    this.ft = 0;
    this.rt = 0;
    this.t = 0;
    this.msg = '';
    this.ok = false;
    this.perfect = false;
    this.fails = 0;
    this.window = d.guardWindow;
    this.done = false;
    this.newRound();
  }

  newRound() {
    const d = this.m.diff;
    let w = d.band + (this.m.mods.easy ? 6 : 0);
    if (this.m.piece.hard) w *= 0.8;
    w *= 1 - this.round * 0.08;
    this.bw = w;
    this.bc = rand(42, 84);
    this.T = d.swapFill * rand(0.88, 1.12);
    this.jit = d.jitter * (this.m.mods.glove ? 0.55 : 1);
    this.seed = rand(0, 10);
    this.v = 0;
  }

  enter() {
    radio('비밀 전시실. 진열대 압력 센서는 3중이다.', 2600);
    radio('레플리카를 길게 눌러. 금빛 띠에서 손을 떼.', 3200);
    if (this.window) radio('관리인이 진열대 앞을 지나는 2초. 그때만 바꿀 수 있다.', 3400);
    hint(isTouch ? '길게 누르기 — 무게 채우기 · 금빛 띠 안에서 떼기' : '마우스 · Space 길게 — 무게 채우기 · 금빛 띠 안에서 떼기', this.m.store.tutorialDone ? 7000 : 0);
  }

  guardOpen() {
    if (!this.window) return true;
    return (this.t % GUARD_CYCLE) > GUARD_CYCLE - GUARD_OPEN;
  }

  down() {
    if (this.state !== 'idle') return;
    this.state = 'fill';
    this.ft = 0;
    this.v = 0;
    audio.humStart();
  }

  move() {}

  up() {
    if (this.state === 'fill') this.judge(this.v);
  }

  judge(v) {
    audio.humStop();
    const inBand = Math.abs(v - this.bc) <= this.bw / 2;
    const okWin = this.guardOpen();
    this.state = 'result';
    this.rt = 0;
    this.v = v;
    if (inBand && okWin) {
      this.ok = true;
      this.perfect = Math.abs(v - this.bc) <= 2;
      audio.swish();
      if (this.perfect) {
        this.m.perfects++;
        this.msg = '완벽한 손놀림';
        audio.chime();
        haptics.perfect();
        edge('gold');
      } else {
        this.msg = ['첫 번째 센서', '두 번째 센서', '세 번째 센서'][this.round];
        haptics.clunk();
      }
    } else {
      this.ok = false;
      this.perfect = false;
      this.fails++;
      this.msg = !okWin && inBand ? '관리인의 시선' : v > this.bc ? '너무 무겁다' : '너무 가볍다';
      this.m.addGaze(!okWin && inBand ? 30 : 50, 'swap');
      if (this.m.state === 'play') radio(!okWin && inBand ? '관리인이 보고 있었다. 지나갈 때를 노려.' : '센서가 반응했다. 다시.', 2200);
    }
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    // 키보드: Space 길게
    const sp = input.down('Space') || input.down('Enter');
    if (sp && !this.keyDown) { this.keyDown = true; this.down(); } else if (!sp && this.keyDown) { this.keyDown = false; this.up(); }
    if (this.state !== 'card') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        audio.humStop();
        this.m.reveal('time');
        return;
      }
    }
    if (this.state === 'fill') {
      this.ft += dt;
      const base = 100 * Math.pow(this.ft / this.T, 1.5);
      const j = this.jit * (Math.sin(this.ft * 17 + this.seed) + 0.5 * Math.sin(this.ft * 31 + this.seed * 2));
      this.v = clamp(base + j * Math.min(1, base / 20), 0, 100);
      audio.humSet(this.v);
      if (base >= 100) this.judge(100.1);
    } else if (this.state === 'result') {
      this.rt += dt;
      if (this.rt > 1.15) {
        if (this.ok) {
          this.round++;
          if (this.round >= ROUNDS) {
            this.state = 'card';
            this.rt = 0;
            audio.card();
            hint('');
            return;
          }
        }
        this.newRound();
        this.state = 'idle';
      }
    } else if (this.state === 'card') {
      this.rt += dt;
      if (this.rt > 2.2) {
        this.done = true;
        this.m.stageClear({ fails: this.fails });
      }
    }
  }

  // ---------- 3D ----------
  build() {
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.userData.fx = { bloom: 0.7, threshold: 0.88, grain: 0.045, vignette: 0.55 };
    scene.background = new THREE.Color(0x030202);
    scene.fog = new THREE.Fog(0x030202, 6, 14);
    scene.environment = getEnv();
    scene.environmentIntensity = 0.5;
    this.cam = new THREE.PerspectiveCamera(34, 0.5, 0.1, 40);

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshPhysicalMaterial({ map: marbleTex('#0e0d0d', '#cfc5b6', [4, 4], 10), roughness: 0.2, clearcoat: 1 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // 벨벳 커튼
    const geo = new THREE.PlaneGeometry(14, 7, 160, 1);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 6) * 0.09 + Math.sin(pos.getX(k) * 13) * 0.03);
    geo.computeVertexNormals();
    const curtain = new THREE.Mesh(geo, MAT.velvetRed());
    curtain.position.set(0, 3.5, -3);
    scene.add(curtain);
    // 진열대: 검은 벨벳 기둥 + 금빛 테
    const ped = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.0, 64), MAT.velvet());
    col.position.y = 0.5;
    col.castShadow = col.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 64), MAT.velvet());
    top.position.y = 1.03;
    top.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 12, 96), MAT.gold());
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.06;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 0.06, 64), MAT.gold());
    base.position.y = 0.03;
    ped.add(col, top, rim, base);
    this.sensors = [-1, 0, 1].map((k) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshStandardMaterial({ color: 0x3a3226, emissive: 0x000000, metalness: 0.6, roughness: 0.3 }));
      m.position.set(k * 0.12, 0.85, 0.44);
      ped.add(m);
      return m;
    });
    scene.add(ped);
    this.piece = buildPiece(this.m.piece.id);
    this.piece.scale.setScalar(0.42);
    this.piece.position.y = 1.32;
    scene.add(this.piece);
    this.card = buildCard();
    this.card.visible = false;
    scene.add(this.card);

    // 스포트라이트 하나
    const spot = new THREE.SpotLight(0xfff0d8, 70, 10, 0.3, 0.55, 1.2);
    spot.position.set(0.4, 5.2, 1.2);
    spot.target.position.set(0, 1.1, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.bias = -0.0005;
    scene.add(spot, spot.target);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.75, 4.2, 48, 1, true), additive(0xfff0d8, 0.07, fadeTex()));
    beam.position.set(0.2, 3.1, 0.6);
    beam.rotation.z = 0.08;
    scene.add(beam);
    scene.add(new THREE.HemisphereLight(0x8a6a60, 0x050303, 0.25));
    const kick = new THREE.PointLight(0xffd9b0, 6, 6);
    kick.position.set(-1.2, 1.8, 2);
    scene.add(kick);
    this.guard = new Figure({ material: MAT.guard(), hat: 'cap', scale: 1.05 });
    this.guard.group.position.set(-6, 0, -1.8);
    this.guard.group.visible = false;
    scene.add(this.guard.group);
    this.buildUI();
  }

  buildUI() {
    const el = document.createElement('div');
    el.id = 'swapui';
    el.innerHTML = `
      <p class="win"></p>
      <div class="gauge"><span class="lb">무게</span><span class="rd"></span><div class="band"><i></i></div><div class="fill"></div></div>
      <p class="msg"></p>
      <div class="replica"><b></b><span>레플리카</span></div>`;
    document.getElementById('app').appendChild(el);
    this.ui = {
      el,
      win: el.querySelector('.win'),
      band: el.querySelector('.band'),
      fill: el.querySelector('.fill'),
      rd: el.querySelector('.rd'),
      msg: el.querySelector('.msg'),
      rep: el.querySelector('.replica'),
      ring: el.querySelector('.replica b'),
    };
  }

  render() {
    if (!this.scene) this.build();
    const t = this.t;
    // 피스: 천천히 돌고, 마지막에 사라지며 방문 카드가 내려앉는다
    this.piece.rotation.y = t * 0.6;
    this.piece.position.y = 1.32 + Math.sin(t * 1.4) * 0.015;
    if (this.state === 'card') {
      const u = clamp(this.rt / 0.7, 0, 1);
      this.piece.scale.setScalar(0.42 * (1 - u));
      this.piece.position.y = 1.32 + u * 0.4;
      const cu = clamp((this.rt - 0.6) / 0.8, 0, 1);
      const e = 1 - Math.pow(1 - cu, 3);
      this.card.visible = cu > 0;
      this.card.position.set(0, 1.065 + (1 - e) * 0.8, 0.05);
      this.card.rotation.set(0, -0.25 + (1 - e) * 1.2, (1 - e) * 0.6);
    }
    this.sensors.forEach((m, i) => {
      const on = i < this.round || (this.state === 'result' && this.ok && i === this.round);
      m.material.emissive.setHex(on ? 0xffc46a : 0x000000);
      m.material.emissiveIntensity = on ? 2 : 0;
    });
    // 관리인 (전설): 진열대 뒤를 지나며 2초 동안 시야를 가린다
    if (this.window) {
      const c = t % GUARD_CYCLE;
      const u = (c - (GUARD_CYCLE - GUARD_OPEN - 0.7)) / (GUARD_OPEN + 1.4);
      this.guard.group.visible = u > 0 && u < 1;
      this.guard.group.position.x = -3.2 + u * 6.4;
      this.guard.setPose('walk', t * 6.5);
    }
    const dist = fitDist(this.cam, 1.05, 1.55);
    this.cam.position.set(Math.sin(t * 0.15) * 0.25, 1.35 + dist * 0.12, dist);
    this.cam.lookAt(0, 0.62, 0);
    draw(this.scene, this.cam);

    // DOM 게이지
    const ui = this.ui;
    const open = this.guardOpen();
    ui.el.className = `${this.state} ${open ? 'open' : 'closed'}`;
    ui.win.textContent = this.window ? (open ? '관리인이 시야를 가린다 — 지금' : '관리인을 기다려') : '';
    ui.band.style.left = `${this.bc - this.bw / 2}%`;
    ui.band.style.width = `${this.bw}%`;
    ui.fill.style.width = `${this.v}%`;
    ui.fill.classList.toggle('bad', this.state === 'result' && !this.ok);
    ui.rd.textContent = `${Math.min(this.round + 1, ROUNDS)} / ${ROUNDS}`;
    ui.msg.textContent = this.state === 'result' ? this.msg : this.state === 'card' && this.rt > 1.3 ? '레드가 다녀갔습니다' : '';
    ui.msg.classList.toggle('perfect', this.state === 'result' && this.perfect);
    ui.ring.style.setProperty('--p', this.state === 'fill' ? this.v : 0);
  }

  dispose() {
    this.ui?.el.remove();
  }
}
