// 한 판(약 3분)의 미션 진행: 단계 전환, 시선 게이지, 정체 드러남, 회수 등급.
import { clamp, fmtTime } from './util.js';
import { GRADE, BRIEF, TOOLS } from './data.js';
import { audio } from './audio.js';
import { haptics } from './haptics.js';
import { store } from './store.js';
import { el, radio, clearRadio, hint, edge, setGaze, setWatch, overlay, closeOverlay, toast } from './ui.js';
import { drawRed, drawPanther, drawPiece, drawCard } from './figures.js';
import { Corridor } from './stages/corridor.js';
import { Vault } from './stages/vault.js';
import { Swap } from './stages/swap.js';

const S_TIME = 180;

export class Mission {
  constructor({ piece, diff, onExit }) {
    this.piece = piece;
    this.diff = diff;
    this.store = store.data;
    const s = this.store.settings;
    this.mods = { ...this.store.tools, easy: !!s.easy };
    this.onExit = onExit;
    this.flow = [
      { key: 'laser', zone: '붉은 복도', sub: '1단계 · 레이저 회랑', make: () => new Corridor(this, 'laser', 'arch') },
      { key: 'patrol', zone: '회랑의 끝', sub: '야간 관리인의 시선', make: () => new Corridor(this, 'patrol', 'vault') },
      { key: 'vault', zone: '지하 금고실', sub: `2단계 · ${piece.vault === 'love' ? 'Love' : 'Trinity'} 금고`, make: () => new Vault(this) },
      { key: 'patrol2', zone: '계단 회랑', sub: '야간 관리인의 시선', make: () => new Corridor(this, 'patrol', 'curtain') },
      { key: 'swap', zone: '비밀 전시실', sub: '3단계 · 벨벳 레플리카', make: () => new Swap(this) },
    ];
    this.gaze = 0;
    this.stageGaze = 0;
    this.elapsed = 0;
    this.perfects = 0;
    this.pantherSteps = 0;
    this.revealed = 0;
    this.stats = {};
    this.state = 'brief';
    this.stage = null;
    this.idx = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.pantherFx = 0;
    this.fade = 0;
    this.paused = false;
    this.W = 0;
    this.H = 0;
  }

  start() {
    setGaze(0);
    const lines = BRIEF.map((l) => `<p class="op"><span>OPERATOR</span>${l}</p>`).join('');
    const o = overlay(`
      <div class="brief fade-in">
        <p class="sub">MISSION · ${this.diff.label}</p>
        <h2>${this.piece.name}</h2>
        <canvas id="brief-piece"></canvas>
        ${lines}
        <p class="meta">붉은 복도 → 지하 금고실 → 비밀 전시실 · 약 3분</p>
        <button class="primary" data-a="go">방문 시작</button>
      </div>`, { cls: 'solid', onAction: (a) => a === 'go' && this.begin() });
    paintPiece(o.querySelector('#brief-piece'), this.piece.id, { glow: false, silhouette: true });
  }

  begin() {
    closeOverlay();
    audio.unlock();
    el.hud.hidden = false;
    audio.tempo = 76;
    audio.startMusic();
    this.enterStage(0);
  }

  enterStage(i) {
    this.idx = i;
    this.stageStartGaze = this.gaze;
    this.stageGaze = 0;
    this.state = 'transition';
    this.stage = null;
    clearRadio();
    hint('');
    const f = this.flow[i];
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      closeOverlay();
      this.stage = f.make();
      this.state = 'play';
      this.fade = 1;
      this.stage.enter();
    };
    overlay(`
      <div class="zone fade-in">
        <p class="sub">${f.sub}</p>
        <h2>${f.zone}</h2>
        <div class="line"></div>
      </div>`, { cls: 'solid', onTap: go });
    const timer = setTimeout(go, 1500);
  }

  // ---------- 입력 ----------
  pointer(type, p) {
    if (this.state !== 'play' || !this.stage || this.paused) return;
    this.stage[type](p);
  }

  // ---------- 공통 규칙 ----------
  addGaze(n, kind, silent = false) {
    if (this.state !== 'play') return;
    this.gaze = clamp(this.gaze + n, 0, 100);
    this.stageGaze += n;
    audio.tempo = 76 + this.gaze * 0.45;
    setGaze(this.gaze);
    if (!silent) this.warnPulse();
    if (this.gaze >= 100) this.reveal('gaze');
  }

  warnPulse() {
    edge('red');
    haptics.warn();
    audio.warn();
  }

  pantherStep() {
    this.pantherSteps++;
    this.slowT = 0.5;
    this.pantherFx = 1;
    audio.slow();
    haptics.clunk();
    radio('팬더의 걸음.', 1400);
  }

  stageClear(stats) {
    const f = this.flow[this.idx];
    this.stats[f.key] = { ...stats, gaze: this.stageGaze };
    this.state = 'clear';
    clearRadio();
    setTimeout(() => {
      if (this.state !== 'clear') return;
      if (this.idx + 1 < this.flow.length) this.enterStage(this.idx + 1);
      else this.finish();
    }, 650);
  }

  // ---------- 정체가 드러나는 순간 ----------
  reveal(reason) {
    if (this.state !== 'play') return;
    this.state = 'reveal';
    this.revealReason = reason;
    this.revealT = 0;
    this.revealed++;
    audio.humStop();
    audio.stopMusic(0.4);
    clearRadio();
    hint('');
    haptics.hit();
    for (let i = 0; i < 4; i++) setTimeout(() => this.state === 'reveal' && audio.bell(i), 250 + i * 300);
    this.revealTimer = setTimeout(() => this.showRevealCard(), 2700);
  }

  showRevealCard() {
    if (this.state !== 'reveal' || this.revealCard) return;
    clearTimeout(this.revealTimer);
    this.revealCard = true;
    const why = this.revealReason === 'time' ? '시간이 다 되어 조명이 켜졌습니다.' : '시선이 모두 모였습니다.';
    overlay(`
      <div class="reveal fade-in">
        <h2>정체가 드러났습니다</h2>
        <p>${why}<br>레드는 정중히 인사하고 어둠 속으로 물러났습니다.</p>
        <div class="stack">
          <button class="primary" data-a="retry">다시 방문하기</button>
          <button class="link" data-a="exit">메종을 떠나기</button>
        </div>
      </div>`, {
      cls: 'dim',
      onAction: (a) => {
        this.revealCard = false;
        if (a === 'retry') this.retry();
        else this.exit();
      },
    });
  }

  retry() {
    closeOverlay();
    this.gaze = this.stageStartGaze;
    setGaze(this.gaze);
    audio.tempo = 76 + this.gaze * 0.45;
    audio.startMusic();
    this.enterStage(this.idx);
  }

  exit(next) {
    this.state = 'over';
    audio.humStop();
    audio.stopMusic();
    clearRadio();
    hint('');
    closeOverlay();
    el.hud.hidden = true;
    this.onExit(next);
  }

  // ---------- 회수 등급 ----------
  finish() {
    this.state = 'done';
    audio.stopMusic(1.2);
    el.hud.hidden = true;
    const t = this.elapsed;
    let grade = 'B';
    if (this.gaze <= 30) grade = 'A';
    if (this.gaze === 0 && this.revealed === 0 && this.perfects >= 2 && t <= S_TIME) grade = 'S';
    if (this.mods.easy && grade === 'S') grade = 'A';

    const d = store.data;
    const rec = d.pieces[this.piece.id] || {};
    const rank = { B: 1, A: 2, S: 3 };
    const firstRetrieve = !Object.keys(d.pieces).length;
    const isNew = !rec.best;
    const seal = grade === 'S' && this.diff.id === 'legend';
    if (!rec.best || rank[grade] > rank[rec.best]) rec.best = grade;
    if (seal) rec.seal = true;
    if (!rec.bestTime || t < rec.bestTime) rec.bestTime = t;
    d.pieces[this.piece.id] = rec;
    d.cards++;
    if (!d.bestTime || t < d.bestTime) d.bestTime = t;
    d.tutorialDone = true;

    const gifts = [];
    const give = (id) => {
      if (d.tools[id]) return;
      d.tools[id] = true;
      gifts.push(TOOLS.find((x) => x.id === id));
    };
    if (firstRetrieve) give('glove');
    const v = this.stats.vault;
    if (v && v.gaze === 0 && v.timeLeft >= 15 && this.revealed === 0) give('loupe');
    const l = this.stats.laser;
    if (l && l.hits === 0 && this.revealed === 0) give('monocle');
    store.save();

    this.result = { grade, t, seal, gifts, isNew };
    if (seal) this.showRedBox();
    else this.showResult();
  }

  showRedBox() {
    audio.redbox();
    overlay(`
      <div class="redbox-wrap fade-in">
        <div class="redbox"><div class="base"></div><div class="inside"><div class="card">INVITATION</div></div><div class="lid"></div></div>
        <h2>비밀 거래 암호코드</h2>
        <p class="phrase">“팬더는 밤에 걷는다.”</p>
        <p>전설 등급 회수. 팬더 인장이 찍혔습니다.<br>체험판에서는 실물 선물 초대장이 발급되지 않습니다.<br>정식 버전에서는 이 순간 매장 예약과 일회용 QR이 열립니다.</p>
        <button class="primary" data-a="next" style="align-self:stretch">계속</button>
      </div>`, { cls: 'solid', onAction: () => this.showResult() });
  }

  showResult() {
    const { grade, t, seal, gifts } = this.result;
    const G = GRADE[grade];
    const giftHtml = gifts.length
      ? `<p class="gift">선물 · ${gifts.map((x) => `${x.name} <span>(${x.effect})</span>`).join('<br>선물 · ')}</p>`
      : '';
    const note = this.mods.easy ? '<p class="gift"><span>판정 범위 완화 중 · 전설 등급은 기록되지 않습니다</span></p>' : '';
    const o = overlay(`
      <div class="result fade-in">
        <p class="sub">회수 완료 · ${this.diff.label}</p>
        <p class="grade">${G.label} <span style="color:var(--gold)">${grade}</span><small>${this.piece.name} — ${seal ? '팬더 인장이 찍힌 진열' : G.place}</small></p>
        <canvas id="result-piece"></canvas>
        <dl>
          <div><dt>시간</dt><dd>${fmtTime(t)}</dd></div>
          <div><dt>시선</dt><dd>${Math.round(this.gaze)}%</dd></div>
          <div><dt>완벽한 손놀림</dt><dd>${this.perfects}</dd></div>
          <div><dt>팬더의 걸음</dt><dd>${this.pantherSteps}</dd></div>
        </dl>
        ${giftHtml}${note}
        <div class="stack">
          <button class="primary" data-a="share">방문 카드 공유하기</button>
          <button class="ghost" data-a="again">다시 방문하기</button>
          <button class="link" data-a="salon">나의 살롱으로</button>
        </div>
      </div>`, {
      cls: 'solid',
      onAction: (a) => {
        if (a === 'share') this.share();
        else this.exit(a);
      },
    });
    paintPiece(o.querySelector('#result-piece'), this.piece.id, { glow: grade !== 'B', card: true, seal });
  }

  async share() {
    const { grade, t } = this.result;
    const text = `레드가 다녀갔습니다.\n${this.piece.name} · ${GRADE[grade].label}(${grade}) · ${fmtTime(t)} · ${this.diff.label}`;
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: '코드네임: 레드', text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast('방문 카드를 복사했습니다');
    } catch { /* 사용자가 취소 */ }
  }

  // ---------- 매 프레임 ----------
  frame(dt, g, W, H) {
    this.W = W;
    this.H = H;
    if (this.paused) dt = 0;
    if (this.slowT > 0) {
      this.slowT -= dt;
      this.timeScale = this.slowT > 0 ? 0.3 : 1;
    }
    this.pantherFx = Math.max(0, this.pantherFx - dt * 1.6);
    this.fade = Math.max(0, this.fade - dt * 2.5);

    if (this.state === 'play' && this.stage) {
      this.elapsed += dt;
      this.stage.update(dt * this.timeScale);
    } else if (this.state === 'reveal') {
      this.revealT += dt;
    }

    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    if (this.state === 'reveal') this.renderReveal(g, W, H, this.revealT);
    else if (this.stage && (this.state === 'play' || this.state === 'clear')) {
      this.stage.render(g, W, H);
      if (this.pantherFx > 0) {
        const u = 1 - this.pantherFx;
        drawPanther(g, -W * 0.6 + u * W * 1.6, H * 0.3, W * 0.9, Math.sin(u * Math.PI) * 0.35);
      }
      if (this.timeScale < 1) {
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, 0, W, H);
      }
      if (this.state === 'clear') {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(0, 0, W, H);
      }
      if (this.fade > 0) {
        g.fillStyle = `rgba(0,0,0,${this.fade})`;
        g.fillRect(0, 0, W, H);
      }
    }

    // 탱크 시계: 제한 시간이 있는 단계는 남은 시간, 아니면 3분 기준
    if (this.stage && this.stage.timeLimit) {
      setWatch(this.stage.timeLeft / this.stage.timeLimit, this.stage.timeLeft < 10);
    } else {
      setWatch(1 - Math.min(1, this.elapsed / S_TIME), false);
    }
  }

  // 사이렌 없이: 샹들리에가 하나씩 켜지고, 관리인의 실루엣, 레드는 모자를 들어 인사한 뒤 물러난다
  renderReveal(g, W, H, t) {
    const lit = clamp((t - 0.25) / 1.2, 0, 1);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, `rgba(60,48,34,${lit * 0.9})`);
    bg.addColorStop(1, `rgba(20,16,12,${lit})`);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // 대리석 바닥
    g.strokeStyle = `rgba(201,169,97,${0.2 + lit * 0.3})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, H * 0.74); g.lineTo(W, H * 0.74); g.stroke();
    // 샹들리에
    for (let i = 0; i < 4; i++) {
      const x = W * (0.14 + i * 0.24);
      const y = H * 0.16;
      const on = t > 0.25 + i * 0.3;
      g.strokeStyle = 'rgba(201,169,97,0.6)';
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, y - 10); g.stroke();
      g.beginPath(); g.arc(x, y, 12, 0, Math.PI); g.stroke();
      g.beginPath(); g.arc(x, y + 6, 6, 0, Math.PI); g.stroke();
      if (on) {
        const k = clamp((t - 0.25 - i * 0.3) / 0.3, 0, 1);
        const rg = g.createRadialGradient(x, y, 2, x, y, W * 0.35);
        rg.addColorStop(0, `rgba(255,236,200,${0.55 * k})`);
        rg.addColorStop(1, 'rgba(255,236,200,0)');
        g.fillStyle = rg;
        g.fillRect(x - W * 0.35, y - W * 0.35, W * 0.7, W * 0.7);
      }
    }
    // 계단과 관리인
    g.strokeStyle = `rgba(201,169,97,${0.15 + lit * 0.35})`;
    g.beginPath();
    let sx = W * 0.52;
    let sy = H * 0.74;
    g.moveTo(sx, sy);
    for (let i = 0; i < 7; i++) {
      sy -= H * 0.035;
      g.lineTo(sx, sy);
      sx += W * 0.065;
      g.lineTo(sx, sy);
    }
    g.stroke();
    const ga = clamp((t - 1.1) / 0.5, 0, 1);
    if (ga > 0) drawRed(g, W * 0.86, sy, 'stand', 0, { scale: 1.8, alpha: ga, body: '#0a0806', rim: 'rgba(255,236,200,0.35)', flip: true, hat: 'cap' });
    // 레드: 모자를 들어 인사한 뒤 어둠 속으로
    const lift = clamp((t - 1.5) / 0.4, 0, 1) * (1 - clamp((t - 2.2) / 0.3, 0, 1));
    const away = clamp((t - 2.2) / 0.6, 0, 1);
    drawRed(g, W * 0.3 - away * W * 0.25, H * 0.74, 'stand', 0, {
      scale: 2.4, hatLift: lift * 7, alpha: 1 - away, rim: 'rgba(255,236,200,0.75)',
    });
  }
}

function paintPiece(cv, id, o) {
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const w = r.width;
  const h = r.height;
  const size = Math.min(w * 0.5, h * 0.7);
  if (o.glow) {
    const sg = g.createLinearGradient(0, 0, 0, h);
    sg.addColorStop(0, 'rgba(255,236,200,0)');
    sg.addColorStop(1, 'rgba(255,236,200,0.07)');
    g.fillStyle = sg;
    g.beginPath(); g.moveTo(w / 2 - 6, 0); g.lineTo(w / 2 + 6, 0); g.lineTo(w / 2 + size * 0.8, h); g.lineTo(w / 2 - size * 0.8, h); g.fill();
  }
  drawPiece(g, id, w / 2, h * 0.46, size, o);
  if (o.card) drawCard(g, w / 2 + size * 0.62, h * 0.82, Math.min(54, w * 0.16), -0.12);
  if (o.seal) {
    g.strokeStyle = '#c9a961';
    g.lineWidth = 1;
    g.beginPath(); g.arc(w / 2 - size * 0.66, h * 0.8, 14, 0, Math.PI * 2); g.stroke();
    drawPanther(g, w / 2 - size * 0.66 - 10, h * 0.8 - 5, 20, 1);
  }
}

export { paintPiece };
