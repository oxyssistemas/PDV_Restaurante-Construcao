import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import FeatureGate from '@/components/FeatureGate';

const channelLabels: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  google_business: 'Google',
  email: 'E-mail',
};

const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  published: 'Publicada',
  cancelled: 'Cancelada',
};

export default function MarketingCampaigns() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', channels: [] as string[], scheduled_for: '' });

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['marketing-campaigns', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('marketing_campaigns').select('*')
        .eq('restaurant_id', restaurantId!).order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.title.trim()) throw new Error('Informe o título da campanha');
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('marketing_campaigns').insert({
        restaurant_id: restaurantId!,
        title: form.title.trim(),
        content: form.content.trim() || null,
        channels: form.channels,
        status: form.scheduled_for ? 'scheduled' : 'draft',
        scheduled_for: form.scheduled_for ? new Date(form.scheduled_for).toISOString() : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      qc.invalidateQueries({ queryKey: ['marketing-overview'] });
      setOpen(false); setForm({ title: '', content: '', channels: [], scheduled_for: '' });
      toast.success('Campanha criada');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('marketing_campaigns').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['marketing-campaigns'] }); toast.success('Campanha excluída'); },
  });

  const toggleChannel = (c: string) => setForm(f => ({
    ...f, channels: f.channels.includes(c) ? f.channels.filter(x => x !== c) : [...f.channels, c],
  }));

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  return (
    <FeatureGate feature="marketing">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Campanhas</h1>
            <p className="text-muted-foreground">Planeje e organize as ações de divulgação.</p>
          </div>
          <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova campanha</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : (campaigns || []).length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">Nenhuma campanha cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {campaigns!.map(c => (
              <Card key={c.id}>
                <CardContent className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-[180px] flex-1">
                    <p className="font-semibold">{c.title}</p>
                    {c.content && <p className="line-clamp-2 text-sm text-muted-foreground">{c.content}</p>}
                    {c.scheduled_for && (
                      <p className="text-xs text-muted-foreground">Agendada para {new Date(c.scheduled_for).toLocaleString('pt-BR')}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(c.channels || []).map(ch => <Badge key={ch} variant="outline">{channelLabels[ch] ?? ch}</Badge>)}
                  </div>
                  <Badge variant="secondary">{statusLabels[c.status] ?? c.status}</Badge>
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2"><Label>Título</Label><Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
              <div className="space-y-2"><Label>Conteúdo</Label><Textarea rows={4} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} /></div>
              <div className="space-y-2">
                <Label>Canais</Label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(channelLabels).map(([k, v]) => (
                    <Button key={k} type="button" size="sm" variant={form.channels.includes(k) ? 'default' : 'outline'} onClick={() => toggleChannel(k)}>{v}</Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2"><Label>Agendar para</Label><Input type="datetime-local" value={form.scheduled_for} onChange={e => setForm({ ...form, scheduled_for: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </FeatureGate>
  );
}
