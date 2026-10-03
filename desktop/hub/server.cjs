// Servidor da central na rede da loja.
//   GET  /...                   o sistema completo (as mesmas telas de sempre), falando com a central
//   /rest/v1  /auth/v1  /realtime/v1   a central responde como a nuvem (espelho da loja, mesmas regras de acesso)
//   GET  /api/hello             restaurante e situação da central (sem login)
//   GET  /api/events            avisos de mudança (SSE) — só o próprio computador
//   GET  /api/prints            fila de impressão — só o próprio computador
//   POST /api/prints/:id        { error? } marca como impresso

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handleRest } = require('./postgrest.cjs');
const { attachRealtime } = require('./realtime.cjs');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2' };

// No servidor dedicado, funções da nuvem que continuam lá (equipe e login).
const CLOUD_FUNCTIONS = new Set(['create-user', 'manage-user', 'bootstrap-admin']);

/**
 * mode: 'central' (offline) ou 'dedicated' (servidor dedicado da loja)
 * cloudProxy: { url, apikey, afterWrite } — servidor dedicado: o que continua na nuvem vai para lá em nome da pessoa
 */
function createServer({ state, getConfig, uiDir, getStatus, mirror, auth, mode = 'central', isSuspended = () => false, cloudProxy = null }) {
  const clients = new Set();  // respostas SSE abertas

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
  // Só o próprio computador. O túnel da internet também chega por "localhost", mas sempre com os cabeçalhos
  // da Cloudflare (cf-connecting-ip / x-forwarded-for): esses nunca contam como locais.
  const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    && !req.headers['cf-connecting-ip'] && !req.headers['x-forwarded-for'] && !req.headers['cf-ray'];

  // O sistema completo, avisando o app (meta oxys-central) que está rodando pela central.
  let indexCache = null;
  function serveIndex(res) {
    const file = path.join(uiDir, 'index.html');
    if (!fs.existsSync(file)) return serveFile(res, path.join(uiDir, 'offline.html'));
    const stat = fs.statSync(file);
    if (!indexCache || indexCache.mtime !== stat.mtimeMs) {
      indexCache = { mtime: stat.mtimeMs, html: fs.readFileSync(file, 'utf8').replace('<head>', `<head><meta name="oxys-central" content="${mode}">`) };
    }
    res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
    res.end(indexCache.html);
  }
  function serveFile(res, file) {
    const ext = path.extname(file);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=31536000, immutable' });
    fs.createReadStream(file).pipe(res);
  }
  function serveStatic(res, pathname) {
    if (!uiDir) { res.writeHead(503); res.end('Telas offline não instaladas'); return; }
    let file;
    try { file = path.normalize(path.join(uiDir, decodeURIComponent(pathname))); } catch { res.writeHead(400); res.end(); return; }
    if (!file.startsWith(uiDir)) { res.writeHead(403); res.end(); return; }
    if (pathname === '/' || pathname === '/index.html') return serveIndex(res);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return serveFile(res, file);
    if (/\.\w{2,5}$/.test(pathname)) { res.writeHead(404); res.end(); return; } // arquivo que não existe
    serveIndex(res); // rotas do app (/cozinha, /caixa...)
  }

  /** Repassa para a nuvem principal com a sessão da nuvem da própria pessoa (as regras da nuvem valem). */
  async function toCloud(req, res, url, isFunction) {
    const token = cloudProxy ? await auth.cloudToken(bearer(req)) : null;
    if (!token) return send(res, 503, { code: 'OXYS_OFFLINE', message: 'Esta alteração é feita na nuvem e precisa de internet.', error: 'Esta alteração é feita na nuvem e precisa de internet.' });
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(await readBody(req));
    const headers = { apikey: cloudProxy.apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    for (const h of ['prefer', 'accept', 'x-client-info']) if (req.headers[h]) headers[h] = req.headers[h];
    try {
      const r = await fetch(`${cloudProxy.url}${url.pathname}${url.search}`, { method: req.method, headers, body, signal: AbortSignal.timeout(30_000) });
      const text = await r.text();
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json', ...(r.headers.get('content-range') ? { 'Content-Range': r.headers.get('content-range') } : {}) });
      res.end(text);
      if (r.ok) cloudProxy.afterWrite?.(isFunction);
    } catch {
      send(res, 503, { code: 'OXYS_OFFLINE', message: 'Esta alteração é feita na nuvem e precisa de internet.', error: 'Sem internet no servidor.' });
    }
  }

  const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, prefer, accept-profile, content-profile, range, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS, HEAD',
    'Access-Control-Expose-Headers': 'Content-Range',
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://central');
    try {
      // ---------- a central no lugar da nuvem ----------
      if (/^\/(rest|auth|functions|storage|realtime)\/v1\//.test(url.pathname)) {
        for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v);
        if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
        if (url.pathname.startsWith('/auth/v1/')) return await auth.handle(req, res, url, readBody, send);
        if (mode === 'dedicated' && isSuspended()) {
          return send(res, 403, { code: 'OXYS_SUSPENDED', message: 'Servidor dedicado desativado para esta loja. Fale com o suporte Oxys.', error: 'Servidor dedicado desativado para esta loja.' });
        }
        if (url.pathname.startsWith('/functions/v1/')) {
          const name = url.pathname.split('/')[3];
          if (mode === 'dedicated' && CLOUD_FUNCTIONS.has(name)) return await toCloud(req, res, url, true);
          return send(res, 503, { error: mode === 'dedicated' ? 'Este recurso ainda não está disponível no servidor dedicado.' : 'Disponível quando a internet voltar.' });
        }
        if (url.pathname.startsWith('/storage/v1/')) { res.writeHead(404); return res.end(); }
        if (url.pathname.startsWith('/rest/v1/')) {
          const who = auth.verify(bearer(req));
          // tela de login (antes de entrar): só as funções de bloqueio de tentativas
          if (!who && /^\/rest\/v1\/rpc\/(login_lock_seconds|register_login_failure|clear_login_attempts)$/.test(url.pathname)) {
            return await handleRest(req, res, url, { mirror, who: null, readBody });
          }
          if (!who) return send(res, 401, { code: 'PGRST301', message: 'Sessão expirada. Entre de novo.', details: null, hint: null });
          // servidor dedicado: dados do restaurante, plano e equipe são da nuvem — gravação vai para lá
          const table = url.pathname.replace(/^\/rest\/v1\//, '').split('/')[0];
          if (req.method !== 'GET' && req.method !== 'HEAD' && mirror.isControl(table)) return await toCloud(req, res, url, false);
          return await handleRest(req, res, url, { mirror, who, readBody });
        }
        return send(res, 404, { error: 'Não encontrado' });
      }
      if (!url.pathname.startsWith('/api/')) { serveStatic(res, url.pathname); return; }

      if (url.pathname === '/api/hello' && req.method === 'GET') {
        // servidor dedicado (acessível pela internet): só o que as telas precisam, sem detalhes da loja
        if (mode === 'dedicated') {
          const st = getStatus();
          return send(res, 200, { mode, ready: st.ready, online: st.online, suspended: st.suspended, lanUrls: st.lanUrls, pendingOps: 0 });
        }
        const s = state.data.snapshot;
        return send(res, 200, {
          restaurant: s?.restaurant || null, ready: !!s,
          ...getStatus(),
        });
      }

      // As telas offline antigas (login com PIN) foram substituídas pelas telas normais com as regras da nuvem.
      if (url.pathname === '/api/login') return send(res, 410, { error: 'Use o sistema normal: ele funciona igual sem internet.' });

      // impressão: só o próprio computador da central
      if (url.pathname === '/api/prints' && req.method === 'GET') {
        if (!isLocal(req)) return send(res, 403, { error: 'Somente na central' });
        return send(res, 200, {
          jobs: state.pendingPrints(), restaurant: state.data.snapshot?.restaurant || null, printers: state.data.snapshot?.printers || [],
          devices: getConfig().devices || {},
          // vias das telas completas (mesmo formato da nuvem)
          mirrorJobs: mirror.queuedPrints(), mirrorPrinters: mirror.rows('printers'),
        });
      }
      const pm = url.pathname.match(/^\/api\/prints\/([\w-]+)$/);
      if (pm && req.method === 'POST') {
        if (!isLocal(req)) return send(res, 403, { error: 'Somente na central' });
        const { error } = await readBody(req);
        if (!mirror.markPrinted(pm[1], error)) state.markPrinted(pm[1], error);
        return send(res, 200, { ok: true });
      }

      // volta para a nuvem de quem entrou pela central: sessão da nuvem no lugar da sessão da central
      if (url.pathname === '/api/cloud-session' && req.method === 'POST') {
        const session = await auth.cloudSession((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
        return session ? send(res, 200, session) : send(res, 404, { error: 'Entre de novo com email e senha.' });
      }

      // avisos para a janela de impressão da central (só o próprio computador)
      if (url.pathname === '/api/events' && req.method === 'GET') {
        if (!isLocal(req)) return send(res, 403, { error: 'Somente na central' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify({ version: state.data.version, ...getStatus() })}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return;
      }
      send(res, 404, { error: 'Não encontrado' });
    } catch (e) {
      if (!res.headersSent) send(res, 500, { error: e instanceof Error ? e.message : 'Erro' });
    }
  });
  const publish = attachRealtime(server, {
    verify: (t) => auth.verify(t),
    canSee: (uid, table, row) => !!row && mirror.authz(uid).canSelect(table, row),
  });
  return { server, publish };
}

module.exports = { createServer };
