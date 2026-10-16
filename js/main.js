import { PIECES, DIFF, TOOLS, GRADE, STORY } from './data.js';
import { store } from './store.js';
import { audio } from './audio.js';
import { haptics } from './haptics.js';
import { el, closeOverlay, overlay, toast, clearRadio, hint } from './ui.js';
import { Mission } from './mission.js';
import { L as T } from './lines.js';
import { showGuide, showStory, isGuideOpen } from './guide.js';
import { dayIndex, fmtTime } from './util.js';
import { initGfx, resizeGfx, setQuality } from './gfx.js';
import { input, pollInput, endFrame, isTouch } from './input.js';
import { getShowcase, queueThumb, processThumbs } from './scenes.js';
import { preloadCharacters } from './characters.js';

const canvas = el.canvas;
initGfx(canvas);
preloadCharacters();
let W = 0;
let H = 0;
let dpr = 1;
let mission = null;
let lowPower = false;
let last = performance.now();
let t = 0;

const screens = ['title', 'salon', 'settings'];
const $ = (s) => document.querySelector(s);

function applySettings() {
  const s = store.data.settings;
  setQuality(s.hq === false ? 'low' : 'high');
  if (W) resize();
  audio.setEnabled(s.sound);
  haptics.enabled = s.haptics;
}
applySettings();

// ---------- 캔버스 ----------
function resize() {
  const r = el.app.getBoundingClientRect();
  W = r.width;
  H = r.height;
  dpr = Math.min(window.devicePixelRatio || 1, store.data.settings.hq === false || lowPower ? 1 : 2);
  resizeGfx(W, H, dpr);
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
canvas.addEventListener('wheel', (e) => {
  if (mission?.state === 'play' && mission.stage?.wheel) {
    mission.stage.wheel(e.deltaY);
    e.preventDefault();
  }
}, { passive: false });
input.on((type, e) => {
  if (type !== 'keydown' || e.repeat || isGuideOpen()) return;
  audio.unlock();
  if (e.code === 'Escape' && mission?.state === 'play') {
    if (mission.paused) resume(); else pause();
    return;
  }
  // 오버레이가 떠 있으면 Enter·Space = 기본 버튼, R = 다시
  const ov = el.overlay;
  if (!ov.hidden) {
    if (e.code === 'KeyR') ov.querySelector('[data-a="retry"], [data-a="restart"]')?.click();
    else if (e.code === 'Enter' || e.code === 'Space') {
      const btn = ov.querySelector('.primary');
      if (btn) btn.click(); else ov.click();
      e.preventDefault();
    }
    return;
  }
  if (!mission && !$('#screen-title').hidden && e.code === 'Enter') startMission(dailyPiece());
});
document.body.classList.toggle('touch', isTouch);
document.getElementById('pausebtn').addEventListener('click', () => (mission?.paused ? resume() : pause()));
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- 루프 ----------
// 느린 기기 자동 감지: 3초 동안 평균 25fps 아래면 해상도·후처리를 낮춘다
let perfT = 0;
let perfN = 0;
function watchPerf(raw) {
  if (lowPower || !mission || mission.state !== 'play') return;
  perfT += raw;
  perfN++;
  if (perfT < 3) return;
  if (perfT / perfN > 0.04) {
    lowPower = true;
    setQuality('low');
    resize();
    toast('부드러운 진행을 위해 그래픽을 낮췄습니다');
  }
  perfT = 0;
  perfN = 0;
}

function frame(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  watchPerf(Math.min(raw, 0.25));
  t += dt;
  processThumbs();
  pollInput();
  if (mission) mission.frame(dt, W, H);
  else getShowcase().render(dt);
  endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- 화면 ----------
function show(id) {
  for (const s of screens) $(`#screen-${s}`).hidden = s !== id;
  if (id === 'title') getShowcase().set({ mode: 'title', piece: dailyPiece().id, offsetY: 0.05 });
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
  $('#daily-name').textContent = p.name;
  $('#daily-line').textContent = rec ? `${p.line} · 재방문` : p.line;
  const notes = {
    apprentice: '관리인이 느리고 감시 카메라가 없습니다. 처음이라면 여기서.',
    pro: '감시 카메라가 켜지고, 금고를 여는 중에 발소리가 지나갑니다.',
    legend: '관리인이 한 명 더, 판정이 가장 엄격합니다. 팬더 인장은 여기서만.',
  };
  $('#diff-note').textContent = notes[store.data.diff] || notes.apprentice;
  for (const b of document.querySelectorAll('#diff button')) {
    const on = b.dataset.diff === store.data.diff;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on);
  }
  const back = PIECES.filter((x) => store.data.pieces[x.id]).length;
  const tag = document.querySelector('.tagline');
  tag.innerHTML = back >= PIECES.length
    ? '다섯 점이 모두 메종으로 돌아왔습니다. 이제는 더 우아하게, 더 조용히.'
    : back ? `${T.title.tagline}<br><small>되찾은 진품 ${back} / ${PIECES.length}</small>` : T.title.tagline;
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
    b.innerHTML = `<canvas></canvas><span class="ln">${p.line}</span><span class="nm">${p.name}</span><span class="st">${st.text}</span>${rec?.seal ? '<i class="seal"></i>' : ''}`;
    b.onclick = () => startMission(p);
    book.appendChild(b);
    queueThumb(b.querySelector('canvas'), p.id, { silhouette: !rec });
  }
  const d = store.data;
  const back = PIECES.filter((x) => d.pieces[x.id]).length;
  const sealed = PIECES.filter((x) => d.pieces[x.id]?.seal).length;
  $('#salon-meta').innerHTML = `
    되찾은 진품 <b>${back} / ${PIECES.length}</b> — 다섯 점을 모두 메종으로 돌려보내면 이야기의 끝을 볼 수 있습니다<br>
    남긴 방문 카드 <b>${d.cards}장</b> · 팬더 인장 <b>${sealed} / ${PIECES.length}</b> <small>(전설 난이도 S)</small><br>
    ${d.bestTime ? `나의 최단 기록 <b>${fmtTime(d.bestTime)}</b><br>` : ''}
    <div class="tools"><span class="eyebrow">괴도의 도구 · 얻으면 늘 지니고 갑니다</span>${TOOLS.map((x) => `<p class="${d.tools[x.id] ? '' : 'off'}"><b>${x.name}</b> ${d.tools[x.id] ? x.effect : `얻는 법: ${x.when}`}</p>`).join('')}</div>
    ${back >= PIECES.length ? '<button class="link" data-nav="epilogue">에필로그 다시 보기</button>' : ''}`;
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
  else if (a === 'guide') showGuide({ startLabel: '닫기', onDone: () => renderTitle() });
  else if (a === 'story') showStory({ startLabel: '닫기', closeLabel: '닫기', onDone: () => renderTitle() });
  else if (a === 'epilogue') {
    overlay(`<div class="panel night-panel fade-in"><p class="eyebrow">Épilogue</p><h2>다섯 점이 돌아왔습니다</h2>${STORY.epilogue.map((l) => `<p class="op">${l}</p>`).join('')}<button class="primary light" data-a="close">닫기</button></div>`, { cls: 'paper dark', onAction: () => closeOverlay() });
  }
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
  // 처음 방문하는 사람에게는 이야기와 방법부터
  if (!store.data.storySeen) {
    showStory({
      closeLabel: '건너뛰기',
      onDone: () => {
        store.data.storySeen = true;
        store.save();
        startMission(piece);
      },
    });
    return;
  }
  if (!store.data.guideSeen) {
    showGuide({
      closeLabel: '건너뛰고 시작',
      onDone: () => {
        store.data.guideSeen = true;
        store.save();
        startMission(piece);
      },
    });
    return;
  }
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
function pause() {
  if (!mission || mission.state !== 'play' || mission.paused) return;
  mission.paused = true;
  mission.stage?.up?.({ x: 0, y: 0 });
  activePointer = null;
  audio.suspend();
  const snd = store.data.settings.sound;
  overlay(`<div class="pause"><p class="eyebrow">Pause</p><h2>${T.pause.title}</h2><div class="stack">
    <button class="primary" data-a="resume">${T.pause.resume}<span class="key">Esc</span></button>
    <button class="ghost light" data-a="restart">${T.pause.restart}<span class="key">R</span></button>
    <button class="ghost light" data-a="guide">방문 방법 보기</button>
    <button class="ghost light" data-a="sound">사운드 ${snd ? '끄기' : '켜기'}</button>
    <button class="link" data-a="quit">${T.pause.leave}</button></div></div>`, {
    cls: 'dim',
    onAction: (a) => {
      if (a === 'resume') resume();
      else if (a === 'restart') {
        resume();
        mission.stage?.dispose?.();
        mission.retry();
      } else if (a === 'guide') {
        const at = { gallery: 1, ante: 1, vault: 3, swap: 4 }[mission.flow[mission.idx]?.key] ?? 0;
        closeOverlay();
        showGuide({ startAt: at, startLabel: '닫기', closeLabel: '닫기', onDone: () => { mission.paused = false; pause(); } });
      } else if (a === 'sound') {
        store.data.settings.sound = !store.data.settings.sound;
        store.save();
        applySettings();
        closeOverlay();
        mission.paused = false;
        pause();
      } else mission.exit();
    },
  });
}
function resume() {
  closeOverlay();
  audio.resume();
  if (mission) mission.paused = false;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    audio.suspend();
    pause();
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
window.__red = { get mission() { return mission; }, store, clearRadio, hint, getShowcase };
