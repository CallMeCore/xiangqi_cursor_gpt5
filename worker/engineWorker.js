// 该 Worker 试图加载 Fairy-Stockfish (Xiangqi 变体) 的 wasm 构建
// 目录结构建议：engine/fairy-stockfish.wasm, engine/fairy-stockfish.js
// 如未找到则回退到“伪引擎”：随机走子由主线程处理（本 Worker 仅报告未加载）。

let engineWorker = null;
let ready = false;
let pending = null; // { fen, depth, timer }

postMessage({ type: 'status', payload: '加载引擎…' });

async function tryLoadFairyStockfish() {
  try {
    // 某些构建会自带 worker 入口，如 fairy-stockfish.wasm.js + worker 版本；
    // 这里优先尝试 engine/stockfish.worker.js（若你放置类似命名）；否则回退到单线程模块（需引擎支持stdin/stdout桥）
    try {
      engineWorker = new Worker('../engine/stockfish.wasm.js');
    } catch (_) {
      // 再尝试常见命名
      try { engineWorker = new Worker('../engine/fairy-stockfish.js'); } catch (_) {}
    }

    if (!engineWorker) throw new Error('未找到可用引擎 Worker 脚本');

    engineWorker.onmessage = generalMessageHandler;

    ready = true;
    postMessage({ type: 'status', payload: '引擎已加载' });
    postMessage({ type: 'ready' });
  } catch (e) {
    console.warn('引擎加载失败，将使用后备方案', e);
    ready = true;
    postMessage({ type: 'status', payload: '未找到引擎，使用后备' });
    postMessage({ type: 'ready' });
  }
}

tryLoadFairyStockfish();

function send(cmd) {
  if (!engineWorker) return;
  engineWorker.postMessage(cmd);
}

function generalMessageHandler(evt) {
  const data = typeof evt.data === 'string' ? evt.data : evt.data?.data;
  if (typeof data !== 'string') return;
  if (data.startsWith('info')) return;
  if (/uciok/i.test(data)) return;
  if (/readyok/i.test(data)) {
    if (pending) {
      send('ucinewgame');
      send('position fen ' + pending.fen);
      send('go depth ' + (pending.depth || 6));
    }
    return;
  }
  const m = data.match(/bestmove\s+(\S+)/i);
  if (m) {
    if (pending && pending.timer) clearTimeout(pending.timer);
    const bm = m[1] && m[1] !== '(none)' ? m[1] : null;
    postMessage({ type: 'bestmove', payload: bm });
    pending = null;
    return;
  }
}

onmessage = (e) => {
  const { type, payload } = e.data || {};
  if (type === 'go') {
    const { fen, depth } = payload;
    if (!engineWorker) {
      postMessage({ type: 'bestmove', payload: null });
      return;
    }
    // 初始化 + 等待 readyok 再 go
    const timeoutMs = 5000;
    if (pending && pending.timer) clearTimeout(pending.timer);
    pending = {
      fen,
      depth,
      timer: setTimeout(() => {
        postMessage({ type: 'bestmove', payload: null });
        pending = null;
      }, timeoutMs)
    };
    send('uci');
    send('setoption name UCI_Variant value xiangqi');
    send('isready');
  }
};


