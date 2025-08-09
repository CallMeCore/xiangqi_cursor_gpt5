export class EngineClient {
  constructor(onStatus) {
    this.onStatus = onStatus || (()=>{});
    // 切换为通过后端桥接
    this.worker = null;
    this.ready = Promise.resolve();
    this.onStatus('Pikafish 桥接中');
  }

  async bestMove(fen, depth=6) {
    await this.ready;
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


