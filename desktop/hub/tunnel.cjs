// Acesso ao servidor da loja pela internet com o cloudflared (túnel seguro da Cloudflare): o servidor abre a
// conexão para fora, então não é preciso abrir portas no roteador nem ter IP fixo.
//  - rápido: endereço automático *.trycloudflare.com (muda quando o servidor reinicia; a nuvem é avisada e
//    encaminha a equipe para o endereço novo). Bom para começar e testar.
//  - token: túnel nomeado criado na conta Cloudflare, com endereço fixo (ex.: loja.oxysrestaurante.app).

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

class Tunnel {
  constructor({ binDir, port, onUrl }) {
    this.binDir = binDir;
    this.port = port;
    this.onUrl = onUrl || (() => {});
    this.proc = null;
    this.url = null;
    this.error = null;
    this.opts = null;
    this.retry = null;
    this.backoff = 5000;
  }

  get running() { return !!this.proc; }

  binary() {
    const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    const candidates = [this.binDir && path.join(this.binDir, name), process.env.OXYS_CLOUDFLARED].filter(Boolean);
    return candidates.find(f => fs.existsSync(f)) || null;
  }

  start(opts) {
    this.stop();
    this.opts = opts;
    const bin = this.binary();
    if (!bin) { this.error = 'Componente do túnel (cloudflared) não encontrado nesta instalação.'; return; }
    const args = opts.token
      ? ['tunnel', '--no-autoupdate', 'run', '--token', opts.token]
      : ['tunnel', '--no-autoupdate', '--url', `http://localhost:${this.port}`];
    this.error = null;
    if (opts.token) this.setUrl(opts.publicUrl);
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.proc = proc;
    const read = (buf) => {
      const text = String(buf);
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !opts.token) this.setUrl(m[0]);
      if (/Registered tunnel connection/i.test(text)) { this.backoff = 5000; this.error = null; }
      if (/error|failed/i.test(text) && !/Retrying|retry/i.test(text)) this.error = text.trim().split('\n').pop().slice(0, 200);
    };
    proc.stdout.on('data', read);
    proc.stderr.on('data', read);
    proc.on('exit', (code) => {
      if (this.proc !== proc) return; // foi parado de propósito
      this.proc = null;
      if (!opts.token) this.setUrl(null);
      this.error = `Túnel parou (código ${code}). Tentando de novo...`;
      // tenta de novo, esperando cada vez mais (até 5 min)
      this.retry = setTimeout(() => this.start(this.opts), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 300_000);
    });
  }

  setUrl(url) {
    if (this.url === url) return;
    this.url = url || null;
    this.onUrl(this.url);
  }

  stop() {
    clearTimeout(this.retry);
    const p = this.proc;
    this.proc = null;
    if (p) { try { p.kill(); } catch { /* já parou */ } }
    this.setUrl(null);
  }
}

module.exports = { Tunnel };
