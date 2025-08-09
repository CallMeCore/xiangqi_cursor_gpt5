// 棋盘绘制：9列 x 10行；单位格80px；画布 720x800，左右各留 40px 边距
const CELL = 80;
const MARGIN_X = 40;
const MARGIN_Y = 40;
const HIGHLIGHT_SIZE = CELL - 16; // 留边避免相邻高亮贴边

export function drawBoard(ctx) {
  const W = 720;
  const H = 800;
  ctx.clearRect(0, 0, W, H);

  // 背景
  ctx.fillStyle = '#f5e7c6';
  ctx.fillRect(0, 0, W, H);

  // 先画河界底色，避免遮挡网格线
  ctx.save();
  ctx.fillStyle = '#edd7a9';
  ctx.fillRect(MARGIN_X, MARGIN_Y + 4 * CELL - CELL / 2, 8 * CELL, CELL);
  ctx.restore();

  ctx.strokeStyle = '#7a5230';
  ctx.lineWidth = 2;

  // 垂直线：最左和最右贯通；中间跨河
  for (let c = 0; c < 9; c++) {
    const x = MARGIN_X + c * CELL;
    if (c === 0 || c === 8) {
      line(ctx, x, MARGIN_Y, x, MARGIN_Y + 9 * CELL);
    } else {
      // 上半 0..4 行
      line(ctx, x, MARGIN_Y, x, MARGIN_Y + 4 * CELL);
      // 下半 5..9 行
      line(ctx, x, MARGIN_Y + 5 * CELL, x, MARGIN_Y + 9 * CELL);
    }
  }

  // 水平线：10行
  for (let r = 0; r < 10; r++) {
    const y = MARGIN_Y + r * CELL;
    line(ctx, MARGIN_X, y, MARGIN_X + 8 * CELL, y);
  }

  // 九宫斜线（上：黑 0..2；下：红 7..9）
  diag(ctx, 0, 3, 2, 5);
  diag(ctx, 0, 5, 2, 3);
  diag(ctx, 7, 3, 9, 5);
  diag(ctx, 7, 5, 9, 3);

  // 楚河汉界文字
  ctx.save();
  ctx.font = 'bold 36px serif';
  ctx.fillStyle = '#7a5230';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('楚 河', MARGIN_X + 2 * CELL, MARGIN_Y + 4.5 * CELL);
  ctx.fillText('汉 界', MARGIN_X + 6 * CELL, MARGIN_Y + 4.5 * CELL);
  ctx.restore();

  // 炮兵、卒点位星标（小角）可选：此处省略
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function diag(ctx, r1, c1, r2, c2) {
  const { x: x1, y: y1 } = cellToCoord(r1, c1);
  const { x: x2, y: y2 } = cellToCoord(r2, c2);
  line(ctx, x1, y1, x2, y2);
}

export function cellToCoord(r, c) {
  const x = MARGIN_X + c * CELL;
  const y = MARGIN_Y + r * CELL;
  return { x, y };
}

export function cellToCoordWithFlip(r, c, flipped) {
  const dr = flipped ? 9 - r : r;
  const dc = flipped ? 8 - c : c;
  return cellToCoord(dr, dc);
}

export function coordToCell(x, y) {
  const c = Math.round((x - MARGIN_X) / CELL);
  const r = Math.round((y - MARGIN_Y) / CELL);
  return { r: clamp(r, 0, 9), c: clamp(c, 0, 8) };
}

export function coordToCellWithFlip(x, y, flipped) {
  const disp = coordToCell(x, y);
  if (!flipped) return disp;
  return { r: 9 - disp.r, c: 8 - disp.c };
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

export function drawPieces(ctx, board, highlight, flipped=false) {
  ctx.save();
  ctx.lineWidth = 2;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p) continue;
      const { x, y } = cellToCoordWithFlip(r, c, flipped);
      drawPiece(ctx, x, y, p);
    }
  }
  // 高亮最近一步：起点与终点
  if (highlight) {
    const { from, to } = highlight;
    drawHighlight(ctx, from.r, from.c, flipped);
    drawHighlight(ctx, to.r, to.c, flipped);
  }
  ctx.restore();
}

export function drawHighlight(ctx, r, c, flipped=false) {
  const { x, y } = cellToCoordWithFlip(r, c, flipped);
  ctx.save();
  ctx.strokeStyle = '#f39c12';
  ctx.lineWidth = 4;
  ctx.strokeRect(
    x - HIGHLIGHT_SIZE / 2,
    y - HIGHLIGHT_SIZE / 2,
    HIGHLIGHT_SIZE,
    HIGHLIGHT_SIZE
  );
  ctx.restore();
}

export function drawTargets(ctx, targets, flipped=false) {
  if (!targets || targets.length === 0) return;
  ctx.save();
  for (const t of targets) {
    const { x, y } = cellToCoordWithFlip(t.r, t.c, flipped);
    if (t.capture) {
      ctx.strokeStyle = '#e74c3c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 34, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPiece(ctx, x, y, piece) {
  const radius = 30;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#7a5230';
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = piece.color === 'w' ? '#c0392b' : '#2c3e50';
  ctx.font = 'bold 32px "Noto Sans SC", "Microsoft YaHei", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pieceToChar(piece), x, y + 1);
}

function pieceToChar(p) {
  // w: 红, b: 黑
  const mapW = { k: '帥', a: '仕', b: '相', n: '傌', r: '俥', c: '炮', p: '兵' };
  const mapB = { k: '將', a: '士', b: '象', n: '馬', r: '車', c: '砲', p: '卒' };
  return (p.color === 'w' ? mapW : mapB)[p.type];
}


