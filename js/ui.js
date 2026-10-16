const $ = (s) => document.querySelector(s);

export const el = {
  app: $('#app'),
  canvas: $('#stage'),
  hud: $('#hud'),
  gaze: $('#hud .gaze'),
  gazeBar: $('#hud .bar i'),
  tank: $('#hud .tank'),
  hand: $('#tank-hand'),
  radio: $('#radio'),
  hint: $('#hint'),
  edge: $('#edge'),
  overlay: $('#overlay'),
  toast: $('#toast'),
};

// ---------- 무전 (오퍼레이터) ----------
let queue = [];
let radioTimer = 0;
let showing = false;

export function radio(text, dur = 2800) {
  if (queue.some((q) => q.text === text)) return;
  queue.push({ text, dur });
  if (!showing) nextRadio();
}

function nextRadio() {
  const it = queue.shift();
  if (!it) {
    showing = false;
    el.radio.classList.remove('on');
    return;
  }
  showing = true;
  el.radio.innerHTML = `<b>OPERATOR</b>${it.text}`;
  el.radio.classList.add('on');
  clearTimeout(radioTimer);
  radioTimer = setTimeout(nextRadio, it.dur);
}

export function clearRadio() {
  queue = [];
  clearTimeout(radioTimer);
  showing = false;
  el.radio.classList.remove('on');
}

// ---------- 하단 조작 안내 ----------
let hintTimer = 0;
export function hint(html, dur = 0) {
  clearTimeout(hintTimer);
  if (!html) {
    el.hint.classList.remove('on');
    return;
  }
  el.hint.innerHTML = html;
  el.hint.classList.add('on');
  if (dur) hintTimer = setTimeout(() => el.hint.classList.remove('on'), dur);
}

// ---------- 화면 가장자리 빛 ----------
export function edge(kind = 'red') {
  el.edge.className = '';
  void el.edge.offsetWidth;
  el.edge.className = kind;
}

// ---------- HUD ----------
export function setGaze(p) {
  el.gazeBar.style.width = `${Math.min(100, p)}%`;
  el.gaze.classList.toggle('hot', p >= 60);
}

export function setWatch(frac, urgent) {
  el.hand.style.transform = `rotate(${(1 - frac) * 360}deg)`;
  el.tank.classList.toggle('urgent', !!urgent);
}

// ---------- 오버레이 ----------
export function overlay(html, { cls = '', onAction, onTap } = {}) {
  const o = el.overlay;
  o.className = `screen ${cls}`;
  o.innerHTML = html;
  o.hidden = false;
  o.onclick = (e) => {
    const b = e.target.closest('[data-a]');
    if (b && onAction) {
      e.stopPropagation();
      onAction(b.dataset.a, b);
    } else if (onTap) onTap();
  };
  return o;
}

export function closeOverlay() {
  el.overlay.hidden = true;
  el.overlay.innerHTML = '';
  el.overlay.onclick = null;
}

let toastTimer = 0;
export function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.toast.classList.remove('on'), 1800);
}
