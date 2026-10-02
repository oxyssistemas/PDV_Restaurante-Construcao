import type { ComponentType } from 'react';
import { CloudOff, Globe, Headset, MessageCircle, QrCode, Smartphone } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/** De onde veio o pedido (orders.source), com a cor de cada canal. */
type Source = { label: string; bg: string; fg: string; icon?: ComponentType<{ className?: string }>; mark?: string };

export const ORDER_SOURCES: Record<string, Source> = {
  site: { label: 'Loja online', bg: '#2563eb', fg: '#fff', icon: Globe },
  whatsapp: { label: 'WhatsApp', bg: '#25d366', fg: '#fff', icon: MessageCircle },
  ifood: { label: 'iFood', bg: '#ea1d2c', fg: '#fff', mark: 'iF' },
  '99food': { label: '99Food', bg: '#ffdd00', fg: '#111', mark: '99' },
  keeta: { label: 'Keeta', bg: '#ffc300', fg: '#111', mark: 'K' },
  rappi: { label: 'Rappi', bg: '#ff441f', fg: '#fff', mark: 'R' },
  other_app: { label: 'Outro app', bg: '#64748b', fg: '#fff', icon: Smartphone },
  qr: { label: 'QR da mesa', bg: '#7c3aed', fg: '#fff', icon: QrCode },
  internal: { label: 'Equipe / telefone', bg: '#475569', fg: '#fff', icon: Headset },
  pos: { label: 'Balcão', bg: '#475569', fg: '#fff', icon: Headset },
  offline: { label: 'Modo offline', bg: '#b45309', fg: '#fff', icon: CloudOff },
};

/** Origens que a equipe escolhe ao lançar um pedido à mão (apps sem integração automática). */
export const MANUAL_SOURCES = ['internal', 'whatsapp', '99food', 'keeta', 'rappi', 'other_app'] as const;

export const sourceLabel = (source?: string | null) => ORDER_SOURCES[source ?? 'internal']?.label ?? source ?? 'Equipe';

export default function SourceBadge({ source, showLabel = false, className }: { source?: string | null; showLabel?: boolean; className?: string }) {
  const s = ORDER_SOURCES[source ?? 'internal'] ?? ORDER_SOURCES.other_app;
  const Icon = s.icon;
  const bubble = (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold leading-none shadow-sm"
        style={{ backgroundColor: s.bg, color: s.fg }}
        aria-label={s.label}
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : s.mark}
      </span>
      {showLabel && <span className="text-xs font-medium">{s.label}</span>}
    </span>
  );
  if (showLabel) return bubble;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{bubble}</TooltipTrigger>
      <TooltipContent>{s.label}</TooltipContent>
    </Tooltip>
  );
}
