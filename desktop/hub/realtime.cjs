// Tempo real da central (/realtime/v1/websocket), no protocolo do Supabase Realtime (Phoenix):
// as telas assinam "postgres_changes" como fazem na nuvem e recebem cada mudança gravada na central.

const { WebSocketServer } = require('ws');

/** Filtro do tipo "restaurant_id=eq.123" ou "status=in.(a,b)". */
function matchFilter(filter, record) {
  if (!filter) return true;
  const m = String(filter).match(/^([\w]+)=(eq|neq|lt|lte|gt|gte|in)\.(.*)$/);
  if (!m || !record) return !m;
  const [, col, op, raw] = m;
  const v = record[col];
  const s = v == null ? null : String(v);
  switch (op) {
    case 'eq': return s === raw;
    case 'neq': return s !== raw;
    case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map(x => x.trim().replace(/^"|"$/g, '')).includes(s);
    case 'lt': return Number(v) < Number(raw);
    case 'lte': return Number(v) <= Number(raw);
    case 'gt': return Number(v) > Number(raw);
    case 'gte': return Number(v) >= Number(raw);
    default: return true;
  }
}

function attachRealtime(server, { verify, canSee }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1e6 });
  let nextId = 1;

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://central');
    if (url.pathname !== '/realtime/v1/websocket') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => {
      ws.vsn = url.searchParams.get('vsn') || '1.0.0';
      ws.channels = new Map(); // topic → { joinRef, bindings }
      ws.alive = true;
      wss.emit('connection', ws, req);
    });
  });

  const send = (ws, joinRef, ref, topic, event, payload) => {
    if (ws.readyState !== 1) return;
    ws.send(ws.vsn === '2.0.0'
      ? JSON.stringify([joinRef ?? null, ref ?? null, topic, event, payload])
      : JSON.stringify({ join_ref: joinRef ?? null, ref: ref ?? null, topic, event, payload }));
  };

  wss.on('connection', ws => {
    ws.on('pong', () => { ws.alive = true; });
    ws.on('message', (raw, isBinary) => {
      if (isBinary) return; // broadcast binário: não usado nas telas da operação
      let msg;
      try {
        const data = JSON.parse(String(raw));
        msg = Array.isArray(data) ? { join_ref: data[0], ref: data[1], topic: data[2], event: data[3], payload: data[4] } : data;
      } catch { return; }
      const { topic, event, ref, join_ref: joinRef, payload } = msg;
      const reply = (status, response = {}) => send(ws, joinRef, ref, topic, 'phx_reply', { status, response });

      if (topic === 'phoenix' && event === 'heartbeat') return reply('ok');
      if (event === 'phx_join') {
        // como na nuvem: cada aviso só chega para quem pode ver aquela linha (RLS)
        // sem sessão válida ainda (tela abrindo): conecta, mas só recebe avisos depois do login
        const claims = verify(payload?.access_token || '');
        if (claims) ws.uid = claims.sub;
        const bindings = (payload?.config?.postgres_changes || []).map(b => ({ ...b, id: nextId++ }));
        ws.channels.set(topic, { joinRef, bindings });
        return reply('ok', { postgres_changes: bindings.map(({ id, event: e, schema, table, filter }) => ({ id, event: e, schema, table, filter })) });
      }
      if (event === 'phx_leave') { ws.channels.delete(topic); return reply('ok'); }
      if (event === 'access_token') {
        const claims = verify(payload?.access_token || '');
        if (claims) ws.uid = claims.sub;
        return;
      }
      if (event === 'broadcast') {
        // repassa para os outros aparelhos no mesmo canal
        for (const other of wss.clients) {
          if (other === ws) continue;
          const ch = other.channels?.get(topic);
          if (ch) send(other, ch.joinRef, null, topic, 'broadcast', payload);
        }
        if (ref) reply('ok');
        return;
      }
      if (ref) reply('ok');
    });
  });

  // conexões mortas (aparelho saiu da rede)
  const alive = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      try { ws.ping(); } catch { /* fechou */ }
    }
  }, 30_000);
  alive.unref();
  server.on('close', () => { clearInterval(alive); for (const ws of wss.clients) ws.terminate(); });

  /** Mudança gravada na central → telas que assinaram essa tabela. */
  return function publish({ table, type, record, old_record, at }) {
    const commit = at || new Date().toISOString();
    for (const ws of wss.clients) {
      if (!ws.uid || !canSee(ws.uid, table, record || old_record)) continue;
      for (const [topic, ch] of ws.channels) {
        const ids = ch.bindings.filter(b =>
          (b.schema === 'public' || b.schema === '*') && (!b.table || b.table === '*' || b.table === table)
          && (b.event === '*' || b.event === type) && matchFilter(b.filter, record || old_record)).map(b => b.id);
        if (!ids.length) continue;
        send(ws, ch.joinRef, null, topic, 'postgres_changes', {
          ids, data: { schema: 'public', table, commit_timestamp: commit, type, record: record || {}, old_record: old_record || {}, columns: [], errors: null },
        });
      }
    }
  };
}

module.exports = { attachRealtime };
