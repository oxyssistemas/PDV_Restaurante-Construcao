import { memo } from 'react';
import { motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Clock, Bike, UtensilsCrossed, User, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KdsItem = {
  id: string;
  quantity: number;
  notes: string | null;
  status: string;
  created_at: string;
  name: string;
  sector: string;
};

export type KdsTicket = {
  key: string;
  orderId: string;
  isDelivery: boolean;
  title: string;
  waiter: string;
  createdAt: string;
  items: KdsItem[];
  column: 'new' | 'preparing' | 'ready' | 'waiting';
};

export function elapsedMinutes(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

export function timeTone(mins: number) {
  if (mins < 5) return 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10';
  if (mins < 10) return 'text-amber-400 border-amber-500/40 bg-amber-500/10';
  return 'text-red-400 border-red-500/40 bg-red-500/10';
}

interface Props {
  ticket: KdsTicket;
  now: number;
  selected?: boolean;
  onSelect: (t: KdsTicket) => void;
  onDragStart: (t: KdsTicket) => void;
}

function OrderTicketCardBase({ ticket, now, selected, onSelect, onDragStart }: Props) {
  const mins = Math.max(0, Math.floor((now - new Date(ticket.createdAt).getTime()) / 60000));
  const late = mins >= 10;

  return (
    <motion.div
      layout
      layoutId={ticket.key}
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      draggable
      onDragStart={() => onDragStart(ticket)}
      onClick={() => onSelect(ticket)}
      className={cn(
        'cursor-pointer select-none rounded-2xl border bg-card p-3 shadow-lg shadow-black/20 transition-colors',
        selected ? 'border-primary ring-1 ring-primary/50' : 'border-border hover:border-primary/50',
        late && 'border-red-500/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {ticket.isDelivery ? (
              <Bike className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <UtensilsCrossed className="h-4 w-4 shrink-0 text-primary" />
            )}
            <span className="truncate">{ticket.title}</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
            <User className="h-3 w-3" />
            <span className="truncate">{ticket.waiter}</span>
          </div>
        </div>
        <Badge variant="outline" className={cn('shrink-0 gap-1 text-[11px] font-semibold', timeTone(mins))}>
          <Clock className="h-3 w-3" /> {mins}m
        </Badge>
      </div>

      <div className="mt-2 space-y-1">
        {ticket.items.slice(0, 5).map((item) => (
          <div key={item.id} className="text-sm leading-tight">
            <span className="font-semibold text-primary">{item.quantity}x</span>{' '}
            <span className={cn(item.status === 'ready' && 'text-muted-foreground line-through')}>{item.name}</span>
            {item.notes && (
              <div className="ml-5 flex items-start gap-1 text-[11px] font-medium text-amber-400">
                <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" /> {item.notes}
              </div>
            )}
          </div>
        ))}
        {ticket.items.length > 5 && (
          <div className="text-[11px] text-muted-foreground">+ {ticket.items.length - 5} itens…</div>
        )}
      </div>
    </motion.div>
  );
}

export const OrderTicketCard = memo(OrderTicketCardBase);
