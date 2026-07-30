import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, PackageX } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function NotificationsBell() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const role = currentRole?.role;
  const queryClient = useQueryClient();

  const { data: notifications } = useQuery({
    queryKey: ['notifications', restaurantId, role],
    enabled: !!restaurantId,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('restaurant_id', restaurantId!)
        .order('created_at', { ascending: false })
        .limit(30);
      return (data || []).filter(n => !role || n.target_roles.includes(role));
    },
  });

  useEffect(() => {
    if (!restaurantId) return;
    const channel = supabase
      .channel('notifications-rt')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `restaurant_id=eq.${restaurantId}` },
        (payload: any) => {
          const n = payload.new;
          if (role && !n.target_roles?.includes(role)) return;
          toast.warning(n.title, { description: n.message, duration: 8000 });
          queryClient.invalidateQueries({ queryKey: ['notifications'] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, role, queryClient]);

  const unread = (notifications || []).filter(n => !n.read);

  const markAllRead = async () => {
    const ids = unread.map(n => n.id);
    if (!ids.length) return;
    await supabase.from('notifications').update({ read: true }).in('id', ids);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  return (
    <Popover onOpenChange={(o) => { if (!o) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unread.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2 text-sm font-semibold">Notificações</div>
        <div className="max-h-80 overflow-auto">
          {!notifications?.length ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>
          ) : (
            notifications.map(n => (
              <div key={n.id} className={`flex gap-3 border-b px-4 py-3 last:border-0 ${n.read ? 'opacity-60' : ''}`}>
                <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">{n.title}</div>
                  <div className="text-xs text-muted-foreground">{n.message}</div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
