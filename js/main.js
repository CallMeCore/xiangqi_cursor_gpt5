import { ChessXQ } from './rules.js';
import { drawBoard, drawPieces, coordToCellWithFlip, cellToCoord, drawTargets } from './renderer.js';
import { EngineClient } from './workerClient.js';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('status-text');
const fenText = document.getElementById('fen-text');
const engineStatus = document.getElementById('engine-status');
const btnNew = document.getElementById('new-game');
const btnUndo = document.getElementById('undo');
const selDepth = document.getElementById('ai-depth');
const selSide = document.getElementById('side-to-move');
const lastMoveText = document.getElementById('last-move-text');
const selMode = document.getElementById('game-mode');
const selEngineRed = document.getElementById('engine-red');
const selEngineBlack = document.getElementById('engine-black');

const game = new ChessXQ();
let selected = null; // {r,c}
let engine = new EngineClient(updateEngineStatus);
let playingHumanColor = 'red';
let pendingEngine = false;
let lastMove = null; // { from:{r,c}, to:{r,c} }
let targetHints = []; // [{r,c,capture:boolean}]
let flippedView = false; // 人类选黑时翻转视角
let mode = 'hva'; // hva 人机, hvh 人人, ava 机机

function updateEngineStatus(msg) {
  engineStatus.textContent = msg;
}

function setStatus(msg) {
  statusText.textContent = msg;
}

function redraw() {
  drawBoard(ctx);
  drawPieces(ctx, game.board, lastMove, flippedView);
  drawTargets(ctx, targetHints, flippedView);
  fenText.textContent = game.fen();
  lastMoveText.textContent = lastMove ? squareStr(lastMove.from) + ' → ' + squareStr(lastMove.to) : '-';
}

function newGame() {
  mode = selMode.value;
  playingHumanColor = selSide.value;
  // 象棋规则固定红先（w）。人类选择黑时，AI（红）先走。
  game.reset('w');
  flippedView = playingHumanColor === 'black';
  selected = null;
  lastMove = null;
  targetHints = [];
  pendingEngine = false;
  redraw();
  setStatus('新开局');
  // 如果 AI 先走，立即请求引擎
  if (mode !== 'hvh' && !isHumanTurn()) {
    currentEngineForTurn();
    requestEngineMove();
  }
}

function isHumanTurn() {
  if (mode === 'ava') return false;
  if (mode === 'hvh') return true;
  const side = game.toMove() === 'w' ? 'red' : 'black';
  return side === playingHumanColor;
}

function onClick(e) {
  if (!isHumanTurn() || pendingEngine) return;
  if (mode === 'ava') return; // 机机模式屏蔽人工点击
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const { r, c } = coordToCellWithFlip(x, y, flippedView);
  const piece = game.board[r][c];

  if (selected && (selected.r !== r || selected.c !== c)) {
    const move = { from: { r: selected.r, c: selected.c }, to: { r, c } };
    if (game.isLegalMove(move)) {
      game.makeMove(move);
      lastMove = move;
      targetHints = [];
      selected = null;
      redraw();
      if (!game.isGameOver()) {
        if (mode !== 'hvh') requestEngineMove();
      } else {
        setStatus(game.resultText());
      }
    } else {
      // 切换选择
      if (piece && game.isOwnPiece(piece)) {
        selected = { r, c };
        updateTargets(r, c);
      }
    }
  } else {
    if (piece && game.isOwnPiece(piece)) {
      selected = { r, c };
      updateTargets(r, c);
    } else {
      selected = null;
      targetHints = [];
      redraw();
    }
  }
}

function highlightCell(r, c) {
  redraw();
  const { x, y } = cellToCoord(r, c);
  ctx.strokeStyle = '#3498db';
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 40, y - 40, 80, 80);
}

async function requestEngineMove() {
  pendingEngine = true;
  setStatus('AI 思考中…');
  const depth = parseInt(selDepth.value, 10);
  try {
    // 同步解析模式给规则（用于 Fairy 与 Pika 坐标格式差异）
    const side = game.toMove() === 'w' ? 'red' : 'black';
    const modeForTurn = (side === 'red' ? selEngineRed.value : selEngineBlack.value);
    game.setParseEngine(modeForTurn === 'fairy' ? 'fairy' : 'pika');
    if (mode !== 'hvh') currentEngineForTurn();
    const best = await engine.bestMove(game.fen(), depth);
    if (best) {
      const mv = game.uciToMove(best);
      if (mv && game.isLegalMove(mv)) {
        game.makeMove(mv);
        lastMove = mv;
      } else {
        const moves = game.generateLegalMoves();
        if (moves.length > 0) {
          const rnd = moves[Math.floor(Math.random() * moves.length)];
          game.makeMove(rnd);
          lastMove = rnd;
        }
      }
    } else {
      // 后备：随机走子
      const moves = game.generateLegalMoves();
      if (moves.length > 0) {
        const mv = moves[Math.floor(Math.random() * moves.length)];
        game.makeMove(mv);
        lastMove = mv;
      }
    }
  } catch (e) {
    console.error(e);
  } finally {
    pendingEngine = false;
    redraw();
    if (game.isGameOver()) {
      setStatus(game.resultText());
    } else {
      if (mode === 'ava' || (mode === 'hva' && !isHumanTurn())) {
        // 连续让 AI 走
        requestEngineMove();
      } else {
        setStatus('轮到你了');
      }
    }
  }
}

btnNew.addEventListener('click', newGame);
btnUndo.addEventListener('click', () => {
  if (game.history.length === 0) return;
  // 悔棋按人+机两步回退
  game.undo();
  if (game.history.length > 0) game.undo();
  lastMove = null;
  targetHints = [];
  redraw();
});

canvas.addEventListener('click', onClick);

// 初始
newGame();

function squareStr(s) {
  const file = String.fromCharCode('a'.charCodeAt(0) + s.c);
  const rank = s.r; // 内部 0..9，自上而下；展示转换为引擎视角 0..9 自下而上
  const engineRank = 9 - rank;
  return file + engineRank;
}

function currentEngineForTurn() {
  const side = game.toMove() === 'w' ? 'red' : 'black';
  const v = side === 'red' ? selEngineRed.value : selEngineBlack.value;
  engine.setMode(v === 'fairy' ? 'fairy' : 'pikafish');
}

selEngineRed.addEventListener('change', () => { if (mode !== 'hvh') currentEngineForTurn(); });
selEngineBlack.addEventListener('change', () => { if (mode !== 'hvh') currentEngineForTurn(); });

function updateTargets(r, c) {
  // 生成该子的所有合法目标，区分可吃子
  const legal = game.generateLegalMoves();
  const mine = legal.filter(m => m.from.r === r && m.from.c === c);
  targetHints = mine.map(m => ({ r: m.to.r, c: m.to.c, capture: !!game.board[m.to.r][m.to.c] }));
  highlightCell(r, c);
}


