import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft, FileUp, Loader2, MessageCircle, PackageCheck, Plus, ShoppingCart, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { brl } from '@/lib/finance';
import { normName, parseNfeXml, type NfePurchase } from '@/lib/nfeXml';
import { waLink } from '@/lib/deliveryStore';
import { useModuleAccess } from '@/hooks/useModuleAccess';

type Inv = { id: string; name: string; unit: string; quantity: number; minimum_stock: number; cost_per_unit: number };
type Line = { inventory_id: string; quantity: string; unit_cost: string };
const NEW = '__new__';
const n = (v: string | number) => Number(String(v).replace(',', '.')) || 0;

const STATUS: Record<string, string> = { draft: 'Rascunho', sent: 'Enviado', received: 'Recebido', cancelled: 'Cancelado' };

function useStock(restaurantId?: string | null) {
  return useQuery({
    queryKey: ['purchase-stock', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const [{ data: inv }, { data: sup }] = await Promise.all([
        supabase.from('inventory').select('id, name, unit, quantity, minimum_stock, cost_per_unit').eq('restaurant_id', restaurantId!).order('name'),
        supabase.from('suppliers').select('id, name, document, phone').eq('restaurant_id', restaurantId!).eq('active', true).order('name'),
      ]);
      return {
        inventory: (inv ?? []).map(i => ({ ...i, quantity: Number(i.quantity), minimum_stock: Number(i.minimum_stock), cost_per_unit: Number(i.cost_per_unit) })) as Inv[],
        suppliers: sup ?? [],
      };
    },
  });
}

/** Compras: pedido de compra, entrada pela NF-e (XML) e transferência entre filiais. */
export default function PurchasesPage() {
  const { currentRole, stores } = useAuth();
  const rid = currentRole?.restaurant_id ?? null;
  const { canEdit } = useModuleAccess();
  const editable = canEdit('inventory');
  if (!rid) return <p className="text-muted-foreground">Nenhum restaurante vinculado.</p>;
  const others = (stores ?? []).filter(s => s.id !== rid);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compras</h1>
        <p className="text-muted-foreground">Pedido de compra para o fornecedor, entrada da nota pelo XML (com custo médio e contas a pagar) e transferência entre lojas.</p>
      </div>
      <Tabs defaultValue="xml">
        <TabsList className="flex-wrap">
          <TabsTrigger value="xml" className="gap-2"><FileUp className="h-4 w-4" /> Importar NF-e (XML)</TabsTrigger>
          <TabsTrigger value="orders" className="gap-2"><ShoppingCart className="h-4 w-4" /> Pedidos de compra</TabsTrigger>
          {others.length > 0 && <TabsTrigger value="transfer" className="gap-2"><ArrowRightLeft className="h-4 w-4" /> Transferir para filial</TabsTrigger>}
        </TabsList>
        <TabsContent value="xml" className="mt-4"><ImportXml restaurantId={rid} editable={editable} /></TabsContent>
        <TabsContent value="orders" className="mt-4"><PurchaseOrders restaurantId={rid} editable={editable} /></TabsContent>
        {others.length > 0 && <TabsContent value="transfer" className="mt-4"><Transfer restaurantId={rid} stores={others} editable={editable} /></TabsContent>}
      </Tabs>
    </div>
  );
}

/* ---------------- XML da NF-e ---------------- */
type Map = { inventory_id: string; new_name: string; factor: string; use: boolean };

function ImportXml({ restaurantId, editable }: { restaurantId: string; editable: boolean }) {
  const qc = useQueryClient();
  const file = useRef<HTMLInputElement>(null);
  const { data: stock } = useStock(restaurantId);
  const [nfe, setNfe] = useState<NfePurchase | null>(null);
  const [map, setMap] = useState<Map[]>([]);
  const [payables, setPayables] = useState(true);

  const read = async (f: File) => {
    try {
      const parsed = parseNfeXml(await f.text());
      // lembra o item do estoque usado da última vez para o mesmo código do mesmo fornecedor
      const { data: last } = await supabase.from('purchase_invoices').select('items, suppliers(document)').eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false }).limit(30);
      const prev = new globalThis.Map<string, { inventory_id: string; factor: number }>();
      (last ?? []).forEach((row: any) => {
        if ((row.suppliers?.document ?? '').replace(/\D/g, '') !== parsed.supplier.document.replace(/\D/g, '')) return;
        ((row.items as any[]) ?? []).forEach(i => { if (i.code && i.inventory_id && !prev.has(i.code)) prev.set(i.code, { inventory_id: i.inventory_id, factor: Number(i.factor) || 1 }); });
      });
      const inv = stock?.inventory ?? [];
      setMap(parsed.items.map(it => {
        const remembered = prev.get(it.code);
        const byName = inv.find(i => normName(i.name) === normName(it.name));
        return { inventory_id: remembered?.inventory_id ?? byName?.id ?? NEW, new_name: it.name.slice(0, 100), factor: String(remembered?.factor ?? 1), use: true };
      }));
      setNfe(parsed);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      if (file.current) file.current.value = '';
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!nfe) return;
      const items = nfe.items.map((it, i) => ({ it, m: map[i] })).filter(x => x.m.use).map(({ it, m }) => {
        const factor = n(m.factor) || 1;
        const qty = it.quantity * factor;
        return {
          inventory_id: m.inventory_id === NEW ? null : m.inventory_id, new_name: m.inventory_id === NEW ? m.new_name : null,
          unit: m.inventory_id === NEW ? it.unit.toLowerCase() : null, quantity: qty, unit_cost: qty ? Math.round((it.total / qty) * 10000) / 10000 : 0,
          label: it.name, code: it.code, factor,
        };
      });
      const { data, error } = await supabase.rpc('receive_purchase', {
        _restaurant_id: restaurantId,
        _p: {
          access_key: nfe.access_key, number: nfe.number, issued_at: nfe.issued_at, total: nfe.total,
          supplier: nfe.supplier, items, installments: payables ? nfe.installments : [],
        },
      });
      if (error) throw error;
      return data as { items: number; total: number };
    },
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['purchase-stock'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      setNfe(null);
      toast.success(`Entrada de ${r?.items} item(ns) no estoque · ${brl(r?.total ?? 0)}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Entrada pela nota do fornecedor</CardTitle>
        <CardDescription>Envie o XML da NF-e: os itens entram no estoque com o custo da nota (custo médio), o fornecedor vai para o cadastro e as parcelas para contas a pagar.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input ref={file} type="file" accept=".xml,text/xml" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) read(f); }} />
        {!nfe ? (
          <Button className="gap-2" disabled={!editable} onClick={() => file.current?.click()}><FileUp className="h-4 w-4" /> Escolher arquivo XML</Button>
        ) : (
          <>
            <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-muted/40 p-3 text-sm">
              <span><b>{nfe.supplier.name}</b> {nfe.supplier.document && `· ${nfe.supplier.document}`}</span>
              <span>NF {nfe.number ?? '—'}{nfe.issued_at ? ` · ${new Date(nfe.issued_at).toLocaleDateString('pt-BR')}` : ''}</span>
              <span>Total {brl(nfe.total)}</span>
            </div>
            <div className="space-y-2">
              {nfe.items.map((it, i) => {
                const m = map[i];
                const set = (patch: Partial<Map>) => setMap(prev => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                const inv = stock?.inventory.find(x => x.id === m.inventory_id);
                const factor = n(m.factor) || 1;
                return (
                  <div key={i} className="grid gap-2 rounded-xl border p-3 lg:grid-cols-[auto_1.4fr_1.4fr_120px_1fr] lg:items-center">
                    <Checkbox aria-label={`Lançar ${it.name}`} checked={m.use} onCheckedChange={v => set({ use: !!v })} />
                    <div className="min-w-0 text-sm">
                      <p className="truncate font-medium" title={it.name}>{it.name}</p>
                      <p className="text-xs text-muted-foreground">{it.quantity} {it.unit} × {brl(it.unit_price)} = {brl(it.total)}</p>
                    </div>
                    <div className="space-y-1">
                      <Select value={m.inventory_id} onValueChange={v => set({ inventory_id: v })}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NEW}>+ Criar item no estoque</SelectItem>
                          {stock?.inventory.map(x => <SelectItem key={x.id} value={x.id}>{x.name} ({x.unit})</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {m.inventory_id === NEW && <Input className="h-8 text-xs" value={m.new_name} maxLength={100} onChange={e => set({ new_name: e.target.value })} />}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">1 {it.unit} =</Label>
                      <Input className="h-9" inputMode="decimal" aria-label="Fator de conversão" value={m.factor} onChange={e => set({ factor: e.target.value })} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Entra <b>{(it.quantity * factor).toLocaleString('pt-BR')} {inv?.unit ?? it.unit.toLowerCase()}</b> a {brl(it.total / Math.max(it.quantity * factor, 0.0001))} cada
                    </p>
                  </div>
                );
              })}
            </div>
            {nfe.installments.length > 0 && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={payables} onCheckedChange={v => setPayables(!!v)} />
                Lançar {nfe.installments.length} parcela(s) em contas a pagar ({nfe.installments.map(d => `${new Date(`${d.due_date}T12:00`).toLocaleDateString('pt-BR')} ${brl(d.amount)}`).join(' · ')})
              </label>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setNfe(null)}>Cancelar</Button>
              <Button className="gap-2" disabled={save.isPending || !map.some(m => m.use)} onClick={() => save.mutate()}>
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Dar entrada no estoque
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- pedidos de compra ---------------- */
function PurchaseOrders({ restaurantId, editable }: { restaurantId: string; editable: boolean }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: stock, refetch: refetchStock } = useStock(restaurantId);
  const [form, setForm] = useState<{ id?: string; supplier_id: string; expected_date: string; notes: string; lines: Line[] } | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['purchase-orders', restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from('purchase_orders').select('*, suppliers(name, phone)').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invById = useMemo(() => new globalThis.Map((stock?.inventory ?? []).map(i => [i.id, i])), [stock]);
  const toItems = (lines: Line[]) => lines.filter(l => l.inventory_id && n(l.quantity) > 0).map(l => {
    const i = invById.get(l.inventory_id)!;
    return { inventory_id: l.inventory_id, name: i?.name, unit: i?.unit, quantity: n(l.quantity), unit_cost: n(l.unit_cost) };
  });

  const save = useMutation({
    mutationFn: async (f: NonNullable<typeof form>) => {
      const items = toItems(f.lines);
      if (!items.length) throw new Error('Adicione os itens do pedido.');
      const row = {
        restaurant_id: restaurantId, supplier_id: f.supplier_id || null, expected_date: f.expected_date || null, notes: f.notes.trim() || null,
        items, total: Math.round(items.reduce((s, i) => s + i.quantity * i.unit_cost, 0) * 100) / 100, created_by: user?.id ?? null,
      };
      const { error } = f.id ? await supabase.from('purchase_orders').update(row).eq('id', f.id) : await supabase.from('purchase_orders').insert(row);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders', restaurantId] }); setForm(null); toast.success('Pedido de compra salvo'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('purchase_orders').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['purchase-orders', restaurantId] }),
  });

  const receive = useMutation({
    mutationFn: async (o: any) => {
      const { error } = await supabase.rpc('receive_purchase', {
        _restaurant_id: restaurantId,
        _p: { purchase_order_id: o.id, supplier: { id: o.supplier_id, name: o.suppliers?.name ?? null }, items: (o.items as any[]).map(i => ({ ...i, label: i.name })) },
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-orders', restaurantId] }); qc.invalidateQueries({ queryKey: ['purchase-stock'] }); toast.success('Mercadoria recebida e lançada no estoque'); },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Sugestão: itens abaixo do mínimo, pedindo o dobro do mínimo menos o saldo. */
  const suggest = async () => {
    const fresh = (await refetchStock()).data ?? stock;
    const low = (fresh?.inventory ?? []).filter(i => i.minimum_stock > 0 && i.quantity <= i.minimum_stock);
    if (!low.length) { toast.info('Nenhum item abaixo do estoque mínimo.'); return; }
    setForm(f => f && ({ ...f, lines: [...f.lines.filter(l => l.inventory_id), ...low.filter(i => !f.lines.some(l => l.inventory_id === i.id))
      .map(i => ({ inventory_id: i.id, quantity: String(Math.max(1, Math.ceil(i.minimum_stock * 2 - i.quantity))), unit_cost: String(i.cost_per_unit || '') }))] }));
  };

  const sendWhats = (o: any) => {
    const lines = (o.items as any[]).map(i => `• ${i.quantity} ${i.unit} ${i.name}`).join('\n');
    const text = `Olá! Pedido de compra:\n${lines}${o.expected_date ? `\nEntrega até ${new Date(`${o.expected_date}T12:00`).toLocaleDateString('pt-BR')}` : ''}${o.notes ? `\nObs.: ${o.notes}` : ''}`;
    const phone = String(o.suppliers?.phone ?? '').replace(/\D/g, '');
    window.open(phone ? waLink(phone.length <= 11 ? `55${phone}` : phone, text) : `https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    if (o.status === 'draft') setStatus.mutate({ id: o.id, status: 'sent' });
  };

  return (
    <div className="space-y-4">
      {editable && <Button className="gap-2" onClick={() => setForm({ supplier_id: '', expected_date: '', notes: '', lines: [{ inventory_id: '', quantity: '', unit_cost: '' }] })}><Plus className="h-4 w-4" /> Novo pedido de compra</Button>}
      {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : !orders?.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum pedido de compra ainda.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orders.map((o: any) => (
            <Card key={o.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate font-semibold">{o.suppliers?.name ?? 'Sem fornecedor'}</span>
                  <Badge variant={o.status === 'received' ? 'default' : 'outline'}>{STATUS[o.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(o.created_at).toLocaleDateString('pt-BR')} · {(o.items as any[]).length} item(ns) · {brl(Number(o.total))}
                  {o.expected_date && ` · entrega ${new Date(`${o.expected_date}T12:00`).toLocaleDateString('pt-BR')}`}
                </p>
                <p className="line-clamp-2 text-xs">{(o.items as any[]).map(i => `${i.quantity} ${i.unit} ${i.name}`).join(' · ')}</p>
                {editable && !['received', 'cancelled'].includes(o.status) && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="gap-1" onClick={() => sendWhats(o)}><MessageCircle className="h-3.5 w-3.5" /> Enviar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setForm({ id: o.id, supplier_id: o.supplier_id ?? '', expected_date: o.expected_date ?? '', notes: o.notes ?? '',
                      lines: (o.items as any[]).map(i => ({ inventory_id: i.inventory_id, quantity: String(i.quantity), unit_cost: String(i.unit_cost) })) })}>Editar</Button>
                    <Button size="sm" className="gap-1" disabled={receive.isPending} onClick={() => receive.mutate(o)}><PackageCheck className="h-3.5 w-3.5" /> Recebi</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setStatus.mutate({ id: o.id, status: 'cancelled' })}>Cancelar</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{form?.id ? 'Editar' : 'Novo'} pedido de compra</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Fornecedor</Label>
                  <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Escolha (cadastro em CRM → Fornecedores)" /></SelectTrigger>
                    <SelectContent>{stock?.suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label htmlFor="po-date">Entregar até</Label><Input id="po-date" type="date" value={form.expected_date} onChange={e => setForm({ ...form, expected_date: e.target.value })} /></div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Itens</Label>
                <Button size="sm" variant="ghost" className="gap-1" onClick={suggest}><Sparkles className="h-3.5 w-3.5" /> Sugerir pelo estoque mínimo</Button>
              </div>
              {form.lines.map((l, i) => {
                const set = (patch: Partial<Line>) => setForm({ ...form, lines: form.lines.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                const inv = invById.get(l.inventory_id);
                return (
                  <div key={i} className="grid grid-cols-[1fr_90px_100px_auto] items-center gap-2">
                    <Select value={l.inventory_id} onValueChange={v => set({ inventory_id: v, unit_cost: l.unit_cost || String(invById.get(v)?.cost_per_unit ?? '') })}>
                      <SelectTrigger><SelectValue placeholder="Item do estoque" /></SelectTrigger>
                      <SelectContent>{stock?.inventory.map(x => <SelectItem key={x.id} value={x.id}>{x.name} (saldo {x.quantity} {x.unit})</SelectItem>)}</SelectContent>
                    </Select>
                    <Input inputMode="decimal" aria-label="Quantidade" placeholder={inv?.unit ?? 'qtd'} value={l.quantity} onChange={e => set({ quantity: e.target.value })} />
                    <Input inputMode="decimal" aria-label="Custo unitário" placeholder="R$ un." value={l.unit_cost} onChange={e => set({ unit_cost: e.target.value })} />
                    <Button size="icon" variant="ghost" aria-label="Remover item" onClick={() => setForm({ ...form, lines: form.lines.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                );
              })}
              <Button size="sm" variant="outline" className="gap-1" onClick={() => setForm({ ...form, lines: [...form.lines, { inventory_id: '', quantity: '', unit_cost: '' }] })}><Plus className="h-3.5 w-3.5" /> Item</Button>
              <div className="space-y-1.5"><Label htmlFor="po-notes">Observação</Label><Input id="po-notes" maxLength={300} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
              <p className="text-right text-sm">Total estimado: <b>{brl(toItems(form.lines).reduce((s, i) => s + i.quantity * i.unit_cost, 0))}</b></p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={save.isPending} onClick={() => form && save.mutate(form)}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------------- transferência entre filiais ---------------- */
function Transfer({ restaurantId, stores, editable }: { restaurantId: string; stores: { id: string; name: string }[]; editable: boolean }) {
  const qc = useQueryClient();
  const { data: stock } = useStock(restaurantId);
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<{ inventory_id: string; quantity: string }[]>([{ inventory_id: '', quantity: '' }]);

  const send = useMutation({
    mutationFn: async () => {
      const items = lines.filter(l => l.inventory_id && n(l.quantity) > 0).map(l => ({ inventory_id: l.inventory_id, quantity: n(l.quantity) }));
      if (!to) throw new Error('Escolha a loja de destino.');
      if (!items.length) throw new Error('Adicione os itens.');
      const { error } = await supabase.rpc('transfer_stock', { _from: restaurantId, _to: to, _items: items, _note: note });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase-stock'] }); setLines([{ inventory_id: '', quantity: '' }]); setNote(''); toast.success('Transferência feita: saiu daqui e entrou na outra loja'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Transferir estoque para outra loja da rede</CardTitle>
        <CardDescription>Sai do estoque desta loja e entra no da outra (o item é criado lá se ainda não existir). Fica registrado nas movimentações das duas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-sm space-y-1.5">
          <Label>Loja de destino</Label>
          <Select value={to} onValueChange={setTo}>
            <SelectTrigger><SelectValue placeholder="Escolha a filial" /></SelectTrigger>
            <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid max-w-xl grid-cols-[1fr_110px_auto] items-center gap-2">
            <Select value={l.inventory_id} onValueChange={v => setLines(lines.map((x, j) => (j === i ? { ...x, inventory_id: v } : x)))}>
              <SelectTrigger><SelectValue placeholder="Item" /></SelectTrigger>
              <SelectContent>{stock?.inventory.map(x => <SelectItem key={x.id} value={x.id}>{x.name} (saldo {x.quantity} {x.unit})</SelectItem>)}</SelectContent>
            </Select>
            <Input inputMode="decimal" aria-label="Quantidade" placeholder="qtd" value={l.quantity} onChange={e => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
            <Button size="icon" variant="ghost" aria-label="Remover" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button size="sm" variant="outline" className="gap-1" onClick={() => setLines([...lines, { inventory_id: '', quantity: '' }])}><Plus className="h-3.5 w-3.5" /> Item</Button>
        <Input className="max-w-xl" placeholder="Observação (opcional)" maxLength={150} value={note} onChange={e => setNote(e.target.value)} />
        <Button className="gap-2" disabled={!editable || send.isPending} onClick={() => send.mutate()}><ArrowRightLeft className="h-4 w-4" /> Transferir</Button>
      </CardContent>
    </Card>
  );
}
