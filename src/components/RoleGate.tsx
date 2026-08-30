import { ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  roles: string[];
  children: ReactNode;
}

/** Restringe uma tela a determinados cargos, mesmo dentro de um portal compartilhado. */
export default function RoleGate({ roles, children }: Props) {
  const { roles: userRoles, isSuperAdmin } = useAuth();
  const allowed = isSuperAdmin || userRoles.some(r => roles.includes(r.role));
  if (allowed) return <>{children}</>;

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground">
          Seu cargo não tem acesso a esta tela. Peça ao administrador do restaurante para liberar.
        </p>
      </CardContent>
    </Card>
  );
}
