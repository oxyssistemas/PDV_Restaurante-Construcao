import { ReactNode, SyntheticEvent, createContext, useContext } from 'react';
import { Eye, Lock, ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { ModuleKey, moduleLabels } from '@/lib/modules';
import { toast } from 'sonner';

interface Props {
  module: ModuleKey;
  /** Exige permissão de edição, não apenas visualização. */
  requireEdit?: boolean;
  children: ReactNode;
}

const ReadOnlyContext = createContext(false);

/** true quando a pessoa só pode ver a tela atual (para esconder botões de gravar). */
export const useReadOnly = () => useContext(ReadOnlyContext);

// Botões que só mostram, filtram ou navegam continuam funcionando no modo "só ver".
const SAFE_TEXT = /^(ver( .*)?|visualizar.*|detalhes|imprimir.*|baixar.*|exportar.*|filtrar|buscar|pesquisar|atualizar|recarregar|fechar|voltar|anterior|próxim[oa]|copiar.*|mostrar.*|esconder.*|limpar filtros?)$/i;
const ACTION = 'button, [role="switch"], [role="checkbox"], [role="radio"], [role="menuitem"], [role="menuitemcheckbox"], input[type="checkbox"], input[type="radio"], input[type="file"]';
const SAFE = '[role="tab"], [role="combobox"], [role="option"], [data-readonly-ok], [aria-haspopup="listbox"], [aria-label="Close"]';

function isBlocked(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const el = target.closest(ACTION);
  if (!el || el.closest(SAFE)) return false;
  const text = (el.getAttribute('aria-label') || el.textContent || '').trim();
  // botão só com ícone de "fechar" (X) do diálogo
  if (el.querySelector('.sr-only')?.textContent?.trim() === 'Close') return false;
  return !SAFE_TEXT.test(text);
}

const warn = () => toast.info('Você só tem permissão para ver esta tela.', { id: 'read-only' });

/**
 * Modo "só ver": bloqueia cliques em botões que gravam, envio de formulários e envio de arquivos.
 * Os cliques de diálogos e menus (portais) também passam por aqui, porque o React propaga pelos portais.
 */
function ReadOnlyRegion({ children }: { children: ReactNode }) {
  const block = (e: SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); warn(); };
  return (
    <ReadOnlyContext.Provider value>
      <div
        onClickCapture={e => { if (isBlocked(e.target)) block(e); }}
        onSubmitCapture={block}
        onKeyDownCapture={e => { if ((e.key === 'Enter' || e.key === ' ') && isBlocked(e.target)) block(e); }}
      >
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
          <Eye className="h-4 w-4 shrink-0" /> Somente visualização: peça ao administrador para liberar a edição.
        </div>
        {children}
      </div>
    </ReadOnlyContext.Provider>
  );
}

/**
 * Bloqueia o conteúdo quando o plano não inclui o módulo ou a pessoa não tem permissão.
 * Com permissão só de ver, mostra a tela em modo "só ver".
 */
export default function ModuleGate({ module, requireEdit = false, children }: Props) {
  const { canView, canEdit, blockedByPlan, planName, isLoading } = useModuleAccess();
  const parentReadOnly = useReadOnly();

  if (isLoading) return null;

  if (canEdit(module)) return <>{children}</>;
  if (!requireEdit && canView(module)) {
    return parentReadOnly ? <>{children}</> : <ReadOnlyRegion>{children}</ReadOnlyRegion>;
  }

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
