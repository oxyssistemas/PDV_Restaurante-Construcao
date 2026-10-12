import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Grid3X3, ClipboardList, BookOpen, CalendarDays, LogOut, Menu, Bell, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import SideNavShell from './SideNavShell';
import ThemeToggle from '@/components/ThemeToggle';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import WaiterCallAlert from '@/components/WaiterCallAlert';

const navItems = [
  { to: '/waiter', icon: Grid3X3, label: 'Mesas', end: true },
  { to: '/waiter/orders', icon: ClipboardList, label: 'Pedidos', end: false },
  { to: '/waiter/menu', icon: BookOpen, label: 'Cardápio', end: false },
  { to: '/waiter/reservations', icon: CalendarDays, label: 'Reservas', end: false, feature: 'reservations' as const },
  { to: '/waiter/fila', icon: Users, label: 'Fila de espera', end: false, feature: 'reservations' as const },
];

export default function WaiterLayout() {
  const { signOut, user, currentRole } = useAuth();
  const { hasFeature } = usePlanFeatures();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { toast } = useToast();
  const restaurantId = currentRole?.restaurant_id;

  // Realtime: listen for order items becoming "ready"
  useEffect(() => {
    if (!restaurantId) return;

    const channel = supabase
      .channel('waiter-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_items',
        },
        (payload) => {
          const newStatus = payload.new?.status;
          const oldStatus = payload.old?.status;
          if (newStatus === 'ready' && oldStatus !== 'ready') {
            toast({
              title: '🔔 Pedido pronto!',
              description: 'Um item do pedido está pronto para retirada.',
            });
            // Play sound
            try {
              const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczFj2markup');
            } catch {}
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [restaurantId, toast]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-3 px-6 border-b border-sidebar-border">
        <BrandLogo fallbackIcon={ClipboardList} fallbackName="Garçom" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
        {navItems.filter(i => !('feature' in i) || hasFeature(i.feature)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-4">
        <div className="text-xs text-sidebar-foreground/50 mb-2 truncate">{user?.email}</div>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:text-sidebar-foreground"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <WaiterCallAlert restaurantId={restaurantId} />
      <SideNavShell open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        {sidebar}
      </SideNavShell>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">Garçom</span>
        </div>
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
