// 시즌 1 · 파리 메종. 모든 수치는 기획서 기준 초기 가정값이며 플레이테스트로 조정합니다.
// lasers: 회랑 전체 레이저 수. 기획서의 3→8은 '한 화면 밀도' 기준이라 약 40초 구간이 되도록 늘려 잡았습니다.

export const PIECES = [
  { id: 'panthere-brooch', name: '팬더 브로치', line: 'Panthère', vault: 'love' },
  { id: 'love-bracelet', name: 'Love 브레이슬릿', line: 'Love', vault: 'love' },
  { id: 'trinity-ring', name: 'Trinity 링', line: 'Trinity', vault: 'trinity' },
  { id: 'panthere-ring', name: '팬더 링', line: 'Panthère', vault: 'trinity' },
  { id: 'clou', name: 'Juste un Clou', line: 'Juste un Clou', vault: 'love', hard: true },
];

export const DIFF = {
  apprentice: {
    id: 'apprentice', label: '견습', lasers: 7, spacing: 210, period: 2.0, warn: 0.3, hitGaze: 30,
    sweepSpeed: 0, lights: 2, lightRate: 32, vaultTime: 75, tol: 5, swapFill: 2.3, band: 16, jitter: 0,
    guardWindow: false, swapTime: 40,
  },
  pro: {
    id: 'pro', label: '프로', lasers: 10, spacing: 185, period: 1.4, warn: 0.22, hitGaze: 40,
    sweepSpeed: 55, lights: 3, lightRate: 42, vaultTime: 60, tol: 4, swapFill: 1.8, band: 11, jitter: 1.5,
    guardWindow: false, swapTime: 40,
  },
  legend: {
    id: 'legend', label: '전설', lasers: 13, spacing: 165, period: 0.8, warn: 0.15, hitGaze: 40,
    sweepSpeed: 80, lights: 4, lightRate: 55, vaultTime: 60, tol: 3, swapFill: 1.45, band: 7, jitter: 3,
    guardWindow: true, swapTime: 50,
  },
};

export const GRADE = {
  S: { label: '전설', place: '팬더 인장이 찍힌 진열' },
  A: { label: '우아함', place: '전용 조명 아래 진열' },
  B: { label: '회수', place: '진열' },
};

export const TOOLS = [
  { id: 'glove', name: '실크 장갑', when: '첫 피스 회수', effect: '바꿔치기 게이지 흔들림 감소' },
  { id: 'loupe', name: '시계공의 루페', when: '금고를 시선 없이 여유 있게', effect: '정답 근처 신호가 더 또렷해짐' },
  { id: 'monocle', name: '적외선 모노클', when: '레이저 회랑을 한 번도 닿지 않고', effect: '레이저 예고 신호 +0.05초' },
];

export const BRIEF = [
  '목표는 지하 금고 아래, 벨벳 진열대 위에 있다.',
  '아무것도 부수지 마. 방문 카드 한 장만 남기고 나와.',
  '레드, 오늘 밤도 조용히 걷자.',
];
