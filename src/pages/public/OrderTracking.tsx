import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Bike, Check, ChefHat, Loader2, MessageCircle, ReceiptText, ShoppingBag, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { brl, callStore, PAYMENT_LABELS, waLink, type TrackData } from '@/lib/deliveryStore';

const STEPS = ['pending', 'preparing', 'out_for_delivery', 'delivered'] as const;

export default function OrderTracking() {
  const { slug = '', orderId = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t') ?? '';

  const { data, isLoading, error } = useQuery({
    queryKey: ['order-tracking', orderId, token],
    retry: false,
    refetchInterval: q => (['delivered', 'cancelled'].includes(q.state.data?.order.delivery_status ?? '') ? false : 15_000),
    queryFn: () => callStore<TrackData>({ action: 'status', orderId, token }),
  });

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (error || !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <ReceiptText className="h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Pedido não encontrado</h1>
        <p className="text-sm text-muted-foreground">{(error as Error)?.message}</p>
      </main>
    );
  }

  const { order, store } = data;
  const pickup = order.order_type === 'takeaway';
  const cancelled = order.delivery_status === 'cancelled';
  const current = STEPS.indexOf(order.delivery_status as typeof STEPS[number]);
  const labels = ['Recebido', 'Em preparo', pickup ? 'Pronto para retirada' : 'Saiu para entrega', pickup ? 'Retirado' : 'Entregue'];
  const icons = [ReceiptText, ChefHat, pickup ? ShoppingBag : Bike, Check];
  const items = order.order_items.filter(i => i.status !== 'cancelled');
  const eta = pickup ? store?.pickup_eta_minutes : store?.eta_minutes;

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-lg space-y-5 px-4 py-8">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Pedido #{order.code}</p>
          <h1 className="mt-1 text-2xl font-bold">
            {cancelled ? 'Pedido cancelado' : current >= 3 ? 'Bom apetite! 😋' : `Obrigado, ${order.customer_name?.split(' ')[0] ?? ''}!`}
          </h1>
          {!cancelled && current < 2 && eta && <p className="mt-1 text-sm text-muted-foreground">Previsão: cerca de {eta} min</p>}
        </div>

        {cancelled ? (
          <div className="flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <XCircle className="h-5 w-5 text-destructive" /> O restaurante cancelou este pedido. Fale com eles para saber mais.
          </div>
        ) : (
          <ol className="pdv-card space-y-4 p-5">
            {labels.map((l, i) => {
              const Icon = icons[i];
              const done = i <= current;
              return (
                <li key={l} className="flex items-center gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2',
                    done ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className={cn('text-sm', i === current ? 'font-bold' : done ? 'font-medium' : 'text-muted-foreground')}>{l}</span>
                  {i === current && current < 3 && <Loader2 className="ml-auto h-4 w-4 animate-spin text-primary" />}
                </li>
              );
            })}
          </ol>
        )}

        {store?.whatsapp && !cancelled && current < 3 && (
          <Button asChild size="lg" className="w-full gap-2 bg-[#25d366] text-white hover:bg-[#1fb457]">
            <a href={waLink(store.whatsapp, `Olá! Quero acompanhar o pedido #${order.code}`)} target="_blank" rel="noreferrer">
              <MessageCircle className="h-5 w-5" /> Receber avisos pelo WhatsApp
            </a>
          </Button>
        )}

        <section className="pdv-card space-y-2 p-5 text-sm">
          <h2 className="font-semibold">Resumo</h2>
          <ul className="space-y-1">
            {items.map((i, idx) => (
              <li key={idx} className="flex justify-between gap-2">
                <span>{i.quantity}x {i.menu_items?.name}{i.notes && <span className="text-muted-foreground"> · {i.notes}</span>}</span>
                <span>{brl(i.quantity * Number(i.unit_price))}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-border pt-2">
            {!pickup && <div className="flex justify-between"><span>Entrega</span><span>{Number(order.delivery_fee) > 0 ? brl(Number(order.delivery_fee)) : 'grátis'}</span></div>}
            <div className="flex justify-between font-bold"><span>Total</span><span>{brl(Number(order.total) + Number(order.delivery_fee || 0))}</span></div>
          </div>
          {order.payment_hint && (
            <p className="text-muted-foreground">
              Pagamento na {pickup ? 'retirada' : 'entrega'}: {PAYMENT_LABELS[order.payment_hint] ?? order.payment_hint}
              {order.payment_hint === 'cash' && Number(order.change_for) > 0 && ` (troco para ${brl(Number(order.change_for))})`}
            </p>
          )}
          {order.customer_address && <p className="text-muted-foreground">Entregar em: {order.customer_address}</p>}
        </section>

        <Button asChild variant="outline" className="w-full"><Link to={`/pedir/${slug}`}>Fazer outro pedido</Link></Button>
      </main>
    </div>
  );
}
