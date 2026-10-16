// 키보드(PC) + 가상 조이스틱·버튼(모바일)을 하나의 상태로 합친다.
export const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0) && matchMedia('(pointer: coarse)').matches;

const keys = new Set();
const pressed = new Set(); // 이번 프레임에 새로 눌린 키
const listeners = new Set();

export const input = {
  move: { x: 0, y: 0 }, // 화면 기준: x 오른쪽, y 위쪽 (-1..1)
  sneak: false,
  interact: false,
  stick: { x: 0, y: 0, on: false },
  sneakToggle: false,
  dashQueued: false,
  down(code) { return keys.has(code); },
  hit(code) { return pressed.has(code); },
  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

const MAP = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};
const any = (list) => list.some((k) => keys.has(k));

window.addEventListener('keydown', (e) => {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
  if (e.code === 'Space' && !e.repeat) input.dashQueued = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  for (const fn of listeners) fn('keydown', e);
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  for (const fn of listeners) fn('keyup', e);
});
window.addEventListener('blur', () => keys.clear());

// 매 프레임 호출: 키보드와 조이스틱을 합쳐 이동 벡터를 만든다
export function pollInput() {
  let x = (any(MAP.right) ? 1 : 0) - (any(MAP.left) ? 1 : 0);
  let y = (any(MAP.up) ? 1 : 0) - (any(MAP.down) ? 1 : 0);
  if (input.stick.on) {
    x = input.stick.x;
    y = input.stick.y;
  }
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  input.move.x = x;
  input.move.y = y;
  input.sneak = keys.has('ShiftLeft') || keys.has('ShiftRight') || input.sneakToggle;
  input.interact = keys.has('KeyE') || keys.has('Enter') || input.btnInteract === true;
}

export function endFrame() {
  pressed.clear();
  input.dashQueued = false;
}

// ---------- 모바일 패드 ----------
let pad = null;
export function showPad(show) {
  if (!isTouch) return;
  if (!pad) buildPad();
  pad.hidden = !show;
  if (!show) {
    input.stick.on = false;
    input.btnInteract = false;
  }
}

function buildPad() {
  pad = document.createElement('div');
  pad.id = 'pad';
  pad.innerHTML = `
    <div class="zone"><div class="base"><div class="knob"></div></div></div>
    <div class="btns">
      <button class="b sneak" data-b="sneak"><span>살금</span></button>
      <button class="b dash" data-b="dash"><span>대시</span></button>
      <button class="b act" data-b="act"><span>조작</span></button>
    </div>`;
  document.getElementById('app').appendChild(pad);
  const zone = pad.querySelector('.zone');
  const base = pad.querySelector('.base');
  const knob = pad.querySelector('.knob');
  let id = null;
  let cx = 0;
  let cy = 0;
  const R = 46;
  zone.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId;
    zone.setPointerCapture(id);
    const r = zone.getBoundingClientRect();
    cx = e.clientX;
    cy = e.clientY;
    base.style.left = `${cx - r.left}px`;
    base.style.top = `${cy - r.top}px`;
    base.classList.add('on');
    input.stick.on = true;
    input.stick.x = input.stick.y = 0;
    knob.style.transform = 'translate(-50%,-50%)';
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    const m = Math.min(1, l / R);
    input.stick.x = l ? (dx / Math.max(l, 1)) * (m < 0.15 ? 0 : m) : 0;
    input.stick.y = l ? (-dy / Math.max(l, 1)) * (m < 0.15 ? 0 : m) : 0;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    input.stick.on = false;
    base.classList.remove('on');
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);

  const sneakB = pad.querySelector('.sneak');
  sneakB.addEventListener('pointerdown', (e) => {
    input.sneakToggle = !input.sneakToggle;
    sneakB.classList.toggle('on', input.sneakToggle);
    e.preventDefault();
  });
  pad.querySelector('.dash').addEventListener('pointerdown', (e) => { input.dashQueued = true; e.preventDefault(); });
  const act = pad.querySelector('.act');
  act.addEventListener('pointerdown', (e) => { input.btnInteract = true; act.setPointerCapture(e.pointerId); e.preventDefault(); });
  act.addEventListener('pointerup', () => { input.btnInteract = false; });
  act.addEventListener('pointercancel', () => { input.btnInteract = false; });
}

export function setPadAction(label) {
  if (!pad) return;
  const act = pad.querySelector('.act');
  act.classList.toggle('ready', !!label);
  act.querySelector('span').textContent = label || '조작';
}
