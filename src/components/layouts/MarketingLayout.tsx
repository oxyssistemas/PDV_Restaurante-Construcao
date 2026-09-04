import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Megaphone, Share2, LogOut, Menu, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';
import { useState } from 'react';
import NotificationsBell from '@/components/NotificationsBell';

const navItems = [
  { to: '/marketing', icon: LayoutDashboard, label: 'Visão geral', end: true },
  { to: '/marketing/connections', icon: Share2, label: 'Conexões', end: false },
  { to: '/marketing/campaigns', icon: Megaphone, label: 'Campanhas', end: false },
];

export default function MarketingLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSignOut = async () => { await signOut(); navigate('/login'); };

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-6">
        <BrandLogo fallbackIcon={Megaphone} fallbackName="Marketing" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setSidebarOpen(false)}
            className={({ isActive }) =>
              cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground')
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="shrink-0 border-t border-sidebar-border p-4">
        <div className="mb-2 truncate text-xs text-sidebar-foreground/50">{user?.email}</div>
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
          <span className="font-semibold lg:hidden">Marketing</span>
          <div className="ml-auto"><NotificationsBell /></div>
        </div>
        <div className="p-4 md:p-6"><Outlet /></div>
      </main>
    </div>
  );
}
