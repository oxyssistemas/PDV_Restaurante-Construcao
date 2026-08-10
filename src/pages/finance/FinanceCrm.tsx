import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SuppliersPanel from '@/components/crm/SuppliersPanel';
import PayablesPanel from '@/components/crm/PayablesPanel';
import InvoicesPanel from '@/components/crm/InvoicesPanel';
import CustomersPanel from '@/components/crm/CustomersPanel';
import AuditLogPanel from '@/components/crm/AuditLogPanel';

export default function FinanceCrmPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const role = currentRole?.role;

  const { data: restaurant } = useQuery({
    queryKey: ['crm-restaurant', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('name').eq('id', restaurantId!).single();
      if (error) throw error;
      return data;
    },
  });

  if (!restaurantId) {
    return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CRM Financeiro</h1>
        <p className="text-muted-foreground">Fornecedores, contas a pagar, notas fiscais e auditoria.</p>
      </div>

      <Tabs defaultValue="payables">
        <TabsList className="flex-wrap">
          <TabsTrigger value="payables">Contas a pagar</TabsTrigger>
          <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
          <TabsTrigger value="invoices">Notas fiscais</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
          <TabsTrigger value="logs">Log de alterações</TabsTrigger>
        </TabsList>
        <TabsContent value="payables" className="mt-4">
          <PayablesPanel restaurantId={restaurantId} role={role} />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <SuppliersPanel restaurantId={restaurantId} role={role} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesPanel restaurantId={restaurantId} role={role} restaurantName={restaurant?.name} />
        </TabsContent>
        <TabsContent value="customers" className="mt-4">
          <CustomersPanel restaurantId={restaurantId} role={role} />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <AuditLogPanel restaurantId={restaurantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
