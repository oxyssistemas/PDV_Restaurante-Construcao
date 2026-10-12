import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Armchair, BellRing, Loader2, MessageCircle, Plus, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PUBLIC_ORIGIN } from '@/lib/native';
import { waLink } from '@/lib/deliveryStore';

type Entry = {
  id: string; name: string; phone: string | null; party_size: number; notes: string | null; status: string; source: string;
  public_token: string; created_at: string; called_at: string | null;
};

/** Fila de espera da porta: quem chegou, chamar pelo WhatsApp e sentar na mesa livre. */
export default function Waitlist() {
  const { currentRole } = useAuth();
  const rid = currentRole?.restaurant_id;
  const qc = useQueryClient();
  const [form, setForm] = useState<{ name: string; phone: string; party: string; notes: string } | null>(null);
  const [seating, setSeating] = useState<Entry | null>(null);
  const [tableId, setTableId] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick(x => x + 1), 30_000); return () => window.clearInterval(t); }, []);

  const { data: list, isLoading } = useQuery({
    queryKey: ['waitlist', rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data, error } = await supabase.from('waitlist').select('*').eq('restaurant_id', rid!)
        .in('status', ['waiting', 'called']).order('created_at');
      if (error) throw error;
      return (data ?? []) as Entry[];
    },
  });
  const { data: tables } = useQuery({
    queryKey: ['waitlist-tables', rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data } = await supabase.from('restaurant_tables').select('id, number, capacity, status').eq('restaurant_id', rid!).order('number');
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!rid) return;
    const ch = supabase.channel(`waitlist-${rid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist', filter: `restaurant_id=eq.${rid}` }, () => qc.invalidateQueries({ queryKey: ['waitlist', rid] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [rid, qc]);

  const add = useMutation({
    mutationFn: async (f: NonNullable<typeof form>) => {
      if (f.name.trim().length < 2) throw new Error('Informe o nome.');
      const { error } = await supabase.from('waitlist').insert({
        restaurant_id: rid!, name: f.name.trim(), phone: f.phone.replace(/\D/g, '') || null,
        party_size: Math.max(1, Math.trunc(Number(f.party)) || 1), notes: f.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ['waitlist', rid] }); toast.success('Adicionado à fila'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ e, status, table }: { e: Entry; status: string; table?: string }) => {
      const patch: { status: string; called_at?: string; seated_at?: string; table_id?: string | null } = { status };
      if (status === 'called') patch.called_at = new Date().toISOString();
      if (status === 'seated') { patch.seated_at = new Date().toISOString(); patch.table_id = table ?? null; }
      const { error } = await supabase.from('waitlist').update(patch).eq('id', e.id);
      if (error) throw error;
      if (status === 'seated' && table) await supabase.from('restaurant_tables').update({ status: 'occupied' as const }).eq('id', table);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['waitlist', rid] }); qc.invalidateQueries({ queryKey: ['waiter-tables'] }); setSeating(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusUrl = (e: Entry) => `${PUBLIC_ORIGIN}/fila/${e.public_token}`;
  const call = (e: Entry) => {
    setStatus.mutate({ e, status: 'called' });
    if (e.phone) window.open(waLink(e.phone.length <= 11 ? `55${e.phone}` : e.phone, `Olá, ${e.name}! Sua mesa está pronta, pode vir até a recepção. 😊`), '_blank', 'noopener');
  };

  const waiting = list ?? [];
  const freeTables = (tables ?? []).filter(t => t.status === 'free');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fila de espera</h1>
          <p className="text-sm text-muted-foreground">{waiting.filter(e => e.status === 'waiting').length} esperando · {freeTables.length} mesa(s) livre(s)</p>
        </div>
        <Button className="gap-2" onClick={() => setForm({ name: '', phone: '', party: '2', notes: '' })}><Plus className="h-4 w-4" /> Adicionar</Button>
      </div>

      {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : !waiting.length ? (
        <div className="py-16 text-center text-muted-foreground"><Users className="mx-auto mb-3 h-12 w-12 opacity-30" /> Ninguém na fila.</div>
      ) : (
        <ol className="space-y-2">
          {waiting.map((e, i) => (
            <li key={e.id} className={cn('flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3', e.status === 'called' && 'border-primary/60 bg-primary/5')}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted font-bold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.name}</span>
                  <Badge variant="outline" className="gap-1"><Users className="h-3 w-3" /> {e.party_size}</Badge>
                  {e.source === 'online' && <Badge variant="secondary">pelo celular</Badge>}
                  {e.status === 'called' && <Badge>Chamado</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  esperando {formatDistanceToNow(new Date(e.created_at), { locale: ptBR })}{e.phone ? ` · ${e.phone}` : ''}{e.notes ? ` · ${e.notes}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Button size="sm" variant="outline" className="gap-1" onClick={() => call(e)}>
                  {e.phone ? <MessageCircle className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />} Chamar
                </Button>
                <Button size="sm" className="gap-1" onClick={() => { setSeating(e); setTableId(freeTables.find(t => t.capacity >= e.party_size)?.id ?? ''); }}>
                  <Armchair className="h-3.5 w-3.5" /> Sentar
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" aria-label={`Tirar ${e.name} da fila`}
                  onClick={() => setStatus.mutate({ e, status: e.status === 'called' ? 'no_show' : 'cancelled' })}><X className="h-4 w-4" /></Button>
                {e.phone && (
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => window.open(waLink(e.phone!.length <= 11 ? `55${e.phone}` : e.phone!, `Olá, ${e.name}! Acompanhe sua vez na fila: ${statusUrl(e)}`), '_blank', 'noopener')}>
                    Enviar link
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Adicionar à fila</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="wl-name">Nome</Label><Input id="wl-name" autoFocus value={form.name} maxLength={80} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="wl-party">Pessoas</Label><Input id="wl-party" type="number" min={1} max={50} value={form.party} onChange={e => setForm({ ...form, party: e.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="wl-phone">WhatsApp</Label><Input id="wl-phone" inputMode="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div className="space-y-1.5"><Label htmlFor="wl-notes">Observação</Label><Input id="wl-notes" placeholder="Ex.: cadeira de bebê, área externa" value={form.notes} maxLength={200} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={add.isPending} onClick={() => form && add.mutate(form)}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!seating} onOpenChange={o => !o && setSeating(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Sentar {seating?.name} ({seating?.party_size} pessoas)</DialogTitle></DialogHeader>
          <Select value={tableId} onValueChange={setTableId}>
            <SelectTrigger><SelectValue placeholder="Escolha a mesa livre" /></SelectTrigger>
            <SelectContent>
              {freeTables.map(t => <SelectItem key={t.id} value={t.id}>Mesa {t.number} · {t.capacity} lugares</SelectItem>)}
            </SelectContent>
          </Select>
          {!freeTables.length && <p className="text-sm text-muted-foreground">Nenhuma mesa livre agora.</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeating(null)}>Cancelar</Button>
            <Button disabled={!tableId || setStatus.isPending} onClick={() => seating && setStatus.mutate({ e: seating, status: 'seated', table: tableId })}>Sentar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
