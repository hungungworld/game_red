export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// signed shortest difference a - b in degrees, range [-180, 180)
export const angDiff = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;

export function pingpong(t, len) {
  const m = ((t % (2 * len)) + 2 * len) % (2 * len);
  return m < len ? m : 2 * len - m;
}

export function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const dayIndex = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
