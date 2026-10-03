// Cofre de login da central: para a equipe entrar sem internet com o email e a senha de sempre.
// Guarda só o hash bcrypt de cada senha (o mesmo que a nuvem guarda, nunca a senha) e a situação da conta,
// num arquivo separado do espelho, criptografado pelo sistema operacional (Electron safeStorage).

const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

class Credentials {
  /** secure: { encrypt(text) → Buffer, decrypt(Buffer) → text } do sistema operacional, quando disponível. */
  constructor(dir, secure) {
    this.file = path.join(dir, 'oxys-central-login.bin');
    this.secure = secure || null;
    this.byUser = {};
    try {
      const raw = fs.readFileSync(this.file);
      this.byUser = JSON.parse(this.secure ? this.secure.decrypt(raw) : raw.toString('utf8'));
    } catch { /* ainda não baixado */ }
  }

  get available() { return Object.keys(this.byUser).length > 0; }

  /** Tira os dados de login da lista da equipe (o espelho fica sem eles) e guarda no cofre. */
  takeFrom(staff) {
    if (!Array.isArray(staff) || !staff.some(s => 'password_hash' in s)) return; // nuvem ainda sem o login offline
    const next = {};
    for (const s of staff) {
      if (s.password_hash) {
        next[s.user_id] = { hash: s.password_hash, confirmed: !!s.confirmed, banned_until: s.banned_until || null, deleted: !!s.deleted };
      }
      delete s.password_hash; delete s.confirmed; delete s.banned_until; delete s.deleted;
    }
    if (JSON.stringify(next) === JSON.stringify(this.byUser)) return;
    this.byUser = next;
    const text = JSON.stringify(next);
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, this.secure ? this.secure.encrypt(text) : text, { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  clear() {
    this.byUser = {};
    try { fs.unlinkSync(this.file); } catch { /* não existia */ }
  }

  /** Confere a senha como a nuvem: conta confirmada, não bloqueada, não apagada e senha certa. */
  async check(userId, password) {
    const c = this.byUser[userId];
    if (!c || c.deleted || !c.confirmed) return false;
    if (c.banned_until && Date.parse(c.banned_until) > Date.now()) return false;
    try { return await bcrypt.compare(String(password || ''), c.hash); } catch { return false; }
  }
}

module.exports = { Credentials };
