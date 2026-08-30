import { ReactNode } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ModuleKey, moduleLabels } from '@/lib/modules';

interface Props {
  module: ModuleKey;
  /** Exige permissão de edição, não apenas visualização. */
  requireEdit?: boolean;
  children: ReactNode;
}

/** Bloqueia o conteúdo quando o plano não inclui o módulo ou o usuário não tem permissão. */
export default function ModuleGate({ module, requireEdit = false, children }: Props) {
  const { canView, canEdit, blockedByPlan, planName, isLoading } = useModuleAccess();

  if (isLoading) return null;

  const allowed = requireEdit ? canEdit(module) : canView(module);
  if (allowed) return <>{children}</>;

  const byPlan = blockedByPlan(module);

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          {byPlan ? <Lock className="h-5 w-5 text-muted-foreground" /> : <ShieldAlert className="h-5 w-5 text-muted-foreground" />}
        </div>
        <h2 className="text-lg font-semibold">{moduleLabels[module]}</h2>
        <p className="text-sm text-muted-foreground">
          {byPlan
            ? `Este recurso não está incluído no plano${planName ? ` ${planName}` : ''} do seu restaurante. Fale com o suporte para liberar.`
            : 'Você não tem permissão para acessar este módulo. Peça ao administrador do restaurante para liberar o acesso.'}
        </p>
      </CardContent>
    </Card>
  );
}
