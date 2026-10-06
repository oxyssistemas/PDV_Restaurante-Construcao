import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SuppliersPanel from '@/components/crm/SuppliersPanel';
import PayablesPanel from '@/components/crm/PayablesPanel';
import CustomersPanel from '@/components/crm/CustomersPanel';
import AuditLogPanel from '@/components/crm/AuditLogPanel';

export default function FinanceCrmPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const role = currentRole?.role;


  if (!restaurantId) {
    return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CRM Financeiro</h1>
        <p className="text-muted-foreground">Fornecedores, contas a pagar e auditoria.</p>
      </div>

      <Tabs defaultValue="payables">
        <TabsList className="flex-wrap">
          <TabsTrigger value="payables">Contas a pagar</TabsTrigger>
          <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
          <TabsTrigger value="customers">Clientes</TabsTrigger>
          <TabsTrigger value="logs">Log de alterações</TabsTrigger>
        </TabsList>
        <TabsContent value="payables" className="mt-4">
          <PayablesPanel restaurantId={restaurantId} role={role} />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <SuppliersPanel restaurantId={restaurantId} role={role} />
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
