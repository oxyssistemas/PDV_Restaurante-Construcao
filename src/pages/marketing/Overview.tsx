import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Share2, Megaphone, Users } from 'lucide-react';
import ModuleGate from '@/components/ModuleGate';

export default function MarketingOverview() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['marketing-overview', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const [connections, campaigns, customers] = await Promise.all([
        supabase.from('marketing_connections').select('id, status').eq('restaurant_id', restaurantId!),
        supabase.from('marketing_campaigns').select('id, status').eq('restaurant_id', restaurantId!),
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('restaurant_id', restaurantId!),
      ]);
      return {
        connected: (connections.data || []).filter(c => c.status === 'connected').length,
        campaigns: (campaigns.data || []).length,
        customers: customers.count ?? 0,
      };
    },
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  return (
    <ModuleGate module="marketing">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
          <p className="text-muted-foreground">Conecte seus canais e organize as campanhas do restaurante.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card><CardContent className="flex items-center gap-3 p-4"><Share2 className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Canais conectados</p><p className="text-2xl font-bold">{data?.connected ?? 0}</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Megaphone className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Campanhas</p><p className="text-2xl font-bold">{data?.campaigns ?? 0}</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Users className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Clientes na base</p><p className="text-2xl font-bold">{data?.customers ?? 0}</p></div></CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Próximos passos</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Conecte Instagram, Facebook, WhatsApp e o perfil do Google do restaurante em “Conexões”.</p>
            <p>2. Cadastre campanhas e agende as publicações em “Campanhas”.</p>
            <p>3. Publicação automática e métricas dos canais entram em uma próxima etapa.</p>
          </CardContent>
        </Card>
      </div>
    </ModuleGate>
  );
}
