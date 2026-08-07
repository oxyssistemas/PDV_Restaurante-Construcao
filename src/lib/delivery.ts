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
