// Banco local do servidor dedicado (SQLite, embutido no app — nada para instalar à parte).
// Cada linha de cada tabela é guardada como JSON (as telas e as regras trabalham com o mesmo formato da nuvem);
// as consultas rodam em memória, e o disco é atualizado linha a linha a cada gravação (modo WAL: não corrompe
// se o computador desligar no meio).

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'oxys-servidor.db');
    this.db = new DatabaseSync(this.file);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS rows (tbl TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (tbl, id));
      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);
      -- alterações a enviar para o Supabase próprio da loja (quando configurado)
      CREATE TABLE IF NOT EXISTS outbox (seq INTEGER PRIMARY KEY AUTOINCREMENT, op TEXT NOT NULL, tries INTEGER NOT NULL DEFAULT 0, error TEXT);
    `);
    this.q = {
      put: this.db.prepare('INSERT INTO rows (tbl, id, data) VALUES (?, ?, ?) ON CONFLICT (tbl, id) DO UPDATE SET data = excluded.data'),
      del: this.db.prepare('DELETE FROM rows WHERE tbl = ? AND id = ?'),
      all: this.db.prepare('SELECT tbl, data FROM rows'),
      getMeta: this.db.prepare('SELECT v FROM meta WHERE k = ?'),
      setMeta: this.db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v'),
      addOut: this.db.prepare('INSERT INTO outbox (op) VALUES (?)'),
      listOut: this.db.prepare('SELECT seq, op, tries FROM outbox ORDER BY seq LIMIT ?'),
      delOut: this.db.prepare('DELETE FROM outbox WHERE seq = ?'),
      failOut: this.db.prepare('UPDATE outbox SET tries = tries + 1, error = ? WHERE seq = ?'),
      countOut: this.db.prepare('SELECT count(*) AS n FROM outbox'),
    };
  }

  /** Todas as linhas, por tabela. */
  loadAll() {
    const out = {};
    for (const { tbl, data } of this.q.all.iterate()) (out[tbl] ||= []).push(JSON.parse(data));
    return out;
  }

  put(table, row, key = row.id) { this.q.put.run(table, String(key), JSON.stringify(row)); }
  del(table, id) { this.q.del.run(table, String(id)); }
  /** Várias gravações de uma vez (importação, troca de tabelas de controle). */
  transaction(fn) {
    this.db.exec('BEGIN');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  replaceTable(table, list, pk = 'id') {
    this.transaction(() => {
      this.db.prepare('DELETE FROM rows WHERE tbl = ?').run(table);
      for (const r of list) this.put(table, r, r[pk]);
    });
  }

  getMeta(k, fallback = null) { const r = this.q.getMeta.get(k); return r ? JSON.parse(r.v) : fallback; }
  setMeta(k, v) { this.q.setMeta.run(k, JSON.stringify(v)); }

  outboxAdd(op) { this.q.addOut.run(JSON.stringify(op)); }
  outboxList(limit = 200) { return this.q.listOut.all(limit).map(r => ({ seq: r.seq, tries: r.tries, op: JSON.parse(r.op) })); }
  outboxDone(seq) { this.q.delOut.run(seq); }
  outboxFail(seq, error) { this.q.failOut.run(String(error).slice(0, 300), seq); }
  outboxCount() { return this.q.countOut.get().n; }

  /** Cópia de segurança completa num arquivo (pode ser feita com o servidor funcionando). */
  backup(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) fs.unlinkSync(file);
    this.db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    return file;
  }

  close() { try { this.db.close(); } catch { /* já fechado */ } }
}

module.exports = { Store };
