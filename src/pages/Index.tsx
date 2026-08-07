import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function Index() {
  const { user, loading, roles, isSuperAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (isSuperAdmin) return <Navigate to="/super-admin" replace />;

  // Route based on primary role
  const role = roles.find(r => r.role !== 'super_admin');
  if (role) {
    switch (role.role) {
      case 'admin': return <Navigate to="/admin" replace />;
      case 'waiter': return <Navigate to="/waiter" replace />;
      case 'kitchen': return <Navigate to="/kitchen" replace />;
      case 'cashier': return <Navigate to="/cashier" replace />;
      case 'finance': return <Navigate to="/finance" replace />;
      case 'delivery': return <Navigate to="/delivery" replace />;
      case 'courier': return <Navigate to="/courier" replace />;

    }
  }

  // No role assigned yet
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-2">
        <p className="text-lg text-muted-foreground">Sem permissão atribuída.</p>
        <p className="text-sm text-muted-foreground">Contate o administrador do seu restaurante.</p>
      </div>
    </div>
  );
}
