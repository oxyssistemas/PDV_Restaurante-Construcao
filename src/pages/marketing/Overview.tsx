import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Share2, Send, CalendarClock, Plus } from 'lucide-react';
import ModuleGate from '@/components/ModuleGate';

export default function MarketingOverview() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ['marketing-overview', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400000).toISOString();
      const [accounts, published, scheduled] = await Promise.all([
        supabase.from('marketing_accounts').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId!).eq('selected', true).in('kind', ['facebook_page', 'instagram', 'tiktok']),
        supabase.from('marketing_posts').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId!).in('status', ['published', 'partial']).gte('published_at', since),
        supabase.from('marketing_posts').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', restaurantId!).eq('status', 'scheduled'),
      ]);
      return { connected: accounts.count ?? 0, published: published.count ?? 0, scheduled: scheduled.count ?? 0 };
    },
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  return (
    <ModuleGate module="marketing">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Marketing</h1>
            <p className="text-muted-foreground">Publique no Instagram, Facebook e TikTok de um só lugar.</p>
          </div>
          <Button asChild className="gap-2"><Link to="/marketing/publish"><Plus className="h-4 w-4" /> Nova publicação</Link></Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Card><CardContent className="flex items-center gap-3 p-4"><Share2 className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Redes conectadas</p><p className="text-2xl font-bold">{data?.connected ?? 0}</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><Send className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Publicadas (30 dias)</p><p className="text-2xl font-bold">{data?.published ?? 0}</p></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-4"><CalendarClock className="h-5 w-5 text-primary" /><div><p className="text-sm text-muted-foreground">Agendadas</p><p className="text-2xl font-bold">{data?.scheduled ?? 0}</p></div></CardContent></Card>
          </div>
        )}

        <Card>
          <CardHeader><CardTitle>Como funciona</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Em “Conexões”, entre com a conta da Meta (Facebook e Instagram) e do TikTok do restaurante.</p>
            <p>2. Em “Publicar”, escreva a legenda, envie a foto ou o vídeo e marque as redes.</p>
            <p>3. Publique na hora ou agende; em “Publicações” você acompanha o resultado em cada rede.</p>
          </CardContent>
        </Card>
      </div>
    </ModuleGate>
  );
}
