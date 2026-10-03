// Supabase próprio e exclusivo da loja: o servidor dedicado mantém lá uma cópia de todos os dados da loja,
// atualizada a cada gravação (fila "outbox" no SQLite: se a internet cair, envia tudo depois, na ordem).
// O projeto da loja precisa ter a mesma estrutura do sistema (as migrações de supabase/migrations).

const PUSH_MS = 5_000;
const BATCH = 500;

class OwnSupabase {
  constructor({ store, mirror, getSecret, setStatus }) {
    this.store = store;
    this.mirror = mirror;
    this.getSecret = getSecret;
    this.setStatus = setStatus || (() => {});
    this.timer = null;
    this.busy = false;
    this.lastError = null;
    this.lastPushAt = null;
    this.fullSync = null; // { table, done, total } durante a cópia inicial
  }

  /** Confere a conexão e se a estrutura do sistema existe no projeto. */
  static async check(url, key) {
    const res = await fetch(`${url}/rest/v1/orders?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res) throw new Error('Não foi possível conectar ao Supabase informado.');
    if (res.status === 401 || res.status === 403) throw new Error('Chave recusada. Use a chave service_role do projeto.');
    if (res.status === 404 || res.status === 400) throw new Error('O projeto ainda não tem a estrutura do sistema. Aplique as migrações do Oxys nele primeiro.');
    if (!res.ok) throw new Error(`Supabase respondeu ${res.status}.`);
  }

  status() {
    return {
      enabled: !!this.timer, pending: this.store.outboxCount(), lastPushAt: this.lastPushAt, error: this.lastError, fullSync: this.fullSync,
    };
  }

  configure(enabled, { fullSync = false } = {}) {
    this.mirror.outbox = enabled;
    if (!enabled) { this.stop(); return; }
    if (!this.timer) { this.timer = setInterval(() => this.push(), PUSH_MS); this.timer.unref?.(); }
    if (fullSync) this.copyAll().catch(e => { this.lastError = e.message; this.setStatus(); });
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  async request(method, path, body) {
    const s = this.getSecret();
    if (!s) throw new Error('Supabase próprio não configurado');
    const res = await fetch(`${s.url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: s.key, Authorization: `Bearer ${s.key}`, 'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`);
  }

  /** Cópia inicial: todas as tabelas da loja (pais antes dos filhos, pelas ligações). */
  async copyAll() {
    const tables = [...this.mirror.local.tables, 'restaurants', 'plans'].filter(t => t !== 'print_jobs');
    const rels = this.mirror.local.relations || [];
    const ordered = [];
    const visit = (t, seen = new Set()) => {
      if (ordered.includes(t) || seen.has(t)) return;
      seen.add(t);
      for (const r of rels) if (r.table === t && r.ref_table !== t && tables.includes(r.ref_table)) visit(r.ref_table, seen);
      ordered.push(t);
    };
    tables.forEach(t => visit(t));
    this.fullSync = { table: null, done: 0, total: ordered.length };
    for (const t of ordered) {
      this.fullSync.table = t;
      this.setStatus();
      const rows = this.mirror.rows(t);
      const key = this.mirror.pk(t);
      for (let i = 0; i < rows.length; i += BATCH) await this.request('POST', `${t}?on_conflict=${key}`, rows.slice(i, i + BATCH));
      this.fullSync.done += 1;
    }
    this.fullSync = null;
    this.lastPushAt = new Date().toISOString();
    this.lastError = null;
    this.setStatus();
  }

  /** Envia a fila na ordem; gravações seguidas da mesma tabela vão juntas. */
  async push() {
    if (this.busy || this.fullSync) return;
    this.busy = true;
    try {
      for (let round = 0; round < 20; round++) {
        const items = this.store.outboxList(BATCH);
        if (!items.length) break;
        let i = 0;
        while (i < items.length) {
          const first = items[i];
          if (first.op.action === 'delete') {
            await this.send(first, () => this.request('DELETE', `${first.op.table}?${first.op.key || 'id'}=eq.${encodeURIComponent(first.op.id)}`));
            i += 1;
            continue;
          }
          // bloco de upserts seguidos na mesma tabela (a última versão de cada linha)
          let j = i;
          while (j < items.length && items[j].op.action === 'upsert' && items[j].op.table === first.op.table) j++;
          const block = items.slice(i, j);
          const key = first.op.key || 'id';
          const byId = new Map(block.map(x => [x.op.row[key], x.op.row]));
          try {
            await this.request('POST', `${first.op.table}?on_conflict=${key}`, [...byId.values()]);
            for (const x of block) this.store.outboxDone(x.seq);
          } catch (e) {
            for (const x of block) this.store.outboxFail(x.seq, e.message);
            throw e;
          }
          i = j;
        }
      }
      this.lastPushAt = new Date().toISOString();
      this.lastError = null;
    } catch (e) {
      this.lastError = e.message; // sem internet ou erro: tenta de novo em 5 s, sem perder a ordem
    } finally {
      this.busy = false;
      this.setStatus();
    }
  }

  async send(item, fn) {
    try { await fn(); this.store.outboxDone(item.seq); } catch (e) { this.store.outboxFail(item.seq, e.message); throw e; }
  }
}

module.exports = { OwnSupabase };
