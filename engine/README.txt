将 Fairy-Stockfish (支持 Xiangqi 变体) 的浏览器构建放入本目录：

必需文件：
- fairy-stockfish.js
- fairy-stockfish.wasm

若你没有构建文件，可从官方构建或第三方构建获取，或自行编译（Emscripten）。
加载逻辑见 `worker/engineWorker.js`，会以 `import('../engine/fairy-stockfish.js')` 动态加载，并通过 locateFile() 寻找 wasm。

若未放置文件，则页面将退回“随机走子(后备)”状态，仍可演示棋盘与人机交互，但 AI 不会下强招。


