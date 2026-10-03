// /rest/v1/* da central: responde como o PostgREST da nuvem, usando o espelho da loja.

const crypto = require('node:crypto');
const { parseSelect, parseQuery } = require('./mirror.cjs');

function prefer(req) {
  const out = {};
  for (const part of String(req.headers.prefer || '').split(',')) {
    const [k, v] = part.split('=').map(s => s.trim());
    if (k) out[k] = v ?? true;
  }
  return out;
}

const pgError = (res, status, message, code = 'PGRST000', details = null) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ code, message, details, hint: null }));
};

/** who: claims do token (sub, email). */
async function handleRest(req, res, url, { mirror, who, readBody }) {
  const route = url.pathname.replace(/^\/rest\/v1\/?/, '');
  // as mesmas regras de acesso (RLS) da nuvem para quem está logado
  const ctx = { who: who ? { id: who.sub, email: who.email } : null, txid: crypto.randomUUID(), authz: who ? mirror.authz(who.sub) : null };
  const accept = String(req.headers.accept || '');
  const single = accept.includes('application/vnd.pgrst.object+json');
  const pref = prefer(req);

  const reply = (status, rows, count) => {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (count != null) {
      const offset = Number(url.searchParams.get('offset') || 0);
      headers['Content-Range'] = rows.length ? `${offset}-${offset + rows.length - 1}/${count}` : `*/${count}`;
    }
    if (single) {
      if (rows.length !== 1) {
        return pgError(res, 406, 'JSON object requested, multiple (or no) rows returned', 'PGRST116',
          `The result contains ${rows.length} rows`);
      }
      res.writeHead(status, headers);
      return res.end(req.method === 'HEAD' ? undefined : JSON.stringify(rows[0]));
    }
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify(rows));
  };

  try {
    if (!mirror.ready) return pgError(res, 503, 'A central ainda está baixando os dados da loja. Tente em instantes.');

    // ---------- funções ----------
    if (route.startsWith('rpc/')) {
      const args = req.method === 'GET' ? Object.fromEntries(url.searchParams) : await readBody(req);
      const result = mirror.rpc(route.slice(4), args || {}, ctx);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(single && Array.isArray(result) ? result[0] ?? null : result));
    }

    const table = route.split('/')[0];
    if (!/^\w+$/.test(table)) return pgError(res, 404, 'Não encontrado', 'PGRST205');
    const nodes = parseSelect(url.searchParams.get('select') || '*');
    const q = parseQuery(url.searchParams);
    // limites vindos do cabeçalho Range (".range()" antigo)
    const range = String(req.headers.range || '').match(/^(\d+)-(\d+)$/);
    if (range) { q.offset[''] = Number(range[1]); q.limit[''] = Number(range[2]) - Number(range[1]) + 1; }

    if (req.method === 'GET' || req.method === 'HEAD') {
      if (!mirror.known(table)) return reply(200, [], pref.count ? 0 : null); // tabela que não vem para a central
      const { rows, count } = mirror.query(table, nodes, q, '', null, ctx.authz);
      return reply(200, rows, pref.count ? count : null);
    }

    // ---------- gravação: devolve as linhas no formato do "select" pedido ----------
    const represent = (written) => {
      if (pref.return !== 'representation') { res.writeHead(req.method === 'POST' ? 201 : 204); return res.end(); }
      const { rows } = mirror.query(table, nodes, { filters: {}, order: {}, limit: {}, offset: {} }, '', written, ctx.authz);
      return reply(req.method === 'POST' ? 201 : 200, rows);
    };

    if (req.method === 'POST') {
      const body = await readBody(req);
      const list = Array.isArray(body) ? body : [body];
      const written = mirror.insert(table, list, ctx, {
        upsert: pref.resolution === 'merge-duplicates' || pref.resolution === 'ignore-duplicates',
        ignoreDuplicates: pref.resolution === 'ignore-duplicates',
        onConflict: url.searchParams.get('on_conflict') || null,
      });
      return represent(written);
    }
    if (req.method === 'PATCH') {
      const patch = await readBody(req);
      return represent(mirror.update(table, patch || {}, q, ctx));
    }
    if (req.method === 'DELETE') {
      return represent(mirror.remove(table, q, ctx));
    }
    return pgError(res, 405, 'Método não suportado');
  } catch (e) {
    return pgError(res, e.status || 400, e instanceof Error ? e.message : 'Erro', e.code || 'PGRST000');
  }
}

module.exports = { handleRest };
