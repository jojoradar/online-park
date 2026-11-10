// 線上公園 - 多人同步伺服器
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');

// 可選角色（與前端 CHARACTORS 對應）
const CHARS = ['huangle', 'huangrenxun', 'musk', 'trump'];

// --- 靜態檔案 ---
const server = http.createServer((req, res) => {
  let urlPath = (req.url || '/').split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const file = path.join(PUBLIC, path.normalize(urlPath).replace(/^([.][.][/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
    res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
    res.end(data);
  });
});

// --- WebSocket ---
const wss = new WebSocketServer({ server });
const players = new Map(); // id -> { id, name, state }

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg, exceptId) {
  const s = JSON.stringify(msg);
  for (const ws of wss.clients) {
    if (ws.readyState === 1 && ws._id !== exceptId) ws.send(s);
  }
}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).slice(2, 10);
  ws._id = id;

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'join') {
      const name = String(m.name || '').slice(0, 16) || '匿名';
      const charType = CHARS.includes(m.charType) ? m.charType : null; // 角色類型（舊版客戶端為 null）
      players.set(id, { id, name, state: { x: 0, y: 0, z: 0, ry: 0, lying: false, box: null, charType } });
      // 告訴新玩家目前所有人
      send(ws, { t: 'init', id, name, players: [...players.values()] });
      broadcast({ t: 'join', id, name, charType }, id);
      broadcast({ t: 'chat', id, name, text: '進入了公園', system: true }, id);

    } else if (m.t === 'pos') {
      const p = players.get(id);
      if (!p) return;
      p.state = {
        x: +m.x || 0, y: +m.y || 0, z: +m.z || 0,
        ry: +m.ry || 0,
        lying: !!m.lying,
        box: m.box || null, // {x, z} 或 null
        charType: p.state.charType || null, // 角色類型（join 時決定，pos 只透傳）
      };
      broadcast({ t: 'pos', id, ...p.state }, id);

    } else if (m.t === 'chat') {
      const p = players.get(id);
      if (!p) return;
      const text = String(m.text || '').slice(0, 200);
      if (!text) return;
      broadcast({ t: 'chat', id, name: p.name, text });
    }
  });

  ws.on('close', () => {
    const p = players.get(id);
    if (p) {
      players.delete(id);
      broadcast({ t: 'leave', id, name: p.name, charType: p.state.charType });
    }
  });
});

server.listen(PORT, () => {
  console.log(`線上公園已開園！請開啟 http://localhost:${PORT}`);
});
