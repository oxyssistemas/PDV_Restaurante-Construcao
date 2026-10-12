export type CourierStatus = 'free' | 'on_route';

export const courierStatusLabels: Record<string, string> = {
  free: 'Livre',
  on_route: 'Em rota',
};

/** Classes de cor por situação do entregador (verde = livre, vermelho = em rota). */
export function courierStatusClasses(status?: string | null) {
  return status === 'on_route'
    ? 'bg-destructive/15 text-destructive border-destructive/40'
    : 'bg-[hsl(var(--success))]/15 text-[hsl(var(--success))] border-[hsl(var(--success))]/40';
}

export function courierDotClass(status?: string | null) {
  return status === 'on_route' ? 'bg-destructive' : 'bg-[hsl(var(--success))]';
}

/** Link que abre o app de navegação do celular traçando a rota até o endereço. */
export function navigationUrl(address: string) {
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(address)}`;
}

export function telUrl(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

type Stop = { id: string; lat?: number | null; lng?: number | null; address?: string | null };

/** Distância em linha reta (km) — só para ordenar as paradas. */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Roteirização simples: sai da loja e vai sempre para a entrega mais perto que falta.
 * Paradas sem coordenada ficam no fim, na ordem em que chegaram.
 */
export function planRoute<T extends Stop>(start: { lat: number; lng: number } | null, stops: T[]): T[] {
  const withGeo = stops.filter(s => s.lat != null && s.lng != null);
  const without = stops.filter(s => s.lat == null || s.lng == null);
  if (!start) return [...withGeo, ...without];
  const out: T[] = [];
  let here = start;
  const left = [...withGeo];
  while (left.length) {
    let best = 0;
    left.forEach((s, i) => { if (kmBetween(here, s as never) < kmBetween(here, left[best] as never)) best = i; });
    const [next] = left.splice(best, 1);
    out.push(next);
    here = { lat: next.lat!, lng: next.lng! };
  }
  return [...out, ...without];
}

/** Rota com várias paradas no Google Maps (até 9 paradas intermediárias). */
export function routeUrl(stops: Stop[]) {
  const point = (s: Stop) => (s.lat != null && s.lng != null ? `${s.lat},${s.lng}` : s.address ?? '');
  const list = stops.map(point).filter(Boolean);
  if (!list.length) return null;
  const destination = list[list.length - 1];
  const waypoints = list.slice(0, -1).slice(0, 9);
  return `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destination)}`
    + (waypoints.length ? `&waypoints=${encodeURIComponent(waypoints.join('|'))}` : '');
}
