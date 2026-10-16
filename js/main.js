import { PIECES, DIFF, TOOLS, GRADE } from './data.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { haptics } from './haptics.js';
import { el, closeOverlay, overlay, toast, clearRadio, hint } from './ui.js';
import { Mission, paintPiece } from './mission.js';
import { dayIndex, fmtTime } from './util.js';
import { drawPanther } from './figures.js';

const canvas = el.canvas;
const g = canvas.getContext('2d');
let W = 0;
let H = 0;
let dpr = 1;
let mission = null;
let last = performance.now();
let t = 0;

const screens = ['title', 'salon', 'settings'];
const $ = (s) => document.querySelector(s);

function applySettings() {
  const s = store.data.settings;
  audio.setEnabled(s.sound);
  haptics.enabled = s.haptics;
}
applySettings();

// ---------- 캔버스 ----------
function resize() {
  const r = el.app.getBoundingClientRect();
  W = r.width;
  H = r.height;
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
resize();

function pos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
let activePointer = null;
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (activePointer !== null) return;
  activePointer = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  mission?.pointer('down', pos(e));
  e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerId !== activePointer) return;
  mission?.pointer('move', pos(e));
});
const end = (e) => {
  if (e.pointerId !== activePointer) return;
  activePointer = null;
  mission?.pointer('up', pos(e));
};
canvas.addEventListener('pointerup', end);
canvas.addEventListener('pointercancel', end);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- 루프 ----------
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (mission) mission.frame(dt, g, W, H);
  else ambient(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// 타이틀 배경: 어둠 속을 천천히 훑는 붉은 레이저 한 줄
function ambient() {
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  const y = H * (0.18 + 0.5 * (0.5 + 0.5 * Math.sin(t * 0.35)));
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const [w, a] of [[10, 0.05], [3, 0.15], [1, 0.5]]) {
    g.strokeStyle = `rgba(255,30,50,${a})`;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y + H * 0.04); g.stroke();
  }
  g.restore();
  drawPanther(g, W * 0.35, H * 0.5, W * 0.75, 0.08 + 0.04 * Math.sin(t * 0.7));
}

// ---------- 화면 ----------
function show(id) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== id;
  if (id === 'title') renderTitle();
  if (id === 'salon') renderSalon();
  if (id === 'settings') renderSettings();
}

function dailyPiece() {
  return PIECES[dayIndex() % PIECES.length];
}

function renderTitle() {
  const p = dailyPiece();
  const rec = store.data.pieces[p.id];
  $('#daily-name').textContent = rec ? `${p.name} · 재방문` : p.name;
  for (const b of document.querySelectorAll('#diff button')) {
    const on = b.dataset.diff === store.data.diff;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  }
  const sealed = PIECES.every((x) => store.data.pieces[x.id]?.seal);
  const tag = document.querySelector('.tagline');
  tag.innerHTML = sealed
    ? '시즌 서클에 초대되었습니다.<br><span style="color:var(--gold)">초대장을 받은 사람만 알 수 있습니다.</span>'
    : '레이저를 피하고, 금고를 열고,<br>방문 카드 한 장만 남긴다.';
}

function pieceState(rec) {
  if (!rec) return { text: '실루엣 · 아직 회수 전', cls: '' };
  if (rec.seal) return { text: `팬더 인장 · ${fmtTime(rec.bestTime)}`, cls: 'lit seal' };
  if (rec.best === 'S' || rec.best === 'A') return { text: `전용 조명 · ${GRADE[rec.best].label} ${rec.best}`, cls: 'lit' };
  return { text: `진열 · ${GRADE.B.label} B`, cls: '' };
}

function renderSalon() {
  const book = $('#book');
  book.innerHTML = '';
  for (const p of PIECES) {
    const rec = store.data.pieces[p.id];
    const st = pieceState(rec);
    const b = document.createElement('button');
    b.className = `piece ${st.cls}`;
    b.innerHTML = `<canvas></canvas><span class="nm">${p.name}</span><span class="st">${st.text}</span>`;
    b.onclick = () => startMission(p);
    book.appendChild(b);
    requestAnimationFrame(() => paintPiece(b.querySelector('canvas'), p.id, {
      silhouette: !rec, glow: rec && rec.best !== 'B', seal: rec?.seal,
    }));
  }
  const d = store.data;
  const sealed = PIECES.filter((x) => d.pieces[x.id]?.seal).length;
  $('#salon-meta').innerHTML = `
    남긴 방문 카드 <b>${d.cards}장</b><br>
    팬더 인장 <b>${sealed} / ${PIECES.length}</b> — 다섯 피스를 모두 채우면 시즌 서클 초대<br>
    ${d.bestTime ? `나의 최단 기록 <b>${fmtTime(d.bestTime)}</b><br>` : ''}
    <div class="tools">괴도의 도구 ${TOOLS.map((x) => `<span class="${d.tools[x.id] ? '' : 'off'}">${x.name}</span>`).join('')}</div>`;
}

function renderSettings() {
  for (const i of document.querySelectorAll('[data-set]')) i.checked = !!store.data.settings[i.dataset.set];
}

document.addEventListener('change', (e) => {
  const k = e.target.dataset?.set;
  if (!k) return;
  store.data.settings[k] = e.target.checked;
  store.save();
  applySettings();
  if (k === 'haptics' && e.target.checked) {
    if (haptics.supported) haptics.clunk();
    else toast('이 브라우저는 진동을 지원하지 않습니다');
  }
});

document.addEventListener('click', (e) => {
  const d = e.target.closest('[data-diff]');
  if (d) {
    store.data.diff = d.dataset.diff;
    store.save();
    renderTitle();
    return;
  }
  const n = e.target.closest('[data-nav]');
  if (!n) return;
  audio.unlock();
  const a = n.dataset.nav;
  if (a === 'start') startMission(dailyPiece());
  else if (a === 'reset') {
    if (confirm('살롱의 모든 기록을 지울까요?')) {
      store.reset();
      applySettings();
      toast('기록을 지웠습니다');
      show('title');
    }
  } else show(a);
});

function startMission(piece) {
  audio.unlock();
  for (const s of screens) $(`#screen-${s}`).hidden = true;
  mission = new Mission({
    piece,
    diff: DIFF[store.data.diff] || DIFF.apprentice,
    onExit: (next) => {
      mission = null;
      if (next === 'again') startMission(piece);
      else show(next === 'salon' ? 'salon' : 'title');
    },
  });
  mission.start();
}

// ---------- 일시정지 ----------
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
    if (mission && mission.state === 'play') {
      mission.paused = true;
      mission.stage?.up?.({ x: 0, y: 0 });
      activePointer = null;
      overlay(`<div class="pause fade-in"><h2>잠시 숨을 고릅니다</h2><button class="primary" data-a="resume">계속하기</button></div>`, {
        cls: 'dim',
        onAction: () => {
          closeOverlay();
          audio.resume();
          mission.paused = false;
        },
      });
    }
  } else if (!mission || !mission.paused) audio.resume();
});

show('title');

// ?play=1 로 바로 미션 시작 (QR·광고 랜딩용)
const qs = new URLSearchParams(location.search);
if (qs.get('play')) {
  const p = PIECES.find((x) => x.id === qs.get('piece')) || dailyPiece();
  startMission(p);
}

// 개발·테스트용 훅
window.__red = { get mission() { return mission; }, store, clearRadio, hint };
