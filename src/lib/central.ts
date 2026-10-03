import type { Session } from '@supabase/supabase-js';
import { PUBLIC_ORIGIN } from '@/lib/native';

/**
 * Modo offline com as mesmas telas: sem internet o sistema abre pela central (computador do caixa), que responde
 * como a nuvem. Aqui ficam a detecção ("estou rodando pela central?") e a passagem da sessão entre nuvem e central,
 * para ninguém precisar entrar de novo na troca.
 */

/**
 * A central offline e o servidor dedicado entregam o app com <meta name="oxys-central" content="central|dedicated">.
 * - central: espelho da nuvem para quando a internet cai (volta para a nuvem depois)
 * - dedicated: servidor dedicado da loja, que é o banco principal dela (a equipe fica nele)
 */
const META = typeof document !== 'undefined' ? document.querySelector('meta[name="oxys-central"]')?.getAttribute('content') ?? null : null;
export const IS_CENTRAL = META !== null;
export const IS_DEDICATED = META === 'dedicated';

/** Mesma chave nos dois lados (na central o endereço é um IP, que geraria outra chave). */
export const AUTH_STORAGE_KEY = `sb-${new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

const HANDOFF = 'oxys-handoff';
const CLOUD_KEY = 'oxys.cloud.origin';

const encode = (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const decode = (text: string) => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))));
};

/** Endereço do sistema na nuvem (para voltar quando a internet voltar). */
export function cloudOrigin() {
  try { return localStorage.getItem(CLOUD_KEY) || PUBLIC_ORIGIN; } catch { return PUBLIC_ORIGIN; }
}

/** Chamado antes de criar o cliente do Supabase: guarda a sessão que veio no endereço e limpa o endereço. */
export function takeHandoff() {
  if (typeof window === 'undefined') return;
  const match = window.location.hash.match(new RegExp(`[#&]${HANDOFF}=([^&]+)`));
  if (!match) return;
  try {
    const { s, from } = decode(match[1]);
    if (s?.refresh_token) localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(s));
    if (from && IS_CENTRAL) localStorage.setItem(CLOUD_KEY, from);
  } catch { /* endereço inválido: segue sem sessão */ }
  const rest = window.location.hash.replace(match[0], '').replace(/^#?&?/, '');
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + (rest ? `#${rest}` : ''));
}

/**
 * Endereço para trocar de lado mantendo a mesma tela e a mesma pessoa logada.
 * - nuvem → central: a central confere o token da nuvem; o refresh vira "oxh.<token>.<refresh>" para a central renovar.
 * - central → nuvem: devolve o refresh original, já vencido, e a nuvem renova na hora.
 * - quem entrou pela central: a central já trocou por uma sessão da nuvem (cloudSession), que vai direto.
 */
export function switchUrl(target: string, session: Session | null, cloudSession?: Session | null) {
  const path = window.location.pathname + window.location.search;
  let s: Record<string, unknown> | null = null;
  if (cloudSession) {
    s = { ...cloudSession };
  } else if (session && IS_DEDICATED) {
    s = { ...session }; // outro endereço do mesmo servidor (ex.: rede da loja): a sessão vale igual
  } else if (session) {
    if (!IS_CENTRAL) {
      s = { ...session, refresh_token: `oxh.${session.access_token}.${session.refresh_token}` };
    } else if (session.refresh_token.startsWith('oxh.')) {
      const parts = session.refresh_token.split('.');
      s = { ...session, access_token: parts.slice(1, 4).join('.'), refresh_token: parts.slice(4).join('.'), expires_at: 0, expires_in: 0 };
    }
  }
  const from = IS_CENTRAL ? undefined : window.location.origin;
  return `${target.replace(/\/$/, '')}${path}${s ? `#${HANDOFF}=${encode({ s, from })}` : ''}`;
}
