import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Loader2, MapPin } from 'lucide-react';
import { edgeErrorMessage } from '@/lib/functionError';

export type KmQuote = { fee: number; km: number; lat: number; lng: number };

/** Loja com taxa por distância? (Delivery → Loja online → Entrega) */
export function useKmStore(restaurantId?: string | null) {
  return useQuery({
    queryKey: ['km-store', restaurantId],
    enabled: !!restaurantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('delivery_stores').select('slug, fee_mode, lat').eq('restaurant_id', restaurantId!).maybeSingle();
      return data;
    },
  });
}

/**
 * Botão "Calcular pela distância" nos pedidos lançados pela equipe: acha o endereço no mapa e devolve
 * taxa, km e coordenadas (o pedido aparece no mapa do delivery e na rota do entregador).
 */
export default function KmFeeButton({ restaurantId, address, onQuote }: {
  restaurantId?: string | null; address: string; onQuote: (q: KmQuote) => void;
}) {
  const { data: store } = useKmStore(restaurantId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (store?.fee_mode !== 'distance') return null;

  const run = async () => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke('delivery-store', { body: { action: 'quote', slug: store.slug, address } });
    setBusy(false);
    const err = error ? await edgeErrorMessage(error) : (data as { error?: string })?.error;
    if (err) { setMsg(err); return; }
    const q = data as KmQuote;
    onQuote(q);
    setMsg(`${q.km.toFixed(1).replace('.', ',')} km`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={busy || address.trim().length < 8} onClick={run}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />} Calcular pela distância
      </Button>
      {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
    </div>
  );
}
