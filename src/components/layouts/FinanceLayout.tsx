import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LineChart, LogOut, Menu, FileBarChart, Package, Building2, History, Briefcase, PieChart, Gift,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import NotificationsBell from '@/components/NotificationsBell';
import { ModuleKey } from '@/lib/modules';
import { useModuleAccess } from '@/hooks/useModuleAccess';


const navItems: { to: string; icon: typeof LineChart; label: string; end: boolean; module?: ModuleKey; financeOnly?: boolean }[] = [
  { to: '/finance', icon: LineChart, label: 'Dashboard', end: true, financeOnly: true },
  { to: '/finance/crm', icon: Building2, label: 'CRM Financeiro', end: false, financeOnly: true },
  { to: '/finance/dre', icon: PieChart, label: 'DRE', end: false, module: 'dre' },
  { to: '/finance/hr', icon: Briefcase, label: 'RH', end: false, module: 'hr' },
  { to: '/finance/loyalty', icon: Gift, label: 'Fidelidade', end: false, module: 'loyalty' },
  { to: '/finance/reports', icon: FileBarChart, label: 'Relatórios', end: false, financeOnly: true },
  { to: '/finance/inventory', icon: Package, label: 'Estoque', end: false, financeOnly: true },
  { to: '/finance/history', icon: History, label: 'Histórico', end: false, financeOnly: true },
];


export default function FinanceLayout() {
  const { signOut, user, roles, isSuperAdmin } = useAuth();
  const { canView } = useModuleAccess();
  const isFinance = isSuperAdmin || roles.some(r => r.role === 'finance');
  const visibleItems = navItems.filter(i =>
    (i.financeOnly ? isFinance : true) && (!i.module || canView(i.module))
  );
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center gap-3 px-6 border-b border-sidebar-border">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <LineChart className="h-5 w-5" />
        </div>
        <span className="font-bold text-lg tracking-tight">Financeiro</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(item => (
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
      <div className="border-t border-sidebar-border p-4">
        <div className="text-xs text-sidebar-foreground/50 mb-2 truncate">{user?.email}</div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={cn('fixed inset-y-0 left-0 z-50 w-64 transform transition-transform lg:relative lg:translate-x-0', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
        {sidebar}
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="flex h-14 items-center gap-4 border-b px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></Button>
          <span className="font-semibold lg:hidden">Financeiro</span>
          <div className="ml-auto"><NotificationsBell /></div>
        </div>
        <div className="p-4 md:p-6"><Outlet /></div>
      </main>

    </div>
  );
}
