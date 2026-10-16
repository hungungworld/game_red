// 레드(플레이어), 팬더 실루엣, 컬렉션 피스, 방문 카드를 그리는 함수 모음.
export const GOLD = '#c9a961';
export const GOLD_D = '#8a7240';
const ROSE = '#c98b7b';
const WHITE = '#cfd2d4';
const RIM = 'rgba(201,169,97,0.55)';

function seg(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

// 발 위치(0,0) 기준, 오른쪽을 바라보는 포즈. 서 있을 때 키 약 60.
function pose(mode, ph, hatLift) {
  const s = Math.sin(ph);
  switch (mode) {
    case 'walk':
      return {
        head: [5, -53],
        limbs: [
          [[2, -46], [-1, -27], 8.5],
          [[-1, -27], [2 + s * 5, -14], [s * 10, 0], 5.5],
          [[-1, -27], [2 - s * 5, -14], [-s * 10, 0], 5.5],
          [[2, -43], [3 - s * 4, -35], [2 - s * 8, -29], 3.5],
        ],
      };
    case 'crouch': // 팬더 자세: 낮게 엎드려 한 손을 바닥에
      return {
        head: [16, -26],
        limbs: [
          [[10, -24], [-8, -23], 8.5],
          [[-8, -23], [-15, -11], [-9, 0], 5.5],
          [[-8, -23], [-2, -12], [-4, 0], 5.5],
          [[9, -22], [14, -11], [17, 0], 3.5],
        ],
      };
    case 'slide':
      return {
        head: [-13, -15],
        limbs: [
          [[-9, -12], [4, -6], 8.5],
          [[4, -6], [18, -3], 5.5],
          [[4, -6], [12, -9], [19, -6], 5.5],
          [[-8, -11], [-15, -2], 3.5],
        ],
      };
    case 'jump':
      return {
        head: [5, -42],
        limbs: [
          [[3, -35], [-1, -21], 8.5],
          [[-1, -21], [8, -16], [-1, -8], 5.5],
          [[-1, -21], [5, -13], [-6, -9], 5.5],
          [[3, -33], [11, -31], 3.5],
        ],
      };
    default: { // stand (정체 드러남 연출용)
      const arm = hatLift > 0
        ? [[1, -44], [8, -50], [5, -60 - hatLift], 3.5]
        : [[1, -44], [2, -35], [1, -27], 3.5];
      return {
        head: [2, -54],
        limbs: [
          [[1, -47], [0, -27], 8.5],
          [[0, -27], [-3, -13], [-4, 0], 5.5],
          [[0, -27], [3, -13], [4, 0], 5.5],
          arm,
        ],
      };
    }
  }
}

export function drawRed(g, x, y, mode, ph = 0, o = {}) {
  const sc = o.scale || 1;
  const lift = o.hatLift || 0;
  const P = pose(mode, ph, lift);
  g.save();
  g.translate(x, y);
  g.scale(o.flip ? -sc : sc, sc);
  g.globalAlpha *= o.alpha ?? 1;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    const extra = pass === 0 ? 1.7 : 0;
    const col = pass === 0 ? o.rim || RIM : o.body || '#000';
    g.strokeStyle = col;
    g.fillStyle = col;
    for (const limb of P.limbs) {
      const w = limb[limb.length - 1];
      g.lineWidth = w + extra;
      seg(g, limb.slice(0, -1));
    }
    const [hx, hy] = P.head;
    g.beginPath();
    g.arc(hx, hy, 5.3 + extra / 2, 0, Math.PI * 2);
    g.fill();
    if (o.hat === 'cap') { // 야간 관리인: 챙 모자
      g.lineWidth = 1.8 + extra;
      g.beginPath(); g.moveTo(hx - 5, hy - 3.5); g.lineTo(hx + 9, hy - 3.5); g.stroke();
      g.beginPath(); g.arc(hx, hy - 3.5, 5.2 + extra / 2, Math.PI, 0); g.fill();
      continue;
    }
    // 페도라
    g.save();
    g.translate(hx, hy - 3.5 - lift);
    g.rotate(lift ? -0.25 : mode === 'slide' ? -0.3 : 0);
    g.lineWidth = 1.8 + extra;
    g.beginPath();
    g.moveTo(-8.5, 0);
    g.lineTo(8.5, 0);
    g.stroke();
    g.beginPath();
    g.moveTo(-5, 0);
    g.lineTo(-4.2, -6.5);
    g.lineTo(4.2, -6.5);
    g.lineTo(5, 0);
    g.closePath();
    g.fill();
    if (pass === 0) g.stroke();
    g.restore();
  }
  g.restore();
}

// 도약하는 팬더 실루엣 (100 x 40 기준, 오른쪽을 바라봄)
export function pantherPath(g) {
  g.beginPath();
  g.moveTo(100, 13);
  g.bezierCurveTo(99, 8, 95, 5, 90, 5);
  g.lineTo(88, 1);
  g.lineTo(85, 5);
  g.bezierCurveTo(78, 6, 70, 9, 58, 10);
  g.bezierCurveTo(44, 10, 32, 8, 22, 11);
  g.bezierCurveTo(14, 12, 8, 4, 0, 6);
  g.bezierCurveTo(6, 7, 10, 14, 17, 17);
  g.bezierCurveTo(16, 24, 10, 31, 3, 37);
  g.lineTo(8, 39);
  g.bezierCurveTo(16, 33, 22, 28, 27, 22);
  g.bezierCurveTo(38, 25, 50, 25, 62, 23);
  g.bezierCurveTo(70, 28, 80, 34, 88, 37);
  g.lineTo(92, 35);
  g.bezierCurveTo(86, 30, 81, 25, 79, 21);
  g.bezierCurveTo(85, 19, 92, 19, 98, 17);
  g.closePath();
}

export function drawPanther(g, x, y, w, alpha, stroke = GOLD) {
  g.save();
  g.translate(x, y);
  const k = w / 100;
  g.scale(k, k);
  g.globalAlpha *= alpha;
  pantherPath(g);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fill();
  g.lineWidth = 1 / k;
  g.strokeStyle = stroke;
  g.stroke();
  g.restore();
}

function pantherHead(g, fill, line, detail) {
  g.beginPath();
  g.moveTo(-20, -17); g.lineTo(-25, -34); g.lineTo(-9, -24); g.closePath();
  g.moveTo(20, -17); g.lineTo(25, -34); g.lineTo(9, -24); g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.beginPath();
  g.moveTo(0, -26);
  g.bezierCurveTo(14, -27, 24, -20, 26, -8);
  g.bezierCurveTo(28, 4, 20, 18, 8, 24);
  g.quadraticCurveTo(0, 28, -8, 24);
  g.bezierCurveTo(-20, 18, -28, 4, -26, -8);
  g.bezierCurveTo(-24, -20, -14, -27, 0, -26);
  g.fill();
  if (line) {
    g.strokeStyle = line;
    g.lineWidth = 1;
    g.stroke();
  }
  if (!detail) return;
  g.fillStyle = '#1f7a4a';
  g.beginPath(); g.ellipse(-9, -5, 4.2, 2.4, 0.15, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(9, -5, 4.2, 2.4, -0.15, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0a0a0a';
  g.beginPath(); g.moveTo(-4, 8); g.lineTo(4, 8); g.lineTo(0, 13); g.closePath(); g.fill();
  for (const [sx, sy, r] of [[-16, 6, 2], [16, 6, 2], [-12, -16, 1.8], [12, -16, 1.8], [0, -18, 2.2], [-19, -4, 1.5], [19, -4, 1.5], [-6, 18, 1.4], [6, 18, 1.4]]) {
    g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
  }
}

// 컬렉션 피스. size ≈ 지름(px)
export function drawPiece(g, id, x, y, size, o = {}) {
  const sil = !!o.silhouette;
  const c = (col) => (sil ? '#232326' : col);
  g.save();
  g.translate(x, y);
  const k = size / 100;
  g.scale(k, k);
  g.globalAlpha *= o.alpha ?? 1;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (o.glow && !sil) {
    const rg = g.createRadialGradient(0, 0, 4, 0, 0, 70);
    rg.addColorStop(0, 'rgba(255,236,200,0.22)');
    rg.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = rg;
    g.fillRect(-80, -80, 160, 160);
  }
  switch (id) {
    case 'love-bracelet': {
      g.strokeStyle = c(GOLD);
      g.lineWidth = 9;
      g.beginPath(); g.ellipse(0, 0, 42, 25, 0, 0, Math.PI * 2); g.stroke();
      if (!sil) {
        g.strokeStyle = 'rgba(255,240,200,0.6)';
        g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(0, -2.5, 41, 24, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          const px = Math.cos(a) * 42;
          const py = Math.sin(a) * 25;
          g.fillStyle = GOLD_D;
          g.beginPath(); g.arc(px, py, 2.6, 0, Math.PI * 2); g.fill();
          g.strokeStyle = '#3a2f18';
          g.lineWidth = 0.9;
          g.beginPath(); g.moveTo(px - 1.8, py + 1); g.lineTo(px + 1.8, py - 1); g.stroke();
        }
      }
      break;
    }
    case 'trinity-ring': {
      g.lineWidth = 6.5;
      const rings = [[ROSE, -10, 6], [GOLD, 10, 6], [WHITE, 0, -11]];
      for (const [col, rx, ry] of rings) {
        g.strokeStyle = c(col);
        g.beginPath(); g.ellipse(rx, ry, 23, 21, 0, 0, Math.PI * 2); g.stroke();
      }
      if (!sil) { // 서로 엮인 느낌을 위해 앞쪽 일부를 다시 그림
        g.strokeStyle = ROSE;
        g.beginPath(); g.ellipse(-10, 6, 23, 21, 0, -0.9, -0.3); g.stroke();
        g.strokeStyle = GOLD;
        g.beginPath(); g.ellipse(10, 6, 23, 21, 0, Math.PI + 0.3, Math.PI + 0.9); g.stroke();
      }
      break;
    }
    case 'clou': {
      g.strokeStyle = c(GOLD);
      g.lineWidth = 6;
      g.beginPath(); g.ellipse(0, 4, 40, 26, 0, Math.PI * 0.12, Math.PI * 1.88); g.stroke();
      // 못 머리
      const hx = Math.cos(Math.PI * 1.88) * 40;
      const hy = 4 + Math.sin(Math.PI * 1.88) * 26;
      g.fillStyle = c(GOLD);
      g.beginPath(); g.ellipse(hx + 3, hy - 1, 3.2, 8, 0.5, 0, Math.PI * 2); g.fill();
      // 못 끝
      const tx = Math.cos(Math.PI * 0.12) * 40;
      const ty = 4 + Math.sin(Math.PI * 0.12) * 26;
      g.beginPath(); g.moveTo(tx - 3, ty - 3); g.lineTo(tx + 6, ty - 5); g.lineTo(tx + 2, ty + 3); g.closePath(); g.fill();
      break;
    }
    case 'panthere-ring': {
      g.strokeStyle = c(GOLD);
      g.lineWidth = 6;
      g.beginPath(); g.ellipse(0, 18, 30, 15, 0, 0, Math.PI * 2); g.stroke();
      g.save(); g.translate(0, -6); g.scale(0.62, 0.62);
      pantherHead(g, c(GOLD), sil ? null : GOLD_D, !sil);
      g.restore();
      break;
    }
    default: { // panthere-brooch
      pantherHead(g, c(GOLD), sil ? null : GOLD_D, !sil);
    }
  }
  g.restore();
}

// 방문 카드: 팬더 문장이 찍힌 아이보리 카드
export function drawCard(g, x, y, w, rot = 0, alpha = 1) {
  const h = w * 0.62;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.globalAlpha *= alpha;
  g.fillStyle = '#efe8dc';
  g.fillRect(-w / 2, -h / 2, w, h);
  g.strokeStyle = GOLD;
  g.lineWidth = 1;
  g.strokeRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6);
  g.save();
  g.translate(0, -h * 0.04);
  const k = (w * 0.38) / 60;
  g.scale(k, k);
  pantherHead(g, 'rgba(0,0,0,0)', '#9a8048', false);
  g.restore();
  g.restore();
}
