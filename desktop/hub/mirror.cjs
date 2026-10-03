// Banco da loja no computador, respondendo às telas normais do sistema exatamente como a nuvem responderia.
// Dois modos:
//  - central offline: espelho da nuvem; cada gravação entra na fila (row.insert / row.update / row.delete) e é
//    aplicada na nuvem pela offline_apply_row quando a internet volta.
//  - servidor dedicado: é o banco principal da loja (SQLite, store.cjs); a nuvem guarda só o controle
//    (restaurante, plano, equipe). Se a loja tiver um Supabase próprio, cada mudança vai para lá também.

const crypto = require('node:crypto');
const { authorizer } = require('./policies.cjs');
const rls = require('./rls.cjs');

// O que pode ser gravado sem internet (o mesmo que a offline_apply_row aceita no banco).
const SYNCED = {
  orders: ['insert', 'update', 'delete'], order_items: ['insert', 'update', 'delete'], payments: ['insert', 'update', 'delete'],
  restaurant_tables: ['update'], reservations: ['insert', 'update'], cash_registers: ['insert', 'update'],
  cash_movements: ['insert', 'update', 'delete'], kitchen_sessions: ['insert', 'update'], couriers: ['update'],
  audit_logs: ['insert'], notifications: ['update'],
};
// Só na central (nunca vai para a nuvem): fila de impressão da loja.
const LOCAL = new Set(['print_jobs']);
// No servidor dedicado: tabelas de controle, que continuam na nuvem (equipe e login dependem delas).
const CONTROL = new Set(['restaurants', 'plans', 'user_roles']);

const rlsError = (table) => new OfflineError(`new row violates row-level security policy for table "${table}"`, 403, '42501');

class OfflineError extends Error {
  constructor(message, status = 503, code = 'OXYS_OFFLINE') { super(message); this.status = status; this.code = code; }
}
const NEEDS_INTERNET = 'Esta ação fica disponível quando a internet voltar.';

// ---------- leitura da URL no formato PostgREST ----------
function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0, cur = '', quoted = false;
  for (const ch of s) {
    if (ch === '"') quoted = !quoted;
    if (!quoted) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === sep && depth === 0) { out.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
const unquote = (v) => (v.length > 1 && v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\"/g, '"') : v);

function parseSelect(s) {
  if (!s || !s.trim()) return [{ kind: 'star' }];
  return splitTop(s.replace(/\s+/g, ' ')).map(part => {
    const p = part.indexOf('(');
    if (p > 0 && part.endsWith(')')) {
      let head = part.slice(0, p).trim();
      const inner = part.slice(p + 1, -1);
      let spread = false;
      if (head.startsWith('...')) { spread = true; head = head.slice(3); }
      let alias = null;
      const m = head.match(/^([\w ]+):(?!:)(.+)$/);
      if (m) { alias = m[1].trim(); head = m[2].trim(); }
      const [rel, ...mods] = head.split('!');
      return {
        kind: 'embed', rel: rel.trim(), alias, spread, inner: mods.includes('inner'),
        hint: mods.find(x => x !== 'inner' && x !== 'left') || null, children: parseSelect(inner),
      };
    }
    if (part === '*') return { kind: 'star' };
    let name = part, alias = null;
    const m = part.match(/^([\w ]+):(?!:)(.+)$/);
    if (m) { alias = m[1].trim(); name = m[2].trim(); }
    name = name.replace(/::[\w ]+$/, '');
    const pathParts = name.split(/->>?/).map(x => x.trim().replace(/^'|'$/g, ''));
    return { kind: 'col', name: pathParts[0], path: pathParts.slice(1), alias: alias || pathParts[pathParts.length - 1] };
  });
}

function parseCond(v) {
  let not = false;
  if (v.startsWith('not.')) { not = true; v = v.slice(4); }
  const dot = v.indexOf('.');
  const op = dot < 0 ? v : v.slice(0, dot);
  let value = dot < 0 ? '' : v.slice(dot + 1);
  if (op === 'in') value = value.replace(/^\(|\)$/g, '') === '' ? [] : splitTop(value.replace(/^\(|\)$/g, '')).map(unquote);
  else if (['cs', 'cd', 'ov'].includes(op)) value = parseArrayLiteral(value);
  else value = unquote(value);
  return { op, value, not };
}

function parseArrayLiteral(v) {
  v = v.trim();
  if (v.startsWith('[') || (v.startsWith('{') && v.includes(':'))) { try { return JSON.parse(v); } catch { /* segue */ } }
  if (v.startsWith('{') || v.startsWith('(')) return splitTop(v.slice(1, -1)).map(unquote);
  return [v];
}

function parseLogic(kind, v, not = false) {
  const inner = v.replace(/^\(/, '').replace(/\)$/, '');
  return {
    logic: kind, not, items: splitTop(inner).map(item => {
      const m = item.match(/^(not\.)?(and|or)\((.*)\)$/);
      if (m) return parseLogic(m[2], `(${m[3]})`, !!m[1]);
      const dot = item.indexOf('.');
      return { col: item.slice(0, dot), ...parseCond(item.slice(dot + 1)) };
    }),
  };
}

/** Filtros, ordem e limites, agrupados pelo caminho ('' = tabela principal, 'order_items' = embutida). */
function parseQuery(params) {
  const q = { filters: {}, order: {}, limit: {}, offset: {} };
  const add = (path, f) => { (q.filters[path] ||= []).push(f); };
  for (const [key, value] of params) {
    if (['select', 'columns', 'on_conflict'].includes(key)) continue;
    const parts = key.split('.');
    const last = parts[parts.length - 1];
    const path = parts.slice(0, -1).join('.');
    if (last === 'order') q.order[path] = value;
    else if (last === 'limit') q.limit[path] = Number(value);
    else if (last === 'offset') q.offset[path] = Number(value);
    else if (last === 'or' || last === 'and') {
      const neg = parts[parts.length - 2] === 'not';
      add(neg ? parts.slice(0, -2).join('.') : path, parseLogic(last, value, neg));
    } else add(path, { col: last, ...parseCond(value) });
  }
  return q;
}

// ---------- comparação de valores ----------
const DATE = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+(Z|[+-]\d{2}(:?\d{2})?)?)?$/;
function getCol(row, col) {
  const parts = col.split(/->>?/).map(x => x.trim().replace(/^'|'$/g, ''));
  let v = row?.[parts[0]];
  for (const p of parts.slice(1)) v = v == null ? null : v[p];
  return v;
}
function compare(a, b) {
  if (typeof a === 'number') return a - Number(b);
  if (typeof a === 'boolean') return Number(a) - Number(b === 'true');
  const sa = String(a), sb = String(b);
  if (DATE.test(sa) && DATE.test(sb)) return Date.parse(sa.replace(' ', 'T')) - Date.parse(sb.replace(' ', 'T'));
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}
const likeRe = (pattern, flags) =>
  new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*').replace(/_/g, '.')}$`, flags);

function test(row, f) {
  if (f.logic) {
    const r = f.logic === 'or' ? f.items.some(i => test(row, i)) : f.items.every(i => test(row, i));
    return f.not ? !r : r;
  }
  const a = getCol(row, f.col);
  let r;
  switch (f.op) {
    case 'is':
      r = f.value === 'null' ? a == null : f.value === 'true' ? a === true : f.value === 'false' ? a === false : a == null;
      break;
    case 'eq': r = a != null && compare(a, f.value) === 0; break;
    case 'neq': r = a != null && compare(a, f.value) !== 0; break;
    case 'gt': r = a != null && compare(a, f.value) > 0; break;
    case 'gte': r = a != null && compare(a, f.value) >= 0; break;
    case 'lt': r = a != null && compare(a, f.value) < 0; break;
    case 'lte': r = a != null && compare(a, f.value) <= 0; break;
    case 'in': r = a != null && f.value.some(v => compare(a, v) === 0); break;
    case 'like': r = a != null && likeRe(f.value, '').test(String(a)); break;
    case 'ilike': r = a != null && likeRe(f.value, 'i').test(String(a)); break;
    case 'cs': r = Array.isArray(a) ? f.value.every(v => a.map(String).includes(String(v))) : a != null && typeof a === 'object' && Object.entries(f.value).every(([k, v]) => a[k] === v); break;
    case 'cd': r = Array.isArray(a) && a.every(v => f.value.map(String).includes(String(v))); break;
    case 'ov': r = Array.isArray(a) && a.some(v => f.value.map(String).includes(String(v))); break;
    default: r = true; // operador desconhecido: não filtra
  }
  return f.not ? !r : r;
}

function sorter(spec) {
  const keys = splitTop(spec).map(s => {
    const [col, ...mods] = s.split('.');
    return { col, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') ? true : mods.includes('nullslast') ? false : mods.includes('desc') };
  });
  return (x, y) => {
    for (const k of keys) {
      const a = getCol(x, k.col), b = getCol(y, k.col);
      if (a == null && b == null) continue;
      if (a == null) return k.nullsFirst ? -1 : 1;
      if (b == null) return k.nullsFirst ? 1 : -1;
      const c = compare(a, b);
      if (c) return k.desc ? -c : c;
    }
    return 0;
  };
}

// ---------- valores padrão das colunas ----------
function evalDefault(expr, who) {
  const e = String(expr).trim();
  if (/^gen_random_uuid\(\)$|^uuid_generate_v4\(\)$/.test(e)) return crypto.randomUUID();
  if (/^(now\(\)|CURRENT_TIMESTAMP|timezone\(.*now\(\)\))$/i.test(e)) return new Date().toISOString();
  if (/^CURRENT_DATE$/i.test(e)) return new Date().toISOString().slice(0, 10);
  if (/^auth\.uid\(\)$/.test(e)) return who?.id ?? null;
  let m = e.match(/gen_random_bytes\((\d+)\)/);
  if (m) return crypto.randomBytes(Number(m[1])).toString('hex');
  m = e.match(/^'((?:[^']|'')*)'::([\w ."[\]]+)$/);
  if (m) {
    const v = m[1].replace(/''/g, "'"), type = m[2];
    if (/json/.test(type)) { try { return JSON.parse(v); } catch { return null; } }
    if (/\[\]$/.test(type)) return v === '{}' ? [] : parseArrayLiteral(v);
    if (/numeric|int|double|real/.test(type)) return Number(v);
    if (type === 'boolean') return v === 'true';
    return v;
  }
  if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e);
  if (e === 'true' || e === 'false') return e === 'true';
  m = e.match(/^ARRAY\[(.*)\]/);
  if (m) return splitTop(m[1]).map(x => x.replace(/^'(.*)'(::.*)?$/, '$1'));
  return null;
}

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

class Mirror {
  /**
   * @param state  HubState (central: espelho em state.data.mirror e fila em state.data.ops)
   * @param emit   (change) => void — avisa as telas abertas (tempo real)
   * @param store  banco SQLite (store.cjs) — só no servidor dedicado
   */
  constructor(state, emit, { store = null } = {}) {
    this.state = state;
    this.emit = emit || (() => {});
    this.store = store;
    this.dedicated = !!store;
    this.outbox = false; // servidor dedicado com Supabase próprio: cada mudança vai para a fila de envio
    const d = state.data;
    if (this.dedicated) {
      const meta = store.getMeta('schema', {});
      this.local = {
        rows: store.loadAll(), relations: meta.relations || [], defaults: meta.defaults || {}, policies: meta.policies || [],
        primary_keys: meta.primary_keys || {},
        tables: meta.tables || [], staff: store.getMeta('staff', []), restaurant_id: store.getMeta('restaurant_id', null),
        imported: store.getMeta('imported', false),
      };
    } else {
      d.mirror ||= null;      // { rows, relations, defaults, staff, restaurant_id, generated_at }
      d.mirrorLocal ||= {};   // { tabela: { id: linha | null } } mudanças ainda não confirmadas pela nuvem
      d.mirrorPrints ||= [];  // print_jobs da loja
    }
    this.loginAttempts = new Map(); // email → tentativas de login erradas
  }

  get ready() { return this.dedicated ? !!(this.local.restaurant_id && this.local.imported) : !!this.state.data.mirror; }
  get db() { return this.dedicated ? this.local : this.state.data.mirror || { rows: {}, relations: [], defaults: {}, staff: [] }; }
  get restaurantId() { return this.db.restaurant_id || null; }
  get staff() { return this.db.staff || []; }

  /** Fila de impressão da loja. */
  get prints() { return this.dedicated ? (this.local.rows.print_jobs ||= []) : this.state.data.mirrorPrints; }
  set prints(list) { if (this.dedicated) this.local.rows.print_jobs = list; else this.state.data.mirrorPrints = list; }

  rows(table) {
    if (table === 'print_jobs') return this.prints;
    return this.db.rows?.[table] || [];
  }
  setRows(table, list) {
    if (table === 'print_jobs') this.prints = list;
    else this.db.rows[table] = list;
  }
  known(table) {
    if (table === 'print_jobs') return true;
    if (this.dedicated) return CONTROL.has(table) || this.local.tables.includes(table);
    return !!this.db.rows?.[table];
  }
  /** Chave primária da tabela (quase sempre "id"; algumas usam o próprio restaurant_id). */
  pk(table) { return this.db.primary_keys?.[table] || 'id'; }

  /** Tabela de controle (servidor dedicado): gravar nela é com a nuvem. */
  isControl(table) { return this.dedicated && CONTROL.has(table); }

  // ---------- disco (servidor dedicado) ----------
  saveRow(table, row) {
    if (!this.dedicated) return;
    this.store.put(table, row, row[this.pk(table)]);
    if (this.outbox && table !== 'print_jobs') this.store.outboxAdd({ action: 'upsert', table, key: this.pk(table), row });
  }
  dropRow(table, id) {
    if (!this.dedicated) return;
    this.store.del(table, id);
    if (this.outbox && table !== 'print_jobs') this.store.outboxAdd({ action: 'delete', table, key: this.pk(table), id });
  }

  /** A pessoa é da equipe deste restaurante? */
  member(userId) { return this.staff.some(s => s.user_id === userId) || this.rows('user_roles').some(r => r.user_id === userId); }

  /** Permissões da pessoa: as mesmas regras (RLS) da nuvem, lidas do banco quando disponíveis. */
  authz(userId) {
    const policies = this.db.policies;
    if (!policies?.length) return authorizer(this, userId);
    if (this.compiledFor !== policies) { this.compiled = rls.compile(policies); this.compiledFor = policies; }
    const db = {
      rows: (t) => this.rows(t),
      roles: (uid) => this.staff.find(s => s.user_id === uid)?.roles || this.rows('user_roles').filter(r => r.user_id === uid),
      restaurant: (id) => this.rows('restaurants').find(r => r.id === id),
      plan: (code) => this.rows('plans').find(p => p.code === code),
    };
    return rls.authorizer(this.compiled, db, userId);
  }

  // ---------- servidor dedicado: estrutura, controle e migração ----------
  /** Tabelas, ligações, valores padrão e regras de acesso vindos da nuvem. */
  applySchema(schema) {
    Object.assign(this.local, {
      relations: schema.relations || [], defaults: schema.defaults || {}, policies: schema.policies || [], tables: schema.tables || [],
      primary_keys: schema.primary_keys || {},
    });
    const { relations, defaults, policies, tables, primary_keys } = this.local;
    this.store.setMeta('schema', { relations, defaults, policies, tables, primary_keys });
  }

  /** Restaurante, plano e equipe (a nuvem é a dona deles). */
  applyControl(ctl) {
    this.local.restaurant_id = ctl.restaurantId;
    this.local.staff = ctl.staff || [];
    this.store.setMeta('restaurant_id', ctl.restaurantId);
    this.store.setMeta('staff', this.local.staff);
    const at = new Date().toISOString();
    for (const table of CONTROL) {
      const list = ctl[table] || [];
      const old = new Map(this.rows(table).map(r => [r.id, r]));
      if (JSON.stringify([...old.values()]) === JSON.stringify(list)) continue;
      this.store.replaceTable(table, list);
      this.local.rows[table] = list;
      for (const r of list) {
        const o = old.get(r.id); old.delete(r.id);
        if (!o) this.emit({ table, type: 'INSERT', record: r, old_record: null, at });
        else if (JSON.stringify(o) !== JSON.stringify(r)) this.emit({ table, type: 'UPDATE', record: r, old_record: o, at });
      }
      for (const o of old.values()) this.emit({ table, type: 'DELETE', record: null, old_record: o, at });
    }
    this.state.changed();
  }

  /** Migração: grava uma tabela inteira vinda da nuvem. */
  importTable(table, list) {
    this.store.replaceTable(table, list, this.pk(table));
    this.local.rows[table] = list;
  }
  finishImport() {
    this.local.imported = true;
    this.store.setMeta('imported', true);
    this.state.changed();
  }

  // ---------- nuvem → central ----------
  hasPending() { return !this.dedicated && this.state.data.ops.some(op => op.type.startsWith('row.') && (op.attempts || 0) < 5); }

  applyReplica(rep) {
    const before = this.state.data.mirror?.rows || {};
    const rows = rep.rows || {};
    delete rows.print_jobs;
    if (this.hasPending()) {
      // o que foi feito na loja e ainda não chegou na nuvem continua valendo
      for (const [table, changes] of Object.entries(this.state.data.mirrorLocal)) {
        for (const [id, row] of Object.entries(changes)) {
          rows[table] = (rows[table] || []).filter(r => r.id !== id);
          if (row) rows[table].push(row);
        }
      }
    } else {
      this.state.data.mirrorLocal = {};
    }
    this.state.data.mirror = {
      rows, relations: rep.relations || [], defaults: rep.defaults || {}, staff: rep.staff || [],
      restaurant_id: rep.restaurant_id, generated_at: rep.generated_at,
    };
    // avisa as telas abertas do que mudou
    const at = new Date().toISOString();
    for (const [table, list] of Object.entries(rows)) {
      const old = new Map((before[table] || []).map(r => [r.id, r]));
      for (const r of list) {
        const o = old.get(r.id);
        old.delete(r.id);
        if (!o) this.emit({ table, type: 'INSERT', record: r, old_record: null, at });
        else if (JSON.stringify(o) !== JSON.stringify(r)) this.emit({ table, type: 'UPDATE', record: r, old_record: o, at });
      }
      for (const o of old.values()) this.emit({ table, type: 'DELETE', record: null, old_record: o, at });
    }
    this.state.changed();
  }

  // ---------- leitura ----------
  relation(from, node) {
    const rels = this.db.relations || [];
    const target = node.rel;
    let toOne = rels.filter(r => r.table === from && (r.ref_table === target || r.column === target));
    let toMany = rels.filter(r => r.ref_table === from && r.table === target);
    if (node.hint) {
      const h = node.hint;
      const match = r => r.column === h || h === `${r.table}_${r.column}_fkey` || r.ref_table === h || r.table === h;
      toOne = toOne.filter(match);
      toMany = toMany.filter(match);
    }
    if (toOne.length) return { table: toOne[0].ref_table, one: true, local: toOne[0].column, remote: toOne[0].ref_column };
    if (toMany.length) return { table: toMany[0].table, one: false, local: toMany[0].ref_column, remote: toMany[0].column };
    return { table: target, one: null };
  }

  /** Mesma resposta que o PostgREST daria, só com as linhas que a pessoa (authz) pode ver. Retorna { rows, count }. */
  query(table, nodes, q, path = '', base = null, authz = null) {
    let list = (base ?? this.rows(table)).filter(r => (!authz || authz.canSelect(table, r)) && (q.filters[path] || []).every(f => test(r, f)));
    const embeds = nodes.filter(n => n.kind === 'embed');
    let recs = [];
    for (const row of list) {
      const emb = {};
      let keep = true;
      for (const n of embeds) {
        const key = n.alias || n.rel;
        const sub = path ? `${path}.${key}` : key;
        const rel = this.relation(table, n);
        let val;
        if (rel.one === null) val = null; // tabela que não vem para a central
        else {
          const candidates = row[rel.local] == null ? [] : this.rows(rel.table).filter(x => x[rel.remote] === row[rel.local]);
          const res = this.query(rel.table, n.children, q, sub, candidates, authz).rows;
          val = rel.one ? (res[0] ?? null) : res;
        }
        if (n.inner && (val == null || (Array.isArray(val) && !val.length))) { keep = false; break; }
        emb[key] = val;
      }
      if (keep) recs.push({ row, emb });
    }
    if (q.order[path]) { const s = sorter(q.order[path]); recs.sort((a, b) => s(a.row, b.row)); }
    const count = recs.length;
    const offset = q.offset[path] || 0;
    if (offset || q.limit[path] != null) recs = recs.slice(offset, q.limit[path] != null ? offset + q.limit[path] : undefined);
    return { rows: recs.map(r => this.project(r, nodes)), count };
  }

  project({ row, emb }, nodes) {
    const out = {};
    for (const n of nodes) {
      if (n.kind === 'star') Object.assign(out, clone(row));
      else if (n.kind === 'col') {
        let v = row[n.name];
        for (const p of n.path) v = v == null ? null : v[p];
        out[n.alias] = clone(v ?? null);
      } else {
        const key = n.alias || n.rel;
        if (n.spread && emb[key] && !Array.isArray(emb[key])) Object.assign(out, emb[key]);
        else out[key] = emb[key];
      }
    }
    return out;
  }

  // ---------- gravação ----------
  /** ctx: { who: { id, email }, txid } */
  checkWrite(table, action) {
    if (LOCAL.has(table)) return;
    if (this.dedicated) {
      if (CONTROL.has(table)) throw new OfflineError(NEEDS_INTERNET);
      return;
    }
    if (!SYNCED[table]?.includes(action)) throw new OfflineError(NEEDS_INTERNET);
  }

  remember(table, id, row) {
    if (LOCAL.has(table) || this.dedicated) return;
    (this.state.data.mirrorLocal[table] ||= {})[id] = row ? clone(row) : null;
  }

  queue(action, table, id, data, ctx) {
    if (LOCAL.has(table) || this.dedicated) return; // servidor dedicado: o disco e o Supabase próprio cuidam (saveRow)
    this.state.data.ops.push({
      id: crypto.randomUUID(), type: `row.${action}`, at: new Date().toISOString(), user_id: ctx.who?.id || null,
      data: { table, id, data: clone(data) },
    });
  }

  insert(table, objects, ctx, { upsert = false, ignoreDuplicates = false, onConflict = null } = {}) {
    const out = [];
    const pk = this.pk(table);
    const keys = (onConflict || pk).split(',').map(s => s.trim());
    for (const obj of objects) {
      const existing = upsert ? this.rows(table).find(r => keys.every(k => obj[k] !== undefined && compare(r[k], obj[k]) === 0)) : null;
      if (existing) {
        if (ignoreDuplicates) continue;
        if (ctx.authz && !(ctx.authz.canSelect(table, existing) && ctx.authz.canUpdate(table, existing))) throw rlsError(table);
        const patch = { ...obj };
        delete patch.id;
        out.push(...this.updateRows(table, [existing], patch, ctx));
        continue;
      }
      const row = {};
      for (const [col, expr] of Object.entries(this.db.defaults?.[table] || {})) row[col] = evalDefault(expr, ctx.who);
      Object.assign(row, clone(obj));
      if (pk === 'id' && !row.id) row.id = crypto.randomUUID();
      if (ctx.authz && !ctx.authz.canInsert(table, row)) throw rlsError(table);
      this.checkWrite(table, 'insert');
      if (row[pk] == null) throw new OfflineError(`Falta ${pk}`, 400, '23502');
      if (this.rows(table).some(r => r[pk] === row[pk])) throw new OfflineError('duplicate key value violates unique constraint', 409, '23505');
      this.beforeInsert(table, row);
      this.setRows(table, [...this.rows(table), row]);
      this.saveRow(table, row);
      const sent = { ...obj, id: row.id };
      if (row.created_at && !obj.created_at) sent.created_at = row.created_at;
      this.remember(table, row.id, row);
      this.queue('insert', table, row.id, sent, ctx);
      this.emit({ table, type: 'INSERT', record: row, old_record: null });
      this.afterInsert(table, row, ctx);
      out.push(row);
    }
    if (out.length) this.state.changed();
    return out;
  }

  /** Linhas atingidas por um filtro: as que a pessoa vê e pode alterar/apagar (como no banco, as outras ficam de fora). */
  targets(table, q, ctx, can) {
    const pk = this.pk(table);
    const ids = new Set(this.query(table, [{ kind: 'col', name: pk, path: [], alias: 'k' }], { ...q, order: {}, limit: {}, offset: {} }, '', null, ctx.authz).rows.map(r => r.k));
    return this.rows(table).filter(r => ids.has(r[pk]) && (!ctx.authz || ctx.authz[can](table, r)));
  }

  update(table, patch, q, ctx) {
    const rows = this.targets(table, q, ctx, 'canUpdate');
    const out = this.updateRows(table, rows, patch, ctx);
    if (out.length) this.state.changed();
    return out;
  }

  updateRows(table, rows, patch, ctx) {
    if (!rows.length) return [];
    // a linha alterada também precisa passar nas regras (WITH CHECK), antes de mexer em qualquer uma
    if (ctx.authz && rows.some(r => !ctx.authz.checkUpdate(table, { ...r, ...patch }))) throw rlsError(table);
    this.checkWrite(table, 'update');
    const out = [];
    for (const row of rows) {
      const old = clone(row);
      Object.assign(row, clone(patch));
      if ('updated_at' in row && !('updated_at' in patch)) row.updated_at = new Date().toISOString();
      this.saveRow(table, row);
      this.remember(table, row.id, row);
      this.queue('update', table, row.id, patch, ctx);
      this.emit({ table, type: 'UPDATE', record: row, old_record: old });
      this.afterUpdate(table, row, old, ctx);
      out.push(row);
    }
    return out;
  }

  remove(table, q, ctx) {
    const removed = this.targets(table, q, ctx, 'canDelete');
    if (!removed.length) return [];
    this.checkWrite(table, 'delete');
    this.setRows(table, this.rows(table).filter(r => !removed.includes(r)));
    const pk = this.pk(table);
    for (const row of removed) {
      this.dropRow(table, row[pk]);
      this.afterDelete(table, row, ctx);
      this.remember(table, row.id, null);
      this.queue('delete', table, row.id, {}, ctx);
      this.emit({ table, type: 'DELETE', record: null, old_record: row });
    }
    this.state.changed();
    return removed;
  }

  // ---------- regras do banco (gatilhos) feitas aqui ----------
  restaurantName() {
    const b = this.rows('branding_settings')[0];
    return (b?.brand_name || '').trim() || this.rows('restaurants')[0]?.name || 'Restaurante';
  }
  orderHeader(orderId) {
    const o = this.rows('orders').find(x => x.id === orderId);
    if (!o) return null;
    const t = o.table_id ? this.rows('restaurant_tables').find(x => x.id === o.table_id) : null;
    return {
      id: o.id, created_at: o.created_at, order_type: o.order_type, table_number: t?.number ?? null,
      customer_name: o.customer_name, customer_phone: o.customer_phone, customer_address: o.customer_address,
      notes: o.notes, delivery_fee: o.delivery_fee, total: o.total, created_by_name: o.created_by_name,
      created_by_role: o.created_by_role, source: o.source,
    };
  }
  printers(purpose) {
    return this.rows('printers').filter(p => p.enabled && p.auto_print && (p.purposes || []).includes(purpose));
  }
  addPrintJob(printer, purpose, orderId, document, ctx) {
    const job = {
      id: crypto.randomUUID(), restaurant_id: this.restaurantId, printer_id: printer.id, purpose, document, order_id: orderId,
      status: 'queued', attempts: 0, claimed_by: null, claimed_at: null, printed_at: null, error: null,
      created_by: ctx.who?.id || null, created_at: new Date().toISOString(),
    };
    // guarda só as últimas 24 h
    const cut = Date.now() - 24 * 3600e3;
    const keep = this.prints.filter(j => Date.parse(j.created_at) > cut).slice(-500);
    for (const j of this.prints) if (!keep.includes(j)) this.dropRow('print_jobs', j.id);
    this.prints = [...keep, job];
    this.saveRow('print_jobs', job);
    this.emit({ table: 'print_jobs', type: 'INSERT', record: job, old_record: null });
    return job;
  }

  // ---------- gatilhos do banco ----------
  /** Hora de Brasília (os gatilhos da nuvem usam America/Sao_Paulo). */
  localNow() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map(p => [p.type, p.value]));
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
  }

  /** enforce_table_reservation: mesa reservada (30 min antes até o fim) só para o titular da reserva. */
  beforeInsert(table, row) {
    if (table !== 'orders' || !row.table_id) return;
    const now = this.localNow();
    const sec = (t) => { const [h, m, x] = String(t).split(':').map(Number); return h * 3600 + m * 60 + (x || 0); };
    const nowS = sec(now.time);
    const r = this.rows('reservations')
      .filter(x => x.table_id === row.table_id && x.status === 'confirmed' && x.reservation_date === now.date
        && sec(x.start_time) - 1800 <= nowS && sec(x.end_time) >= nowS)
      .sort((a, b) => sec(a.start_time) - sec(b.start_time))[0];
    if (!r) return;
    if (row.reservation_id && row.reservation_id === r.id) return;
    if (row.customer_name && String(row.customer_name).trim().toLowerCase() === String(r.customer_name).trim().toLowerCase()) {
      row.reservation_id = r.id;
      return;
    }
    throw new OfflineError(`Mesa reservada para ${r.customer_name} das ${String(r.start_time).slice(0, 5)} as ${String(r.end_time).slice(0, 5)}. Apenas o titular da reserva pode ocupar esta mesa.`, 400, 'P0001');
  }

  /** Gravação feita pelo próprio banco (gatilho): sem regras de acesso, com disco e aviso às telas. */
  sysInsert(table, data, who) {
    const row = {};
    for (const [col, expr] of Object.entries(this.db.defaults?.[table] || {})) row[col] = evalDefault(expr, who);
    Object.assign(row, data);
    if (!row.id) row.id = crypto.randomUUID();
    this.setRows(table, [...this.rows(table), row]);
    this.saveRow(table, row);
    this.emit({ table, type: 'INSERT', record: row, old_record: null });
    this.afterInsert(table, row, { who, txid: null });
    return row;
  }
  sysUpdate(table, row, patch, who) {
    const old = clone(row);
    Object.assign(row, patch);
    if ('updated_at' in row) row.updated_at = new Date().toISOString();
    this.saveRow(table, row);
    this.emit({ table, type: 'UPDATE', record: row, old_record: old });
    this.afterUpdate(table, row, old, { who });
  }

  /** consume_inventory_for_order_item: baixa (ou estorno) do estoque pela ficha técnica do produto. */
  consumeInventory(item, sign, who) {
    const order = this.rows('orders').find(o => o.id === item.order_id);
    if (!order) return;
    const direct = this.rows('menu_item_ingredients').filter(m => m.menu_item_id === item.menu_item_id)
      .map(m => ({ inventory_id: m.inventory_id, quantity: Number(m.quantity) }));
    const viaComponents = this.rows('menu_item_components').filter(c => c.parent_item_id === item.menu_item_id).flatMap(c =>
      this.rows('menu_item_ingredients').filter(m => m.menu_item_id === c.component_item_id)
        .map(m => ({ inventory_id: m.inventory_id, quantity: Number(m.quantity) * Number(c.quantity) })));
    for (const ing of [...direct, ...viaComponents]) {
      const inv = this.rows('inventory').find(i => i.id === ing.inventory_id);
      const amount = ing.quantity * Number(item.quantity);
      if (inv) this.sysUpdate('inventory', inv, { quantity: Math.max(Number(inv.quantity) + sign * amount, 0) }, who);
      this.sysInsert('inventory_movements', {
        inventory_id: ing.inventory_id, restaurant_id: order.restaurant_id, type: sign < 0 ? 'exit' : 'entry', quantity: amount,
        reason: sign < 0 ? 'Baixa automática por pedido' : 'Estorno de item de pedido', user_id: who?.id ?? null,
      }, who);
    }
  }

  /** notify_low_stock: aviso de estoque baixo (no máximo um a cada 6 h por item). */
  lowStock(inv, old) {
    const q = Number(inv.quantity), min = Number(inv.minimum_stock);
    if (!(q <= min && (!old || Number(old.quantity) > Number(old.minimum_stock) || Number(old.quantity) !== q))) return;
    const recent = this.rows('notifications').some(n => n.restaurant_id === inv.restaurant_id && n.type === 'low_stock'
      && String(n.message).includes(inv.name) && Date.parse(n.created_at) > Date.now() - 6 * 3600e3);
    if (recent) return;
    const fmt = (n) => String(Math.round(Number(n) * 1000) / 1000);
    this.sysInsert('notifications', {
      restaurant_id: inv.restaurant_id, title: 'Estoque baixo',
      message: `${inv.name} está com ${fmt(q)} ${inv.unit} (mínimo: ${fmt(min)} ${inv.unit})`, type: 'low_stock', target_roles: ['admin', 'finance'],
    }, null);
  }

  afterUpdate(table, row, old) {
    if (!this.dedicated) return; // na central offline a nuvem faz isso ao sincronizar
    if (table === 'inventory' && (Number(row.quantity) !== Number(old.quantity) || Number(row.minimum_stock) !== Number(old.minimum_stock))) this.lowStock(row, old);
  }
  afterDelete(table, row, ctx) {
    if (!this.dedicated) return;
    if (table === 'order_items') this.consumeInventory(row, 1, ctx.who);
  }

  afterInsert(table, row, ctx) {
    if (this.dedicated && table === 'order_items') this.consumeInventory(row, -1, ctx.who);
    if (this.dedicated && table === 'inventory') this.lowStock(row, null);
    if (table === 'order_items') {
      // via da cozinha: um trabalho por impressora e por envio (vários itens juntos)
      const order = this.rows('orders').find(o => o.id === row.order_id);
      if (!order) return;
      const item = { name: this.rows('menu_items').find(m => m.id === row.menu_item_id)?.name || 'Item', quantity: row.quantity, notes: row.notes ?? null };
      for (const p of this.printers('kitchen')) {
        const job = this.prints.find(j => j.printer_id === p.id && j.order_id === order.id && j.purpose === 'kitchen'
          && j.status === 'queued' && j.document?.txid === ctx.txid);
        if (job) { job.document.items.push(item); this.saveRow('print_jobs', job); }
        else this.addPrintJob(p, 'kitchen', order.id, {
          kind: 'kitchen', txid: ctx.txid, restaurant_name: this.restaurantName(), order: this.orderHeader(order.id), items: [item],
        }, ctx);
      }
    }
    if (table === 'payments' && row.order_id) {
      // recibo quando a conta fica paga
      const order = this.rows('orders').find(o => o.id === row.order_id);
      if (!order) return;
      const items = this.rows('order_items').filter(i => i.order_id === order.id && i.status !== 'cancelled');
      const pays = this.rows('payments').filter(p => p.order_id === order.id);
      const itemsTotal = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unit_price), 0);
      const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
      if (paid + 0.009 < Math.max(itemsTotal + Number(order.delivery_fee || 0), Number(order.total || 0))) return;
      const sorted = [...pays].sort((a, b) => compare(a.created_at, b.created_at));
      for (const p of this.printers('receipt')) {
        if (this.prints.some(j => j.printer_id === p.id && j.order_id === order.id && j.purpose === 'receipt')) continue;
        this.addPrintJob(p, 'receipt', order.id, {
          kind: 'receipt', restaurant_name: this.restaurantName(), order: this.orderHeader(order.id),
          items: [...items].sort((a, b) => compare(a.created_at, b.created_at)).map(i => ({
            name: this.rows('menu_items').find(m => m.id === i.menu_item_id)?.name || 'Item', quantity: i.quantity, unit_price: i.unit_price, notes: i.notes ?? null,
          })),
          payments: sorted.map(x => ({ method: x.method, amount: x.amount })),
          change: round2(sorted.reduce((s, x) => s + Number(x.change_amount || 0), 0)),
        }, ctx);
      }
    }
  }

  // ---------- funções (rpc) ----------
  rpc(name, args, ctx) {
    switch (name) {
      case 'claim_print_job': {
        const job = this.prints.find(j => j.id === args._job_id
          && (j.status === 'queued' || (j.status === 'printing' && Date.parse(j.claimed_at) < Date.now() - 120_000)));
        if (!job || (ctx.authz && !(ctx.authz.canSelect('print_jobs', job) && ctx.authz.canUpdate('print_jobs', job)))) return [];
        const old = clone(job);
        Object.assign(job, { status: 'printing', claimed_by: args._station ?? null, claimed_at: new Date().toISOString(), attempts: job.attempts + 1 });
        this.saveRow('print_jobs', job);
        this.emit({ table: 'print_jobs', type: 'UPDATE', record: job, old_record: old });
        this.state.changed();
        return [clone(job)];
      }
      // bloqueio do login: as mesmas regras do banco (5 erros em 15 min → 5 min bloqueado)
      case 'login_lock_seconds': {
        const a = this.loginAttempts.get(String(args._email || '').trim().toLowerCase());
        return a?.lockedUntil ? Math.max(0, Math.ceil((a.lockedUntil - Date.now()) / 1000)) : 0;
      }
      case 'register_login_failure': {
        const email = String(args._email || '').trim().toLowerCase();
        if (!email) return 0;
        const now = Date.now();
        const prev = this.loginAttempts.get(email);
        const reset = !prev || (prev.lockedUntil && prev.lockedUntil <= now) || prev.last < now - 15 * 60_000;
        const a = { attempts: reset ? 1 : prev.attempts + 1, last: now, lockedUntil: null };
        if (a.attempts >= 5) a.lockedUntil = now + 300_000;
        this.loginAttempts.set(email, a);
        return a.lockedUntil ? 300 : 0;
      }
      case 'clear_login_attempts':
        this.loginAttempts.delete(String(args._email || '').trim().toLowerCase());
        return null;
      case 'is_restaurant_active':
        return this.rows('restaurants').some(r => r.id === args._restaurant_id && r.status === 'active');
      default:
        throw new OfflineError(NEEDS_INTERNET);
    }
  }

  /** Vias a imprimir no computador da central. */
  queuedPrints() { return this.prints.filter(j => j.status === 'queued'); }
  markPrinted(id, error) {
    const job = this.prints.find(j => j.id === id);
    if (!job) return false;
    const old = clone(job);
    if (error) Object.assign(job, { status: job.attempts >= 3 ? 'error' : 'queued', error: String(error).slice(0, 200), attempts: job.attempts + 1 });
    else Object.assign(job, { status: 'done', printed_at: new Date().toISOString(), error: null });
    this.saveRow('print_jobs', job);
    this.emit({ table: 'print_jobs', type: 'UPDATE', record: job, old_record: old });
    this.state.changed();
    return true;
  }
}

module.exports = { Mirror, OfflineError, parseSelect, parseQuery, test, splitTop };
