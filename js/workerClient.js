export class EngineClient {
  constructor(onStatus) {
    this.onStatus = onStatus || (()=>{});
    this.worker = null;
    this.mode = 'pikafish'; // 'pikafish' | 'fairy'
    this.ready = Promise.resolve();
    this.onStatus('Pikafish 桥接中');
  }

  setMode(mode) {
    this.mode = mode;
    // 统一走后端，不再创建 WASM Worker
    this.worker = null;
    this.onStatus(mode === 'fairy' ? 'Fairy-Stockfish(后端)' : 'Pikafish 桥接中');
  }

  async bestMove(fen, depth=6) {
    await this.ready;
    if (this.mode === 'fairy') {
      // 与后端保持一致，但通过 query 参数声明引擎类型
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 6000);
        // 为 Fairy 传递 movetime，可按需求调大（例如 5000-15000ms）
        const mt = 8000;
        const resp = await fetch(`http://localhost:5174/bestmove?engine=fairy&mt=${mt}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen, depth }),
          signal: controller.signal
        });
        clearTimeout(id);
        if (!resp.ok) return null;
        const json = await resp.json();
        const bm = (json && json.bestmove) ? String(json.bestmove) : '';
        if (!bm || bm.toLowerCase() === '(none)') return null;
        return bm;
      } catch { return null; }
    } else {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 6000);
        const resp = await fetch('http://localhost:5174/bestmove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fen, depth }),
          signal: controller.signal
        });
        clearTimeout(id);
        if (!resp.ok) return null;
        const json = await resp.json();
        const bm = (json && json.bestmove) ? String(json.bestmove) : '';
        if (!bm || bm.toLowerCase() === '(none)') return null;
        return bm;
      } catch {
        return null;
      }
    }
  }
}


