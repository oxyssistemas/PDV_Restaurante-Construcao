import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  UtensilsCrossed, LayoutDashboard, BookOpen, Grid3X3, Users, Package, Settings, LogOut, Menu,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/menu', icon: BookOpen, label: 'Cardápio', end: false },
  { to: '/admin/tables', icon: Grid3X3, label: 'Mesas', end: false },
  { to: '/admin/inventory', icon: Package, label: 'Estoque', end: false },
  { to: '/admin/users', icon: Users, label: 'Usuários', end: false },
  { to: '/admin/settings', icon: Settings, label: 'Configurações', end: false },
];

export default function AdminLayout() {
  const { signOut, user } = useAuth();
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
          <UtensilsCrossed className="h-5 w-5" />
        </div>
        <span className="font-bold text-lg tracking-tight">Administração</span>
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
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 transform transition-transform lg:relative lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {sidebar}
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="flex h-14 items-center gap-4 border-b px-4 lg:hidden">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="font-semibold">Admin</span>
        </div>
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
