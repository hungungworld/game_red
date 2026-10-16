// 2단계 컬렉션 금고 (Love · Trinity). 정답 각도 3개를 소리·진동·금빛 번짐으로 찾는다.
import { clamp, lerp, rand, angDiff } from '../util.js';
import { GOLD } from '../figures.js';
import { audio } from '../audio.js';
import { haptics } from '../haptics.js';
import { radio, hint, edge } from '../ui.js';

const RING_COLORS = ['#c98b7b', '#c9a961', '#cfd2d4']; // 로즈 · 옐로 · 화이트 골드
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
    radio(`${name}다. 정답 각도는 세 개.`, 2400);
    radio(this.type === 'love'
      ? '드라이버를 천천히 돌려. 째깍이 빨라지면 가까운 거다.'
      : '링을 하나씩 돌려. 째깍이 빨라지면 가까운 거다.', 3400);
    radio('맞았다 싶으면 손을 멈추고 기다려.', 2600);
    hint('원을 따라 천천히 돌리기 · 정답에서 0.5초 멈추기', this.m.store.tutorialDone ? 6000 : 0);
  }

  geom(W, H) {
    const R = Math.min(W * 0.4, H * 0.27);
    return { cx: W / 2, cy: H * 0.56, R };
  }

  // ---------- 입력 ----------
  down(e) {
    const { cx, cy } = this.geom(this.m.W, this.m.H);
    const r = Math.hypot(e.x - cx, e.y - cy);
    this.drag = r > 18 ? { a: Math.atan2(e.y - cy, e.x - cx) } : null;
  }

  move(e) {
    if (this.opening >= 0) return;
    const { cx, cy } = this.geom(this.m.W, this.m.H);
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
    // 바깥쪽을 잡을수록 정밀하게
    this.angle = (this.angle + d + 360) % 360;
    if (Math.abs(d) > 0.3) this.stillT = 0;
    this.moveAcc += Math.abs(d);
    if (this.moveAcc >= 4) {
      this.moveAcc = 0;
      audio.tick(this.prox() * 0.6, 'move');
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
    if (this.timeLeft < 10 && !this.warned10) {
      this.warned10 = true;
      radio('10초 남았다.', 1800);
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
        if (this.m.state === 'play') radio('너무 지나쳤어. 다이얼 소리가 커.', 2200);
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
      radio('열렸다. 좋아.', 1800);
      return;
    }
    this.newTarget();
    radio(this.idx === 1 ? '하나. 다음.' : '둘. 마지막이다.', 1600);
  }

  // ---------- 그리기 ----------
  render(g, W, H) {
    const { cx, cy, R } = this.geom(W, H);
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const bg = g.createRadialGradient(cx, cy, R * 0.3, cx, cy, Math.max(W, H) * 0.8);
    bg.addColorStop(0, '#121113');
    bg.addColorStop(1, '#000');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    const open = this.opening >= 0 ? clamp(this.opening / 1.2, 0, 1) : 0;
    const prox = this.done || this.opening >= 0 ? 0 : this.prox();

    // 금고 문
    g.save();
    g.translate(cx, cy);
    g.rotate(open * 1.6);
    g.globalAlpha = 1 - open * 0.75;
    g.fillStyle = '#0c0c0e';
    g.beginPath(); g.arc(0, 0, R * 1.22, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(201,169,97,0.55)';
    g.stroke();
    g.strokeStyle = 'rgba(201,169,97,0.22)';
    g.beginPath(); g.arc(0, 0, R * 1.12, 0, Math.PI * 2); g.stroke();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath(); g.arc(Math.cos(a) * R * 1.17, Math.sin(a) * R * 1.17, 2.4, 0, Math.PI * 2); g.stroke();
    }
    g.restore();

    // 금빛 번짐 (소리를 들을 수 없을 때를 위한 시각 정보)
    if (this.m.store.settings.assist && prox > 0) {
      const rr = this.type === 'love' ? R : [R, R * 0.74, R * 0.48][this.idx] || R;
      g.save();
      g.strokeStyle = `rgba(201,169,97,${0.08 + prox * prox * 0.7})`;
      g.shadowColor = 'rgba(201,169,97,0.9)';
      g.shadowBlur = 6 + prox * prox * 26;
      g.lineWidth = 1 + prox * prox * 3;
      g.beginPath(); g.arc(cx, cy, rr + 3, 0, Math.PI * 2); g.stroke();
      g.restore();
    }

    if (this.type === 'love') this.drawLove(g, cx, cy, R, open);
    else this.drawTrinity(g, cx, cy, R, open);

    // 째깍 파동
    if (this.pulseFx > 0 && this.opening < 0) {
      g.strokeStyle = `rgba(239,232,220,${this.pulseFx * 0.1})`;
      g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, R * (1.25 + (1 - this.pulseFx) * 0.15), 0, Math.PI * 2); g.stroke();
    }
    if (this.lockFx > 0) {
      g.strokeStyle = `rgba(201,169,97,${this.lockFx * 0.8})`;
      g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, R * (1.25 + (1 - this.lockFx) * 0.4), 0, Math.PI * 2); g.stroke();
    }

    // 고정 표시 (12시)
    g.fillStyle = GOLD;
    g.beginPath();
    g.moveTo(cx, cy - R * 1.27);
    g.lineTo(cx - 6, cy - R * 1.27 - 10);
    g.lineTo(cx + 6, cy - R * 1.27 - 10);
    g.closePath();
    g.fill();

    // 진행 점 3개
    for (let i = 0; i < 3; i++) {
      const x = cx + (i - 1) * 18;
      const y = cy + R * 1.27 + 26;
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(201,169,97,0.7)';
      g.lineWidth = 1;
      g.stroke();
      if (i < this.idx) { g.fillStyle = GOLD; g.fill(); }
    }
  }

  drawLove(g, cx, cy, R, open) {
    g.save();
    g.translate(cx, cy);
    g.globalAlpha = 1 - open * 0.75;
    g.rotate((this.angles[0] * Math.PI) / 180 + open * 1.6);
    // 링 밴드
    g.fillStyle = '#16151a';
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.arc(0, 0, R * 0.68, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = 'rgba(201,169,97,0.75)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, R * 0.68, 0, Math.PI * 2); g.stroke();
    // 눈금
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const l = i % 6 === 0 ? 0.1 : 0.05;
      g.strokeStyle = i % 6 === 0 ? 'rgba(201,169,97,0.7)' : 'rgba(201,169,97,0.3)';
      g.beginPath();
      g.moveTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98);
      g.lineTo(Math.cos(a) * R * (0.98 - l), Math.sin(a) * R * (0.98 - l));
      g.stroke();
    }
    // 나사 모티브 8개
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = Math.cos(a) * R * 0.78;
      const y = Math.sin(a) * R * 0.78;
      screw(g, x, y, R * 0.055, a + 0.6);
    }
    // 안쪽 원판과 중앙 나사
    g.fillStyle = '#0b0b0c';
    g.beginPath(); g.arc(0, 0, R * 0.62, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(201,169,97,0.3)';
    g.beginPath(); g.arc(0, 0, R * 0.5, 0, Math.PI * 2); g.stroke();
    screw(g, 0, 0, R * 0.16, 0.4);
    // 전용 드라이버
    g.strokeStyle = '#2b2a2e';
    g.lineCap = 'round';
    g.lineWidth = R * 0.07;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(R * 0.52, 0); g.stroke();
    g.strokeStyle = GOLD;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(R * 0.12, -R * 0.035); g.lineTo(R * 0.52, -R * 0.035); g.stroke();
    g.fillStyle = '#16151a';
    g.beginPath(); g.ellipse(R * 0.55, 0, R * 0.09, R * 0.055, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(201,169,97,0.8)';
    g.stroke();
    g.restore();
  }

  drawTrinity(g, cx, cy, R, open) {
    const bands = [[R, R * 0.78], [R * 0.74, R * 0.52], [R * 0.48, R * 0.26]];
    for (let i = 0; i < 3; i++) {
      const [ro, ri] = bands[i];
      const active = i === this.idx;
      const locked = i < this.idx;
      g.save();
      g.translate(cx, cy);
      g.globalAlpha = (active ? 1 : locked ? 0.85 : 0.4) * (1 - open * 0.75);
      g.rotate((this.angles[i] * Math.PI) / 180 + open * (1.2 + i * 0.4));
      g.fillStyle = '#141316';
      g.beginPath(); g.arc(0, 0, ro, 0, Math.PI * 2); g.arc(0, 0, ri, 0, Math.PI * 2, true); g.fill();
      g.strokeStyle = RING_COLORS[i];
      g.lineWidth = active ? 1.5 : 1;
      g.beginPath(); g.arc(0, 0, ro, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(0, 0, ri, 0, Math.PI * 2); g.stroke();
      const n = 48 - i * 12;
      g.lineWidth = 1;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        g.globalAlpha *= 1;
        g.strokeStyle = k % 4 === 0 ? RING_COLORS[i] : 'rgba(239,232,220,0.14)';
        g.beginPath();
        g.moveTo(Math.cos(a) * (ro - 2), Math.sin(a) * (ro - 2));
        g.lineTo(Math.cos(a) * (ro - (ro - ri) * (k % 4 === 0 ? 0.45 : 0.25)), Math.sin(a) * (ro - (ro - ri) * (k % 4 === 0 ? 0.45 : 0.25)));
        g.stroke();
      }
      g.restore();
      if (locked) {
        g.fillStyle = GOLD;
        g.beginPath(); g.arc(cx, cy - (ro + ri) / 2, 2.6, 0, Math.PI * 2); g.fill();
      }
    }
    g.save();
    g.globalAlpha = 1 - open * 0.75;
    g.fillStyle = '#0b0b0c';
    g.beginPath(); g.arc(cx, cy, R * 0.22, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(201,169,97,0.5)';
    g.lineWidth = 1;
    g.stroke();
    g.restore();
  }
}

function screw(g, x, y, r, a) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#2a251c';
  g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(201,169,97,0.85)';
  g.lineWidth = 1;
  g.stroke();
  g.rotate(a);
  g.beginPath(); g.moveTo(-r * 0.65, 0); g.lineTo(r * 0.65, 0); g.stroke();
  g.restore();
}
