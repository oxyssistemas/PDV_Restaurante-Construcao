import { Sparkles } from 'lucide-react';
import { FEATURES, type FeatureKey } from '@/lib/plans';
import { brl } from '@/lib/finance';
import type { TrialSuggestion as Suggestion } from '@/hooks/useTrial';

/** Plano indicado pelo uso no teste, com o que a pessoa usou. */
export default function TrialSuggestion({ suggestion }: { suggestion: Suggestion | null | undefined }) {
  if (!suggestion?.plan) return null;
  const used = suggestion.used.filter((k): k is FeatureKey => k in FEATURES);
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3 text-left text-sm">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" /> Plano ideal para o seu uso
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-base font-bold">{suggestion.plan.name}</span>
        {Number(suggestion.plan.price) > 0 && <span className="font-semibold text-primary">{brl(Number(suggestion.plan.price))}/mês</span>}
      </div>
      {used.length ? (
        <p className="text-xs text-muted-foreground">
          Você usou: {used.map(k => FEATURES[k].label).join(', ')}.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Até agora você usou o essencial do salão (mesas, cozinha e caixa).</p>
      )}
    </div>
  );
}
