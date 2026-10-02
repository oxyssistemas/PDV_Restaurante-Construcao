import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { CloudOff, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { desktop } from '@/lib/desktop';

const KEY = 'oxys.hub.urls';
const PUBLIC = /^\/(pedir|mesa|privacidade|termos|login)(\/|$)/;
const loadUrls = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };

/**
 * Quando a internet cai, mostra o caminho para o modo offline (a central no computador do caixa).
 * Os endereços da central são guardados enquanto há internet, para funcionar justamente quando ela cair.
 */
export default function OfflineBanner() {
  const { currentRole } = useAuth();
  const { pathname } = useLocation();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const [urls, setUrls] = useState<string[]>(loadUrls);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [isHub, setIsHub] = useState(false);

  // Endereços da central (com internet).
  useEffect(() => {
    if (!restaurantId) return;
    supabase.from('offline_hubs').select('lan_urls').eq('restaurant_id', restaurantId).maybeSingle().then(({ data }) => {
      const list = data?.lan_urls ?? [];
      setUrls(list);
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* sem armazenamento */ }
    });
    desktop?.hubStatus?.().then(s => setIsHub(!!s.enabled)).catch(() => {});
  }, [restaurantId]);

  // "Sem internet" = o navegador avisa ou a nuvem não responde duas vezes seguidas.
  useEffect(() => {
    let fails = 0;
    const ping = async () => {
      try {
        const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, signal: AbortSignal.timeout(8000), cache: 'no-store',
        });
        fails = r.ok ? 0 : fails + 1;
      } catch { fails += 1; }
      setOffline(!navigator.onLine || fails >= 2);
    };
    const t = setInterval(ping, 15_000);
    const on = () => ping();
    window.addEventListener('online', on);
    window.addEventListener('offline', () => setOffline(true));
    return () => { clearInterval(t); window.removeEventListener('online', on); };
  }, []);

  if (!offline || PUBLIC.test(pathname) || !restaurantId) return null;
  const targets = isHub ? ['http://localhost:8790'] : urls;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-amber-500/40 bg-[#1c1404]/95 px-4 py-3 text-sm backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3">
        <CloudOff className="h-5 w-5 shrink-0 text-amber-400" />
        <p className="min-w-0 flex-1">
          <b className="text-amber-300">Sem internet.</b>{' '}
          {targets.length ? 'Continue pelo modo offline — os pedidos vão para a nuvem quando a internet voltar.' : 'A loja não tem central offline ativada. O administrador ativa no app de computador (Estação de impressão).'}
        </p>
        {targets.map(u => (
          <a key={u} href={u} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1.5 font-bold text-black hover:bg-amber-300">
            Abrir modo offline <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ))}
      </div>
    </div>
  );
}
