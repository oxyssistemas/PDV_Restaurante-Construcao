// Central offline: guarda a loja no computador, atende a rede local e sincroniza com a nuvem.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { HubState } = require('./state.cjs');
const { createServer, pinHash } = require('./server.cjs');

const PORT = Number(process.env.OXYS_HUB_PORT || 8790);
const SYNC_MS = 20_000;
const SYNC_OFFLINE_MS = 10_000; // sem internet tenta mais vezes, para voltar logo

function lanUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
  }
  return out;
}

class Hub {
  constructor({ dataDir, uiDir, version }) {
    this.configFile = path.join(dataDir, 'oxys-central-config.json');
    this.config = {};
    try { this.config = JSON.parse(fs.readFileSync(this.configFile, 'utf8')); } catch { /* sem central */ }
    this.state = new HubState(dataDir);
    this.uiDir = uiDir;
    this.version = version;
    this.online = false;
    this.lastError = null;
    this.server = null;
    this.timer = null;
    this.syncing = false;
    this.offlineFails = 0; // tentativas seguidas sem conseguir falar com a nuvem
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
  activate({ key, restaurantId, functionsUrl, apikey, pin }) {
    if (!/^[0-9a-f]{64}$/.test(key || '')) throw new Error('Chave inválida');
    if (!/^\d{4,8}$/.test(pin || '')) throw new Error('O PIN precisa ter de 4 a 8 números');
    if (this.config.restaurantId && this.config.restaurantId !== restaurantId) {
      // outra loja: começa do zero
      this.state.data = { ...this.state.data, snapshot: null, orders: {}, ops: [], printQueue: [] };
      this.state.save(true);
    }
    const salt = crypto.randomBytes(12).toString('hex');
    this.config = { ...this.config, key, restaurantId, functionsUrl, apikey, salt, pinHash: pinHash(pin, salt) };
    this.saveConfig();
    this.start();
    this.sync();
  }

  deactivate() {
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
      this.server = createServer({ state: this.state, getConfig: () => this.config, uiDir: this.uiDir, getStatus: () => this.status() });
      this.server.on('error', e => { this.lastError = `Porta ${PORT}: ${e.message}`; });
      this.server.listen(PORT, '0.0.0.0');
    }
    if (!this.timer) {
      const loop = async () => { await this.sync(); if (this.server) this.timer = setTimeout(loop, this.online ? SYNC_MS : SYNC_OFFLINE_MS); };
      this.timer = setTimeout(loop, SYNC_MS);
    }
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.server) this.server.close();
    this.server = null;
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

  /** Envia o que foi feito offline (na ordem) e depois baixa o retrato atualizado da loja. */
  async sync() {
    if (!this.enabled || this.syncing) return;
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
      const { snapshot } = await this.call('snapshot', { lanUrls: lanUrls(PORT), version: this.version, pendingOps: this.state.data.ops.length });
      this.state.applySnapshot(snapshot);
      this.online = true;
      this.offlineFails = 0;
      this.lastError = null;
    } catch (e) {
      this.online = false;
      this.offlineFails += 1;
      this.lastError = e.status === 401 ? 'Central desativada no sistema. Ative de novo.' : null;
    } finally {
      this.syncing = false;
      if (wasOnline !== this.online) this.state.changed();
    }
  }
}

module.exports = { Hub, PORT };
