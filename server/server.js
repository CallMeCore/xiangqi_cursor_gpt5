import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 查找 engine 目录下的 pikafish 可执行文件
function findEngine() {
  const base = resolve(process.cwd(), '../engine');
  const names = [
    'pikafish.exe',
    'pikafish-avx2.exe',
    'pikafish-bmi2.exe',
    'pikafish-sse41-popcnt.exe',
    'pikafish-ssse3.exe'
  ];
  for (const n of names) {
    const p = resolve(base, n);
    if (existsSync(p)) return p;
  }
  return null;
}

function runUciBestmove({ fen, depth }) {
  return new Promise((resolvePromise, reject) => {
    const exe = findEngine();
    if (!exe) return reject(new Error('未找到 pikafish 可执行文件，请放入 engine/ 目录'));
    const child = spawn(exe, [], { stdio: 'pipe' });
    const send = (s) => child.stdin.write(s + '\n');
    let best = null;
    let resolved = false;

    const finalize = (value) => {
      if (resolved) return;
      resolved = true;
      try { child.stdin.write('quit\n'); } catch {}
      try { child.kill(); } catch {}
      resolvePromise(value || null);
    };

    child.stdout.on('data', (buf) => {
      const txt = buf.toString('utf8');
      // 在控制台打印，便于调试
      process.stdout.write(txt);
      const m = txt.match(/bestmove\s+(\S+)/i);
      if (m) {
        best = m[1];
        finalize(best);
      }
    });
    child.on('error', reject);
    child.on('close', () => finalize(best));

    send('uci');
    // Pikafish 是象棋引擎，不需要 UCI_Variant；设置线程/哈希
    const threads = Math.max(1, Math.min((os.cpus()?.length || 1), 8));
    send(`setoption name Threads value ${threads}`);
    send('setoption name Hash value 64');
    send('isready');
    send('ucinewgame');
    send('position fen ' + fen);
    send('go depth ' + (depth || 6));
    // 兜底超时：10秒（避免深度较大或机器较慢时过早超时）
    setTimeout(() => finalize(best), 10000);
  });
}

app.post('/bestmove', async (req, res) => {
  try {
    const { fen, depth } = req.body || {};
    if (!fen) return res.status(400).json({ error: 'missing fen' });
    const bm = await runUciBestmove({ fen, depth: Number(depth) || 6 });
    res.json({ bestmove: bm });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = 5174;
app.listen(PORT, () => console.log('Pikafish bridge listening on http://localhost:' + PORT));


