// 3단계 벨벳 레플리카 바꿔치기. 길게 눌러 무게를 채우고 금빛 띠 안에서 손을 뗀다.
import { clamp, rand } from '../util.js';
import { GOLD, drawPiece, drawCard, drawRed } from '../figures.js';
import { audio } from '../audio.js';
import { haptics } from '../haptics.js';
import { radio, hint, edge } from '../ui.js';

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
    hint('길게 누르기 — 무게 채우기 · 금빛 띠 안에서 떼기', this.m.store.tutorialDone ? 6000 : 0);
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

  render(g, W, H) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    const cx = W / 2;
    const topY = H * 0.43;
    const pw = Math.min(W * 0.36, 150);

    // 스포트라이트 하나
    const sg = g.createLinearGradient(0, 0, 0, topY + 40);
    sg.addColorStop(0, 'rgba(255,236,200,0.0)');
    sg.addColorStop(1, 'rgba(255,236,200,0.10)');
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(cx - 10, 0);
    g.lineTo(cx + 10, 0);
    g.lineTo(cx + pw * 0.75, topY + 6);
    g.lineTo(cx - pw * 0.75, topY + 6);
    g.closePath();
    g.fill();

    // 순찰 중인 관리인 (전설)
    if (this.window) {
      const c = this.t % GUARD_CYCLE;
      const open = c > GUARD_CYCLE - GUARD_OPEN;
      const u = (c - (GUARD_CYCLE - GUARD_OPEN - 0.6)) / (GUARD_OPEN + 1.2);
      if (u > 0 && u < 1) {
        const gx = -40 + u * (W + 80);
        drawRed(g, gx, topY + 70, 'walk', this.t * 6, { scale: 2.2, body: '#060606', rim: 'rgba(239,232,220,0.18)', alpha: 0.9, hat: 'cap' });
      }
      g.fillStyle = open ? GOLD : 'rgba(139,134,128,0.8)';
      g.font = '12px "Noto Sans KR", sans-serif';
      g.textAlign = 'center';
      g.fillText(open ? '관리인이 시야를 가린다 — 지금' : '관리인을 기다려', cx, H * 0.6);
    }

    // 벨벳 진열대
    g.fillStyle = '#0e0a0c';
    g.fillRect(cx - pw / 2, topY, pw, H * 0.12);
    const vg = g.createLinearGradient(cx - pw / 2, 0, cx + pw / 2, 0);
    vg.addColorStop(0, 'rgba(0,0,0,0.6)');
    vg.addColorStop(0.5, 'rgba(255,255,255,0.03)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = vg;
    g.fillRect(cx - pw / 2, topY, pw, H * 0.12);
    g.fillStyle = '#1a1316';
    g.beginPath(); g.ellipse(cx, topY, pw / 2, 9, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(201,169,97,0.5)';
    g.lineWidth = 1;
    g.stroke();

    // 센서 표시
    for (let i = 0; i < ROUNDS; i++) {
      const x = cx + (i - 1) * 16;
      const y = topY + H * 0.12 - 12;
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(201,169,97,0.6)';
      g.stroke();
      if (i < this.round || (this.state === 'result' && this.ok && i === this.round)) {
        g.fillStyle = GOLD;
        g.fill();
      }
    }

    // 피스와 방문 카드
    const ps = pw * 0.7;
    if (this.state === 'card') {
      const u = clamp(this.rt / 0.7, 0, 1);
      drawPiece(g, this.m.piece.id, cx, topY - ps * 0.42 - u * 30, ps, { alpha: 1 - u });
      const cu = clamp((this.rt - 0.6) / 0.8, 0, 1);
      const ease = 1 - Math.pow(1 - cu, 3);
      if (cu > 0) drawCard(g, cx, topY - 8 - (1 - ease) * 60, pw * 0.42, -0.08 * ease + 0.3 * (1 - ease), ease);
      if (this.rt > 1.4) {
        g.fillStyle = `rgba(239,232,220,${clamp((this.rt - 1.4) / 0.5, 0, 1) * 0.8})`;
        g.font = '15px "Noto Serif KR", serif';
        g.textAlign = 'center';
        g.fillText('레드가 다녀갔습니다', cx, H * 0.66);
      }
    } else {
      drawPiece(g, this.m.piece.id, cx, topY - ps * 0.42, ps, { glow: true });
    }

    if (this.state === 'card') return;

    // 무게 게이지
    const gx = W * 0.14;
    const gw = W * 0.72;
    const gy = H * 0.66;
    const gh = 10;
    const open = this.guardOpen();
    g.fillStyle = 'rgba(239,232,220,0.05)';
    g.fillRect(gx, gy, gw, gh);
    const bx = gx + ((this.bc - this.bw / 2) / 100) * gw;
    const bwpx = (this.bw / 100) * gw;
    g.fillStyle = open ? 'rgba(201,169,97,0.32)' : 'rgba(201,169,97,0.1)';
    g.fillRect(bx, gy - 4, bwpx, gh + 8);
    g.strokeStyle = open ? GOLD : 'rgba(201,169,97,0.4)';
    g.lineWidth = 1;
    g.strokeRect(bx + 0.5, gy - 3.5, bwpx - 1, gh + 7);
    const mid = gx + (this.bc / 100) * gw;
    g.beginPath(); g.moveTo(mid, gy - 7); g.lineTo(mid, gy + gh + 7); g.stroke();
    g.strokeStyle = 'rgba(239,232,220,0.25)';
    g.strokeRect(gx + 0.5, gy + 0.5, gw - 1, gh - 1);
    g.fillStyle = this.state === 'result' && !this.ok ? '#c8102e' : 'rgba(239,232,220,0.85)';
    g.fillRect(gx, gy + 3, (this.v / 100) * gw, gh - 6);
    g.fillStyle = 'rgba(139,134,128,0.9)';
    g.font = '11px "Noto Sans KR", sans-serif';
    g.textAlign = 'left';
    g.fillText('무게', gx, gy - 12);
    g.textAlign = 'right';
    g.fillText(`${this.round + 1} / ${ROUNDS}`, gx + gw, gy - 12);

    if (this.state === 'result') {
      g.fillStyle = this.ok ? (this.perfect ? GOLD : 'rgba(239,232,220,0.85)') : 'rgba(239,232,220,0.7)';
      g.font = `${this.perfect ? 'italic ' : ''}17px "Noto Serif KR", serif`;
      g.textAlign = 'center';
      g.fillText(this.msg, cx, gy + 46);
    }

    // 레플리카 (벨벳 주머니)
    const ry = H * 0.83;
    const rr = Math.min(40, W * 0.1);
    const pressing = this.state === 'fill';
    g.fillStyle = pressing ? '#1c1418' : '#100c0e';
    g.beginPath(); g.arc(cx, ry, rr * (pressing ? 0.94 : 1), 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(201,169,97,0.7)';
    g.lineWidth = 1;
    g.stroke();
    if (pressing) {
      g.strokeStyle = GOLD;
      g.beginPath(); g.arc(cx, ry, rr + 6, -Math.PI / 2, -Math.PI / 2 + (this.v / 100) * Math.PI * 2); g.stroke();
    }
    g.beginPath();
    g.moveTo(cx - rr * 0.4, ry - rr * 0.35);
    g.quadraticCurveTo(cx, ry - rr * 0.1, cx + rr * 0.4, ry - rr * 0.35);
    g.stroke();
    g.fillStyle = 'rgba(139,134,128,0.9)';
    g.font = '11px "Noto Sans KR", sans-serif';
    g.textAlign = 'center';
    g.fillText('레플리카', cx, ry + rr + 18);
  }
}
