import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Instagram, Facebook, MessageCircle, MapPin, Loader2, Link2, Unlink } from 'lucide-react';
import { toast } from 'sonner';
import FeatureGate from '@/components/FeatureGate';

const providers = [
  { key: 'instagram', label: 'Instagram', icon: Instagram, hint: '@perfil do restaurante' },
  { key: 'facebook', label: 'Facebook', icon: Facebook, hint: 'Página do restaurante' },
  { key: 'whatsapp', label: 'WhatsApp Business', icon: MessageCircle, hint: 'Número comercial' },
  { key: 'google_business', label: 'Google Meu Negócio', icon: MapPin, hint: 'Perfil no Google Maps' },
];

export default function MarketingConnections() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ account_name: '', account_url: '' });

  const { data: connections, isLoading } = useQuery({
    queryKey: ['marketing-connections', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_connections').select('*')
        .eq('restaurant_id', restaurantId!);
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async (provider: string) => {
      const existing = (connections || []).find(c => c.provider === provider);
      const payload = {
        restaurant_id: restaurantId!,
        provider,
        status: 'connected',
        account_name: form.account_name.trim() || null,
        account_url: form.account_url.trim() || null,
        connected_at: new Date().toISOString(),
      };
      if (existing) {
        const { error } = await supabase.from('marketing_connections').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('marketing_connections').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-connections'] });
      qc.invalidateQueries({ queryKey: ['marketing-overview'] });
      setEditing(null);
      toast.success('Canal conectado');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_connections')
        .update({ status: 'disconnected', connected_at: null }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-connections'] });
      qc.invalidateQueries({ queryKey: ['marketing-overview'] });
      toast.success('Canal desconectado');
    },
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  return (
    <FeatureGate feature="marketing">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Conexões</h1>
          <p className="text-muted-foreground">Registre os canais oficiais do restaurante. A publicação automática chega em breve.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {providers.map(p => {
              const conn = (connections || []).find(c => c.provider === p.key);
              const connected = conn?.status === 'connected';
              return (
                <Card key={p.key}>
                  <CardContent className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted"><p.icon className="h-5 w-5" /></div>
                    <div className="min-w-[140px] flex-1">
                      <p className="font-semibold">{p.label}</p>
                      <p className="text-sm text-muted-foreground">{conn?.account_name || p.hint}</p>
                    </div>
                    <Badge variant={connected ? 'secondary' : 'outline'}>{connected ? 'Conectado' : 'Não conectado'}</Badge>
                    {connected ? (
                      <Button size="sm" variant="outline" className="gap-2" onClick={() => disconnect.mutate(conn!.id)}>
                        <Unlink className="h-4 w-4" /> Desconectar
                      </Button>
                    ) : (
                      <Button size="sm" className="gap-2" onClick={() => { setForm({ account_name: conn?.account_name || '', account_url: conn?.account_url || '' }); setEditing(p.key); }}>
                        <Link2 className="h-4 w-4" /> Conectar
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Conectar {providers.find(p => p.key === editing)?.label}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Nome da conta / perfil</Label><Input value={form.account_name} onChange={e => setForm({ ...form, account_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Link do perfil</Label><Input value={form.account_url} onChange={e => setForm({ ...form, account_url: e.target.value })} placeholder="https://" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={() => editing && save.mutate(editing)} disabled={save.isPending}>Conectar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </FeatureGate>
  );
}
