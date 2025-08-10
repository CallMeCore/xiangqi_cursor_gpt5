import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
import os from 'node:os';
import { existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 查找 engine 目录下的可执行文件；可偏好某一类引擎
function findEngine(preferKind /* 'pikafish' | 'fairy' | undefined */) {
  const base = resolve(process.cwd(), '../engine');
  const pika = [
    'pikafish.exe',
    'pikafish-avx2.exe',
    'pikafish-bmi2.exe',
    'pikafish-sse41-popcnt.exe',
    'pikafish-ssse3.exe',
  ];
  const fairy = [
    'fairy-stockfish.exe',
    'fairy.exe',
    'fairy_stockfish.exe',
    'stockfish-fairy.exe',
  ];
  const order = preferKind === 'fairy' ? [...fairy] : preferKind === 'pikafish' ? [...pika] : [];
  // 先按常见文件名匹配（严格命名）
  for (const n of order) {
    const p = resolve(base, n);
    if (existsSync(p)) return p;
  }
  // 若偏好 Fairy，则优先按关键字扫描包含 fairy 的可执行文件
  try {
    const files = readdirSync(base, { withFileTypes: true });
    const exeFiles = files
      .filter((d) => d.isFile() && /\.exe$/i.test(d.name))
      .map((d) => d.name);
    if (preferKind === 'fairy') {
      let hit = exeFiles.find((n) => /fairy/i.test(n));
      if (!hit) hit = exeFiles.find((n) => /stockfish/i.test(n));
      if (hit) return resolve(base, hit);
    }
    if (preferKind === 'pikafish') {
      const hit = exeFiles.find((n) => /pika/i.test(n) || /pikafish/i.test(n));
      if (hit) return resolve(base, hit);
    }
    // 无偏好：任选一款（先 pika 再 fairy/stockfish）
    let neutral = exeFiles.find((n) => /pika/i.test(n) || /pikafish/i.test(n));
    if (!neutral) neutral = exeFiles.find((n) => /fairy/i.test(n) || /stockfish/i.test(n));
    if (neutral) return resolve(base, neutral);
  } catch {}
  return null;
}

function isFairyEnginePath(enginePath) {
  const lower = enginePath.toLowerCase();
  return lower.includes('fairy');
}

function runUciBestmove({ fen, depth, kind }) {
  return new Promise((resolvePromise, reject) => {
    const exe = findEngine(kind);
    if (!exe) return reject(new Error('未找到可执行引擎，请将 pikafish 或 fairy-stockfish 放入 engine/ 目录'));
    console.log(`[SPAWN] kind=${kind} exe=${exe}`);
    const child = spawn(exe, [], { stdio: 'pipe', cwd: dirname(exe) });
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
      const tag = isFairyEnginePath(exe) ? '[FAIRY]' : '[PIKA]';
      process.stdout.write(tag + ' ' + txt);
      const m = txt.match(/bestmove\s+(\S+)/i);
      if (m) {
        best = m[1];
        finalize(best);
      }
    });
    child.on('error', reject);
    child.on('close', () => finalize(best));

    send('uci');
    // 设置线程/哈希（加大一些以提升棋力）
    const threads = Math.max(1, Math.min((os.cpus()?.length || 1), 32));
    send(`setoption name Threads value ${threads}`);
    send('setoption name Hash value 512');
    // 仅 Fairy-Stockfish 需要显式设置象棋变体与强化项
    if (isFairyEnginePath(exe)) {
      send('setoption name UCI_Variant value xiangqi');
      send('setoption name UCI_LimitStrength value false');
      send('setoption name Skill Level value 20');
      send('setoption name Use NNUE value true');
      // 若同目录存在 variants.ini，向引擎声明
      send('setoption name VariantPath value variants.ini');
      // 指定 Xiangqi NNUE 权重（若存在）
      try {
        const engDir = dirname(exe);
        const files = readdirSync(engDir);
        const nnue = files.find((n) => /xiangqi-.*\.nnue$/i.test(n));
        if (nnue) {
          const rel = nnue; // cwd 已设为引擎目录
          send(`setoption name EvalFile value ${rel}`);
          console.log(`[FAIRY] Using NNUE: ${join(engDir, rel)}`);
        }
      } catch {}
      // 确保单主变（更专注最优解）
      send('setoption name MultiPV value 1');
      send('setoption name UCI_AnalyseMode value false');
    }
    send('isready');
    send('ucinewgame');
    send('position fen ' + fen);
    // 统一使用深度搜索，避免超时导致的随机走子
    const targetDepth = Number(depth) || (isFairyEnginePath(exe) ? 12 : 8);
    send(`go depth ${targetDepth}`);
    // 兜底超时：根据深度估算给更宽裕的时间（fairy 更耗时）
    const base = isFairyEnginePath(exe) ? 20000 : 10000;
    setTimeout(() => finalize(best), base);
  });
}

app.post('/bestmove', async (req, res) => {
  try {
    const { fen, depth } = req.body || {};
    if (!fen) return res.status(400).json({ error: 'missing fen' });
    const kindParam = (req.query && req.query.engine) ? String(req.query.engine) : '';
    const kind = /fairy/i.test(kindParam) ? 'fairy' : 'pikafish';
    console.log(`[REQ] engine=${kindParam} -> kind=${kind}, depth=${Number(depth) || 8}`);
    const bm = await runUciBestmove({ fen, depth: Number(depth) || 8, kind });
    res.json({ bestmove: bm });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

const PORT = 5174;
app.listen(PORT, () => console.log('AI engine bridge listening on http://localhost:' + PORT));


