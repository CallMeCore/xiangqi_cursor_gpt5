// 极简中国象棋逻辑（含基本走法与将军判定），支持 FEN、UCI

export class ChessXQ {
  constructor() {
    this.reset('w');
  }

  reset(side = 'w') {
    // 内部使用 w=红, b=黑；行0在顶部（黑方底线），行9在底部（红方底线），与传统布局一致
    this.board = emptyBoard();
    this.history = [];
    this.turn = side; // 'w' or 'b'

    // 传统起始 FEN（表示见下），我们直接放置
    // 行0: 俥傌相仕帥仕相傌俥  -> r n b a k a b n r (w)
    // 行2: 炮      炮             -> c       c (w)
    // 行3: 兵 兵 兵 兵 兵         -> p p p p p (w)
    // 行9: 車馬象士將士象馬車     -> r n b a k a b n r (b)
    // 行7: 砲      砲             -> c       c (b)
    // 行6: 卒 卒 卒 卒 卒         -> p p p p p (b)
    const place = (r, c, type, color) => { this.board[r][c] = { type, color }; };
    const R = 'w', B = 'b';
    // 黑方（上）
    [['r',0],['n',1],['b',2],['a',3],['k',4],['a',5],['b',6],['n',7],['r',8]].forEach(([t,c])=>place(0,c,t,B));
    place(2,1,'c',B); place(2,7,'c',B);
    [0,2,4,6,8].forEach(c=>place(3,c,'p',B));
    // 红方（下）
    [['r',0],['n',1],['b',2],['a',3],['k',4],['a',5],['b',6],['n',7],['r',8]].forEach(([t,c])=>place(9,c,t,R));
    place(7,1,'c',R); place(7,7,'c',R);
    [0,2,4,6,8].forEach(c=>place(6,c,'p',R));
  }

  fen() {
    // 6段式 FEN: 10/9 格，从0行(黑底线)到9行(红底线)；side - - 0 1
    const rows = [];
    for (let r = 0; r < 10; r++) {
      let row = '';
      let empty = 0;
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (!p) { empty++; continue; }
        if (empty) { row += empty; empty = 0; }
        row += encodePiece(p);
      }
      if (empty) row += empty;
      rows.push(row || '9');
    }
    return rows.join('/') + ' ' + this.turn + ' - - 0 1';
  }

  toMove() { return this.turn; }

  isOwnPiece(p) { return p && p.color === this.turn; }

  isLegalMove(mv) {
    const legal = this.generateLegalMoves();
    return legal.some(x => x.from.r === mv.from.r && x.from.c === mv.from.c && x.to.r === mv.to.r && x.to.c === mv.to.c);
  }

  makeMove(mv) {
    const piece = this.board[mv.from.r][mv.from.c];
    const captured = this.board[mv.to.r][mv.to.c] || null;
    this.board[mv.to.r][mv.to.c] = piece;
    this.board[mv.from.r][mv.from.c] = null;
    this.history.push({ mv, captured, turn: this.turn });
    this.turn = this.turn === 'w' ? 'b' : 'w';
  }

  undo() {
    const last = this.history.pop();
    if (!last) return;
    const { mv, captured, turn } = last;
    const piece = this.board[mv.to.r][mv.to.c];
    this.board[mv.from.r][mv.from.c] = piece;
    this.board[mv.to.r][mv.to.c] = captured;
    this.turn = turn;
  }

  isGameOver() {
    return !this.hasKing('w') || !this.hasKing('b') || this.generateLegalMoves().length === 0;
  }

  resultText() {
    // 简化：若某方无将或无合法步则另一方胜
    const wK = this.hasKing('w');
    const bK = this.hasKing('b');
    if (!wK && bK) return '黑胜';
    if (!bK && wK) return '红胜';
    if (!wK && !bK) return '和棋';
    const legal = this.generateLegalMoves();
    if (legal.length === 0) {
      // 无合法步
      const side = this.turn;
      if (this.inCheck(side)) {
        return side === 'w' ? '黑胜（将死）' : '红胜（将死）';
      }
      return '和棋（无子可动）';
    }
    return '对弈中';
  }

  hasKing(color) {
    for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
      const p = this.board[r][c];
      if (p && p.type === 'k' && p.color === color) return true;
    }
    return false;
  }

  generateLegalMoves() {
    const moves = [];
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        const p = this.board[r][c];
        if (!p || p.color !== this.turn) continue;
        const ps = this.generatePieceMoves(r, c, p);
        for (const mv of ps) {
          if (this.causesFacingKings(r, c, mv.to.r, mv.to.c)) continue;
          // 模拟走子，避免走后仍被将军
          const savedFrom = this.board[r][c];
          const savedTo = this.board[mv.to.r][mv.to.c];
          this.board[mv.to.r][mv.to.c] = savedFrom;
          this.board[r][c] = null;
          const inChk = this.inCheck(this.turn);
          this.board[r][c] = savedFrom;
          this.board[mv.to.r][mv.to.c] = savedTo;
          if (!inChk) moves.push(mv);
        }
      }
    }
    return moves;
  }

  inCheck(color) {
    const k = findKing(this.board, color);
    if (!k) return false;
    const enemy = color === 'w' ? 'b' : 'w';
    return isSquareAttacked(this.board, k.r, k.c, enemy);
  }

  causesFacingKings(fr, fc, tr, tc) {
    const piece = this.board[fr][fc];
    const saved = this.board[tr][tc];
    this.board[tr][tc] = piece;
    this.board[fr][fc] = null;
    const face = kingsFacing(this.board);
    this.board[fr][fc] = piece;
    this.board[tr][tc] = saved;
    return face;
  }

  generatePieceMoves(r, c, p) {
    const add = (to) => ({ from: { r, c }, to });
    const moves = [];
    const color = p.color;
    switch (p.type) {
      case 'k': {
        // 红在下(7..9)，黑在上(0..2)
        const palaceRows = color === 'w' ? [7, 8, 9] : [0, 1, 2];
        const palaceCols = [3, 4, 5];
        for (const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nr = r + dr, nc = c + dc;
          if (palaceRows.includes(nr) && palaceCols.includes(nc) && !this.isOwnPiece(this.board[nr][nc]))
            moves.push(add({ r: nr, c: nc }));
        }
        // 直线对脸吃
        const other = color === 'w' ? 'b' : 'w';
        let rr = r + (color === 'w' ? 1 : -1);
        let blocked = false; let canFace = false; let faceR = -1;
        while (rr >= 0 && rr < 10) {
          const q = this.board[rr][c];
          if (q) { blocked = true; if (q.type === 'k' && q.color !== color) { faceR = rr; canFace = true; } break; }
          rr += (color === 'w' ? 1 : -1);
        }
        // 禁止对脸，但如果正好能走到对方将的位置也不允许；不额外加吃法
        break;
      }
      case 'a': {
        const palaceRows = p.color === 'w' ? [7,8,9] : [0,1,2];
        const palaceCols = [3,4,5];
        for (const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
          const nr=r+dr, nc=c+dc;
          if (palaceRows.includes(nr) && palaceCols.includes(nc) && !this.isOwnPiece(this.board[nr][nc]))
            moves.push(add({r:nr,c:nc}));
        }
        break;
      }
      case 'b': {
        // 相/象：田字，不能过河，象眼不塞
        // 红(下)可走 5..9；黑(上)可走 0..4
        const allowedRows = p.color === 'w' ? [5,6,7,8,9] : [0,1,2,3,4];
        for (const [dr,dc,er,ec] of [[2,2,1,1],[2,-2,1,-1],[-2,2,-1,1],[-2,-2,-1,-1]]){
          const nr=r+dr, nc=c+dc; const br=r+er, bc=c+ec;
          if (allowedRows.includes(nr) && inBoard(nr,nc) && !this.board[br][bc] && !this.isOwnPiece(this.board[nr][nc]))
            moves.push(add({r:nr,c:nc}));
        }
        break;
      }
      case 'n': {
        // 马：日字，马腿不塞
        const legs = [
          { step:[-2,-1], leg:[-1,0] }, { step:[-2,1], leg:[-1,0] },
          { step:[2,-1], leg:[1,0] }, { step:[2,1], leg:[1,0] },
          { step:[-1,-2], leg:[0,-1] }, { step:[1,-2], leg:[0,-1] },
          { step:[-1,2], leg:[0,1] }, { step:[1,2], leg:[0,1] },
        ];
        for (const l of legs) {
          const nr=r+l.step[0], nc=c+l.step[1]; const lr=r+l.leg[0], lc=c+l.leg[1];
          if (inBoard(nr,nc) && !this.board[lr][lc] && !this.isOwnPiece(this.board[nr][nc]))
            moves.push(add({r:nr,c:nc}));
        }
        break;
      }
      case 'r': {
        // 车：直线滑行
        for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          let nr=r+dr,nc=c+dc;
          while (inBoard(nr,nc)){
            const q=this.board[nr][nc];
            if (!q) { moves.push(add({r:nr,c:nc})); }
            else { if (q.color!==color) moves.push(add({r:nr,c:nc})); break; }
            nr+=dr; nc+=dc;
          }
        }
        break;
      }
      case 'c': {
        // 炮：平走，吃隔一个子
        for (const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          let nr=r+dr,nc=c+dc; let jumped=false;
          while (inBoard(nr,nc)){
            const q=this.board[nr][nc];
            if (!jumped){
              if (!q) moves.push(add({r:nr,c:nc}));
              else jumped=true;
            } else {
              if (q){ if (q.color!==color) moves.push(add({r:nr,c:nc})); break; }
            }
            nr+=dr; nc+=dc;
          }
        }
        break;
      }
      case 'p': {
        // 兵/卒：未过河仅前进一步；过河后可左右平一步。红在下(前进向上，r-1)，黑在上(前进向下，r+1)
        const dir = color==='w' ? -1 : 1;
        const nr = r+dir; if (inBoard(nr,c) && !this.isOwnPiece(this.board[nr][c])) moves.push(add({r:nr,c}));
        const crossed = color==='w' ? r<=4 : r>=5;
        if (crossed){
          for (const dc of [-1,1]){
            const nc=c+dc; if (inBoard(r,nc) && !this.isOwnPiece(this.board[r][nc])) moves.push(add({r, c:nc}));
          }
        }
        break;
      }
    }
    return moves;
  }

  uciToMove(uci) {
    // 引擎坐标基于红方视角：file a..i 从红方左到右；rank 0..9 自下而上。
    // 我们内部坐标：file 从左到右（黑方在上），rank 0..9 自上而下。
    // 因此需要镜像：r = 9 - rank，引擎列镜像 c = 8 - file。
    if (!uci || uci.length < 4) return null;
    const m = uci.match(/^([a-i])(\d{1,2})([a-i])(\d{1,2})/i);
    if (!m) return null;
    const f = parseEngineSquare(m[1] + m[2]);
    const t = parseEngineSquare(m[3] + m[4]);
    if (!f || !t) return null;
    return { from: f, to: t };
  }
}

function emptyBoard(){
  return Array.from({length:10},()=>Array(9).fill(null));
}

function inBoard(r,c){ return r>=0 && r<10 && c>=0 && c<9; }

function encodePiece(p){
  const map = { k:'k', a:'a', b:'b', n:'n', r:'r', c:'c', p:'p' };
  const ch = map[p.type];
  return p.color==='w' ? ch.toUpperCase() : ch;
}

function kingsFacing(board){
  // 同列无阻隔则对脸
  let wk=null, bk=null;
  for (let r=0;r<10;r++) for (let c=0;c<9;c++){
    const p=board[r][c]; if (!p || p.type!=='k') continue;
    if (p.color==='w') wk={r,c}; else bk={r,c};
  }
  if (!wk || !bk || wk.c!==bk.c) return false;
  const col=wk.c; const [ra, rb]=wk.r<bk.r?[wk.r,bk.r]:[bk.r,wk.r];
  for (let r=ra+1;r<rb;r++){ if (board[r][col]) return false; }
  return true;
}

function parseSquare(s){
  // 支持两种行号格式：
  // - 单位数字 0..9 → 直接作为内部 0..9
  // - 两位数字 "10"   → 映射为 9
  const fileChar = s[0];
  const numStr = s.slice(1);
  const file = fileChar.charCodeAt(0) - 'a'.charCodeAt(0);
  let rank = parseInt(numStr, 10);
  if (Number.isNaN(file) || Number.isNaN(rank)) return null;
  if (file < 0 || file > 8) return null;
  if (numStr.length >= 2) {
    // 仅处理 10 → 9，其它两位数无效
    if (rank !== 10) return null;
    rank = 9;
  }
  if (rank < 0 || rank > 9) return null;
  return { r: rank, c: file };
}

function parseEngineSquare(s){
  // 从引擎 UCI 坐标转换为内部坐标
  const fileChar = s[0].toLowerCase();
  const numStr = s.slice(1);
  const file = fileChar.charCodeAt(0) - 'a'.charCodeAt(0); // 0..8（红方左到右）
  let rank = parseInt(numStr, 10); // 0..9（红方自下而上）
  if (Number.isNaN(file) || Number.isNaN(rank)) return null;
  if (file < 0 || file > 8) return null;
  if (rank < 0 || rank > 9) return null;
  // 仅翻转行，不翻转列：
  // 引擎 a..i 为红方从左到右；我们的列从左到右与黑方一致，所以不镜像列
  const r = 9 - rank;
  const c = file;
  return { r, c };
}

function findKing(board, color){
  for (let r=0;r<10;r++) for (let c=0;c<9;c++){
    const p=board[r][c]; if (p && p.type==='k' && p.color===color) return { r, c };
  }
  return null;
}

function isSquareAttacked(board, r, c, byColor){
  // 枚举对方所有走子，若能到 (r,c) 则被将军。使用与 generatePieceMoves 相同的规则，但不做“自杀过滤”。
  const temp = new ChessXQ(); // 仅为调用 generatePieceMoves 逻辑，这里不会使用 temp.board
  for (let i=0;i<10;i++){
    for (let j=0;j<9;j++){
      const p = board[i][j];
      if (!p || p.color !== byColor) continue;
      const pseudo = temp.generatePieceMoves.bind({ board, isOwnPiece:(x)=>x&&x.color===byColor })(i, j, p);
      for (const mv of pseudo){ if (mv.to.r===r && mv.to.c===c) return true; }
    }
  }
  return false;
}


