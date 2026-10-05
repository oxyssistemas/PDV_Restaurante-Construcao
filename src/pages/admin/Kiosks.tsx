import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, ExternalLink, Loader2, MonitorSmartphone, Plus, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { publicOrigin } from '@/lib/native';
import type { Tables } from '@/integrations/supabase/types';

type KioskRow = Tables<'kiosks'>;
const kioskLink = (token: string) => `${publicOrigin()}/totem/${token}`;
const onlineNow = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 15 * 60_000;

/** Autoatendimento: totens e tablets de balcão em que o cliente faz o pedido sozinho. */
export default function KiosksPage() {
  const { currentRole } = useAuth();
  const rid = currentRole?.restaurant_id;
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [qr, setQr] = useState<{ name: string; url: string; img: string } | null>(null);

  const { data: kiosks, isLoading } = useQuery({
    queryKey: ['kiosks', rid],
    enabled: !!rid,
    queryFn: async () => {
      const { data, error } = await supabase.from('kiosks').select('*').eq('restaurant_id', rid!).order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['kiosks'] });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('kiosks').insert({ restaurant_id: rid!, name: newName.trim() || `Totem ${(kiosks?.length ?? 0) + 1}` });
      if (error) throw error;
    },
    onSuccess: () => { setNewName(''); refresh(); toast.success('Totem criado. Abra o link no tablet/totem.'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<KioskRow> }) => {
      const { error } = await supabase.from('kiosks').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('kiosks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success('Totem removido.'); },
  });

  const showQr = async (k: KioskRow) => {
    const url = kioskLink(k.token);
    setQr({ name: k.name, url, img: await QRCode.toDataURL(url, { width: 500, margin: 1 }) });
  };

  if (!rid) return null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><MonitorSmartphone className="h-7 w-7 text-primary" /> Autoatendimento</h1>
        <p className="text-sm text-muted-foreground">
          Totem ou tablet no balcão: o cliente escolhe, informa o nome, recebe uma senha e paga no caixa. O pedido vai direto para a cozinha
          e aparece em Delivery → Pedidos (retirada) para receber o pagamento.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label>Novo totem</Label>
            <Input className="w-64" placeholder="Ex.: Totem da entrada" value={newName} maxLength={60} onChange={e => setNewName(e.target.value)} />
          </div>
          <Button className="gap-2" onClick={() => create.mutate()} disabled={create.isPending}><Plus className="h-4 w-4" /> Criar</Button>
        </CardContent>
      </Card>

      {isLoading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" /> : !kiosks?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum totem ainda.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {kiosks.map(k => <KioskCard key={k.id} k={k} onSave={patch => update.mutate({ id: k.id, patch })} onQr={() => showQr(k)} onRemove={() => remove.mutate(k.id)} />)}
        </div>
      )}

      <Dialog open={!!qr} onOpenChange={o => !o && setQr(null)}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader><DialogTitle>{qr?.name}</DialogTitle></DialogHeader>
          {qr && <img src={qr.img} alt="QR Code do totem" className="mx-auto w-64" />}
          <p className="text-xs text-muted-foreground">Aponte a câmera do tablet para abrir o totem. Depois toque no ícone de tela cheia.</p>
          <p className="break-all text-xs">{qr?.url}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KioskCard({ k, onSave, onQr, onRemove }: { k: KioskRow; onSave: (p: Partial<KioskRow>) => void; onQr: () => void; onRemove: () => void }) {
  const [form, setForm] = useState({ name: k.name, welcome: k.welcome_text ?? '', idle: String(k.idle_seconds) });
  useEffect(() => setForm({ name: k.name, welcome: k.welcome_text ?? '', idle: String(k.idle_seconds) }), [k]);
  const url = kioskLink(k.token);
  const online = onlineNow(k.last_seen_at);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            {k.name}
            <Badge variant="outline" className={online ? 'border-emerald-500/40 text-emerald-500' : 'text-muted-foreground'}>{online ? 'em uso' : 'sem acesso recente'}</Badge>
          </CardTitle>
          <CardDescription className="break-all text-xs">{url}</CardDescription>
        </div>
        <Switch checked={k.enabled} onCheckedChange={v => onSave({ enabled: v })} aria-label="Totem ativo" />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onQr}><QrCode className="h-3.5 w-3.5" /> QR Code</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { navigator.clipboard.writeText(url); toast.success('Link copiado.'); }}><Copy className="h-3.5 w-3.5" /> Copiar link</Button>
          <Button size="sm" variant="outline" className="gap-1.5" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Abrir</a></Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { if (confirm('Gerar um link novo? O link antigo para de funcionar.')) onSave({ token: crypto.randomUUID() }); }}>
            <RefreshCw className="h-3.5 w-3.5" /> Novo link
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={() => { if (confirm(`Remover "${k.name}"?`)) onRemove(); }}><Trash2 className="h-3.5 w-3.5" /> Remover</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">Comer aqui <Switch checked={k.eat_in_enabled} onCheckedChange={v => onSave({ eat_in_enabled: v })} /></label>
          <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm">Para levar <Switch checked={k.takeaway_enabled} onCheckedChange={v => onSave({ takeaway_enabled: v })} /></label>
          <label className="flex items-center justify-between gap-2 rounded-lg border p-2.5 text-sm sm:col-span-2">Pedir celular (fidelidade/cashback) <Switch checked={k.ask_phone} onCheckedChange={v => onSave({ ask_phone: v })} /></label>
          <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} maxLength={60} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Volta ao início após (segundos)</Label><Input type="number" min={30} max={600} value={form.idle} onChange={e => setForm({ ...form, idle: e.target.value })} /></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Mensagem de boas-vindas</Label><Input value={form.welcome} maxLength={120} placeholder="Faça seu pedido aqui e pague no caixa" onChange={e => setForm({ ...form, welcome: e.target.value })} /></div>
        </div>
        <Button size="sm" onClick={() => onSave({ name: form.name.trim() || k.name, welcome_text: form.welcome.trim() || null, idle_seconds: Math.min(600, Math.max(30, parseInt(form.idle) || 90)) })}>Salvar</Button>
      </CardContent>
    </Card>
  );
}
