import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Bike, LogOut, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BrandLogo from '@/components/BrandLogo';

const navItems = [
  { to: '/courier', icon: ListOrdered, label: 'Minhas entregas', end: true },
];

export default function CourierLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card px-4">
        <BrandLogo
          fallbackIcon={Bike}
          fallbackName="Entregador"
          dark={false}
          subtitle={user?.email ?? undefined}
          className="mr-auto"
          nameClassName="text-base"
          iconWrapperClassName="bg-primary text-primary-foreground"
        />
        <Button variant="ghost" size="icon" onClick={handleSignOut} aria-label="Sair">
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <nav className="flex gap-2 border-b border-border bg-card px-4 py-2">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
