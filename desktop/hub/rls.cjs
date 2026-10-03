// Regras de acesso da nuvem (RLS) aplicadas no servidor da loja, lidas direto do banco (pg_policies).
// Um tradutor pequeno das expressões SQL que as políticas usam: AND/OR/NOT, comparações, IN/ANY/ALL,
// EXISTS (SELECT ... FROM tabela WHERE ...), literais com tipo ('admin'::app_role) e as funções de
// permissão do sistema (has_role, user_belongs_to_restaurant, module_guard...). Assim o servidor segue as
// mesmas regras da nuvem e acompanha sozinho qualquer mudança nelas.
//
// Lógica de três valores como no SQL (true / false / null); uma política só libera quando dá true.

// ---------- leitura ----------
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'") {
      let j = i + 1, s = '';
      for (;;) {
        if (j >= src.length) throw new Error('texto sem fim');
        if (src[j] === "'" && src[j + 1] === "'") { s += "'"; j += 2; continue; }
        if (src[j] === "'") break;
        s += src[j++];
      }
      out.push({ t: 'str', v: s }); i = j + 1; continue;
    }
    if (/[0-9]/.test(c)) { const m = src.slice(i).match(/^\d+(\.\d+)?/)[0]; out.push({ t: 'num', v: Number(m) }); i += m.length; continue; }
    if (/[A-Za-z_"]/.test(c)) {
      let m;
      if (c === '"') { const j = src.indexOf('"', i + 1); m = src.slice(i + 1, j); i = j + 1; }
      else { m = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_$]*/)[0]; i += m.length; }
      out.push({ t: 'id', v: m, u: m.toUpperCase() }); continue;
    }
    const two = src.slice(i, i + 2);
    if (['::', '<>', '<=', '>=', '!='].includes(two)) { out.push({ t: 'op', v: two === '!=' ? '<>' : two }); i += 2; continue; }
    if ('()[],.=<>*'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    throw new Error(`caractere inesperado: ${c}`);
  }
  return out;
}

function parse(src) {
  const tk = tokenize(src);
  let p = 0;
  const peek = (o = 0) => tk[p + o];
  const isOp = (v, o = 0) => peek(o)?.t === 'op' && peek(o).v === v;
  const isKw = (v, o = 0) => peek(o)?.t === 'id' && peek(o).u === v;
  const eat = (v) => { if (!(isOp(v) || isKw(v))) throw new Error(`esperado ${v} em ${src.slice(0, 80)}`); return tk[p++]; };

  const expr = () => orE();
  const orE = () => { let l = andE(); while (isKw('OR')) { p++; l = { k: 'or', l, r: andE() }; } return l; };
  const andE = () => { let l = notE(); while (isKw('AND')) { p++; l = { k: 'and', l, r: notE() }; } return l; };
  const notE = () => { if (isKw('NOT')) { p++; return { k: 'not', e: notE() }; } return cmpE(); };
  const cmpE = () => {
    let l = castE();
    for (;;) {
      if (peek()?.t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) {
        const op = tk[p++].v;
        if (isKw('ANY') || isKw('ALL') || isKw('SOME')) {
          const q = tk[p++].u === 'ALL' ? 'all' : 'any';
          eat('('); const arr = expr(); eat(')');
          l = { k: 'quant', op, q, l, arr };
        } else l = { k: 'cmp', op, l, r: castE() };
        continue;
      }
      if (isKw('IS')) {
        p++; const neg = isKw('NOT') ? (p++, true) : false;
        const what = tk[p++].u; // NULL / TRUE / FALSE
        l = { k: 'is', neg, what, e: l };
        continue;
      }
      if (isKw('IN') || (isKw('NOT') && isKw('IN', 1))) {
        const neg = isKw('NOT') ? (p += 2, true) : (p++, false);
        eat('(');
        let right;
        if (isKw('SELECT')) right = { k: 'sub', q: select() };
        else { const items = [expr()]; while (isOp(',')) { p++; items.push(expr()); } right = { k: 'list', items }; }
        eat(')');
        l = { k: 'in', neg, l, right };
        continue;
      }
      return l;
    }
  };
  const castE = () => {
    let e = primary();
    while (isOp('::')) { p++; tk[p++]; while (isOp('[')) { p++; eat(']'); } e = { k: 'cast', e }; } // tipo não muda o valor aqui
    return e;
  };
  const select = () => {
    eat('SELECT');
    const cols = [expr()];
    if (isKw('AS')) { p += 2; }
    while (isOp(',')) { p++; cols.push(expr()); if (isKw('AS')) p += 2; }
    let from = null, alias = null, where = null;
    if (isKw('FROM')) {
      p++;
      let name = tk[p++].v;
      if (isOp('.')) { p++; name = tk[p++].v; } // public.tabela
      from = name;
      if (peek()?.t === 'id' && !['WHERE', 'LIMIT'].includes(peek().u) && !isOp(')')) alias = tk[p++].v;
      if (isKw('AS')) { p++; alias = tk[p++].v; }
    }
    if (isKw('WHERE')) { p++; where = expr(); }
    if (isKw('LIMIT')) { p += 2; }
    return { cols, from, alias: alias || from, where };
  };
  const primary = () => {
    const t = peek();
    if (!t) throw new Error('fim inesperado');
    if (isOp('(')) {
      p++;
      if (isKw('SELECT')) { const q = select(); eat(')'); return { k: 'scalar', q }; }
      const e = expr(); eat(')'); return e;
    }
    if (t.t === 'str') { p++; return { k: 'lit', v: t.v }; }
    if (t.t === 'num') { p++; return { k: 'lit', v: t.v }; }
    if (t.t === 'id') {
      if (t.u === 'TRUE' || t.u === 'FALSE') { p++; return { k: 'lit', v: t.u === 'TRUE' }; }
      if (t.u === 'NULL') { p++; return { k: 'lit', v: null }; }
      if (t.u === 'EXISTS') { p++; eat('('); const q = select(); eat(')'); return { k: 'exists', q }; }
      if (t.u === 'ARRAY') {
        p++; eat('['); const items = [];
        if (!isOp(']')) { items.push(expr()); while (isOp(',')) { p++; items.push(expr()); } }
        eat(']'); return { k: 'array', items };
      }
      // nome qualificado: a.b ou a.b.c
      const parts = [tk[p++].v];
      while (isOp('.') && peek(1)?.t === 'id') { p++; parts.push(tk[p++].v); }
      if (isOp('(')) { // função
        p++; const args = [];
        if (!isOp(')')) { args.push(expr()); while (isOp(',')) { p++; args.push(expr()); } }
        eat(')');
        return { k: 'fn', name: parts[parts.length - 1].toLowerCase(), schema: parts.length > 1 ? parts[0] : null, args };
      }
      return { k: 'col', parts };
    }
    throw new Error(`não entendi: ${JSON.stringify(t)}`);
  };
  const tree = expr();
  if (p < tk.length) throw new Error(`sobrou: ${src.slice(0, 80)}`);
  return tree;
}

// ---------- avaliação ----------
const and3 = (a, b) => (a === false || b === false ? false : a === null || b === null ? null : true);
const or3 = (a, b) => (a === true || b === true ? true : a === null || b === null ? null : false);
const eq = (a, b) => (a == null || b == null ? null : String(a) === String(b));
function cmp(op, a, b) {
  if (a == null || b == null) return null;
  if (op === '=') return String(a) === String(b);
  if (op === '<>') return String(a) !== String(b);
  const x = typeof a === 'number' || typeof b === 'number' ? Number(a) - Number(b) : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  return op === '<' ? x < 0 : op === '>' ? x > 0 : op === '<=' ? x <= 0 : x >= 0;
}

/**
 * ctx: { uid, db } — db.rows(tabela), db.roles(uid) (papéis em todos os restaurantes), db.restaurant(id), db.plan(code)
 * scopes: [{ name, alias, row }] do mais de fora para o mais de dentro
 */
function evaluate(node, ctx, scopes) {
  const ev = (n, s = scopes) => evaluate(n, ctx, s);
  switch (node.k) {
    case 'lit': return node.v;
    case 'cast': return ev(node.e);
    case 'and': { const l = ev(node.l); return l === false ? false : and3(l, ev(node.r)); }
    case 'or': { const l = ev(node.l); return l === true ? true : or3(l, ev(node.r)); }
    case 'not': { const v = ev(node.e); return v == null ? null : !v; }
    case 'cmp': return cmp(node.op, ev(node.l), ev(node.r));
    case 'is': {
      const v = ev(node.e);
      const r = node.what === 'NULL' ? v == null : node.what === 'TRUE' ? v === true : v === false;
      return node.neg ? !r : r;
    }
    case 'array': return node.items.map(i => ev(i));
    case 'quant': {
      const l = ev(node.l), arr = ev(node.arr) || [];
      const res = arr.map(x => cmp(node.op, l, x));
      if (node.q === 'any') return res.reduce(or3, false);
      return res.reduce(and3, true);
    }
    case 'in': {
      const l = ev(node.l);
      const values = node.right.k === 'list' ? node.right.items.map(i => ev(i)) : runSelect(node.right.q, ctx, scopes).map(r => r[0]);
      const r = values.map(v => eq(l, v)).reduce(or3, false);
      return node.neg ? (r == null ? null : !r) : r;
    }
    case 'exists': return runSelect(node.q, ctx, scopes, 1).length > 0;
    case 'scalar': { const r = runSelect(node.q, ctx, scopes, 1); return r.length ? r[0][0] : null; }
    case 'col': return column(node.parts, scopes);
    case 'fn': return call(node, ctx, scopes);
    default: throw new Error(`nó desconhecido ${node.k}`);
  }
}

function column(parts, scopes) {
  if (parts.length >= 2) {
    const [q, col] = parts.slice(-2);
    for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].alias === q || scopes[i].name === q) return scopes[i].row?.[col] ?? null;
    return null;
  }
  const col = parts[0];
  for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].row && col in scopes[i].row) return scopes[i].row[col];
  return null;
}

function runSelect(q, ctx, scopes, limit = Infinity) {
  const out = [];
  const rows = q.from ? ctx.db.rows(q.from) : [null];
  for (const row of rows) {
    const inner = q.from ? [...scopes, { name: q.from, alias: q.alias, row }] : scopes;
    if (q.where && evaluate(q.where, ctx, inner) !== true) continue;
    out.push(q.cols.map(c => evaluate(c, ctx, inner)));
    if (out.length >= limit) break;
  }
  return out;
}

// ---------- funções de permissão do banco ----------
function helpers(ctx) {
  const roles = (uid) => ctx.db.roles(uid);
  const hasRole = (uid, role) => roles(uid).some(r => r.role === role);
  const belongs = (uid, rid) => rid != null && roles(uid).some(r => r.restaurant_id === rid);
  const active = (rid) => ctx.db.restaurant(rid)?.status === 'active';
  const home = (uid) => [...roles(uid)].filter(r => r.role !== 'super_admin' && r.restaurant_id)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))[0]?.restaurant_id ?? null;
  const feature = (rid, f) => {
    const r = ctx.db.restaurant(rid);
    const plan = r ? ctx.db.plan(r.plan_code) : null;
    const v = plan?.features?.[f];
    return v == null ? true : v === true || v === 'true';
  };
  const moduleAccess = (uid, rid, mod, edit) => {
    if (uid == null || rid == null) return false;
    if (hasRole(uid, 'super_admin')) return true;
    if (!belongs(uid, rid)) return false;
    if (hasRole(uid, 'admin')) return true;
    const perm = ctx.db.rows('module_permissions').find(m => m.user_id === uid && m.restaurant_id === rid && m.module === mod);
    if (perm) return edit ? !!perm.can_edit : !!(perm.can_view || perm.can_edit);
    if (['hr', 'dre', 'loyalty'].includes(mod) && hasRole(uid, 'finance')) return true;
    if (mod === 'hr' && hasRole(uid, 'hr')) return true;
    if (mod === 'marketing' && hasRole(uid, 'marketing')) return true;
    return false;
  };
  return { hasRole, belongs, active, home, feature, moduleAccess };
}

function call(node, ctx, scopes) {
  const a = node.args.map(x => evaluate(x, ctx, scopes));
  const h = ctx.h;
  switch (node.name) {
    case 'uid': return ctx.uid; // auth.uid()
    case 'has_role': return h.hasRole(a[0], a[1]);
    case 'user_belongs_to_restaurant': return h.belongs(a[0], a[1]);
    case 'get_user_restaurant_id': return h.home(a[0]);
    case 'is_restaurant_active': return h.active(a[0]);
    case 'restaurant_has_feature': return h.feature(a[0], a[1]);
    case 'has_module_access': return h.moduleAccess(a[0], a[1], a[2], !!a[3]);
    case 'module_guard': return h.hasRole(ctx.uid, 'super_admin') || (h.feature(a[0], a[1]) && h.moduleAccess(ctx.uid, a[0], a[1], !!a[2]));
    case 'is_delivery_staff':
      return h.hasRole(ctx.uid, 'super_admin')
        || ((h.hasRole(ctx.uid, 'admin') || h.hasRole(ctx.uid, 'delivery')) && h.belongs(ctx.uid, a[0]) && h.active(a[0]));
    case 'lower': return a[0] == null ? null : String(a[0]).toLowerCase();
    case 'coalesce': return a.find(x => x != null) ?? null;
    default:
      if (!warned.has(node.name)) { warned.add(node.name); console.warn(`[rls] função sem tradução: ${node.name} (nega acesso)`); }
      return null;
  }
}
const warned = new Set();

// ---------- políticas por tabela ----------
/**
 * policies: linhas de pg_policies { table, cmd, permissive, qual, with_check }.
 * Retorna um "autorizador" igual ao de policies.cjs: canSelect / canInsert / canUpdate / checkUpdate / canDelete.
 */
function compile(policies) {
  const byTable = {};
  for (const p of policies || []) {
    let using = null, check = null;
    try {
      using = p.qual ? parse(p.qual) : null;
      check = p.with_check ? parse(p.with_check) : null;
    } catch (e) {
      console.warn(`[rls] política não traduzida (${p.table}.${p.name}): ${e.message} — ela não libera nada`);
      continue;
    }
    (byTable[p.table] ||= []).push({ cmd: p.cmd, permissive: p.permissive !== 'RESTRICTIVE', using, check });
  }
  return byTable;
}

function authorizer(compiled, db, uid) {
  const ctx = { uid, db };
  ctx.h = helpers(ctx);
  const pass = (node, table, row) => node != null && evaluate(node, ctx, [{ name: table, alias: table, row }]) === true;
  const of = (table, cmd) => (compiled[table] || []).filter(p => p.cmd === 'ALL' || p.cmd === cmd);
  // permissivas somam (OR); restritivas precisam passar todas (AND)
  const decide = (table, cmd, row, pick) => {
    const list = of(table, cmd);
    const perm = list.filter(p => p.permissive);
    const restr = list.filter(p => !p.permissive);
    return perm.some(p => pass(pick(p), table, row)) && restr.every(p => pass(pick(p), table, row));
  };
  return {
    uid,
    canSelect: (t, row) => decide(t, 'SELECT', row, p => p.using),
    canInsert: (t, row) => decide(t, 'INSERT', row, p => p.check ?? p.using),
    canUpdate: (t, row) => decide(t, 'UPDATE', row, p => p.using),
    checkUpdate: (t, row) => decide(t, 'UPDATE', row, p => p.check ?? p.using),
    canDelete: (t, row) => decide(t, 'DELETE', row, p => p.using),
  };
}

module.exports = { parse, evaluate, compile, authorizer };
