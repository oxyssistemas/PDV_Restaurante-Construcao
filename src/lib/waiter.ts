export type TableUiStatus = 'free' | 'occupied' | 'sent' | 'ready' | 'calling';

export const tableStatusMeta: Record<TableUiStatus, { label: string; dot: string; card: string; chip: string }> = {
  free: {
    label: 'Livre',
    dot: 'bg-emerald-500',
    card: 'border-emerald-500/40 hover:border-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  occupied: {
    label: 'Ocupada',
    dot: 'bg-primary',
    card: 'border-primary/40 hover:border-primary',
    chip: 'bg-primary/15 text-primary border-primary/30',
  },
  sent: {
    label: 'Pedido enviado',
    dot: 'bg-yellow-400',
    card: 'border-yellow-400/40 hover:border-yellow-400',
    chip: 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30',
  },
  ready: {
    label: 'Pedido pronto',
    dot: 'bg-sky-400',
    card: 'border-sky-400/50 hover:border-sky-400',
    chip: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
  },
  calling: {
    label: 'Solicitando atendimento',
    dot: 'bg-fuchsia-500',
    card: 'border-fuchsia-500/50 hover:border-fuchsia-500',
    chip: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30',
  },
};

export const waiterFilters: { value: 'all' | TableUiStatus; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'free', label: 'Livres' },
  { value: 'occupied', label: 'Ocupadas' },
  { value: 'sent', label: 'Aguardando pedido' },
  { value: 'ready', label: 'Pedido pronto' },
  { value: 'calling', label: 'Atendimento' },
];

export function elapsedSince(iso?: string | null) {
  if (!iso) return '--';
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}min`;
}

export function timeLabel(iso?: string | null) {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const brl = (v: number) =>
  `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
