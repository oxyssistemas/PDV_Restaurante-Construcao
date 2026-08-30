import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Plus, Trash2, Gift, Settings2, Users, Search } from 'lucide-react';
import { toast } from 'sonner';
import { brl } from '@/lib/finance';
import FeatureGate from '@/components/FeatureGate';

const modeLabels: Record<string, string> = {
  points: 'Pontos',
  cashback: 'Cashback',
  stamps: 'Selos (cartão fidelidade)',
};

const channelLabels: Record<string, string> = {
  dine_in: 'Salão',
  delivery: 'Delivery',
  takeaway: 'Retirada',
};

const rewardTypeLabels: Record<string, string> = {
  discount_value: 'Desconto em R$',
  discount_percent: 'Desconto em %',
  free_item: 'Item grátis',
};

export default function LoyaltyPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id ?? null;

  if (!restaurantId) {
    return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  }

  return (
    <FeatureGate feature="loyalty">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Programa de Fidelidade</h1>
          <p className="text-muted-foreground">Configure regras, recompensas e acompanhe os clientes participantes.</p>
        </div>
        <Tabs defaultValue="program">
          <TabsList className="flex-wrap">
            <TabsTrigger value="program" className="gap-2"><Settings2 className="h-4 w-4" /> Configuração</TabsTrigger>
            <TabsTrigger value="rewards" className="gap-2"><Gift className="h-4 w-4" /> Recompensas</TabsTrigger>
            <TabsTrigger value="accounts" className="gap-2"><Users className="h-4 w-4" /> Clientes</TabsTrigger>
          </TabsList>
          <TabsContent value="program" className="mt-4"><ProgramTab restaurantId={restaurantId} /></TabsContent>
          <TabsContent value="rewards" className="mt-4"><RewardsTab restaurantId={restaurantId} /></TabsContent>
          <TabsContent value="accounts" className="mt-4"><AccountsTab restaurantId={restaurantId} /></TabsContent>
        </Tabs>
      </div>
    </FeatureGate>
  );
}

function ProgramTab({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data: program, isLoading } = useQuery({
    queryKey: ['loyalty-program', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('loyalty_programs').select('*')
        .eq('restaurant_id', restaurantId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    enabled: false, name: 'Programa de Fidelidade', mode: 'points',
    points_per_currency: '1', cashback_percent: '5', stamps_required: '10',
    min_order_value: '0', points_expire_days: '365',
    channels: ['dine_in', 'delivery', 'takeaway'] as string[], terms: '',
  });

  useEffect(() => {
    if (program) {
      setForm({
        enabled: program.enabled,
        name: program.name,
        mode: program.mode,
        points_per_currency: String(program.points_per_currency),
        cashback_percent: String(program.cashback_percent),
        stamps_required: String(program.stamps_required),
        min_order_value: String(program.min_order_value),
        points_expire_days: String(program.points_expire_days),
        channels: program.channels || [],
        terms: program.terms || '',
      });
    }
  }, [program]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        restaurant_id: restaurantId,
        enabled: form.enabled,
        name: form.name.trim() || 'Programa de Fidelidade',
        mode: form.mode,
        points_per_currency: Number(form.points_per_currency) || 0,
        cashback_percent: Number(form.cashback_percent) || 0,
        stamps_required: Number(form.stamps_required) || 0,
        min_order_value: Number(form.min_order_value) || 0,
        points_expire_days: Number(form.points_expire_days) || 0,
        channels: form.channels,
        terms: form.terms.trim() || null,
      };
      if (program) {
        const { error } = await supabase.from('loyalty_programs').update(payload).eq('id', program.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('loyalty_programs').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loyalty-program'] }); toast.success('Programa salvo'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleChannel = (c: string) => setForm(f => ({
    ...f, channels: f.channels.includes(c) ? f.channels.filter(x => x !== c) : [...f.channels, c],
  }));

  if (isLoading) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <Card className="max-w-3xl">
      <CardHeader><CardTitle>Regras do programa</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Programa ativo</p>
            <p className="text-sm text-muted-foreground">Quando desligado, nenhum ponto é acumulado.</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={v => setForm({ ...form, enabled: v })} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Nome do programa</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-2">
            <Label>Modelo</Label>
            <Select value={form.mode} onValueChange={v => setForm({ ...form, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(modeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {form.mode === 'points' && (
            <>
              <div className="space-y-2"><Label>Pontos por R$ 1,00</Label><Input type="number" step="0.01" value={form.points_per_currency} onChange={e => setForm({ ...form, points_per_currency: e.target.value })} /></div>
              <div className="space-y-2"><Label>Validade dos pontos (dias)</Label><Input type="number" value={form.points_expire_days} onChange={e => setForm({ ...form, points_expire_days: e.target.value })} /></div>
            </>
          )}
          {form.mode === 'cashback' && (
            <div className="space-y-2"><Label>Cashback (%)</Label><Input type="number" step="0.01" value={form.cashback_percent} onChange={e => setForm({ ...form, cashback_percent: e.target.value })} /></div>
          )}
          {form.mode === 'stamps' && (
            <div className="space-y-2"><Label>Selos para prêmio</Label><Input type="number" value={form.stamps_required} onChange={e => setForm({ ...form, stamps_required: e.target.value })} /></div>
          )}

          <div className="space-y-2"><Label>Valor mínimo do pedido (R$)</Label><Input type="number" step="0.01" value={form.min_order_value} onChange={e => setForm({ ...form, min_order_value: e.target.value })} /></div>
        </div>

        <div className="space-y-2">
          <Label>Canais participantes</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(channelLabels).map(([k, v]) => (
              <Button key={k} type="button" size="sm" variant={form.channels.includes(k) ? 'default' : 'outline'} onClick={() => toggleChannel(k)}>
                {v}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Regulamento</Label>
          <Textarea rows={4} value={form.terms} onChange={e => setForm({ ...form, terms: e.target.value })} placeholder="Condições que serão exibidas ao cliente." />
        </div>

        <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
          {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Salvar programa
        </Button>
      </CardContent>
    </Card>
  );
}

function RewardsTab({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', reward_type: 'discount_value', cost_points: '100', discount_value: '0', discount_percent: '0', menu_item_id: '' });

  const { data: rewards, isLoading } = useQuery({
    queryKey: ['loyalty-rewards', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('loyalty_rewards').select('*')
        .eq('restaurant_id', restaurantId).order('cost_points');
      if (error) throw error;
      return data || [];
    },
  });

  const { data: menuItems } = useQuery({
    queryKey: ['loyalty-menu-items', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('menu_items').select('id, name')
        .eq('restaurant_id', restaurantId).order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error('Informe o nome da recompensa');
      const { error } = await supabase.from('loyalty_rewards').insert({
        restaurant_id: restaurantId,
        name: form.name.trim(),
        reward_type: form.reward_type,
        cost_points: Number(form.cost_points) || 0,
        discount_value: Number(form.discount_value) || 0,
        discount_percent: Number(form.discount_percent) || 0,
        menu_item_id: form.reward_type === 'free_item' ? (form.menu_item_id || null) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loyalty-rewards'] }); setOpen(false); toast.success('Recompensa criada'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('loyalty_rewards').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty-rewards'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('loyalty_rewards').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['loyalty-rewards'] }); toast.success('Recompensa excluída'); },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button className="gap-2" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova recompensa</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (rewards || []).length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhuma recompensa cadastrada.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rewards!.map(r => (
            <Card key={r.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold">{r.name}</p>
                  <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <Badge variant="secondary">{rewardTypeLabels[r.reward_type] ?? r.reward_type}</Badge>
                <p className="text-sm text-muted-foreground">
                  {r.reward_type === 'discount_value' && `Desconto de ${brl(Number(r.discount_value))}`}
                  {r.reward_type === 'discount_percent' && `Desconto de ${Number(r.discount_percent)}%`}
                  {r.reward_type === 'free_item' && (menuItems?.find(m => m.id === r.menu_item_id)?.name ?? 'Item do cardápio')}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm font-medium">{r.cost_points} pts</span>
                  <Switch checked={r.active} onCheckedChange={v => toggle.mutate({ id: r.id, active: v })} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova recompensa</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={form.reward_type} onValueChange={v => setForm({ ...form, reward_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(rewardTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.reward_type === 'discount_value' && (
              <div className="space-y-2"><Label>Valor do desconto (R$)</Label><Input type="number" step="0.01" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: e.target.value })} /></div>
            )}
            {form.reward_type === 'discount_percent' && (
              <div className="space-y-2"><Label>Desconto (%)</Label><Input type="number" step="0.01" value={form.discount_percent} onChange={e => setForm({ ...form, discount_percent: e.target.value })} /></div>
            )}
            {form.reward_type === 'free_item' && (
              <div className="space-y-2">
                <Label>Item do cardápio</Label>
                <Select value={form.menu_item_id} onValueChange={v => setForm({ ...form, menu_item_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{(menuItems || []).map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2"><Label>Custo em pontos</Label><Input type="number" value={form.cost_points} onChange={e => setForm({ ...form, cost_points: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountsTab({ restaurantId }: { restaurantId: string }) {
  const [q, setQ] = useState('');
  const { data: accounts, isLoading } = useQuery({
    queryKey: ['loyalty-accounts', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('loyalty_accounts').select('*')
        .eq('restaurant_id', restaurantId).order('points_balance', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const list = (accounts || []).filter(a =>
    !q || [a.customer_name, a.customer_phone, a.customer_document].some(v => (v || '').toLowerCase().includes(q.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar cliente..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : list.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">Nenhum cliente participante ainda.</p>
      ) : (
        <div className="space-y-2">
          {list.map(a => (
            <Card key={a.id}>
              <CardContent className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[160px] flex-1">
                  <p className="font-medium">{a.customer_name}</p>
                  <p className="text-sm text-muted-foreground">{a.customer_phone || a.customer_document || '—'}</p>
                </div>
                <Badge variant="secondary">{Number(a.points_balance)} pts</Badge>
                <Badge variant="outline">{brl(Number(a.cashback_balance))}</Badge>
                <Badge variant="outline">{a.stamps} selos</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
