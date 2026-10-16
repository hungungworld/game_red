// 시즌 1 · 모로 저택. 수치는 초기 가정값이며 플레이테스트로 조정합니다.

// 모로가 위작으로 바꿔치기한 다섯 점. chapter는 브리핑에서 오퍼레이터가 들려주는 그 피스의 사연.
export const PIECES = [
  {
    id: 'panthere-brooch', name: '팬더 브로치', line: 'Panthère', vault: 'love',
    chapter: '모로가 맨 처음 바꿔치기한 피스야. 메종의 상징이 남의 진열장에 갇혀 있다는 게 영 마음에 안 들어.',
  },
  {
    id: 'love-bracelet', name: 'Love 브레이슬릿', line: 'Love', vault: 'love',
    chapter: '나사로 잠그는 약속. 모로는 그 작은 드라이버까지 위조했어. 성의는 인정.',
  },
  {
    id: 'trinity-ring', name: 'Trinity 링', line: 'Trinity', vault: 'trinity',
    chapter: '세 가지 금이 하나로 엮인 반지. 위작의 로즈 골드 색이 반 톤 틀렸어. 네가 알아챈 게 그거였지.',
  },
  {
    id: 'panthere-ring', name: '팬더 링', line: 'Panthère', vault: 'trinity',
    chapter: '에메랄드 눈의 팬더. 다음 달 경매 카탈로그 표지에 오를 예정이래. 그 전에 데려오자.',
  },
  {
    id: 'clou', name: 'Juste un Clou', line: 'Juste un Clou', vault: 'love', hard: true,
    chapter: '못 하나를 보석으로 만든 대담함. 모로가 가장 깊은 곳에, 가장 엄하게 지키고 있어.',
  },
];

export const STORY = {
  villain: '앙리 모로',
  house: '모로 저택',
  epilogue: [
    '다음 날 아침, 모로의 진열장에는 레플리카 다섯 점과 방문 카드 다섯 장이 가지런히 놓여 있었습니다.',
    '경매는 조용히 취소되었고, 메종의 쇼윈도에는 진품이 돌아와 있었습니다.',
    '아무도 그 이유를 묻지 않았습니다. 레드가 다녀갔으니까요.',
  ],
};

export const DIFF = {
  apprentice: { id: 'apprentice', label: '견습', hitGaze: 30, vaultTime: 75, tol: 5, swapFill: 2.3, band: 16, jitter: 0, guardWindow: false, swapTime: 40 },
  pro: { id: 'pro', label: '프로', hitGaze: 40, vaultTime: 60, tol: 4, swapFill: 1.8, band: 11, jitter: 1.5, guardWindow: false, swapTime: 40 },
  legend: { id: 'legend', label: '전설', hitGaze: 40, vaultTime: 60, tol: 3, swapFill: 1.45, band: 7, jitter: 3, guardWindow: true, swapTime: 50 },
};

export const GRADE = {
  S: { label: '전설', place: '팬더 인장이 찍힌 진열' },
  A: { label: '우아함', place: '전용 조명 아래 진열' },
  B: { label: '회수', place: '진열' },
};

// 괴도의 도구: 한 번 얻으면 이후 모든 방문에 늘 지니고 간다.
export const TOOLS = [
  { id: 'glove', name: '실크 장갑', when: '첫 피스 회수', effect: '바꿔치기 게이지의 손떨림이 절반으로' },
  { id: 'loupe', name: '시계공의 루페', when: '금고를 시선 없이, 15초 이상 남기고 열기', effect: '금고 신호가 더 먼 곳에서부터 잡힘' },
  { id: 'monocle', name: '적외선 모노클', when: '갤러리 회랑을 레이저에 한 번도 닿지 않고', effect: '레이저가 다시 켜지기 0.6초 전부터 예고' },
];

// 현장 도구: 저택 안에서 줍고, 그 밤에만 쓴다. start = 처음 들고 들어가는 수.
export const KIT = {
  card: { name: '카드 총', short: '카드', key: 'Q', start: 1, desc: '바라보는 쪽으로 방문 카드를 쏩니다. 카드가 떨어진 자리로 근처 관리인이 확인하러 갑니다.' },
  smoke: { name: '연막탄', short: '연막', key: 'F', start: 0, desc: '발밑에 5초 동안 연기를 피웁니다. 연기 안에 있는 동안은 누구도 레드를 볼 수 없습니다.' },
  plan: { name: '금고 설계도', short: '설계도', start: 0, desc: '지니고 있으면 금고 다이얼의 첫 번째 정답 위치에 금빛 표시가 보입니다.' },
};
