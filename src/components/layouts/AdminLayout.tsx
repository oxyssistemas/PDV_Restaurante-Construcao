import { Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  UtensilsCrossed, LayoutDashboard, BookOpen, Grid3X3, Users, Package, Settings, LogOut, Menu, Bike,
  Building2, History, Briefcase, PieChart, Gift, Palette, Megaphone, ShieldCheck,
  Network, LineChart, ClipboardCheck, MessageSquareHeart, FileArchive, MonitorSmartphone, Receipt, BadgePercent, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { useState } from 'react';
import NotificationsBell from '@/components/NotificationsBell';
import { MODULES, ModuleKey } from '@/lib/modules';
import { usePlansList, useTrial } from '@/hooks/useTrial';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import type { FeatureKey } from '@/lib/plans';
import { useCurrentStore } from '@/hooks/useCurrentStore';
import StoreSwitcher from '@/components/StoreSwitcher';
import SideNavShell from './SideNavShell';
import ThemeToggle from '@/components/ThemeToggle';
import TrialClock from '@/components/TrialClock';

const navItems: { to: string; icon: typeof Users; label: string; end: boolean; module?: ModuleKey; branches?: true; network?: true; adminOnly?: true; feature?: FeatureKey }[] = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true, module: 'dashboard' },
  { to: '/admin/network', icon: LineChart, label: 'Painel da rede', end: false, module: 'network', network: true },
  { to: '/admin/crm', icon: Building2, label: 'CRM', end: false, module: 'crm' },
  { to: '/admin/menu', icon: BookOpen, label: 'Cardápio', end: false, module: 'menu' },
  { to: '/admin/tables', icon: Grid3X3, label: 'Mesas', end: false, module: 'tables' },
  { to: '/admin/fila', icon: Users, label: 'Fila de espera', end: false, module: 'tables', feature: 'reservations' },
  { to: '/admin/kiosks', icon: MonitorSmartphone, label: 'Autoatendimento', end: false, module: 'kiosks' },
  { to: '/admin/inventory', icon: Package, label: 'Estoque', end: false, module: 'inventory' },
  { to: '/admin/compras', icon: ShoppingCart, label: 'Compras', end: false, module: 'inventory' },
  { to: '/admin/stock-counts', icon: ClipboardCheck, label: 'Balanço de estoque', end: false, module: 'stock_counts' },
  { to: '/admin/fiscal', icon: Receipt, label: 'Fiscal (NFC-e)', end: false, module: 'fiscal' },
  { to: '/admin/accountant', icon: FileArchive, label: 'Pacote do contador', end: false, module: 'accountant' },
  { to: '/admin/hr', icon: Briefcase, label: 'RH', end: false, module: 'hr' },
  { to: '/admin/dre', icon: PieChart, label: 'DRE', end: false, module: 'dre' },
  { to: '/admin/loyalty', icon: Gift, label: 'Fidelidade', end: false, module: 'loyalty' },
  { to: '/admin/reviews', icon: MessageSquareHeart, label: 'Avaliações (NPS)', end: false, module: 'reviews' },
  { to: '/admin/promotions', icon: BadgePercent, label: 'Promoções', end: false, module: 'promotions' },
  { to: '/marketing', icon: Megaphone, label: 'Marketing', end: false, module: 'marketing' },
  { to: '/admin/history', icon: History, label: 'Histórico', end: false, module: 'history' },
  { to: '/admin/delivery', icon: Bike, label: 'Delivery', end: false, module: 'delivery' },
  { to: '/admin/branches', icon: Network, label: 'Filiais', end: false, module: 'branches', branches: true },
  { to: '/admin/users', icon: Users, label: 'Usuários', end: false, module: 'users' },
  { to: '/admin/permissions', icon: ShieldCheck, label: 'Permissões', end: false, adminOnly: true, feature: 'permissions' },
  { to: '/admin/branding', icon: Palette, label: 'Identidade visual', end: false, module: 'branding' },
  { to: '/admin/settings', icon: Settings, label: 'Configurações', end: false, module: 'settings' },
];





export default function AdminLayout() {
  const { signOut, user, stores, roles, isSuperAdmin } = useAuth();
  const { canView, isLoading: accessLoading } = useModuleAccess();
  const { hasFeature } = usePlanFeatures();
  const location = useLocation();
  const { canManageBranches } = useCurrentStore();
  // Permissões ficam com o dono (o banco só deixa o admin gravar permissões)
  const isOwner = isSuperAdmin || roles.some(r => r.role === 'admin');
  const visibleItems = navItems.filter(i =>
    (!i.module || canView(i.module)) && (!i.adminOnly || isOwner) && (!i.feature || hasFeature(i.feature)) &&
    (!i.branches || canManageBranches) && (!i.network || stores.length > 1));
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // no teste grátis: etiqueta do plano de cada tela (o menor plano que tem a função)
  const { trial } = useTrial();
  const { data: plans } = usePlansList(!!trial);
  const planOf = (i: (typeof navItems)[number]) => {
    const feature = i.feature ?? (i.module ? MODULES[i.module].feature : undefined);
    if (!trial || !feature || !plans?.length) return null;
    const p = plans.find(pl => (pl.features as Record<string, boolean> | null)?.[feature] !== false);
    return p && p.code !== plans[0].code ? p.name : null;
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  // sem acesso à tela inicial do portal: abre a primeira tela liberada
  if (!accessLoading && location.pathname === '/admin' && !canView('dashboard') && visibleItems[0] && visibleItems[0].to !== '/admin') {
    return <Navigate to={visibleItems[0].to} replace />;
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-3 px-6 border-b border-sidebar-border">
        <BrandLogo fallbackIcon={UtensilsCrossed} fallbackName="Administração" />
      </div>
      <StoreSwitcher />

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-4">
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
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {planOf(item) && (
              <span title={`Plano ${planOf(item)}`} className="shrink-0 rounded-full border border-primary/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none text-primary">
                {planOf(item)!.slice(0, 3)}
              </span>
            )}
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
      <SideNavShell open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        {sidebar}
      </SideNavShell>
      <main className="flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-4 border-b bg-background px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold lg:hidden">Admin</span>
          <div className="ml-auto flex items-center gap-2"><TrialClock /><div data-tour="notifications"><NotificationsBell /></div></div>
        </div>
        <div className="p-6">
          <Outlet />
        </div>

      </main>
    </div>
  );
}
