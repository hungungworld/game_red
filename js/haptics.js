// 웹 진동 API. iOS 사파리는 지원하지 않으므로 시각·소리 피드백이 항상 함께 나갑니다.
const can = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export const haptics = {
  enabled: true,
  supported: can,
  v(p) {
    if (!this.enabled || !can) return;
    try { navigator.vibrate(p); } catch { /* ignore */ }
  },
  tick() { this.v(5); }, // 가벼운 틱 (근접)
  clunk() { this.v(45); }, // 묵직한 클릭 (정답)
  warn() { this.v([16, 40, 16, 40, 16]); }, // 짧은 연타 (시선 경고)
  hit() { this.v([25, 30, 50]); },
  perfect() { this.v([12, 40, 60]); },
};
