import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CustomersPanel from '@/components/crm/CustomersPanel';
import SuppliersPanel from '@/components/crm/SuppliersPanel';
import PayablesPanel from '@/components/crm/PayablesPanel';
import AuditLogPanel from '@/components/crm/AuditLogPanel';
import ReceivablesPanel from '@/components/crm/ReceivablesPanel';
import { BankReconcilePanel, CashFlowPanel } from '@/components/crm/CashFlowPanel';

export default function CrmPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const role = currentRole?.role;


  if (!restaurantId) {
    return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">CRM do restaurante</h1>
        <p className="text-muted-foreground">Clientes, fornecedores, contas a pagar e a receber, fluxo de caixa, conciliação bancária e histórico de alterações.</p>
      </div>

      <Tabs defaultValue="customers">
        <TabsList className="flex-wrap">
          <TabsTrigger value="customers">Clientes</TabsTrigger>
          <TabsTrigger value="suppliers">Fornecedores</TabsTrigger>
          <TabsTrigger value="payables">Contas a pagar</TabsTrigger>
          <TabsTrigger value="receivables">Contas a receber</TabsTrigger>
          <TabsTrigger value="cashflow">Fluxo de caixa</TabsTrigger>
          <TabsTrigger value="bank">Extrato e conciliação</TabsTrigger>
          <TabsTrigger value="logs">Log de alterações</TabsTrigger>
        </TabsList>
        <TabsContent value="customers" className="mt-4">
          <CustomersPanel restaurantId={restaurantId} role={role} />
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4">
          <SuppliersPanel restaurantId={restaurantId} role={role} />
        </TabsContent>
        <TabsContent value="payables" className="mt-4">
          <PayablesPanel restaurantId={restaurantId} role={role} />
        </TabsContent>
        <TabsContent value="receivables" className="mt-4">
          <ReceivablesPanel restaurantId={restaurantId} />
        </TabsContent>
        <TabsContent value="cashflow" className="mt-4">
          <CashFlowPanel restaurantId={restaurantId} />
        </TabsContent>
        <TabsContent value="bank" className="mt-4">
          <BankReconcilePanel restaurantId={restaurantId} />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <AuditLogPanel restaurantId={restaurantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
