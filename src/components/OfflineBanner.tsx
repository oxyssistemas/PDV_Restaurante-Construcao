import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CloudOff, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { desktop } from '@/lib/desktop';

const KEY = 'oxys.hub.urls';
const PUBLIC = /^\/(pedir|mesa|privacidade|termos|login)(\/|$)/;
const COUNTDOWN = 5;
const loadUrls = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

/**
 * Internet caiu → vai sozinho para o modo offline (a central no computador do caixa), com 5 s para cancelar.
 * Os endereços da central são guardados enquanto há internet, para funcionar justamente quando ela cair.
 * No próprio computador da central quem troca é o app (desktop/main.cjs).
 */
export default function OfflineBanner() {
  const { currentRole } = useAuth();
  const { pathname } = useLocation();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const [urls, setUrls] = useState<string[]>(loadUrls);
  const [offline, setOffline] = useState(false);
  const [isHub, setIsHub] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [stay, setStay] = useState(false);

  // Endereços da central (com internet).
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

  // "Sem internet" = a nuvem não responde duas vezes seguidas (≈30 s); evita trocar por uma oscilação.
  useEffect(() => {
    let fails = 0;
    const ping = async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(8000), cache: 'no-store',
        });
        fails = r.ok ? 0 : fails + 1;
      } catch { fails += 1; }
      setOffline(fails >= 2);
      if (fails === 0) setStay(false);
    };
    const t = setInterval(ping, 15_000);
    const goneOffline = () => ping();
    window.addEventListener('offline', goneOffline);
    window.addEventListener('online', goneOffline);
    return () => { clearInterval(t); window.removeEventListener('offline', goneOffline); window.removeEventListener('online', goneOffline); };
  }, []);

  const visible = offline && !PUBLIC.test(pathname) && !!restaurantId;
  const target = isHub ? null : urls[0] ?? null; // na central o próprio app troca
  const go = (u: string) => { window.location.href = `${u}/?auto=1&voltar=${encodeURIComponent(window.location.href)}`; };

  // Contagem regressiva para entrar sozinho.
  useEffect(() => {
    if (!visible || !target || stay) { setLeft(null); return; }
    setLeft(COUNTDOWN);
    const t = setInterval(() => setLeft(n => (n === null ? null : n - 1)), 1000);
    return () => clearInterval(t);
  }, [visible, target, stay]);
  useEffect(() => { if (left !== null && left <= 0 && target) go(target); }, [left, target]);

  if (!visible) return null;
  const targets = isHub ? ['http://localhost:8790'] : urls;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-amber-500/40 bg-[#1c1404]/95 px-4 py-3 text-sm backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        <CloudOff className="h-5 w-5 shrink-0 text-amber-400" />
        <p className="min-w-0 flex-1">
          <b className="text-amber-300">Sem internet.</b>{' '}
          {!targets.length
            ? 'A loja não tem central offline ativada. O administrador ativa no app de computador (Estação de impressão).'
            : left !== null
              ? `Entrando no modo offline em ${left}s — os pedidos vão para a nuvem quando a internet voltar.`
              : 'Continue pelo modo offline — os pedidos vão para a nuvem quando a internet voltar.'}
        </p>
        {targets.slice(0, 1).map(u => (
          <button key={u} type="button" onClick={() => go(u)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-black hover:bg-amber-300">
            {left !== null ? 'Entrar agora' : 'Abrir modo offline'} <ExternalLink className="h-3.5 w-3.5" />
          </button>
        ))}
        {left !== null && (
          <button type="button" onClick={() => setStay(true)} className="rounded-lg px-3 py-1.5 font-semibold text-amber-200 hover:bg-white/10">Ficar aqui</button>
        )}
      </div>
    </div>
  );
}
