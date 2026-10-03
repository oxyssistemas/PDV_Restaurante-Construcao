// Servidor dedicado da loja ("Oxys Servidor"): o banco principal daquela loja fica neste computador.
// A nuvem guarda só o controle (restaurante, plano, equipe e login) e o endereço do servidor; os dados da operação
// (pedidos, cardápio, clientes, caixa, estoque, financeiro...) ficam aqui, num SQLite, e as telas normais do
// sistema falam com este servidor pela rede da loja e, pelo túnel seguro, pela internet.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { HubState } = require('./state.cjs');
const { Store } = require('./store.cjs');
const { Mirror } = require('./mirror.cjs');
const { HubAuth } = require('./auth.cjs');
const { Credentials } = require('./credentials.cjs');
const { createServer } = require('./server.cjs');
const { Tunnel } = require('./tunnel.cjs');
const { OwnSupabase } = require('./ownsupabase.cjs');

const PORT = Number(process.env.OXYS_SERVER_PORT || 8790);
const CONTROL_MS = 60_000;            // equipe / plano / situação
const SCHEMA_MS = 6 * 3600e3;         // estrutura e regras de acesso
const BACKUP_KEEP = 7;                // cópias diárias guardadas

function lanUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

class DedicatedServer {
  /**
   * dataDir: pasta de dados do app; uiDir: o sistema (dist); secure: criptografia do sistema operacional;
   * cloudUrl / apikey: a nuvem principal (controle); binDir: onde fica o cloudflared.
   */
  constructor({ dataDir, uiDir, version, secure, cloudUrl, apikey, binDir }) {
    this.dataDir = dataDir;
    this.uiDir = uiDir;
    this.version = version;
    this.secure = secure || null;
    this.cloudUrl = String(cloudUrl || '').replace(/\/$/, '');
    this.apikey = apikey;
    this.configFile = path.join(dataDir, 'oxys-servidor-config.json');
    this.config = {};
    try { this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8')); } catch { /* ainda não ativado */ }

    this.state = new HubState(dataDir);
    this.store = new Store(dataDir);
    this.publish = null;
    this.mirror = new Mirror(this.state, (c) => this.publish?.(c), { store: this.store });
    this.credentials = new Credentials(dataDir, this.secure);
    this.auth = new HubAuth({
      getConfig: () => this.config,
      saveConfig: (patch) => { this.config = { ...this.config, ...patch }; this.saveConfig(); },
      mirror: this.mirror,
      credentials: this.credentials,
      cloud: () => ({ url: this.cloudUrl, apikey: this.apikey }),
    });
    this.tunnel = new Tunnel({ binDir, port: PORT, onUrl: () => this.control().catch(() => {}) });
    this.own = new OwnSupabase({ store: this.store, mirror: this.mirror, getSecret: () => this.ownSecret(), setStatus: () => this.state.changed() });

    this.online = false;          // alcança a nuvem principal?
    this.suspended = false;       // super admin desativou o recurso
    this.lastError = null;
    this.migration = null;        // { table, done, total, rows } durante a migração
    this.server = null;
    this.timers = [];
  }

  saveConfig() {
    const tmp = `${this.configFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.config, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.configFile);
  }
  get activated() { return !!(this.config.key && this.config.restaurantId); }

  // ---------- segredos guardados com a criptografia do sistema ----------
  seal(text) { return this.secure ? this.secure.encrypt(text).toString('base64') : Buffer.from(text).toString('base64'); }
  unseal(b64) { try { return this.secure ? this.secure.decrypt(Buffer.from(b64, 'base64')) : Buffer.from(b64, 'base64').toString('utf8'); } catch { return null; } }
  ownSecret() {
    const o = this.config.ownSupabase;
    return o?.url && o?.key ? { url: o.url, key: this.unseal(o.key) } : null;
  }

  status() {
    return {
      mode: 'dedicated', activated: this.activated, restaurantId: this.config.restaurantId || null, restaurantName: this.config.restaurantName || null,
      ready: this.mirror.ready, online: this.online, suspended: this.suspended, error: this.lastError, migration: this.migration,
      port: PORT, lanUrls: lanUrls(PORT), publicUrl: this.tunnel.url || this.config.tunnel?.publicUrl || null,
      tunnel: { mode: this.config.tunnel?.mode || 'quick', running: this.tunnel.running, error: this.tunnel.error },
      ownSupabase: { url: this.config.ownSupabase?.url || null, ...this.own.status() },
      lastBackupAt: this.config.lastBackupAt || null, records: Object.values(this.mirror.local.rows).reduce((s, l) => s + l.length, 0),
      pendingOps: 0, version: this.version,
    };
  }

  // ---------- nuvem principal ----------
  async call(action, extra = {}, { key = this.config.key, timeout = 20_000 } = {}) {
    const res = await fetch(`${this.cloudUrl}/functions/v1/dedicated-server`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: this.apikey, ...(key ? { 'x-server-key': key } : {}) },
      body: JSON.stringify({ action, ...extra }),
      signal: AbortSignal.timeout(timeout),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
    return body;
  }

  /** Ativa com o código gerado pelo super admin e, na primeira vez, traz os dados da loja. */
  async activate(code) {
    const r = await this.call('activate', { code, lanUrls: lanUrls(PORT), version: this.version }, { key: null });
    if (this.config.restaurantId && this.config.restaurantId !== r.restaurantId) {
      throw new Error('Este servidor já pertence a outra loja. Use um computador novo ou reinstale o servidor.');
    }
    this.config = { ...this.config, key: r.key, restaurantId: r.restaurantId, restaurantName: r.restaurantName, activatedAt: new Date().toISOString() };
    if (!this.config.authSecret) this.config.authSecret = crypto.randomBytes(32).toString('hex');
    this.saveConfig();
    await this.refreshSchema(true);
    await this.control();
    if (!r.migrated || !this.mirror.ready) await this.migrate();
    this.start();
    return this.status();
  }

  /** Copia da nuvem todo o histórico da loja, tabela por tabela. */
  async migrate() {
    const tables = this.mirror.local.tables;
    let total = 0;
    this.migration = { table: null, done: 0, total: tables.length, rows: 0 };
    this.state.changed();
    for (const table of tables) {
      this.migration.table = table;
      const rows = [];
      for (let offset = 0; ; offset += 1000) {
        const page = await this.call('export', { table, offset, limit: 1000 }, { timeout: 60_000 });
        rows.push(...page.rows);
        if (page.rows.length < 1000) break;
      }
      this.mirror.importTable(table, rows);
      total += rows.length;
      this.migration = { ...this.migration, done: this.migration.done + 1, rows: total };
      this.state.changed();
    }
    this.mirror.finishImport();
    await this.call('migrated', { rows: total });
    this.migration = null;
    this.state.changed();
    return total;
  }

  async refreshSchema(force = false) {
    if (!force && this.config.schemaAt && Date.now() - this.config.schemaAt < SCHEMA_MS) return;
    const schema = await this.call('schema');
    this.mirror.applySchema(schema);
    this.config.schemaAt = Date.now();
    this.saveConfig();
  }

  /** Restaurante, plano, equipe e login; avisa a nuvem do endereço e da versão. */
  async control() {
    if (!this.activated) return;
    try {
      const ctl = await this.call('control', {
        publicUrl: this.tunnel.url || this.config.tunnel?.publicUrl || null, lanUrls: lanUrls(PORT), version: this.version,
        ownSupabaseUrl: this.config.ownSupabase?.url || null,
      });
      this.credentials.takeFrom(ctl.staff); // hash das senhas vai para o cofre criptografado
      this.mirror.applyControl(ctl);
      this.suspended = !ctl.enabled;
      this.online = true;
      this.lastError = null;
      await this.refreshSchema().catch(() => {});
      await this.refreshJwks();
    } catch (e) {
      this.online = false;
      this.lastError = e.status === 401 ? 'Servidor desligado no sistema. Ative de novo com um código novo.' : null;
      if (e.status === 401) this.suspended = true;
    }
    this.state.changed();
  }

  async refreshJwks() {
    if (this.config.jwksAt && Date.now() - this.config.jwksAt < 6 * 3600e3) return;
    const res = await fetch(`${this.cloudUrl}/auth/v1/.well-known/jwks.json`, { headers: { apikey: this.apikey }, signal: AbortSignal.timeout(10_000) });
    const jwks = await res.json();
    if (res.ok && Array.isArray(jwks?.keys)) { this.config.jwks = jwks; this.config.jwksAt = Date.now(); this.saveConfig(); }
  }

  // ---------- funcionamento ----------
  start() {
    if (!this.server) {
      const { server, publish } = createServer({
        state: this.state, getConfig: () => this.config, uiDir: this.uiDir, getStatus: () => this.status(),
        mirror: this.mirror, auth: this.auth, mode: 'dedicated', isSuspended: () => this.suspended,
        cloudProxy: { url: this.cloudUrl, apikey: this.apikey, afterWrite: () => setTimeout(() => this.control(), 300) },
      });
      this.server = server;
      this.publish = publish;
      this.server.on('error', e => { this.lastError = `Porta ${PORT}: ${e.message}`; });
      this.server.listen(PORT, '0.0.0.0');
    }
    if (!this.activated || this.timers.length) return;
    this.applyTunnel();
    this.own.configure(!!this.ownSecret());
    const every = (ms, fn) => { const t = setInterval(fn, ms); t.unref?.(); this.timers.push(t); };
    every(CONTROL_MS, () => this.control());
    every(3600e3, () => this.dailyBackup());
    this.control();
    this.dailyBackup();
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.tunnel.stop();
    this.own.stop();
    if (this.server) this.server.close();
    this.server = null;
    this.publish = null;
  }

  // ---------- acesso pela internet (túnel seguro, sem abrir portas no roteador) ----------
  /** mode: 'quick' (endereço automático), 'token' (túnel nomeado da Cloudflare, endereço fixo) ou 'off'. */
  setTunnel({ mode, token, publicUrl }) {
    const t = { mode: ['quick', 'token', 'off'].includes(mode) ? mode : 'quick' };
    if (t.mode === 'token') {
      if (token) t.token = this.seal(String(token).trim());
      else if (this.config.tunnel?.token) t.token = this.config.tunnel.token;
      if (!t.token) throw new Error('Cole o token do túnel da Cloudflare.');
      if (!/^https:\/\/[\w.-]+\/?$/.test(publicUrl || '')) throw new Error('Informe o endereço público (https://...) configurado no túnel.');
      t.publicUrl = publicUrl.replace(/\/$/, '');
    }
    this.config.tunnel = t;
    this.saveConfig();
    this.applyTunnel();
    this.control();
    return this.status();
  }
  applyTunnel() {
    const t = this.config.tunnel || { mode: 'quick' };
    if (t.mode === 'off') this.tunnel.stop();
    else if (t.mode === 'token') this.tunnel.start({ token: this.unseal(t.token), publicUrl: t.publicUrl });
    else this.tunnel.start({});
  }

  // ---------- Supabase próprio da loja (cópia exclusiva de todos os dados) ----------
  async setOwnSupabase({ url, key }) {
    if (!url) { this.config.ownSupabase = null; this.saveConfig(); this.own.configure(false); this.control(); return this.status(); }
    if (!/^https:\/\/[\w.-]+\/?$/.test(url)) throw new Error('Endereço inválido (ex.: https://xxxx.supabase.co).');
    const clean = url.replace(/\/$/, '');
    const secret = key ? String(key).trim() : this.ownSecret()?.key;
    if (!secret) throw new Error('Cole a chave service_role do Supabase da loja.');
    await OwnSupabase.check(clean, secret); // confere a conexão e a estrutura antes de salvar
    this.config.ownSupabase = { url: clean, key: this.seal(secret) };
    this.saveConfig();
    this.own.configure(true, { fullSync: true });
    this.control();
    return this.status();
  }

  // ---------- cópias de segurança ----------
  backupDir() { return path.join(this.dataDir, 'backups'); }
  backupNow() {
    const name = `oxys-servidor-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`;
    const file = this.store.backup(path.join(this.backupDir(), name));
    const all = fs.readdirSync(this.backupDir()).filter(f => f.endsWith('.db')).sort();
    for (const f of all.slice(0, Math.max(0, all.length - BACKUP_KEEP))) fs.unlinkSync(path.join(this.backupDir(), f));
    this.config.lastBackupAt = new Date().toISOString();
    this.saveConfig();
    this.state.changed();
    return file;
  }
  dailyBackup() {
    if (!this.mirror.ready) return;
    if (this.config.lastBackupAt && Date.now() - Date.parse(this.config.lastBackupAt) < 24 * 3600e3) return;
    try { this.backupNow(); } catch (e) { this.lastError = `Cópia de segurança: ${e.message}`; }
  }
}

module.exports = { DedicatedServer, PORT };
