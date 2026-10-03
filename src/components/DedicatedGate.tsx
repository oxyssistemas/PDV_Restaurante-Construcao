import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, ServerCog } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { IS_CENTRAL } from '@/lib/central';
import { switchTo } from '@/components/OfflineBanner';

type DedicatedServer = { restaurant_id: string; status: 'migrating' | 'active'; public_url: string | null; lan_urls: string[] };

const PUBLIC = /^\/(pedir|mesa|privacidade|termos|login|setup)(\/|$)/;
const LAN_KEY = 'oxys.server.lan';

/**
 * Lojas com servidor dedicado: os dados delas moram no servidor da loja, não na nuvem compartilhada.
 * Depois do login na nuvem, a pessoa é levada na hora para o servidor da loja (mesma tela, já logada);
 * enquanto a migração dos dados acontece, as telas ficam em espera para nada ser gravado no lugar errado.
 */
export default function DedicatedGate({ children }: { children: ReactNode }) {
  const { user, currentRole } = useAuth();
  const { pathname } = useLocation();
  const [server, setServer] = useState<DedicatedServer | null | undefined>(undefined);
  const check = !IS_CENTRAL && !!user && !!currentRole?.restaurant_id && currentRole.role !== 'super_admin' && !PUBLIC.test(pathname);

  useEffect(() => {
    if (!check) { setServer(null); return; }
    let stop = false;
    const load = async () => {
      // sem internet a consulta falha: segue normal (a troca para a rede da loja é feita pelo aviso de sem internet)
      const { data, error } = await supabase.rpc('my_dedicated_server');
      if (stop) return;
      const row = !error && data?.length ? (data[0] as DedicatedServer) : null;
      setServer(row);
      if (row?.lan_urls?.length) { try { localStorage.setItem('oxys.hub.urls', JSON.stringify(row.lan_urls)); localStorage.setItem(LAN_KEY, JSON.stringify(row.lan_urls)); } catch { /* sem armazenamento */ } }
      if (row?.status === 'migrating') setTimeout(load, 5000);
    };
    load();
    return () => { stop = true; };
  }, [check, currentRole?.restaurant_id]);

  const target = server?.status === 'active' ? server.public_url || server.lan_urls?.[0] || null : null;
  useEffect(() => { if (check && target) switchTo(target); }, [check, target]);

  if (!check || server === null) return <>{children}</>;
  if (server === undefined) return null; // conferindo (rápido)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-3 text-center">
        <ServerCog className="mx-auto h-10 w-10 text-primary" />
        {server.status === 'migrating' ? (
          <>
            <h1 className="text-lg font-bold">Levando os dados da loja para o servidor dedicado</h1>
            <p className="text-sm text-muted-foreground">Isso acontece uma vez só. Assim que terminar, o sistema abre sozinho no servidor da loja.</p>
          </>
        ) : target ? (
          <>
            <h1 className="text-lg font-bold">Abrindo o servidor da loja…</h1>
            <p className="text-sm text-muted-foreground">Os dados desta loja ficam no servidor dedicado dela.</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold">Servidor da loja indisponível</h1>
            <p className="text-sm text-muted-foreground">O servidor dedicado desta loja não está acessível agora. Confira se o computador do servidor está ligado e com internet.</p>
          </>
        )}
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}
