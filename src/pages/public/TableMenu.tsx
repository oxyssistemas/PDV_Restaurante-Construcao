import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Loader2, Minus, Plus, ShoppingBag, UtensilsCrossed, ImageIcon, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface MenuItem {
  id: string; name: string; description: string | null; price: number;
  image_url: string | null; category_id: string | null;
}
interface MenuData {
  restaurant: { name: string; logo: string | null };
  table: { number: number };
  categories: { id: string; name: string }[];
  items: MenuItem[];
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

async function callPublic<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('public-menu', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error || error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export default function TableMenu() {
  const { token = '' } = useParams();
  const queryClient = useQueryClient();
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [sent, setSent] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-menu', token],
    retry: false,
    queryFn: () => callPublic<MenuData>({ action: 'menu', token }),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const items = Object.entries(cart)
        .filter(([, q]) => q > 0)
        .map(([menu_item_id, quantity]) => ({ menu_item_id, quantity, notes: notes || null }));
      return callPublic<{ orderId: string }>({ action: 'order', token, customerName, items });
    },
    onSuccess: () => {
      setCart({});
      setNotes('');
      setCartOpen(false);
      setSent(true);
      queryClient.invalidateQueries({ queryKey: ['public-orders', token] });
      toast({ title: 'Pedido enviado!', description: 'A cozinha já recebeu seu pedido.' });
    },
    onError: (e: Error) => toast({ title: 'Não foi possível enviar', description: e.message, variant: 'destructive' }),
  });

  const { data: status } = useQuery({
    queryKey: ['public-orders', token],
    enabled: sent,
    refetchInterval: 15000,
    queryFn: () => callPublic<{ orders: { id: string; status: string; total: number; customer_name: string | null }[] }>(
      { action: 'status', token },
    ),
  });

  const total = useMemo(
    () => Object.entries(cart).reduce((sum, [id, qty]) => {
      const item = data?.items.find(i => i.id === id);
      return sum + (item ? item.price * qty : 0);
    }, 0),
    [cart, data],
  );
  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const setQty = (id: string, delta: number) =>
    setCart(prev => {
      const next = Math.min(20, Math.max(0, (prev[id] ?? 0) + delta));
      const copy = { ...prev };
      if (next === 0) delete copy[id]; else copy[id] = next;
      return copy;
    });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Cardápio indisponível</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {(error as Error)?.message || 'Peça ajuda a um atendente para escanear novamente.'}
        </p>
      </main>
    );
  }

  const grouped = data.categories
    .map(c => ({ ...c, items: data.items.filter(i => i.category_id === c.id) }))
    .filter(c => c.items.length > 0);
  const uncategorized = data.items.filter(i => !i.category_id);

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        {data.restaurant.logo ? (
          <img src={data.restaurant.logo} alt={data.restaurant.name} className="h-10 w-10 rounded-lg object-contain" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <UtensilsCrossed className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold">{data.restaurant.name}</h1>
          <p className="text-xs text-muted-foreground">Mesa {data.table.number}</p>
        </div>
      </header>

      {sent && status?.orders?.length ? (
        <section className="mx-4 mt-4 rounded-2xl border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="h-4 w-4 text-primary" /> Seus pedidos nesta mesa
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {status.orders.map(o => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{o.customer_name}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{
                    { pending: 'Recebido', preparing: 'Em preparo', ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado' }[o.status] ?? o.status
                  }</Badge>
                  {brl(Number(o.total))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <main className="space-y-8 px-4 py-6">
        {[...grouped, ...(uncategorized.length ? [{ id: 'outros', name: 'Outros', items: uncategorized }] : [])].map(cat => (
          <section key={cat.id}>
            <h2 className="mb-3 text-lg font-bold tracking-tight">{cat.name}</h2>
            <div className="space-y-3">
              {cat.items.map(item => (
                <article key={item.id} className="pdv-card flex gap-3 p-3">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} loading="lazy"
                      className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-muted">
                      <ImageIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-tight">{item.name}</h3>
                    {item.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>
                    )}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-bold text-primary">{brl(Number(item.price))}</span>
                      {cart[item.id] ? (
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty(item.id, -1)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-5 text-center text-sm font-semibold">{cart[item.id]}</span>
                          <Button size="icon" className="h-8 w-8" onClick={() => setQty(item.id, 1)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" onClick={() => setQty(item.id, 1)} className="gap-1">
                          <Plus className="h-4 w-4" /> Adicionar
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>

      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-4 backdrop-blur">
          <Sheet open={cartOpen} onOpenChange={setCartOpen}>
            <SheetTrigger asChild>
              <Button size="lg" className="w-full justify-between gap-2">
                <span className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" /> Ver pedido ({count})
                </span>
                <span>{brl(total)}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
              <SheetHeader><SheetTitle>Seu pedido — Mesa {data.table.number}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-4">
                <ul className="space-y-2">
                  {Object.entries(cart).map(([id, qty]) => {
                    const item = data.items.find(i => i.id === id);
                    if (!item) return null;
                    return (
                      <li key={id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 flex-1 truncate">{qty}x {item.name}</span>
                        <span className="font-medium">{brl(item.price * qty)}</span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setQty(id, -1)}>
                          <Minus className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <div className="space-y-2">
                  <Label htmlFor="qr-name">Seu nome *</Label>
                  <Input id="qr-name" value={customerName} maxLength={80}
                    onChange={e => setCustomerName(e.target.value)} placeholder="Como devemos te chamar?" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qr-notes">Observações</Label>
                  <Textarea id="qr-notes" value={notes} maxLength={300}
                    onChange={e => setNotes(e.target.value)} placeholder="Ex.: sem cebola" />
                </div>
                <div className="flex items-center justify-between text-base font-bold">
                  <span>Total</span><span>{brl(total)}</span>
                </div>
                <Button
                  size="lg"
                  className="w-full gap-2"
                  disabled={submit.isPending || customerName.trim().length < 2}
                  onClick={() => submit.mutate()}
                >
                  {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Enviar para a cozinha
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  O pagamento é feito no caixa ou com o atendente.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      )}
    </div>
  );
}
