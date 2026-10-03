// Login na central sem internet, no mesmo formato da nuvem (/auth/v1), para as telas normais funcionarem.
//
// - Quem já estava logado chega com a sessão da nuvem (token ES256, conferido com a chave pública guardada).
//   O "refresh token" vira  oxh.<token da nuvem>.<refresh da nuvem>  : a central renova sozinha e, quando a
//   internet volta, o aparelho devolve o refresh original para a nuvem.
// - Aparelho deslogado entra com o email e a senha de sempre: a central confere no cofre (credentials.cjs) e
//   emite a sessão (refresh "oxp."). Quando a internet volta, troca por uma sessão da nuvem (cloudSession), e a
//   pessoa continua logada sem digitar de novo.
// - Os tokens emitidos aqui são HS256 com um segredo só desta central.

const crypto = require('node:crypto');

const ACCESS_TTL = 3600;               // 1 h, como na nuvem
const HANDOFF_MAX_AGE = 7 * 24 * 3600;  // sessão da nuvem aceita até 7 dias depois de vencer
const HUB_REFRESH_TTL = 30 * 24 * 3600; // sessão aberta na central vale 30 dias
const EXCHANGE_TTL = 12 * 3600e3;       // senha guardada só na memória, para virar sessão da nuvem na volta

const OFFLINE_LOGIN = 'Sem internet no momento: a central ainda não recebeu os logins da equipe. Quem já estava logado continua usando o sistema normalmente.';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');

function decode(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    return { header: JSON.parse(fromB64u(parts[0])), payload: JSON.parse(fromB64u(parts[1])), signed: `${parts[0]}.${parts[1]}`, sig: fromB64u(parts[2]) };
  } catch { return null; }
}

class HubAuth {
  /**
   * @param getConfig  () => config da central (jwks, authSecret, pinHash, salt)
   * @param saveConfig (patch) => void
   * @param mirror     espelho (equipe da loja)
   * @param credentials cofre de login (hash das senhas)
   * @param cloud       () => { url, apikey } da nuvem principal
   */
  constructor({ getConfig, saveConfig, mirror, credentials, cloud }) {
    this.getConfig = getConfig;
    this.saveConfig = saveConfig;
    this.mirror = mirror;
    this.credentials = credentials;
    this.cloud = cloud || (() => null);
    this.pending = new Map();   // user_id → { email, password, at } (só na memória, para obter a sessão da nuvem)
    this.cloudSessions = new Map(); // user_id → { access, refresh, exp } sessão da nuvem da pessoa (só na memória)
  }

  /** Login na nuvem principal (email+senha ou renovação). */
  async cloudAuth(grant, body) {
    const c = this.cloud();
    if (!c?.url) return null;
    const res = await fetch(`${c.url}/auth/v1/token?grant_type=${grant}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.apikey || '' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    return res?.ok ? res.json() : null;
  }
  keepCloud(uid, s) {
    if (s?.access_token) this.cloudSessions.set(uid, { access: s.access_token, refresh: s.refresh_token, exp: s.expires_at || 0 });
    return s;
  }

  /**
   * Token da nuvem da própria pessoa, para o que continua na nuvem (dados do restaurante, equipe).
   * Usa o token que veio da nuvem, renova a sessão da nuvem trazida na troca ou entra com a senha digitada no
   * servidor. Sem internet: null.
   */
  async cloudToken(bearer) {
    const claims = this.verify(bearer);
    if (!claims) return null;
    if (claims.iss !== 'oxys-central' && claims.exp * 1000 > Date.now() + 30_000) return bearer; // já é da nuvem
    const s = this.cloudSessions.get(claims.sub);
    if (s?.access && s.exp * 1000 > Date.now() + 60_000) return s.access;
    if (s?.refresh) {
      const r = this.keepCloud(claims.sub, await this.cloudAuth('refresh_token', { refresh_token: s.refresh }));
      if (r) return r.access_token;
    }
    const p = this.pending.get(claims.sub);
    if (p) {
      const r = this.keepCloud(claims.sub, await this.cloudAuth('password', { email: p.email, password: p.password }));
      if (r) { this.pending.delete(claims.sub); return r.access_token; }
    }
    return null;
  }

  secret() {
    let s = this.getConfig().authSecret;
    if (!s) { s = crypto.randomBytes(32).toString('hex'); this.saveConfig({ authSecret: s }); }
    return s;
  }

  sign(payload) {
    const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: 'oxys-central' }));
    const body = b64u(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', this.secret()).update(`${head}.${body}`).digest();
    return `${head}.${body}.${b64u(sig)}`;
  }

  /** Confere a assinatura (nuvem ES256 ou central HS256). Não olha validade. */
  verifySignature(token) {
    const t = decode(token);
    if (!t) return null;
    if (t.header.alg === 'HS256' && t.header.kid === 'oxys-central') {
      const expect = crypto.createHmac('sha256', this.secret()).update(t.signed).digest();
      return expect.length === t.sig.length && crypto.timingSafeEqual(expect, t.sig) ? t.payload : null;
    }
    if (t.header.alg === 'ES256') {
      const jwk = (this.getConfig().jwks?.keys || []).find(k => k.kid === t.header.kid);
      if (!jwk) return null;
      try {
        const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
        return crypto.verify('sha256', Buffer.from(t.signed), { key, dsaEncoding: 'ieee-p1363' }, t.sig) ? t.payload : null;
      } catch { return null; }
    }
    return null;
  }

  /** Token de acesso válido de alguém da equipe → claims; senão null. */
  verify(token) {
    const claims = this.verifySignature(token);
    if (!claims || claims.typ === 'refresh' || !claims.sub) return null;
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    if (this.mirror.ready && !this.mirror.member(claims.sub)) return null;
    return claims;
  }

  user(claims) {
    return {
      id: claims.sub, aud: 'authenticated', role: 'authenticated', email: claims.email || '', phone: claims.phone || '',
      app_metadata: claims.app_metadata || { provider: 'email', providers: ['email'] }, user_metadata: claims.user_metadata || {},
      identities: [], is_anonymous: false, created_at: claims.user_created_at || new Date(0).toISOString(), updated_at: new Date().toISOString(),
    };
  }

  session(claims, refreshToken) {
    const now = Math.floor(Date.now() / 1000);
    const access = this.sign({
      aud: 'authenticated', role: 'authenticated', sub: claims.sub, email: claims.email, phone: claims.phone || '',
      app_metadata: claims.app_metadata || {}, user_metadata: claims.user_metadata || {}, iss: 'oxys-central',
      iat: now, exp: now + ACCESS_TTL, session_id: claims.session_id || null, aal: 'aal1',
    });
    return {
      access_token: access, token_type: 'bearer', expires_in: ACCESS_TTL, expires_at: now + ACCESS_TTL,
      refresh_token: refreshToken, user: this.user(claims),
    };
  }

  /** Renova pela central a sessão trazida da nuvem (oxh.<token da nuvem>.<refresh da nuvem>). */
  refresh(refreshToken) {
    const t = String(refreshToken || '');
    let claims = null;
    if (t.startsWith('oxh.')) {
      const jwt = t.split('.').slice(1, 4).join('.');
      const c = this.verifySignature(jwt);
      if (c && c.sub && (c.exp || 0) + HANDOFF_MAX_AGE > Date.now() / 1000) {
        claims = c;
        // guarda a sessão da nuvem trazida na troca (para o que continua na nuvem)
        if (!this.cloudSessions.has(c.sub)) this.cloudSessions.set(c.sub, { access: jwt, refresh: t.split('.').slice(4).join('.'), exp: c.exp || 0 });
      }
    } else if (t.startsWith('oxp.')) {
      const c = this.verifySignature(t.slice(4));
      if (c && c.typ === 'refresh' && c.iss === 'oxys-central' && c.exp * 1000 > Date.now()) claims = c;
    }
    if (!claims || (this.mirror.ready && !this.mirror.member(claims.sub))) return null;
    return this.session(claims, t);
  }

  /** Email e senha de sempre, conferidos no cofre da central. */
  async login(email, password) {
    const member = this.mirror.staff.find(s => String(s.email || '').toLowerCase() === String(email || '').trim().toLowerCase());
    if (!this.credentials?.available) return { status: 503, code: 'offline_login', error: OFFLINE_LOGIN };
    if (!member || !(await this.credentials.check(member.user_id, password))) {
      return { status: 400, code: 'invalid_credentials', error: 'Invalid login credentials' };
    }
    const claims = {
      sub: member.user_id, email: member.email, user_created_at: member.created_at,
      app_metadata: member.app_metadata || { provider: 'email', providers: ['email'] }, user_metadata: member.user_metadata || {},
    };
    const now = Math.floor(Date.now() / 1000);
    const refresh = `oxp.${this.sign({ ...claims, typ: 'refresh', iss: 'oxys-central', iat: now, exp: now + HUB_REFRESH_TTL })}`;
    this.pending.set(member.user_id, { email: member.email, password: String(password), at: Date.now() });
    return { session: this.session(claims, refresh) };
  }

  /**
   * Volta para a nuvem de quem entrou pela central: troca pela sessão da nuvem (com internet), usando a senha
   * que ficou só na memória desde o login. Depois disso a senha é esquecida.
   */
  async cloudSession(token) {
    const claims = this.verify(token);
    if (!claims) return null;
    for (const [id, p] of this.pending) if (Date.now() - p.at > EXCHANGE_TTL) this.pending.delete(id);
    const p = this.pending.get(claims.sub);
    if (!p) return null;
    const session = await this.cloudAuth('password', { email: p.email, password: p.password });
    if (session) this.pending.delete(claims.sub);
    return session;
  }

  /** Rotas /auth/v1/* */
  async handle(req, res, url, readBody, send) {
    const route = url.pathname.replace(/^\/auth\/v1/, '');
    const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const fail = (status, code, message) => send(res, status, { code: status, error_code: code, msg: message, error: code, error_description: message });

    if (route === '/health') return send(res, 200, { name: 'oxys-central', description: 'Central offline' });
    if (route === '/settings') return send(res, 200, { external: { email: true }, disable_signup: true, mailer_autoconfirm: true });
    if (route === '/token' && req.method === 'POST') {
      const body = await readBody(req);
      const grant = url.searchParams.get('grant_type');
      if (grant === 'refresh_token') {
        const s = this.refresh(body.refresh_token);
        return s ? send(res, 200, s) : fail(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      }
      if (grant === 'password') {
        const r = await this.login(body.email, body.password);
        return r.session ? send(res, 200, r.session) : fail(r.status, r.code, r.error);
      }
      return fail(503, 'offline', 'Disponível quando a internet voltar.');
    }
    if (route === '/user' && req.method === 'GET') {
      const claims = this.verify(bearer);
      return claims ? send(res, 200, this.user(claims)) : fail(401, 'bad_jwt', 'invalid JWT');
    }
    if (route === '/logout') { res.writeHead(204); return res.end(); }
    return fail(503, 'offline', 'Disponível quando a internet voltar.');
  }
}

module.exports = { HubAuth };
