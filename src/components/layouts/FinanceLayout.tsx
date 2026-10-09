import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LineChart, LogOut, Menu, FileBarChart, Package, Building2, History, Briefcase, PieChart, Gift, ClipboardCheck, Calculator, MessageSquareHeart, FileArchive, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { useState } from 'react';
import NotificationsBell from '@/components/NotificationsBell';
import { ModuleKey } from '@/lib/modules';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import SideNavShell from './SideNavShell';
import ThemeToggle from '@/components/ThemeToggle';


const navItems: { to: string; icon: typeof LineChart; label: string; end: boolean; module: ModuleKey }[] = [
  { to: '/finance', icon: LineChart, label: 'Dashboard', end: true, module: 'dashboard' },
  { to: '/finance/crm', icon: Building2, label: 'CRM Financeiro', end: false, module: 'crm' },
  { to: '/finance/dre', icon: PieChart, label: 'DRE', end: false, module: 'dre' },
  { to: '/finance/fiscal', icon: Receipt, label: 'Fiscal (NFC-e)', end: false, module: 'fiscal' },
  { to: '/finance/hr', icon: Briefcase, label: 'RH', end: false, module: 'hr' },
  { to: '/finance/loyalty', icon: Gift, label: 'Fidelidade', end: false, module: 'loyalty' },
  { to: '/finance/reports', icon: FileBarChart, label: 'Relatórios', end: false, module: 'reports' },
  { to: '/finance/inventory', icon: Package, label: 'Estoque', end: false, module: 'inventory' },
  { to: '/finance/stock-counts', icon: ClipboardCheck, label: 'Balanço de estoque', end: false, module: 'stock_counts' },
  { to: '/finance/cmv', icon: Calculator, label: 'Custo do prato (CMV)', end: false, module: 'cmv' },
  { to: '/finance/reviews', icon: MessageSquareHeart, label: 'Avaliações (NPS)', end: false, module: 'reviews' },
  { to: '/finance/accountant', icon: FileArchive, label: 'Pacote do contador', end: false, module: 'accountant' },
  { to: '/finance/history', icon: History, label: 'Histórico', end: false, module: 'history' },
];


export default function FinanceLayout() {
  const { signOut, user } = useAuth();
  const { canView, isLoading: accessLoading } = useModuleAccess();
  const location = useLocation();
  const visibleItems = navItems.filter(i => canView(i.module));
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // sem acesso à tela inicial do portal: abre a primeira tela liberada
  if (!accessLoading && location.pathname === '/finance' && !canView('dashboard') && visibleItems[0] && visibleItems[0].to !== '/finance') {
    return <Navigate to={visibleItems[0].to} replace />;
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-3 px-6 border-b border-sidebar-border">
        <BrandLogo fallbackIcon={LineChart} fallbackName="Financeiro" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
        {visibleItems.map(item => (
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
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" /> Sair
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <SideNavShell open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        {sidebar}
      </SideNavShell>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}><Menu className="h-5 w-5" /></Button>
          <span className="font-semibold lg:hidden">Financeiro</span>
          <div className="ml-auto"><NotificationsBell /></div>
        </div>
        <div className="p-4 md:p-6"><Outlet /></div>
      </main>

    </div>
  );
}
