import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LogOut,
  Menu,
  Wallet,
  ArrowDownUp,
  ReceiptText,
  ShoppingCart,
  X,
  Circle,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import logo from '@/assets/oxys-logo.png.asset.json';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const navItems = [
  { to: '/cashier', icon: Wallet, label: 'Caixa', end: true },
  { to: '/cashier/orders', icon: ShoppingCart, label: 'Lançar Pedido', end: false },
  { to: '/cashier/payments', icon: ReceiptText, label: 'Pagamentos', end: false },
  { to: '/cashier/movements', icon: ArrowDownUp, label: 'Movimentações', end: false },
];

export default function CashierLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  const { data: register } = useQuery({
    queryKey: ['cashier-open-register-bar'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cash_registers')
        .select('id, opened_at, opening_amount')
        .is('closed_at', null)
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 60_000,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
        <img src={logo.url} alt="Oxys Sistemas" className="h-9 w-9 rounded-xl object-contain" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-tight">Oxys Sistemas</div>
          <div className="truncate text-[11px] text-sidebar-foreground/50">Frente de Caixa</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <nav className="pdv-scroll flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_hsl(var(--primary))]'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
              )
            }
          >
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-2 truncate text-xs text-sidebar-foreground/50">{user?.email}</div>
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" /> Sair do Sistema
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-200 lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-border px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">Caixa</span>
        </div>

        <main className="pdv-scroll min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>

        <footer className="flex h-11 shrink-0 flex-wrap items-center gap-x-5 gap-y-1 overflow-hidden border-t border-border bg-card px-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {format(now, "dd/MM/yyyy • HH:mm", { locale: ptBR })}
          </span>
          <span className="flex items-center gap-1.5 text-[hsl(var(--success))]">
            <Circle className="h-2 w-2 fill-current" /> Online
          </span>
          <span className="hidden truncate sm:inline">
            {register
              ? `Caixa aberto por ${user?.email?.split('@')[0]} • ${format(new Date(register.opened_at), "dd/MM 'às' HH:mm", { locale: ptBR })}`
              : 'Nenhum caixa aberto'}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 rounded-lg text-xs"
            onClick={() => navigate('/cashier')}
          >
            {register ? 'Fechar Caixa' : 'Abrir Caixa'}
          </Button>
        </footer>
      </div>
    </div>
  );
}
