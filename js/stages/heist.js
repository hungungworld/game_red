// 잠입 스테이지: 위에서 내려다보는 메종을 자유롭게 이동한다.
// 관리인 시야·감시 카메라·레이저(점멸·틈·회전·차선)·퓨즈·수집품.
import { clamp, pingpong, angDiff } from '../util.js';
import { THREE, MAT, getEnv, draw, fitDist, glowTex } from '../gfx.js';
import { Humanoid } from '../models.js';
import {
  checkerFloor, buildWalls, buildColumn, buildCase, buildFuse, buildExit, buildCamera, buildEmblem,
  buildLaser, placeLaser, buildEmitter, VisionFan, markSprite, buildDust,
} from '../props.js';
import { LEVELS } from '../levels.js';
import { input, isTouch, showPad, setPadAction } from '../input.js';
import { audio } from '../audio.js';
import { haptics } from '../haptics.js';
import { radio, hint, edge } from '../ui.js';
import { L as T, pick } from '../lines.js';

const R = 0.27;
const SPEED = { walk: 3.3, sneak: 1.65, dash: 7.6 };
const DIFF_I = { apprentice: 0, pro: 1, legend: 2 };
const SOLID = new Set(['#', 'O', 'D', 'F']);
const SIGHT_BLOCK = new Set(['#', 'O']);
const D2R = Math.PI / 180;

export class Heist {
  constructor(m, levelId) {
    this.m = m;
    this.L = LEVELS[levelId];
    this.map = this.L.map;
    this.h = this.map.length;
    this.w = this.map[0].length;
    const di = DIFF_I[m.diff.id] ?? 0;
    this.di = di;
    this.mod = {
      guardSpeed: [0.85, 1, 1.15][di],
      vision: [0.85, 1, 1.12][di],
      detect: [0.65, 1, 1.35][di] * (m.mods.easy ? 0.7 : 1),
      laser: [0.8, 1, 1.2][di],
      hit: m.diff.hitGaze * (m.mods.easy ? 0.75 : 1) * 0.85,
    };
    this.t = 0;
    this.done = false;
    this.timeLimit = null;
    this.disabled = new Set();
    this.hits = 0;
    this.alerts = 0;
    this.emblemsGot = 0;
    this.sinceSeen = 9;
    this.nearCd = 0;

    this.emblems = [];
    this.cases = [];
    this.cols = [];
    this.map.forEach((row, z) => [...row].forEach((ch, x) => {
      if (ch === 'S') this.start = [x + 0.5, z + 0.5];
      if (ch === 'E') this.exit = [x + 0.5, z + 0.5];
      if (ch === 'P') this.emblems.push({ x: x + 0.5, z: z + 0.5, got: false });
      if (ch === 'D') this.cases.push([x, z]);
      if (ch === 'O') this.cols.push([x, z]);
    }));
    this.p = { x: this.start[0], z: this.start[1], vx: 0, vz: 0, face: Math.PI, inv: 0, dashT: 0, dashCd: 0, noiseT: 0, mode: 'idle' };
    const ok = (o) => !o.minDiff || DIFF_I[o.minDiff] <= di;
    this.lasers = this.L.lasers.map((l) => ({ ...l, segs: [], meshes: [] }));
    this.fuses = this.L.fuses.map((f) => ({ ...f, x: f.pos[0] + 0.5, z: f.pos[1] + 0.5, prog: 0, done: false }));
    this.guards = this.L.guards.filter(ok).map((g) => ({
      path: g.path, wait: g.wait ?? 1, wi: 1, x: g.path[0][0], z: g.path[0][1], face: 0,
      state: 'patrol', waitT: 0, seenT: 0, lostT: 0, lookT: 0, target: null, speed: 1.35 * this.mod.guardSpeed,
      range: 5.4 * this.mod.vision, fov: 74,
    }));
    for (const g of this.guards) g.face = Math.atan2(g.path[1][1] - g.z, g.path[1][0] - g.x);
    this.cams = this.L.cams.filter(ok).map((c) => ({ ...c, x: c.pos[0], z: c.pos[1], ang: c.dir, range: c.range * this.mod.vision, seen: false }));
  }

  enter() {
    const key = this.m.flow[this.m.idx].key;
    radio(pick(T.heist[key] || T.heist.gallery), 2600);
    hint(isTouch
      ? '<span class="kc">왼쪽 엄지</span> 이동 <span class="kc">살금</span> 조용히 <span class="kc">대시</span> 빠르게'
      : '<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 이동 <kbd>Shift</kbd> 살금 <kbd>Space</kbd> 대시 <kbd>E</kbd> 조작', this.m.store.tutorialDone ? 5000 : 9000);
    showPad(true);
    this.cued = new Set();
    this.lineCd = 0;
    this.setObjective();
  }

  say(text, ms = 2400, force = false) {
    if (!force && this.lineCd > 0) return;
    this.lineCd = 3;
    radio(text, ms);
  }

  // 처음 마주치는 장치마다 한 번씩 짧게 알려 준다
  cues() {
    const p = this.p;
    for (const l of this.lasers) {
      if (this.cued.has(l.kind) || !l.segs.length) continue;
      if (l.segs.some((sg) => segDist(p.x, p.z, sg) < 3.2)) {
        this.cued.add(l.kind);
        this.say(T.heist.laser[l.kind], 2800, true);
      }
    }
    if (!this.cued.has('guard') && this.guards.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 7.5)) {
      this.cued.add('guard');
      this.say(this.guards.length > 1 ? T.heist.crossGuards : T.heist.guardRoom(isTouch), 3600, true);
      if (this.fuses.some((f) => !f.done)) setTimeout(() => this.m.state === 'play' && radio(T.heist.fuseHint, 2800), 3800);
    }
  }

  setObjective() {
    const el = document.getElementById('objective');
    if (!el) return;
    const fuseLeft = this.fuses.filter((f) => !f.done).length;
    el.innerHTML = `<b class="obj-dot"></b><span class="obj-t">${fuseLeft ? '퓨즈함을 내려 레이저 문 끄기' : '금빛 표시가 있는 문으로'}</span><em title="팬더 발자국">${'◆'.repeat(this.emblemsGot)}${'◇'.repeat(this.emblems.length - this.emblemsGot)}</em>`;
  }

  // 마우스·터치로 캔버스를 누르는 입력은 쓰지 않는다 (조이스틱·키보드)
  down() {}
  move() {}
  up() {}

  // ---------- 지도 ----------
  tile(x, z) {
    const r = this.map[Math.floor(z)];
    return r ? r[Math.floor(x)] || '#' : '#';
  }

  solidAt(x, z) {
    for (const l of this.lasers) if (l.kind === 'spin' && Math.hypot(x - l.c[0], z - l.c[1]) < R + 0.3) return true;
    const x0 = Math.floor(x - R);
    const x1 = Math.floor(x + R);
    const z0 = Math.floor(z - R);
    const z1 = Math.floor(z + R);
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        const ch = this.tile(tx + 0.5, tz + 0.5);
        if (!SOLID.has(ch)) continue;
        if (ch === 'O') {
          if (Math.hypot(x - (tx + 0.5), z - (tz + 0.5)) < R + 0.32) return true;
          continue;
        }
        const pad = ch === 'D' ? 0.09 : ch === 'F' ? 0.18 : 0;
        const cx = clamp(x, tx + pad, tx + 1 - pad);
        const cz = clamp(z, tz + pad, tz + 1 - pad);
        if (Math.hypot(x - cx, z - cz) < R) return true;
      }
    }
    return false;
  }

  // 격자 광선: 막히기 전까지의 거리
  ray(x, z, ang, max, block = SIGHT_BLOCK, sneakCase = false) {
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const step = 0.08;
    for (let d = 0; d < max; d += step) {
      const px = x + dx * d;
      const pz = z + dz * d;
      const ch = this.tile(px, pz);
      if (ch === 'O') {
        const cx = Math.floor(px) + 0.5;
        const cz = Math.floor(pz) + 0.5;
        if (Math.hypot(px - cx, pz - cz) < 0.33) return d;
        continue;
      }
      if (block.has(ch) || (sneakCase && ch === 'D')) return d;
    }
    return max;
  }

  // ---------- 진행 ----------
  update(dt) {
    if (this.done) return;
    this.t += dt;
    this.nearCd -= dt;
    this.lineCd -= dt;
    this.movePlayer(dt);
    this.updateLasers(dt);
    this.updateFuses(dt);
    this.updateGuards(dt);
    this.updateCams(dt);
    this.collect();
    this.cues();
    this.sinceSeen += dt;
    if (this.sinceSeen > 1.6) this.m.relax(dt * 6);
    const p = this.p;
    if (Math.abs(p.x - this.exit[0]) < 0.6 && p.z < this.exit[1] + 0.6) {
      this.done = true;
      hint('');
      showPad(false);
      audio.door();
      radio(pick(T.heist.exit), 1400);
      this.m.stageClear({ hits: this.hits, alerts: this.alerts, emblems: this.emblemsGot });
    }
  }

  movePlayer(dt) {
    const p = this.p;
    const mv = input.move;
    const amt = Math.hypot(mv.x, mv.y);
    p.inv -= dt;
    p.dashCd -= dt;
    if (input.dashQueued && p.dashCd <= 0 && amt > 0.2) {
      p.dashT = 0.22;
      p.dashCd = 1.1;
      audio.swish();
      this.noise(4.6);
    }
    p.dashT -= dt;
    const sneak = input.sneak && p.dashT <= 0;
    const sp = p.dashT > 0 ? SPEED.dash : sneak ? SPEED.sneak : SPEED.walk;
    let dirx = mv.x;
    let dirz = -mv.y;
    if (p.dashT > 0 && amt < 0.2) { dirx = Math.sin(p.face); dirz = Math.cos(p.face); }
    const tvx = dirx * sp * (p.dashT > 0 ? 1 : amt);
    const tvz = dirz * sp * (p.dashT > 0 ? 1 : amt);
    const k = Math.min(1, dt * (p.dashT > 0 ? 30 : 14));
    p.vx += (tvx - p.vx) * k;
    p.vz += (tvz - p.vz) * k;
    const nx = p.x + p.vx * dt;
    if (!this.solidAt(nx, p.z)) p.x = nx; else p.vx = 0;
    const nz = p.z + p.vz * dt;
    if (!this.solidAt(p.x, nz)) p.z = nz; else p.vz = 0;
    const v = Math.hypot(p.vx, p.vz);
    if (v > 0.15) {
      const target = Math.atan2(p.vx, p.vz);
      p.face += angDiff(target / D2R, p.face / D2R) * D2R * Math.min(1, dt * 14);
    }
    p.mode = p.dashT > 0 ? 'dash' : v < 0.15 ? (sneak ? 'sneak' : 'idle') : sneak ? 'sneak' : 'walk';
    p.amt = clamp(v / SPEED.walk, 0, 1.4);
    p.sneaking = sneak;
    // 걷는 소리는 가까운 관리인을 의심하게 만든다
    p.noiseT -= dt;
    if (p.mode === 'walk' && p.noiseT <= 0) {
      p.noiseT = 0.35;
      this.noise(2.3);
    }
  }

  noise(r) {
    const p = this.p;
    for (const g of this.guards) {
      if (g.state === 'alert') continue;
      if (Math.hypot(g.x - p.x, g.z - p.z) < r) {
        if (g.state !== 'search') {
          audio.warn();
          this.say(pick(T.heist.noise), 2000);
        }
        g.state = 'search';
        g.target = [p.x, p.z];
        g.lookT = 2.2;
      }
    }
  }

  // ---------- 레이저 ----------
  laserOn(l) {
    if (l.group && this.disabled.has(l.group)) return 0;
    if (!l.pulse) return 1;
    const P = l.pulse.period / this.mod.laser;
    const c = (this.t + l.pulse.phase) % P;
    const onT = l.pulse.on * P;
    if (c >= onT) return P - c < 0.3 ? 0.14 : 0.04; // 다시 켜지기 직전 희미하게 예고
    return onT - c < 0.3 ? 0.38 : 1;
  }

  updateLasers() {
    const p = this.p;
    const t = this.t;
    for (const l of this.lasers) {
      const segs = [];
      const a = this.laserOn(l);
      if (l.kind === 'line') segs.push([l.a[0], l.a[1], l.b[0], l.b[1]]);
      else if (l.kind === 'gap') {
        const span = l.x1 - l.x0 - l.gap;
        const g0 = l.x0 + pingpong(t * l.speed * this.mod.laser + l.phase, span);
        segs.push([l.x0, l.z, g0, l.z], [g0 + l.gap, l.z, l.x1, l.z]);
      } else if (l.kind === 'lane') {
        const span = l.x1 - l.x0;
        for (let i = 0; i < l.count; i++) {
          const x = l.x0 + ((((t * l.speed * this.mod.laser + l.phase + (i * span) / l.count) % span) + span) % span);
          segs.push([x, l.z - l.len / 2, x, l.z + l.len / 2]);
        }
      } else if (l.kind === 'spin') {
        for (let k = 0; k < l.arms; k++) {
          const ang = (t * l.speed * this.mod.laser + (k * 360) / l.arms) * D2R;
          const d = this.ray(l.c[0], l.c[1], ang, l.r, SOLID);
          segs.push([l.c[0], l.c[1], l.c[0] + Math.cos(ang) * d, l.c[1] + Math.sin(ang) * d]);
        }
      }
      l.segs = segs;
      l.alpha = a;
      if (a < 0.9) continue;
      for (const s of segs) {
        const d = segDist(p.x, p.z, s);
        if (d < R + 0.03 && p.inv <= 0) this.hitLaser(s);
        else if (d < R + 0.4 && this.nearCd <= 0 && l.kind !== 'line' && Math.hypot(p.vx, p.vz) > 0.5) {
          this.nearCd = 4;
          this.m.pantherStep();
        }
      }
    }
  }

  hitLaser(s) {
    const p = this.p;
    this.hits++;
    p.inv = 1.3;
    // 레이저 반대쪽으로 밀려난다
    const [ax, az, bx, bz] = s;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    let nx = -dz / len;
    let nz = dx / len;
    if ((p.x - ax) * nx + (p.z - az) * nz < 0) { nx = -nx; nz = -nz; }
    for (let k = 0; k < 6; k++) {
      const tx = p.x + nx * 0.12;
      const tz = p.z + nz * 0.12;
      if (!this.solidAt(tx, tz)) { p.x = tx; p.z = tz; }
    }
    p.vx = p.vz = 0;
    audio.hit();
    haptics.hit();
    this.m.addGaze(this.mod.hit, 'laser', false, true);
    if (this.m.state === 'play') this.say(this.m.gaze >= 55 ? T.heist.hitAgain : pick(T.heist.hit), 2200, true);
  }

  // ---------- 퓨즈 ----------
  updateFuses(dt) {
    const p = this.p;
    let near = null;
    for (const f of this.fuses) {
      if (f.done) continue;
      if (Math.hypot(p.x - f.x, p.z - f.z) < 1.15) near = f;
      else f.prog = Math.max(0, f.prog - dt);
    }
    const pr = document.getElementById('prompt');
    if (near) {
      if (input.interact) {
        near.prog += dt / 1.1;
        if (Math.floor(near.prog * 8) !== Math.floor((near.prog - dt / 1.1) * 8)) audio.tick(near.prog, 'move');
      } else near.prog = Math.max(0, near.prog - dt * 2);
      if (near.prog >= 1) {
        near.done = true;
        this.disabled.add(near.group);
        audio.clunk();
        haptics.clunk();
        edge('gold');
        this.say(pick(T.heist.fuseDone), 2200, true);
        this.setObjective();
      }
      if (pr) {
        pr.hidden = near.done;
        pr.querySelector('b').textContent = isTouch ? '조작 길게' : 'E 길게';
        pr.querySelector('i').style.setProperty('--p', Math.min(100, near.prog * 100));
      }
      setPadAction(near.done ? '' : '퓨즈');
    } else {
      if (pr) pr.hidden = true;
      setPadAction('');
    }
  }

  // ---------- 수집품 ----------
  collect() {
    const p = this.p;
    for (const e of this.emblems) {
      if (e.got || Math.hypot(p.x - e.x, p.z - e.z) > 0.55) continue;
      e.got = true;
      this.emblemsGot++;
      this.m.emblems = (this.m.emblems || 0) + 1;
      audio.chime();
      haptics.tick();
      edge('gold');
      this.say(pick(T.heist.emblem), 1600);
      this.setObjective();
    }
  }

  // ---------- 시야 ----------
  canSee(ox, oz, face, fovDeg, range) {
    const p = this.p;
    const dx = p.x - ox;
    const dz = p.z - oz;
    const d = Math.hypot(dx, dz);
    if (d > range) return 0;
    const ang = Math.atan2(dz, dx);
    if (d > 0.6 && Math.abs(angDiff(ang / D2R, face / D2R)) > fovDeg / 2) return 0;
    const clear = this.ray(ox, oz, ang, d, SIGHT_BLOCK, p.sneaking);
    if (clear < d - 0.25) return 0;
    return d;
  }

  observe(dt, d, range, k = 1) {
    const p = this.p;
    const near = 1.3 - 0.75 * (d / range);
    const rate = 40 * this.mod.detect * near * (p.sneaking ? 0.6 : 1) * k;
    this.m.addGaze(rate * dt, 'seen', true);
    this.sinceSeen = 0;
    this.warnT = (this.warnT || 0) - dt;
    if (this.warnT <= 0) {
      this.warnT = 0.5;
      this.m.warnPulse();
    }
  }

  updateGuards(dt) {
    const p = this.p;
    for (const g of this.guards) {
      const d = this.canSee(g.x, g.z, g.face, g.fov, g.range);
      g.sees = !!d;
      if (d) {
        g.seenT += dt;
        g.lostT = 0;
        this.observe(dt, d, g.range, g.state === 'alert' ? 1.5 : 1);
        if (g.seenT > 0.35 && g.state !== 'alert') {
          g.state = 'alert';
          this.alerts++;
          this.m.alerted = true;
          audio.warn();
          this.say(pick(T.heist.spotted), 1800, true);
        }
        if (g.state === 'alert') g.target = [p.x, p.z];
      } else {
        g.seenT = Math.max(0, g.seenT - dt);
        if (g.state === 'alert') {
          g.lostT += dt;
          if (g.lostT > 1.0) {
            g.state = 'search';
            g.lookT = 2.5;
            this.say(pick(T.heist.lost), 1800);
          }
        }
      }
      // 잡힘
      if (Math.hypot(g.x - p.x, g.z - p.z) < 0.62 && (g.state === 'alert' || g.state === 'search')) {
        this.m.addGaze(100, 'caught');
        return;
      }
      // 이동
      let tx;
      let tz;
      let sp = g.speed;
      if (g.state === 'patrol') {
        if (g.waitT > 0) {
          g.waitT -= dt;
          const next = g.path[g.wi];
          turnTo(g, Math.atan2(next[1] - g.z, next[0] - g.x), dt * 3);
          continue;
        }
        [tx, tz] = g.path[g.wi];
      } else if (g.state === 'alert') {
        [tx, tz] = g.target;
        sp *= 0.75;
      } else if (g.state === 'search') {
        [tx, tz] = g.target;
        sp *= 1.1;
      } else {
        [tx, tz] = g.path[g.wi];
      }
      const dx = tx - g.x;
      const dz = tz - g.z;
      const dd = Math.hypot(dx, dz);
      if (dd > 0.08) {
        const want = Math.atan2(dz, dx);
        turnTo(g, want, dt * 6);
        const nx = g.x + (dx / dd) * sp * dt;
        const nz = g.z + (dz / dd) * sp * dt;
        if (!this.guardBlocked(nx, g.z)) g.x = nx;
        if (!this.guardBlocked(g.x, nz)) g.z = nz;
        g.moving = true;
      } else {
        g.moving = false;
        if (g.state === 'patrol' || g.state === 'return') {
          g.state = 'patrol';
          g.wi = (g.wi + 1) % g.path.length;
          g.waitT = g.wait;
        } else if (g.state === 'search') {
          g.lookT -= dt;
          g.face += Math.sin(this.t * 2.2) * dt * 1.6;
          if (g.lookT <= 0) {
            g.state = 'return';
            g.wi = nearestIdx(g.path, g.x, g.z);
          }
        }
      }
    }
  }

  guardBlocked(x, z) {
    const ch = this.tile(x, z);
    return ch === '#' || ch === 'O' || ch === 'D' || ch === 'F';
  }

  updateCams(dt) {
    for (const c of this.cams) {
      c.ang = c.dir + Math.sin(this.t * (c.speed / c.sweep) * 0.9) * c.sweep;
      const d = this.canSee(c.x, c.z, c.ang * D2R, c.fov, c.range);
      const was = c.seen;
      c.seen = !!d;
      if (d) {
        if (!was) this.say(T.heist.camera, 2000);
        this.observe(dt, d, c.range, 0.8);
        // 가장 가까운 관리인을 부른다
        let best = null;
        for (const g of this.guards) {
          if (g.state === 'alert') continue;
          const gd = Math.hypot(g.x - this.p.x, g.z - this.p.z);
          if (!best || gd < best.gd) best = { g, gd };
        }
        if (best && best.gd < 12) {
          best.g.state = 'search';
          best.g.target = [this.p.x, this.p.z];
          best.g.lookT = 2.5;
        }
      }
    }
  }

  // ---------- 3D ----------
  build() {
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.background = new THREE.Color(0x020203);
    scene.fog = new THREE.Fog(0x020203, 30, 60);
    scene.environment = getEnv();
    scene.environmentIntensity = 0.12;
    scene.userData.fx = { bloom: 0.75, threshold: 1.0, radius: 0.28, grain: 0.05, vignette: 0.6 };
    this.cam = new THREE.PerspectiveCamera(34, 0.5, 0.5, 120);

    scene.add(checkerFloor(this.map, this.w * 7 + this.h));
    scene.add(buildWalls(this.map));
    this.map.forEach((row, z) => [...row].forEach((ch, x) => {
      if (ch === 'O') {
        const c = buildColumn();
        c.position.set(x + 0.5, 0, z + 0.5);
        scene.add(c);
      }
    }));
    const pieces = this.L.pieces || [];
    this.caseMeshes = this.cases.map(([x, z], i) => {
      const c = buildCase(pieces[i % pieces.length] || 'trinity-ring');
      c.position.set(x + 0.5, 0, z + 0.5);
      scene.add(c);
      return c;
    });
    for (const f of this.fuses) {
      const m = buildFuse();
      m.position.set(f.x, 0, f.z);
      // 가장 가까운 벽 쪽을 등지게
      m.rotation.y = this.tile(f.x + 1, f.z) === '#' ? -Math.PI / 2 : this.tile(f.x - 1, f.z) === '#' ? Math.PI / 2 : 0;
      scene.add(m);
      f.mesh = m;
    }
    const ex = buildExit();
    ex.position.set(this.exit[0], 0, this.exit[1] - 0.45);
    scene.add(ex);
    for (const e of this.emblems) {
      e.mesh = buildEmblem();
      e.mesh.position.set(e.x, 0, e.z);
      scene.add(e.mesh);
    }
    // 레이저와 발광 기둥
    for (const l of this.lasers) {
      const n = l.kind === 'gap' ? 2 : l.kind === 'lane' ? l.count : l.kind === 'spin' ? l.arms : 1;
      l.meshes = Array.from({ length: n }, () => {
        const b = buildLaser();
        scene.add(b);
        return b;
      });
      const em = [];
      if (l.kind === 'line') em.push(l.a, l.b);
      else if (l.kind === 'gap' || l.kind === 'lane') em.push([l.x0, l.z], [l.x1, l.z]);
      if (l.kind === 'spin') {
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 24), MAT.gold());
        hub.position.set(l.c[0], 0.35, l.c[1]);
        hub.castShadow = true;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), MAT.onyx());
        eye.position.set(l.c[0], 0.72, l.c[1]);
        scene.add(hub, eye);
      }
      for (const [x, z] of em) {
        const e = buildEmitter();
        e.position.set(x + (x <= 1 ? 0.1 : x >= this.w - 1 ? -0.1 : 0), 0, z);
        scene.add(e);
      }
    }
    // 관리인
    for (const g of this.guards) {
      g.fig = new Humanoid({ coat: 0x1b2233, hat: 'cap', coatLen: 0.3 });
      scene.add(g.fig.group);
      const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.22, 12), MAT.steel());
      torch.rotation.x = Math.PI / 2;
      g.fig.hold(torch);
      g.spot = new THREE.SpotLight(0xfff1d6, 10, 7.5, 0.5, 0.6, 1.4);
      scene.add(g.spot, g.spot.target);
      g.fan = new VisionFan(26);
      scene.add(g.fan.mesh);
      g.mark = markSprite();
      scene.add(g.mark);
    }
    for (const c of this.cams) {
      c.mesh = buildCamera();
      c.mesh.position.set(c.x, 2.0, c.z);
      scene.add(c.mesh);
      c.fan = new VisionFan(22);
      scene.add(c.fan.mesh);
    }
    // 레드
    this.fig = new Humanoid({ scarf: true });
    scene.add(this.fig.group);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.37, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.0, 0.6), transparent: true, opacity: 0.5, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.015;
    scene.add(this.ring);

    // 조명: 차가운 달빛 + 방마다 따뜻한 샹들리에 빛
    scene.add(new THREE.HemisphereLight(0x5a6688, 0x050404, 0.14));
    const moon = new THREE.DirectionalLight(0x9fb2ff, 0.45);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const sc = moon.shadow.camera;
    sc.left = sc.bottom = -12;
    sc.right = sc.top = 12;
    sc.near = 1;
    sc.far = 40;
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.02;
    scene.add(moon, moon.target);
    this.moon = moon;
    // 방마다 따뜻한 샹들리에 빛 웅덩이 (조명 수는 적게)
    for (let z = 4; z < this.h - 2; z += 8) {
      const l = new THREE.PointLight(0xffc98a, 9, 8, 1.6);
      l.position.set(this.w / 2, 2.6, z);
      scene.add(l);
    }
    // 목표 표시: 금빛 빛기둥 + 바닥 고리
    const beacon = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.2, 0.55), transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, alphaMap: fadeBeam() }));
    col.position.y = 3;
    const ringB = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.5, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.8), transparent: true, opacity: 0.8, depthWrite: false }));
    ringB.rotation.x = -Math.PI / 2;
    ringB.position.y = 0.03;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 0.8) }));
    gem.position.y = 2.6;
    beacon.add(col, ringB, gem);
    scene.add(beacon);
    this.beacon = { g: beacon, ring: ringB, gem };
    this.dust = buildDust(this.w, this.h);
    scene.add(this.dust);
  }

  render(dtReal = 0.016) {
    if (!this.scene) this.build();
    const p = this.p;
    const t = this.t;
    // 레드
    this.fig.group.position.set(p.x, 0, p.z);
    this.fig.group.rotation.y = p.face;
    this.fig.animate(dtReal, p.mode, p.amt || 0);
    this.fig.group.visible = !(p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0);
    this.ring.position.set(p.x, 0.015, p.z);
    this.ring.material.opacity = p.sneaking ? 0.2 : 0.5;
    // 레이저
    for (const l of this.lasers) {
      l.meshes.forEach((mesh, i) => {
        const s = l.segs[i];
        if (!s) { mesh.visible = false; return; }
        mesh.visible = true;
        placeLaser(mesh, s[0], s[1], s[2], s[3], 0.7);
        mesh.userData.set(l.alpha ?? 1);
      });
    }
    // 퓨즈
    for (const f of this.fuses) {
      f.mesh.userData.lever.rotation.x = -0.5 + Math.min(1, f.done ? 1 : f.prog) * 1.6;
      f.mesh.userData.lamp.material.color.setRGB(f.done ? 0.6 : 4, f.done ? 3 : 0.3, f.done ? 1.6 : 0.4);
    }
    for (const e of this.emblems) {
      e.mesh.visible = !e.got;
      e.mesh.userData.spin.rotation.y = t * 2;
      e.mesh.userData.spin.position.y = 0.6 + Math.sin(t * 2.5) * 0.06;
    }
    this.caseMeshes.forEach((c, i) => { c.userData.jewel.rotation.y = t * 0.6 + i; });
    // 관리인
    for (const g of this.guards) {
      g.fig.group.position.set(g.x, 0, g.z);
      g.fig.group.rotation.y = Math.PI / 2 - g.face;
      g.fig.animate(dtReal, g.moving ? 'walk' : 'idle', g.moving ? g.speed / SPEED.walk * 1.4 : 0);
      const hx = g.x + Math.cos(g.face) * 0.35;
      const hz = g.z + Math.sin(g.face) * 0.35;
      g.spot.position.set(hx, 1.1, hz);
      g.spot.target.position.set(g.x + Math.cos(g.face) * 4, 0, g.z + Math.sin(g.face) * 4);
      g.fan.set([g.x, g.z], this.fanPts(g.x, g.z, g.face, g.fov, g.range, 26));
      const col = g.state === 'alert' ? 0xff2a3c : g.state === 'search' ? 0xffc46a : 0xfff0d8;
      g.fan.color(col, g.state === 'alert' ? 0.55 : g.sees ? 0.5 : 0.32);
      g.spot.color.setHex(g.state === 'alert' ? 0xff8080 : 0xfff1d6);
      g.mark.position.set(g.x, 2.35, g.z);
      g.mark.userData.set(g.state === 'alert' ? 'alert' : g.state === 'search' ? 'search' : null);
    }
    for (const c of this.cams) {
      const a = c.ang * D2R;
      c.mesh.userData.head.rotation.y = Math.PI / 2 - a;
      c.mesh.userData.head.rotation.x = 0.5;
      c.fan.set([c.x, c.z], this.fanPts(c.x, c.z, a, c.fov, c.range, 22));
      c.fan.color(c.seen ? 0xff2a3c : 0xbfd2ff, c.seen ? 0.5 : 0.26);
    }
    this.dust.userData.tick(t);
    const goal = this.fuses.find((f) => !f.done);
    const bx = goal ? goal.x : this.exit[0];
    const bz = goal ? goal.z : this.exit[1] + 0.3;
    this.beacon.g.position.set(bx, 0, bz);
    const pulse = (t * 0.8) % 1;
    this.beacon.ring.scale.setScalar(1 + pulse * 0.9);
    this.beacon.ring.material.opacity = 0.8 * (1 - pulse);
    this.beacon.gem.rotation.y = t * 1.6;
    this.beacon.gem.position.y = 2.5 + Math.sin(t * 2) * 0.12;
    // 카메라: 위에서 비스듬히 따라간다
    const tx = clamp(p.x, 4.5, this.w - 4.5);
    const tz = p.z - 1.2;
    this.cx = this.cx === undefined ? tx : this.cx + (tx - this.cx) * Math.min(1, dtReal * 5);
    this.cz = this.cz === undefined ? tz : this.cz + (tz - this.cz) * Math.min(1, dtReal * 5);
    const slow = this.m.timeScale < 1 ? 0.8 : 1;
    const d = fitDist(this.cam, 4.1, 5.2) * slow;
    const el = 58 * D2R;
    this.cam.position.set(this.cx, Math.sin(el) * d, this.cz + Math.cos(el) * d);
    this.cam.lookAt(this.cx, 0, this.cz);
    this.moon.position.set(this.cx - 6, 14, this.cz + 4);
    this.moon.target.position.set(this.cx, 0, this.cz);
    draw(this.scene, this.cam);
  }

  fanPts(x, z, face, fov, range, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = face + ((i / n) - 0.5) * fov * D2R;
      const d = this.ray(x, z, a, range);
      pts.push([x + Math.cos(a) * d, z + Math.sin(a) * d]);
    }
    return pts;
  }

  dispose() {
    showPad(false);
    const pr = document.getElementById('prompt');
    if (pr) pr.hidden = true;
    const ob = document.getElementById('objective');
    if (ob) ob.innerHTML = '';
  }
}

let beamTex = null;
function fadeBeam() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 0, 64);
  lg.addColorStop(0, '#000');
  lg.addColorStop(1, '#fff');
  g.fillStyle = lg;
  g.fillRect(0, 0, 4, 64);
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

function segDist(px, pz, [ax, az, bx, bz]) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function turnTo(g, want, k) {
  const d = angDiff(want / D2R, g.face / D2R) * D2R;
  g.face += d * Math.min(1, k);
}

function nearestIdx(path, x, z) {
  let bi = 0;
  let bd = Infinity;
  path.forEach(([px, pz], i) => {
    const d = Math.hypot(px - x, pz - z);
    if (d < bd) { bd = d; bi = i; }
  });
  return bi;
}
