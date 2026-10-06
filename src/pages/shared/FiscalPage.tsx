import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FileArchive, Receipt } from 'lucide-react';
import InvoicesPanel from '@/components/crm/InvoicesPanel';
import FiscalSettingsCard from '@/components/admin/FiscalSettingsCard';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useReadOnly } from '@/components/ModuleGate';

/** Módulo fiscal: notas emitidas (NFC-e) e configuração do emitente, certificado e padrões dos itens. */
export default function FiscalPage() {
  const { currentRole } = useAuth();
  const restaurantId = currentRole?.restaurant_id;
  const role = currentRole?.role;
  const readOnly = useReadOnly();
  const { canView } = useModuleAccess();
  const base = useLocation().pathname.startsWith('/finance') ? '/finance' : '/admin';

  const { data: restaurant } = useQuery({
    queryKey: ['crm-restaurant', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('restaurants').select('name').eq('id', restaurantId!).single();
      if (error) throw error;
      return data;
    },
  });

  if (!restaurantId) return <p className="text-muted-foreground">Nenhum restaurante vinculado a este usuário.</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Receipt className="h-7 w-7" /> Fiscal
          </h1>
          <p className="text-muted-foreground">Notas fiscais (NFC-e) emitidas, cancelamentos e a configuração fiscal da loja.</p>
        </div>
        {canView('accountant') && (
          <Button asChild variant="outline" className="gap-2">
            <Link to={`${base}/accountant`}><FileArchive className="h-4 w-4" /> Pacote do contador</Link>
          </Button>
        )}
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Notas fiscais</TabsTrigger>
          <TabsTrigger value="settings">Configuração</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices" className="mt-4">
          <InvoicesPanel restaurantId={restaurantId} role={role} canEdit={!readOnly} restaurantName={restaurant?.name} />
        </TabsContent>
        <TabsContent value="settings" className="mt-4 max-w-3xl">
          <FiscalSettingsCard restaurantId={restaurantId} role={role} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
