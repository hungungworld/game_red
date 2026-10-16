// 방문 카드 앞면을 그리는 2D 함수 (3D 카드의 텍스처로 쓴다).
const GOLD = '#c9a961';

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
