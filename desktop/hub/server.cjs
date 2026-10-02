// Servidor da central na rede da loja: entrega as telas offline e recebe as operações dos aparelhos.
//   GET  /                      telas offline (garçom, cozinha, caixa)
//   GET  /api/hello             restaurante, equipe e situação (sem login)
//   POST /api/login             { user_id, pin } → token
//   GET  /api/state             estado da loja (com token)
//   POST /api/op                { type, data } → aplica e devolve a operação
//   GET  /api/events?token=     avisos de mudança (SSE)
//   GET  /api/prints            fila de impressão (só o próprio computador)
//   POST /api/prints/:id        { error? } marca como impresso

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

const pinHash = (pin, salt) => crypto.createHash('sha256').update(`${salt}:${pin}`).digest('hex');

function createServer({ state, getConfig, uiDir, getStatus }) {
  const sessions = new Map(); // token → { user_id, name, role, at }
  const clients = new Set();  // respostas SSE abertas
  const attempts = new Map(); // ip → { n, until } (bloqueio contra chute de PIN)

  state.onChange(version => {
    for (const res of clients) { try { res.write(`data: ${JSON.stringify({ version, ...getStatus() })}\n\n`); } catch { /* fechou */ } }
  });
  setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch { /* fechou */ } } }, 25000).unref();

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) { reject(new Error('Muito grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('JSON inválido')); } });
  });
  const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const auth = (req, url) => {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || url.searchParams.get('token');
    const s = token && sessions.get(token);
    return s || null;
  };
  const staff = () => (state.data.snapshot?.staff || []);

  function serveStatic(res, pathname) {
    if (!uiDir) { res.writeHead(503); res.end('Telas offline não instaladas'); return; }
    let file = path.normalize(path.join(uiDir, decodeURIComponent(pathname)));
    if (!file.startsWith(uiDir)) { res.writeHead(403); res.end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(uiDir, 'offline.html');
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' });
    fs.createReadStream(file).pipe(res);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://central');
    try {
      if (!url.pathname.startsWith('/api/')) { serveStatic(res, url.pathname); return; }

      if (url.pathname === '/api/hello' && req.method === 'GET') {
        const s = state.data.snapshot;
        return send(res, 200, {
          restaurant: s?.restaurant || null, ready: !!s,
          staff: staff().map(p => ({ user_id: p.user_id, name: p.email, role: p.role })),
          ...getStatus(),
        });
      }

      if (url.pathname === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const lock = attempts.get(ip);
        if (lock && lock.until > Date.now()) return send(res, 429, { error: 'Muitas tentativas. Aguarde 1 minuto.' });
        const { user_id, pin } = await readBody(req);
        const member = staff().filter(p => p.user_id === user_id);
        if (!member.length) return send(res, 400, { error: 'Escolha quem está usando.' });
        const config = getConfig();
        if (!config.pinHash || pinHash(String(pin || ''), config.salt) !== config.pinHash) {
          const n = (lock?.n || 0) + 1;
          attempts.set(ip, { n, until: n >= 5 ? Date.now() + 60_000 : 0 });
          return send(res, 401, { error: 'PIN da central incorreto.' });
        }
        attempts.delete(ip);
        const roles = member.map(m => m.role);
        const role = ['admin', 'cashier', 'waiter', 'kitchen', 'delivery', 'finance'].find(r => roles.includes(r));
        const token = crypto.randomBytes(24).toString('hex');
        sessions.set(token, { user_id, name: member[0].email, role, at: Date.now() });
        return send(res, 200, { token, user: { user_id, name: member[0].email, role } });
      }

      // impressão: só o próprio computador da central
      if (url.pathname === '/api/prints' && req.method === 'GET') {
        if (!isLocal(req)) return send(res, 403, { error: 'Somente na central' });
        return send(res, 200, { jobs: state.pendingPrints(), restaurant: state.data.snapshot?.restaurant || null, printers: state.data.snapshot?.printers || [], devices: getConfig().devices || {} });
      }
      const pm = url.pathname.match(/^\/api\/prints\/([\w-]+)$/);
      if (pm && req.method === 'POST') {
        if (!isLocal(req)) return send(res, 403, { error: 'Somente na central' });
        const { error } = await readBody(req);
        state.markPrinted(pm[1], error);
        return send(res, 200, { ok: true });
      }

      const who = auth(req, url);
      if (!who) return send(res, 401, { error: 'Entre com o PIN da central.' });

      if (url.pathname === '/api/state' && req.method === 'GET') {
        return send(res, 200, { ...state.view(), me: who, ...getStatus() });
      }
      if (url.pathname === '/api/op' && req.method === 'POST') {
        const { type, data } = await readBody(req);
        try {
          const op = state.apply(String(type), data || {}, who);
          return send(res, 200, { op: { id: op.id, type: op.type, data: op.data } });
        } catch (e) {
          return send(res, 400, { error: e.message });
        }
      }
      if (url.pathname === '/api/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ version: state.data.version, ...getStatus() })}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        sessions.delete((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
        return send(res, 200, { ok: true });
      }
      send(res, 404, { error: 'Não encontrado' });
    } catch (e) {
      send(res, 500, { error: e instanceof Error ? e.message : 'Erro' });
    }
  });
}

module.exports = { createServer, pinHash };
