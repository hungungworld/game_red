const KEY = 'codename-red-v1';

const defaults = () => ({
  settings: { sound: true, haptics: true, assist: true, easy: false },
  diff: 'apprentice',
  pieces: {}, // id -> { best: 'S'|'A'|'B', seal: bool, bestTime: seconds }
  tools: {}, // id -> true
  cards: 0, // 남긴 방문 카드
  visits: 0, // 방문 횟수
  bestTime: null,
  tutorialDone: false,
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const d = JSON.parse(raw);
    const base = defaults();
    return { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
  } catch {
    return defaults();
  }
}

export const store = {
  data: load(),
  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* private mode */ }
  },
  reset() {
    this.data = defaults();
    this.save();
  },
};
