import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CloudOff } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { desktop } from '@/lib/desktop';
import { cloudOrigin, IS_CENTRAL, IS_DEDICATED, switchUrl } from '@/lib/central';

const KEY = 'oxys.hub.urls';
const PUBLIC = /^\/(pedir|mesa|privacidade|termos|login)(\/|$)/;
const loadUrls = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

/** Troca de lado (nuvem ⇄ central) na mesma tela e com a mesma pessoa logada. */
export async function switchTo(target: string) {
  const { data: { session } } = await supabase.auth.getSession();
  // Entrou pela central (sem internet)? A central troca por uma sessão da nuvem para continuar logado.
  let cloudSession: Session | null = null;
  if (IS_CENTRAL && session?.refresh_token.startsWith('oxp.')) {
    cloudSession = await fetch('/api/cloud-session', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } })
      .then(r => (r.ok ? r.json() : null)).catch(() => null);
  }
  window.location.href = switchUrl(target, session, cloudSession);
}

declare global {
  // O app de computador chama isso na central quando a internet cai (desktop/main.cjs).
  interface Window { oxysGoCentral?: (url: string) => boolean }
}

/**
 * A nuvem responde? Confere a cada 5 s; muda de estado só depois de 2 respostas iguais seguidas,
 * para não ficar trocando por uma oscilação rápida da internet.
 */
function useCloudReachable() {
  const [reachable, setReachable] = useState(true);
  useEffect(() => {
    let fails = 0, oks = 0;
    const ping = async () => {
      let ok = false;
      try {
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(4000), cache: 'no-store',
        });
        ok = r.ok;
      } catch { ok = false; }
      if (ok) { oks += 1; fails = 0; } else { fails += 1; oks = 0; }
      if (fails >= 2) setReachable(false);
      if (oks >= 2 || (!IS_CENTRAL && ok)) setReachable(true);
    };
    if (IS_CENTRAL) setReachable(false);
    ping();
    const t = setInterval(ping, 5000);
    window.addEventListener('offline', ping);
    window.addEventListener('online', ping);
    return () => { clearInterval(t); window.removeEventListener('offline', ping); window.removeEventListener('online', ping); };
  }, []);
  return reachable;
}

/** Troca uma vez só (a página muda de endereço logo em seguida). */
function useSwitchOnce(when: boolean, target: string | null) {
  const done = useRef(false);
  useEffect(() => {
    if (!when || !target || done.current) return;
    done.current = true;
    switchTo(target);
  }, [when, target]);
}

export default function OfflineBanner() {
  if (IS_DEDICATED) return <DedicatedBanner />;
  return IS_CENTRAL ? <CentralBanner /> : <CloudBanner />;
}

type ServerInfo = { online: boolean; suspended: boolean; lanUrls: string[] };
const LAN_KEY = 'oxys.server.lan';

/**
 * No servidor dedicado da loja: a equipe fica sempre nele. Se o endereço da internet (túnel) cair, passa na hora
 * para o endereço da rede da loja; avisa quando o próprio servidor está sem internet (integrações esperam).
 */
function DedicatedBanner() {
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let fails = 0;
    const load = () => fetch('/api/hello', { cache: 'no-store', signal: AbortSignal.timeout(4000) }).then(r => r.json())
      .then(d => {
        fails = 0; setDown(false);
        const lan = (d.lanUrls ?? []) as string[];
        setInfo({ online: !!d.online, suspended: !!d.suspended, lanUrls: lan });
        try { localStorage.setItem(LAN_KEY, JSON.stringify(lan)); } catch { /* sem armazenamento */ }
      })
      .catch(() => { fails += 1; if (fails >= 2) setDown(true); });
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  // endereço da internet caiu: vai para o da rede da loja (o servidor continua o mesmo)
  const lan = (() => { try { return (JSON.parse(localStorage.getItem(LAN_KEY) || '[]') as string[]).filter(u => !u.startsWith(window.location.origin)); } catch { return []; } })();
  useSwitchOnce(down && lan.length > 0, lan[0] ?? null);

  if (info?.suspended) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-red-500/40 bg-[#1c0606]/95 px-4 py-3 text-sm text-red-200 backdrop-blur">
        <div className="mx-auto max-w-5xl"><b className="text-red-300">Servidor dedicado desativado.</b> Fale com o suporte Oxys para reativar.</div>
      </div>
    );
  }
  if (down && !lan.length) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-amber-500/40 bg-[#1c1404]/95 px-4 py-3 text-sm backdrop-blur">
        <div className="mx-auto max-w-5xl"><b className="text-amber-300">Sem conexão com o servidor da loja.</b> Confira a internet ou a rede da loja.</div>
      </div>
    );
  }
  if (!info || info.online) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-[100] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-amber-500/40 bg-[#1c1404]/90 px-3 py-1.5 text-xs text-amber-200 shadow-lg backdrop-blur">
      <CloudOff className="mr-1.5 inline h-3.5 w-3.5 text-amber-300" />
      <b className="text-amber-300">Servidor da loja sem internet</b> · tudo funciona normalmente; NFC-e, iFood, WhatsApp e loja online voltam com a internet
    </div>
  );
}

/**
 * Na nuvem: internet caiu → passa na hora para a central da loja, na mesma tela e com a mesma pessoa logada.
 * Os endereços da central são guardados enquanto há internet, para funcionar justamente quando ela cair.
 */
function CloudBanner() {
  const { currentRole } = useAuth();
  const { pathname } = useLocation();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const [urls, setUrls] = useState<string[]>(loadUrls);
  const [isHub, setIsHub] = useState(false);
  const reachable = useCloudReachable();

  useEffect(() => {
    if (!restaurantId) return;
    supabase.from('offline_hubs').select('lan_urls').eq('restaurant_id', restaurantId).maybeSingle().then(({ data, error }) => {
      if (error) return; // sem internet: fica com os endereços guardados
      const list = data?.lan_urls ?? [];
      setUrls(list);
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ }
    });
    desktop?.hubStatus?.().then(s => setIsHub(!!s.enabled)).catch(() => {});
  }, [restaurantId]);

  // O app de computador da central também pode pedir a troca (desktop/main.cjs).
  useEffect(() => {
    window.oxysGoCentral = (url: string) => { switchTo(url); return true; };
    return () => { delete window.oxysGoCentral; };
  }, []);

  const offline = !reachable && !PUBLIC.test(pathname) && !!restaurantId;
  // no próprio computador da central, ela mesma
  const target = isHub ? 'http://localhost:8790' : urls[0] ?? null;
  useSwitchOnce(offline, target);

  if (!offline || target) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-amber-500/40 bg-[#1c1404]/95 px-4 py-3 text-sm backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3">
        <CloudOff className="h-5 w-5 shrink-0 text-amber-400" />
        <p className="min-w-0 flex-1">
          <b className="text-amber-300">Sem internet.</b>{' '}
          A loja não tem central offline ativada, então o sistema só volta a funcionar com a internet. O administrador ativa a central no app de computador (Estação de impressão).
        </p>
      </div>
    </div>
  );
}

type CentralInfo = { online: boolean; pendingOps: number };

/**
 * Na central: avisa que está sem internet (e o que fica para depois) e volta na hora para a nuvem quando a
 * internet voltar — depois que a central enviou tudo e este aparelho também alcança a nuvem.
 */
function CentralBanner() {
  const [info, setInfo] = useState<CentralInfo | null>(null);
  const reachable = useCloudReachable();

  useEffect(() => {
    const load = () => fetch('/api/hello', { cache: 'no-store' }).then(r => r.json())
      .then(d => setInfo({ online: !!d.online, pendingOps: Number(d.pendingOps || 0) })).catch(() => {});
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, []);

  const back = !!info?.online && info.pendingOps === 0 && reachable;
  useSwitchOnce(back, cloudOrigin());

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-[100] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-amber-500/40 bg-[#1c1404]/90 px-3 py-1.5 text-xs text-amber-200 shadow-lg backdrop-blur">
      <CloudOff className="mr-1.5 inline h-3.5 w-3.5 text-amber-300" />
      <b className="text-amber-300">Sem internet</b> · tudo funciona normalmente; NFC-e, iFood, WhatsApp e loja online voltam com a internet
      {info && info.pendingOps > 0 && <span className="text-amber-200/80"> · {info.pendingOps} para enviar</span>}
    </div>
  );
}
