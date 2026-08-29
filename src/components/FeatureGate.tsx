import { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { FeatureKey, featureLabels } from '@/lib/plans';

interface Props {
  feature: FeatureKey;
  children: ReactNode;
  fallback?: ReactNode;
}

export default function FeatureGate({ feature, children, fallback }: Props) {
  const { hasFeature, planName } = usePlanFeatures();
  if (hasFeature(feature)) return <>{children}</>;
  if (fallback) return <>{fallback}</>;

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-5 w-5 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">{featureLabels[feature]}</h2>
        <p className="text-sm text-muted-foreground">
          Este recurso não está incluído no plano{planName ? ` ${planName}` : ''} do seu restaurante.
          Fale com o suporte para liberar.
        </p>
      </CardContent>
    </Card>
  );
}
