// 1단계 레이저 회랑 + 단계 사이 야간 관리인 순찰 구간 (같은 횡스크롤 엔진)
import { clamp, rand, pingpong, shuffle } from '../util.js';
import { drawRed } from '../figures.js';
import { audio } from '../audio.js';
import { radio, hint } from '../ui.js';

const VIEW_W = 320;
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

  // ---------- 그리기 ----------
  render(g, W, H) {
    const s = W / VIEW_W;
    const vh = H / s;
    const p = this.p;
    const floorY = vh * 0.6;
    const ceilY = floorY - 150;
    const cam = clamp(p.x - VIEW_W * 0.32, -30, Math.max(-30, this.length - VIEW_W * 0.62));
    const px = 1 / s;
    g.save();
    g.scale(s, s);

    g.fillStyle = '#000';
    g.fillRect(0, 0, VIEW_W, vh);
    // 벽
    const wg = g.createLinearGradient(0, ceilY, 0, floorY);
    wg.addColorStop(0, '#050506');
    wg.addColorStop(1, this.kind === 'laser' ? '#141012' : '#13110f');
    g.fillStyle = wg;
    g.fillRect(0, ceilY, VIEW_W, floorY - ceilY);
    // 아르데코 문양
    g.lineWidth = px;
    const step = 96;
    for (let wx = Math.floor((cam - 60) / step) * step; wx < cam + VIEW_W + step; wx += step) {
      const sx = wx - cam;
      g.strokeStyle = 'rgba(201,169,97,0.16)';
      g.beginPath();
      g.moveTo(sx, ceilY + 10);
      g.lineTo(sx, floorY - 16);
      g.stroke();
      fan(g, sx + step / 2, floorY - 16, 34);
      fan(g, sx + step / 2, ceilY + 10, 18, true);
    }
    g.strokeStyle = 'rgba(201,169,97,0.4)';
    hline(g, 0, VIEW_W, ceilY);
    hline(g, 0, VIEW_W, ceilY + 10);
    hline(g, 0, VIEW_W, floorY - 16);
    // 대리석 바닥
    const fg = g.createLinearGradient(0, floorY, 0, floorY + 110);
    fg.addColorStop(0, '#1d1c1e');
    fg.addColorStop(1, '#000');
    g.fillStyle = fg;
    g.fillRect(0, floorY, VIEW_W, 110);
    g.strokeStyle = 'rgba(239,232,220,0.06)';
    for (const dy of [7, 19, 37, 64]) hline(g, 0, VIEW_W, floorY + dy);
    for (let wx = Math.floor(cam / 70) * 70; wx < cam + VIEW_W + 70; wx += 70) {
      const sx = wx - cam;
      g.beginPath();
      g.moveTo(sx, floorY);
      g.lineTo(sx - 30, floorY + 70);
      g.stroke();
    }
    g.strokeStyle = 'rgba(201,169,97,0.45)';
    hline(g, 0, VIEW_W, floorY);

    this.drawEnd(g, this.length - cam, floorY, ceilY, px);

    if (this.kind === 'laser') this.drawLasers(g, cam, floorY, ceilY, px);
    else this.drawLights(g, cam, floorY, ceilY);

    // 레드
    const blink = p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0;
    const sx = p.x - cam;
    // 바닥 반사
    g.save();
    g.globalAlpha = 0.12;
    g.translate(0, floorY * 2);
    g.scale(1, -1);
    drawRed(g, sx, floorY - p.jy, p.mode, p.ph, { alpha: blink ? 0.4 : 1 });
    g.restore();
    drawRed(g, sx, floorY - p.jy, p.mode, p.ph, {
      alpha: blink ? 0.35 : 1,
      rim: this.lit ? 'rgba(255,236,200,0.95)' : undefined,
    });

    g.restore();
  }

  drawEnd(g, x, floorY, ceilY, px) {
    if (x > VIEW_W + 60) return;
    g.lineWidth = px;
    g.strokeStyle = 'rgba(201,169,97,0.8)';
    if (this.end === 'vault') {
      g.fillStyle = '#0c0c0d';
      g.beginPath(); g.arc(x + 40, floorY - 62, 56, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.arc(x + 40, floorY - 62, 44, 0, Math.PI * 2); g.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.beginPath(); g.arc(x + 40 + Math.cos(a) * 50, floorY - 62 + Math.sin(a) * 50, 2, 0, Math.PI * 2); g.stroke();
      }
    } else if (this.end === 'curtain') {
      g.fillStyle = '#16090c';
      g.fillRect(x, ceilY + 10, 80, floorY - ceilY - 10);
      g.strokeStyle = 'rgba(201,169,97,0.25)';
      for (let i = 1; i < 8; i++) {
        g.beginPath(); g.moveTo(x + i * 10, ceilY + 12); g.lineTo(x + i * 10 + Math.sin(i) * 3, floorY); g.stroke();
      }
      g.strokeStyle = 'rgba(201,169,97,0.8)';
      g.strokeRect(x, ceilY + 10, 80, floorY - ceilY - 10);
    } else {
      // 아치형 문
      g.fillStyle = '#080808';
      g.beginPath();
      g.moveTo(x, floorY);
      g.lineTo(x, ceilY + 60);
      g.arc(x + 36, ceilY + 60, 36, Math.PI, 0);
      g.lineTo(x + 72, floorY);
      g.closePath();
      g.fill();
      g.stroke();
      g.beginPath(); g.moveTo(x + 36, ceilY + 24); g.lineTo(x + 36, floorY); g.stroke();
    }
  }

  drawLasers(g, cam, floorY, ceilY, px) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const o of this.obs) {
      const x = o.x - cam;
      if (x < -60 || x > VIEW_W + 60) continue;
      const on = this.isOn(o);
      const a = !on ? 0.07 : this.dimmed(o) ? 0.38 : 1;
      if (o.type === 'gate') {
        beam(g, x, ceilY + 10, x, floorY, a, px);
        beam(g, x, floorY, x, floorY + 40, a * 0.18, px);
      } else {
        const h = o.type === 'sweep' ? this.sweepH(o) : o.h;
        const y = floorY - h;
        beam(g, x - o.len / 2, y, x + o.len / 2, y, a, px);
        beam(g, x - o.len / 2, floorY + h, x + o.len / 2, floorY + h, a * 0.16, px);
      }
    }
    g.restore();
    // 발광부 (금색 1px)
    g.lineWidth = px;
    g.strokeStyle = 'rgba(201,169,97,0.6)';
    for (const o of this.obs) {
      if (o.type === 'gate') {
        const x = o.x - cam;
        g.strokeRect(x - 4, ceilY + 10, 8, 5);
        g.strokeRect(x - 4, floorY - 5, 8, 5);
      } else {
        const x = o.x - cam;
        const y = floorY - (o.type === 'sweep' ? o.hi : o.h);
        g.beginPath();
        g.moveTo(x - o.len / 2 - 3, floorY); g.lineTo(x - o.len / 2 - 3, y - 4);
        g.moveTo(x + o.len / 2 + 3, floorY); g.lineTo(x + o.len / 2 + 3, y - 4);
        g.stroke();
      }
    }
  }

  drawLights(g, cam, floorY, ceilY) {
    for (const o of this.obs) {
      const cx = this.lightX(o) - cam;
      if (cx < -80 || cx > VIEW_W + 80) continue;
      // 샹들리에
      const chx = (o.x0 + o.x1) / 2 - cam;
      g.strokeStyle = 'rgba(201,169,97,0.5)';
      g.beginPath(); g.moveTo(chx, ceilY); g.lineTo(chx, ceilY + 16); g.stroke();
      g.beginPath(); g.arc(chx, ceilY + 20, 6, 0, Math.PI); g.stroke();
      // 빛줄기
      const cg = g.createLinearGradient(0, ceilY + 20, 0, floorY);
      cg.addColorStop(0, 'rgba(255,236,200,0.0)');
      cg.addColorStop(1, 'rgba(255,236,200,0.09)');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(chx - 3, ceilY + 22);
      g.lineTo(chx + 3, ceilY + 22);
      g.lineTo(cx + o.r, floorY);
      g.lineTo(cx - o.r, floorY);
      g.closePath();
      g.fill();
      // 바닥의 불빛
      g.save();
      g.translate(cx, floorY + 3);
      g.scale(1, 0.22);
      const rg = g.createRadialGradient(0, 0, 2, 0, 0, o.r);
      rg.addColorStop(0, 'rgba(255,236,200,0.55)');
      rg.addColorStop(1, 'rgba(255,236,200,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(0, 0, o.r, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
}

function hline(g, x0, x1, y) {
  g.beginPath();
  g.moveTo(x0, y);
  g.lineTo(x1, y);
  g.stroke();
}

function fan(g, x, y, r, down = false) {
  g.strokeStyle = 'rgba(201,169,97,0.13)';
  const dir = down ? 1 : -1;
  g.beginPath();
  g.arc(x, y, r, down ? 0 : Math.PI, down ? Math.PI : Math.PI * 2);
  g.stroke();
  for (let i = 1; i < 6; i++) {
    const a = (i / 6) * Math.PI;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * r, y + dir * Math.sin(a) * r);
    g.stroke();
  }
}

function beam(g, x1, y1, x2, y2, a, px) {
  if (a <= 0) return;
  g.lineCap = 'round';
  const layers = [[8, 0.07], [3.5, 0.22], [1.3, 0.95]];
  for (const [w, al] of layers) {
    g.strokeStyle = w < 2 ? `rgba(255,170,170,${al * a})` : `rgba(255,30,50,${al * a})`;
    g.lineWidth = w * (w < 2 ? px * 1.4 : 1);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
  }
}
