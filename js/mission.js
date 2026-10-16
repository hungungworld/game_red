// 한 판(약 3분)의 미션 진행: 단계 전환, 시선 게이지, 정체 드러남, 회수 등급.
import { clamp, fmtTime } from './util.js';
import { GRADE, BRIEF, TOOLS } from './data.js';
import { audio } from './audio.js';
import { haptics } from './haptics.js';
import { store } from './store.js';
import { el, radio, clearRadio, hint, edge, setGaze, setWatch, overlay, closeOverlay, toast } from './ui.js';
import { getShowcase, Reveal, drawBlank } from './scenes.js';
import { Heist } from './stages/heist.js';
import { LEVELS } from './levels.js';
import { Vault } from './stages/vault.js';
import { Swap } from './stages/swap.js';

const S_TIME = 300;

export class Mission {
  constructor({ piece, diff, onExit }) {
    this.piece = piece;
    this.diff = diff;
    this.store = store.data;
    const s = this.store.settings;
    this.mods = { ...this.store.tools, easy: !!s.easy };
    this.onExit = onExit;
    this.flow = [
      { key: 'gallery', zone: '갤러리 회랑', sub: '1단계 · 잠입', make: () => new Heist(this, 'gallery') },
      { key: 'vault', zone: '지하 금고실', sub: `2단계 · ${piece.vault === 'love' ? 'Love' : 'Trinity'} 금고`, make: () => new Vault(this) },
      { key: 'ante', zone: '비밀 전시실 앞', sub: '3단계 · 잠입', make: () => new Heist(this, 'antechamber') },
      { key: 'swap', zone: '비밀 전시실', sub: '4단계 · 벨벳 레플리카', make: () => new Swap(this) },
    ];

    this.gaze = 0;
    this.gazeFloor = 0;
    this.peakGaze = 0;
    this.emblems = 0;
    this.alerted = false;
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
    getShowcase().set({ mode: 'piece', piece: this.piece.id, offsetY: 0.27 });
    const lines = BRIEF.map((l) => `<p class="op">${l}</p>`).join('');
    overlay(`
      <div class="window"></div>
      <div class="panel brief fade-in">
        <p class="eyebrow">Mission · ${this.diff.label}</p>
        <h2>${this.piece.name}</h2>
        <p class="eyebrow dim">${this.piece.line}</p>
        <div class="ops"><span class="eyebrow">Operator</span>${lines}</div>
        <p class="meta">갤러리 회랑 → 지하 금고실 → 비밀 전시실 · 약 4분</p>
        <button class="primary" data-a="go">방문 시작</button>
        <button class="link" data-a="back">돌아가기</button>
      </div>`, { cls: 'paper', onAction: (a) => (a === 'go' ? this.begin() : this.exit()) });
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
    if (this.retrying) this.emblems = this.stageStartEmblems ?? this.emblems;
    this.retrying = false;
    this.stageStartEmblems = this.emblems;
    this.stageStartGaze = this.gaze;
    this.stageGaze = 0;
    this.state = 'transition';
    this.stage?.dispose?.();
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
      </div>`, { cls: 'night', onTap: go });
    const timer = setTimeout(go, 1500);
  }

  // ---------- 입력 ----------
  pointer(type, p) {
    if (this.state !== 'play' || !this.stage || this.paused) return;
    this.stage[type](p);
  }

  // ---------- 공통 규칙 ----------
  addGaze(n, kind, silent = false, permanent = false) {
    if (this.state !== 'play') return;
    this.gaze = clamp(this.gaze + n, 0, 100);
    if (permanent || kind !== 'seen') this.gazeFloor = Math.min(100, this.gazeFloor + n);
    this.peakGaze = Math.max(this.peakGaze, this.gaze);
    this.stageGaze += n;
    audio.tempo = 76 + this.gaze * 0.45;
    setGaze(this.gaze);
    if (!silent) this.warnPulse();
    if (this.gaze >= 100) this.reveal('gaze');
  }

  // 시야에서 벗어나 있으면 관찰로 쌓인 시선은 천천히 식는다 (레이저·실수로 쌓인 몫은 남는다)
  relax(n) {
    if (this.state !== 'play' || this.gaze <= this.gazeFloor) return;
    this.gaze = Math.max(this.gazeFloor, this.gaze - n);
    audio.tempo = 76 + this.gaze * 0.45;
    setGaze(this.gaze);
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
    const fx = document.getElementById('fx');
    fx.classList.remove('on');
    void fx.offsetWidth;
    fx.classList.add('on');
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
    this.stage?.dispose?.();
    this.revealScene = new Reveal();
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
      cls: 'veil',
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
    this.gazeFloor = Math.min(this.gazeFloor, this.gaze);
    this.retrying = true;
    setGaze(this.gaze);
    audio.tempo = 76 + this.gaze * 0.45;
    audio.startMusic();
    this.enterStage(this.idx);
  }

  exit(next) {
    this.state = 'over';
    this.stage?.dispose?.();
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
    this.stage?.dispose?.();
    audio.stopMusic(1.2);
    el.hud.hidden = true;
    const t = this.elapsed;
    const hits = (this.stats.gallery?.hits || 0) + (this.stats.ante?.hits || 0);
    let grade = 'B';
    if (this.peakGaze <= 50 && this.revealed === 0) grade = 'A';
    if (hits === 0 && !this.alerted && this.revealed === 0 && this.perfects >= 2 && t <= S_TIME && this.gazeFloor === 0) grade = 'S';
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
    const l = this.stats.gallery;
    if (l && l.hits === 0 && this.revealed === 0) give('monocle');
    store.save();

    this.result = { grade, t, seal, gifts, isNew };
    if (seal) this.showRedBox();
    else this.showResult();
  }

  showRedBox() {
    audio.redbox();
    getShowcase().set({ mode: 'redbox', piece: this.piece.id, offsetY: 0.14 });
    overlay(`
      <div class="window"></div>
      <div class="panel night-panel fade-in" style="animation-delay:1.6s">
        <p class="eyebrow">Panthère · Seal</p>
        <h2>비밀 거래 암호코드</h2>
        <p class="phrase">“팬더는 밤에 걷는다.”</p>
        <p class="meta">전설 등급 회수. 팬더 인장이 찍혔습니다.<br>체험판에서는 실물 선물 초대장이 발급되지 않습니다.<br>정식 버전에서는 이 순간 매장 예약과 일회용 QR이 열립니다.</p>
        <button class="primary light" data-a="next">계속</button>
      </div>`, { cls: 'paper dark', onAction: () => this.showResult() });
  }

  showResult() {
    const { grade, t, seal, gifts } = this.result;
    const G = GRADE[grade];
    getShowcase().set({ mode: 'piece', piece: this.piece.id, offsetY: 0.3 });
    const giftHtml = gifts.length
      ? `<p class="gift">${gifts.map((x) => `<b>선물 · ${x.name}</b> ${x.effect}`).join('<br>')}</p>`
      : '';
    const note = this.mods.easy ? '<p class="gift">판정 범위 완화 중 · 전설 등급은 기록되지 않습니다</p>' : '';
    overlay(`
      <div class="window"></div>
      <div class="panel result fade-in">
        <p class="eyebrow">회수 완료 · ${this.diff.label}</p>
        <p class="grade">${G.label}<em>${grade}</em></p>
        <p class="place">${this.piece.name} — ${seal ? '팬더 인장이 찍힌 진열' : G.place}</p>
        <dl>
          <div><dt>시간</dt><dd>${fmtTime(t)}</dd></div>
          <div><dt>최고 시선</dt><dd>${Math.round(this.peakGaze)}%</dd></div>
          <div><dt>완벽한 손놀림</dt><dd>${this.perfects}</dd></div>
          <div><dt>발자국</dt><dd>${this.emblems}<small>/${Object.values(LEVELS).reduce((n, l) => n + l.map.join('').split('P').length - 1, 0)}</small></dd></div>
        </dl>
        ${giftHtml}${note}
        <button class="primary" data-a="share">방문 카드 공유하기</button>
        <button class="ghost" data-a="again">다시 방문하기</button>
        <button class="link" data-a="salon">나의 살롱으로</button>
      </div>`, {
      cls: 'paper',
      onAction: (a) => {
        if (a === 'share') this.share();
        else this.exit(a);
      },
    });
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
  frame(dt, W, H) {
    this.W = W;
    this.H = H;
    if (this.paused) dt = 0;
    if (this.slowT > 0) {
      this.slowT -= dt;
      this.timeScale = this.slowT > 0 ? 0.3 : 1;
    }
    if (this.state === 'play' && this.stage) {
      this.elapsed += dt;
      this.stage.update(dt * this.timeScale);
    } else if (this.state === 'reveal') {
      this.revealT += dt;
    }

    if (this.state === 'brief' || this.state === 'done') getShowcase().render(dt);
    else if (this.state === 'reveal' && this.revealScene) this.revealScene.render(this.revealT);
    else if (this.stage && (this.state === 'play' || this.state === 'clear')) this.stage.render(dt);
    else drawBlank();

    // 탱크 시계: 제한 시간이 있는 단계는 남은 시간, 아니면 3분 기준
    if (this.stage && this.stage.timeLimit) {
      setWatch(this.stage.timeLeft / this.stage.timeLimit, this.stage.timeLeft < 10);
    } else {
      setWatch(1 - Math.min(1, this.elapsed / S_TIME), false);
    }
  }
}
