import { useAuth } from '@/contexts/AuthContext';
import CmvPanel from '@/components/CmvPanel';

/** Portal Financeiro: custo do prato e CMV. */
export default function FinanceCmv() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  return (
    <div>
      <h1 className="mb-1 text-3xl font-bold tracking-tight">Custo do prato (CMV)</h1>
      <p className="mb-6 text-sm text-muted-foreground">Quanto cada prato custa pela ficha técnica, a margem e o CMV das vendas.</p>
      {restaurantId && <CmvPanel restaurantId={restaurantId} />}
    </div>
  );
}
