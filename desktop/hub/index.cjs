// Central offline: guarda a loja no computador, atende a rede local e sincroniza com a nuvem.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { HubState } = require('./state.cjs');
const { createServer } = require('./server.cjs');
const { Mirror } = require('./mirror.cjs');
const { HubAuth } = require('./auth.cjs');
const { Credentials } = require('./credentials.cjs');
const { createClient } = require('@supabase/supabase-js');

const PORT = Number(process.env.OXYS_HUB_PORT || 8790);
const SYNC_MS = 20_000;
const SYNC_OFFLINE_MS = 5_000;  // sem internet tenta mais vezes, para voltar logo

function lanUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

class Hub {
  /** secure: criptografia do sistema operacional (Electron safeStorage) para o cofre de login. */
  constructor({ dataDir, uiDir, version, secure }) {
    this.configFile = path.join(dataDir, 'oxys-central-config.json');
    this.config = {};
    try { this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8')); } catch { /* sem central */ }
    this.state = new HubState(dataDir);
    // espelho da loja para as telas normais do sistema (avisa as telas abertas a cada mudança)
    this.publish = null;
    this.mirror = new Mirror(this.state, (change) => this.publish?.(change));
    this.credentials = new Credentials(dataDir, secure);
    this.auth = new HubAuth({
      credentials: this.credentials,
      cloud: () => (this.forceOffline ? null : { url: String(this.config.functionsUrl || '').replace(/\/functions\/v1\/.*$/, ''), apikey: this.config.apikey }),
      getConfig: () => this.config,
      saveConfig: (patch) => { this.config = { ...this.config, ...patch }; this.saveConfig(); },
      mirror: this.mirror,
    });
    this.uiDir = uiDir;
    this.version = version;
    this.online = false;
    this.lastError = null;
    this.server = null;
    this.timer = null;
    this.syncing = false;
    this.offlineFails = 0; // tentativas seguidas sem conseguir falar com a nuvem
    this.live = null;      // canal de avisos em tempo real da nuvem
    this.liveToken = null;
    this.liveTimer = null;
    // Para testar sem derrubar a internet: OXYS_FORCE_OFFLINE=1
    this.forceOffline = process.env.OXYS_FORCE_OFFLINE === '1';
  }

  get enabled() { return !!(this.config.key && this.config.restaurantId); }
  saveConfig() { fs.writeFileSync(this.configFile, JSON.stringify(this.config)); }

  status() {
    return {
      enabled: this.enabled, online: this.online, port: PORT, lanUrls: lanUrls(PORT),
      restaurantId: this.config.restaurantId || null, lastSyncAt: this.state.data.lastSyncAt,
      snapshotAt: this.state.data.snapshotAt, pendingOps: this.state.data.ops.length,
      failedOps: this.state.data.ops.filter(o => o.error).length, error: this.lastError,
    };
  }

  /** Liga esta máquina como central (chave criada pelo administrador no sistema). */
  activate({ key, restaurantId, functionsUrl, apikey }) {
    if (!/^[0-9a-f]{64}$/.test(key || '')) throw new Error('Chave inválida');
    if (this.config.restaurantId && this.config.restaurantId !== restaurantId) {
      // outra loja: começa do zero
      this.state.data = { ...this.state.data, snapshot: null, orders: {}, ops: [], printQueue: [], mirror: null, mirrorLocal: {}, mirrorPrints: [], sessions: {} };
      this.state.save(true);
      this.credentials.clear();
    }
    // segredo novo a cada ativação: sessões renovadas pela central antes disso deixam de valer
    const { salt, pinHash: _pin, ...rest } = this.config; // eslint-disable-line no-unused-vars
    this.config = { ...rest, key, restaurantId, functionsUrl, apikey, authSecret: crypto.randomBytes(32).toString('hex') };
    this.saveConfig();
    this.start();
    this.sync();
  }

  deactivate() {
    this.credentials.clear();
    this.stopLive();
    this.config = { devices: this.config.devices };
    this.saveConfig();
    this.stop();
  }

  setDevices(devices) {
    this.config.devices = devices && typeof devices === 'object' ? devices : {};
    this.saveConfig();
  }

  start() {
    if (!this.enabled) return;
    if (!this.server) {
      const { server, publish } = createServer({
        state: this.state, getConfig: () => this.config, uiDir: this.uiDir, getStatus: () => this.status(), mirror: this.mirror, auth: this.auth,
      });
      this.server = server;
      this.publish = publish;
      this.server.on('error', e => { this.lastError = `Porta ${PORT}: ${e.message}`; });
      this.server.listen(PORT, '0.0.0.0');
    }
    if (!this.timer) {
      const loop = async () => { await this.sync(); if (this.server) this.timer = setTimeout(loop, this.online ? SYNC_MS : SYNC_OFFLINE_MS); };
      this.timer = setTimeout(loop, SYNC_MS);
    }
  }

  // ---------- avisos em tempo real ----------
  /** Assina o canal da loja: cada mudança na nuvem dispara uma sincronização (agrupando rajadas). */
  startLive(token) {
    if (!token || this.forceOffline || (this.live && this.liveToken === token)) return;
    this.stopLive();
    const url = String(this.config.functionsUrl || '').replace(/\/functions\/v1\/.*$/, '');
    if (!url || !this.config.apikey) return;
    this.supabase = this.supabase || createClient(url, this.config.apikey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.liveToken = token;
    this.live = this.supabase.channel(`oxys-hub-${token}`, { config: { private: false } })
      .on('broadcast', { event: 'changed' }, () => {
        clearTimeout(this.liveTimer);
        this.liveTimer = setTimeout(() => this.sync(), 400);
      })
      .subscribe();
  }

  stopLive() {
    clearTimeout(this.liveTimer);
    if (this.live && this.supabase) this.supabase.removeChannel(this.live).catch(() => {});
    this.live = null;
    this.liveToken = null;
  }

  stop() {
    this.stopLive();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.server) this.server.close();
    this.server = null;
    this.publish = null;
  }

  async call(action, extra = {}) {
    if (this.forceOffline) throw new Error('offline (simulado)');
    const res = await fetch(this.config.functionsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-key': this.config.key, ...(this.config.apikey ? { apikey: this.config.apikey } : {}) },
      body: JSON.stringify({ action, ...extra }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
    return body;
  }

  /** Chave pública da nuvem: confere sem internet as sessões de quem já estava logado. */
  async refreshJwks() {
    if (this.config.jwksAt && Date.now() - this.config.jwksAt < 6 * 3600e3) return;
    try {
      const base = String(this.config.functionsUrl || '').replace(/\/functions\/v1\/.*$/, '');
      const res = await fetch(`${base}/auth/v1/.well-known/jwks.json`, { headers: { apikey: this.config.apikey || '' }, signal: AbortSignal.timeout(10_000) });
      const jwks = await res.json();
      if (res.ok && Array.isArray(jwks?.keys)) { this.config.jwks = jwks; this.config.jwksAt = Date.now(); this.saveConfig(); }
    } catch { /* tenta na próxima */ }
  }

  /** Envia o que foi feito offline (na ordem) e depois baixa o retrato atualizado da loja. */
  async sync() {
    if (!this.enabled) return;
    if (this.syncing) { this.again = true; return; } // chegou aviso no meio: sincroniza de novo em seguida
    this.syncing = true;
    const wasOnline = this.online;
    try {
      for (let round = 0; round < 10; round++) {
        const ops = this.state.opsToSend();
        if (!ops.length) break;
        const result = await this.call('push', { ops: ops.map(({ id, type, at, user_id, data }) => ({ id, type, at, user_id, data })) });
        this.state.afterPush(result);
        if (!(result.applied || []).length) break;
      }
      const info = { lanUrls: lanUrls(PORT), version: this.version, pendingOps: this.state.data.ops.length };
      const [{ snapshot, channelToken }, { replica }] = await Promise.all([this.call('snapshot', info), this.call('replica', info)]);
      this.state.applySnapshot(snapshot);
      this.credentials.takeFrom(replica.staff); // hash das senhas vai para o cofre, não para o espelho
      this.mirror.applyReplica(replica);
      this.startLive(channelToken);
      this.refreshJwks();
      this.online = true;
      this.offlineFails = 0;
      this.lastError = null;
    } catch (e) {
      if (e.status) {
        // A nuvem respondeu: há internet. Só falta de resposta conta como "sem internet".
        this.online = true;
        this.offlineFails = 0;
        if (e.status === 401) {
          // central apagada/desativada no sistema: desliga aqui também (senão a loja ficaria presa nela)
          this.lastError = 'Central desativada no sistema. Ative de novo para usar o modo offline.';
          this.revoked = true;
        } else {
          this.lastError = e.message;
        }
      } else {
        this.online = false;
        this.offlineFails += 1;
        this.lastError = null;
      }
    } finally {
      this.syncing = false;
      if (wasOnline !== this.online) this.state.changed();
      if (this.again) { this.again = false; setTimeout(() => this.sync(), 50); }
      if (this.revoked) { this.revoked = false; this.deactivate(); }
    }
  }
}

module.exports = { Hub, PORT };
