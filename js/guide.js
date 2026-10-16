// 넘겨 보는 카드 화면 두 가지: 이야기(프롤로그)와 방문 방법.
// 그림은 금선으로 줄여 그린 것이고, 조작 표기는 기기(키보드/터치)에 맞춘다.
import { el, closeOverlay } from './ui.js';
import { isTouch } from './input.js';
import { KIT, STORY } from './data.js';

let open = false;
export const isGuideOpen = () => open;

const k = (...keys) => keys.map((x) => `<kbd>${x}</kbd>`).join('');
const b = (label) => `<span class="pill">${label}</span>`;

function controls(stage) {
  if (isTouch) {
    return {
      heist: [[b('왼쪽 화면을 끌기'), '이동'], [b('살금'), '조용히 걷기, 진열장 뒤에 숨기'], [b('대시'), '짧게 빠르게, 대신 소리가 큼'], [b('조작'), '퓨즈함 앞에서 길게']],
      kit: [[b('카드'), '카드 총 쏘기'], [b('연막'), '연막탄 피우기']],
      vault: [[b('원을 따라 끌기'), '다이얼 돌리기'], [b('손 떼기'), '신호가 꽉 차면 그대로 기다리기']],
      swap: [[b('길게 누르기'), '무게 채우기'], [b('손 떼기'), '금빛 띠 안에서']],
    }[stage];
  }
  return {
    heist: [[k('W', 'A', 'S', 'D'), '이동 (방향키도 됨)'], [k('Shift'), '누르는 동안 살금'], [k('Space'), '대시, 대신 소리가 큼'], [k('E'), '퓨즈함 앞에서 길게']],
    kit: [[k(KIT.card.key), '카드 총 쏘기 (바라보는 쪽)'], [k(KIT.smoke.key), '연막탄 피우기']],
    vault: [[`${k('A')}${k('D')} ${b('드래그')} ${b('휠')}`, '다이얼 돌리기'], [k('Shift'), '누르면 아주 정밀하게']],
    swap: [[`${k('Space')} ${b('클릭')}`, '길게 눌러 무게 채우기'], [b('떼기'), '금빛 띠 안에서']],
  }[stage];
}

const ctl = (rows) => `<dl class="g-ctl">${rows.map(([key, what]) => `<div><dt>${key}</dt><dd>${what}</dd></div>`).join('')}</dl>`;

// ---------- 그림 (320×180) ----------
const ART = {
  route: `
    <svg viewBox="0 0 320 180" role="img" aria-label="갤러리에서 금고, 전시실까지 이어지는 경로와 시선 게이지">
      <path class="g-path" d="M30 70 C 90 20, 120 120, 160 70 S 250 20, 290 70"/>
      <g class="g-node"><circle cx="30" cy="70" r="11"/><text x="30" y="104">갤러리</text></g>
      <g class="g-node"><circle cx="160" cy="70" r="11"/><text x="160" y="104">금고</text></g>
      <g class="g-node"><rect x="279" y="59" width="22" height="22" transform="rotate(45 290 70)"/><text x="290" y="104">전시실</text></g>
      <circle class="g-walker" r="5"><animateMotion dur="5s" repeatCount="indefinite" path="M30 70 C 90 20, 120 120, 160 70 S 250 20, 290 70"/></circle>
      <text class="g-small" x="30" y="142">시선</text>
      <rect class="g-track" x="66" y="134" width="224" height="10"/>
      <rect class="g-gaze" x="66" y="134" width="224" height="10"/>
      <text class="g-small g-end" x="290" y="162">100%가 되면 정체가 드러납니다</text>
    </svg>`,
  heist: `
    <svg viewBox="0 0 320 180" role="img" aria-label="관리인의 부채꼴 시야, 깜빡이는 레이저, 목표 표시가 있는 방">
      <g class="g-floor">${Array.from({ length: 8 }, (_, r) => Array.from({ length: 14 }, (_, c) => ((r + c) % 2 ? `<rect x="${c * 24 - 8}" y="${r * 24 - 6}" width="24" height="24"/>` : '')).join('')).join('')}</g>
      <g class="g-fan"><path d="M232 52 L 316 20 A 90 90 0 0 1 300 118 Z"/></g>
      <circle class="g-guard" cx="232" cy="52" r="8"/>
      <rect class="g-case" x="186" y="96" width="22" height="22"/>
      <line class="g-laser" x1="20" y1="132" x2="170" y2="132"/>
      <g class="g-beacon"><rect x="40" y="10" width="14" height="70"/><circle cx="47" cy="84" r="9"/></g>
      <circle class="g-me" cx="0" cy="0" r="7"><animateMotion dur="6s" repeatCount="indefinite" path="M150 168 L 150 150 L 196 140 L 196 128 L 120 100 L 70 92 L 50 84"/></circle>
    </svg>`,
  vault: `
    <svg viewBox="0 0 320 180" role="img" aria-label="다이얼과 신호 막대">
      <polygon class="g-mark" points="130,14 124,4 136,4"/>
      <g class="g-dial"><circle cx="130" cy="94" r="70"/><circle cx="130" cy="94" r="48"/>${Array.from({ length: 36 }, (_, i) => { const a = (i / 36) * Math.PI * 2; const r1 = i % 3 ? 64 : 58; return `<line x1="${130 + Math.cos(a) * 70}" y1="${94 + Math.sin(a) * 70}" x2="${130 + Math.cos(a) * r1}" y2="${94 + Math.sin(a) * r1}"/>`; }).join('')}</g>
      <circle class="g-hub" cx="130" cy="94" r="14"/>
      <g class="g-bars">${Array.from({ length: 7 }, (_, i) => `<rect class="b${i}" x="${232 + i * 11}" y="${120 - i * 9}" width="7" height="${20 + i * 9}"/>`).join('')}</g>
      <text class="g-small" x="232" y="160">신호</text>
    </svg>`,
  swap: `
    <svg viewBox="0 0 320 180" role="img" aria-label="무게 게이지와 금빛 띠">
      <ellipse class="g-ped" cx="160" cy="56" rx="54" ry="10"/>
      <path class="g-ped" d="M106 56 V 92 M214 56 V 92"/>
      <g class="g-ring"><circle cx="150" cy="40" r="12"/><circle cx="166" cy="40" r="12"/><circle cx="158" cy="28" r="12"/></g>
      <rect class="g-track" x="40" y="118" width="240" height="8"/>
      <rect class="g-band" x="170" y="110" width="36" height="24"/>
      <line class="g-mid" x1="188" y1="106" x2="188" y2="138"/>
      <rect class="g-fill" x="40" y="119" width="240" height="6"/>
      <text class="g-small" x="40" y="160">길게 누르는 동안 차오르고, 띠 안에서 놓으면 성공</text>
    </svg>`,
  kit: `
    <svg viewBox="0 0 320 180" role="img" aria-label="카드, 연막탄, 설계도, 레이저를 스치는 팬더">
      <g class="g-vcard"><rect x="22" y="40" width="44" height="60" transform="rotate(-10 44 70)"/><text x="44" y="78">R</text></g>
      <path class="g-path" d="M70 66 C 100 40, 120 40, 140 56"/>
      <circle class="g-guard" cx="150" cy="60" r="7"/>
      <g class="g-node"><circle cx="44" cy="140" r="16"/></g>
      <g class="g-node"><rect x="98" y="128" width="54" height="18" rx="9"/></g>
      <text class="g-small" x="44" y="172">연막</text>
      <text class="g-small" x="125" y="172">설계도</text>
      <line class="g-laser" x1="220" y1="30" x2="220" y2="150"/>
      <g transform="translate(232 70) scale(0.8)"><path class="g-panther" d="M100 13C99 8 95 5 90 5L88 1L85 5C78 6 70 9 58 10C44 10 32 8 22 11C14 12 8 4 0 6C6 7 10 14 17 17C16 24 10 31 3 37L8 39C16 33 22 28 27 22C38 25 50 25 62 23C70 28 80 34 88 37L92 35C86 30 81 25 79 21C85 19 92 19 98 17Z"/></g>
      <text class="g-small" x="268" y="172">팬더 스텝</text>
    </svg>`,
  grade: `
    <svg viewBox="0 0 320 180" role="img" aria-label="진열대 위에 남겨진 방문 카드">
      <ellipse class="g-ped" cx="160" cy="118" rx="80" ry="14"/>
      <g class="g-vcard"><rect x="122" y="72" width="76" height="46"/><rect class="g-inner" x="128" y="78" width="64" height="34"/><text x="160" y="101">R</text></g>
    </svg>`,
};

const STORY_ART = {
  window: `
    <svg viewBox="0 0 320 180" role="img" aria-label="밤의 쇼윈도와 위작이 된 다섯 피스">
      <rect class="g-case" x="40" y="30" width="240" height="110"/>
      <path class="g-path" d="M40 30 L 70 10 H 250 L 280 30"/>
      ${[0, 1, 2, 3, 4].map((i) => `<g class="g-node"><circle cx="${76 + i * 42}" cy="90" r="11"/><text x="${76 + i * 42}" y="124">?</text></g>`).join('')}
      <text class="g-small g-end" x="280" y="166">Place Vendôme · 1년 전</text>
    </svg>`,
  house: `
    <svg viewBox="0 0 320 180" role="img" aria-label="달빛 아래 모로 저택">
      <g class="g-node"><circle cx="268" cy="30" r="13"/></g>
      <path class="g-path" d="M50 150 V 80 L 160 34 L 270 80 V 150 Z M50 150 H 270"/>
      ${[0, 1, 2, 3].map((i) => `<rect class="g-case" x="${78 + i * 46}" y="88" width="22" height="30"/>`).join('')}
      <g class="g-beacon"><rect x="150" y="124" width="20" height="26"/></g>
      <text class="g-small" x="160" y="172">지하 비밀 전시실</text>
    </svg>`,
  card: `
    <svg viewBox="0 0 320 180" role="img" aria-label="진열대 위의 방문 카드">
      <ellipse class="g-ped" cx="160" cy="124" rx="86" ry="14"/>
      <g class="g-vcard"><rect x="120" y="66" width="80" height="50"/><rect class="g-inner" x="126" y="72" width="68" height="38"/><text x="160" y="98">R</text></g>
      <text class="g-small" x="160" y="166">레드가 다녀갔습니다</text>
    </svg>`,
};

function storyCards() {
  return [
    {
      art: STORY_ART.window,
      title: '바꿔치기된 다섯 점',
      body: '1년 전 어느 밤, 방돔 광장 메종의 쇼윈도에서 걸작 다섯 점이 감쪽같이 위작으로 바뀌었습니다. 아무도 눈치채지 못했습니다. 단 한 사람, 레드만 빼고.',
    },
    {
      art: STORY_ART.house,
      title: STORY.house,
      body: `진품은 수집가 ${STORY.villain}의 저택 지하, 비밀 전시실에 있습니다. 그는 다음 달 경매에 그것들을 내놓을 생각입니다. 갤러리 회랑과 금고, 레이저 복도를 지나야 닿을 수 있죠.`,
    },
    {
      art: STORY_ART.card,
      title: '레드의 규칙',
      body: '아무것도 부수지 않는다. 진품을 되찾고, 모로가 만든 위작을 그 자리에 돌려놓는다. 그리고 방문 카드 한 장. 하룻밤에 한 점씩, 다섯 점이 모두 메종으로 돌아갈 때까지.',
      extra: '<p class="g-note">무전 속 목소리는 레드의 오랜 파트너, 오퍼레이터입니다.</p>',
    },
  ];
}

function cards() {
  return [
    {
      art: ART.route,
      title: '오늘 밤의 방문',
      body: '갤러리를 지나 금고를 열고, 진열대의 진품을 위작과 바꾼 뒤 방문 카드 한 장을 남기고 나옵니다. 한 판은 4분 남짓.',
      extra: '<p class="g-note">들키거나 레이저에 닿으면 화면 위 <b>시선</b>이 차오릅니다. 100%가 되면 그 방부터 다시 시작합니다.</p>',
    },
    {
      art: ART.heist,
      title: '갤러리와 복도: 잠입',
      body: '바닥의 부채꼴이 관리인의 시야입니다. 벽과 기둥이 시야를 막고, 살금 걸음이면 진열장 뒤에도 숨을 수 있어요. 빨간 레이저는 깜빡이는 박자를 보고 지나가고, 금빛 빛기둥은 지금 가야 할 곳입니다.',
      extra: ctl(controls('heist')),
    },
    {
      art: ART.kit,
      title: '현장 도구와 팬더 스텝',
      body: `저택 곳곳에 빛나는 도구가 떨어져 있습니다. <b>${KIT.card.name}</b>은 카드가 떨어진 자리로 관리인을 불러 길을 엽니다. <b>${KIT.smoke.name}</b> 연기 안에서는 아무도 레드를 볼 수 없어요. 갤러리의 <b>${KIT.plan.name}</b>를 챙기면 금고 첫 번째 숫자가 표시됩니다.`,
      extra: `${ctl(controls('kit'))}<p class="g-note"><b>팬더 스텝</b> · 움직이는 레이저를 닿을 듯 말 듯 비켜 가면 시간이 잠깐 느려지고 시선이 8% 식습니다.</p>`,
    },
    {
      art: ART.vault,
      title: '지하 금고: 다이얼',
      body: '다이얼을 천천히 돌리면 정답에 가까울수록 신호 막대가 차오릅니다. 꽉 차면 손을 떼고 0.5초 기다리세요. 정답은 세 개입니다. 발소리가 들리면 잠깐 손을 멈추세요.',
      extra: ctl(controls('vault')),
    },
    {
      art: ART.swap,
      title: '비밀 전시실: 바꿔치기',
      body: '레플리카를 길게 눌러 무게를 채우고, 게이지가 금빛 띠 안에 있을 때 손을 떼면 바꿔치기 성공. 띠 한가운데에서 떼면 완벽한 손놀림입니다. 세 번 해내면 끝.',
      extra: ctl(controls('swap')),
    },
    {
      art: ART.grade,
      title: '등급과 팁',
      body: '레이저에 닿지 않고, 들키지 않고, 완벽한 손놀림을 두 번 해내면 전설 S. 특별한 방문을 해내면 다음 방문부터 늘 지니고 가는 괴도의 도구가 생깁니다.',
      extra: `<p class="g-note">언제든 ${isTouch ? '오른쪽 위 일시정지 버튼' : `${k('Esc')} 또는 오른쪽 위 일시정지 버튼`}으로 멈추고, 이 안내를 다시 볼 수 있습니다.</p>`,
    },
  ];
}

// opts: { onDone(started), startLabel, startAt, closeLabel }
export function showGuide(opts = {}) {
  pager({ head: '방문 방법', list: cards(), ...opts });
}

export function showStory(opts = {}) {
  pager({ head: 'Prologue', list: storyCards(), startLabel: '다음', ...opts, cls: 'story' });
}

function pager({ head, list, cls = '', onDone, startLabel = '방문 시작', startAt = 0, closeLabel = '건너뛰기' }) {
  let i = Math.min(startAt, list.length - 1);
  open = true;
  const o = el.overlay;
  o.className = `screen guide-ov ${cls}`;
  o.hidden = false;
  o.innerHTML = `
    <div class="guide" role="dialog" aria-modal="true" aria-labelledby="g-title">
      <header class="g-top">
        <h2 class="g-head">${head}</h2>
        <button class="link g-skip" data-g="skip">${closeLabel}</button>
      </header>
      <div class="g-stage"></div>
      <nav class="g-nav" aria-label="안내 넘기기">
        <button class="g-arrow" data-g="prev" aria-label="이전">‹</button>
        <ol class="g-dots">${list.map((c, n) => `<li><button data-g="go" data-n="${n}" aria-label="${n + 1}. ${c.title}"></button></li>`).join('')}</ol>
        <button class="g-arrow" data-g="next" aria-label="다음">›</button>
      </nav>
      <button class="primary g-cta" data-g="next"></button>
    </div>`;
  const stage = o.querySelector('.g-stage');
  const cta = o.querySelector('.g-cta');
  const dots = [...o.querySelectorAll('.g-dots button')];
  const prev = o.querySelector('[data-g="prev"]');

  const render = (dir = 0) => {
    const c = list[i];
    stage.innerHTML = `
      <article class="g-card ${dir > 0 ? 'from-r' : dir < 0 ? 'from-l' : ''}">
        <div class="g-art">${c.art}</div>
        <p class="g-step">${i + 1} / ${list.length}</p>
        <h3 id="g-title">${c.title}</h3>
        <p class="g-body">${c.body}</p>
        ${c.extra || ''}
      </article>`;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) stage.querySelectorAll('animateMotion').forEach((a) => a.remove());
    dots.forEach((d, n) => d.setAttribute('aria-current', n === i ? 'step' : 'false'));
    prev.disabled = i === 0;
    cta.textContent = i === list.length - 1 ? startLabel : '다음';
  };

  const close = (started) => {
    open = false;
    window.removeEventListener('keydown', onKey, true);
    closeOverlay();
    onDone?.(started);
  };
  const go = (n) => {
    const d = Math.sign(n - i);
    i = Math.max(0, Math.min(list.length - 1, n));
    render(d);
  };
  const next = () => (i === list.length - 1 ? close(true) : go(i + 1));

  o.onclick = (e) => {
    const t = e.target.closest('[data-g]');
    if (!t) return;
    const a = t.dataset.g;
    if (a === 'next') next();
    else if (a === 'prev') go(i - 1);
    else if (a === 'go') go(+t.dataset.n);
    else if (a === 'skip') close(false);
  };
  // 키보드: ←/→ 넘기기, Enter·Space 다음, Esc 닫기 (게임의 다른 단축키보다 먼저 받는다)
  const onKey = (e) => {
    const map = { ArrowRight: next, ArrowLeft: () => go(i - 1), Enter: next, Space: next, Escape: () => close(false) };
    const f = map[e.code];
    if (!f) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    f();
  };
  window.addEventListener('keydown', onKey, true);
  // 터치: 좌우로 쓸어 넘기기
  let sx = null;
  stage.onpointerdown = (e) => { sx = e.clientX; };
  stage.onpointerup = (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
  };
  render();
  cta.focus({ preventScroll: true });
}
