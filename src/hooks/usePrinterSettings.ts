import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { defaultPrinterConfig, PrintPurpose, PrinterConfig } from '@/lib/printing';
import { PRINTER_COLUMNS, printerConfig, type Printer } from '@/lib/printQueue';

/**
 * Configuração (largura, vias, textos) usada na impressão manual pela janela do navegador:
 * vem da primeira impressora ativa cadastrada para aquele uso.
 */
export function usePrinterSettings(restaurantId?: string | null) {
  const query = useQuery({
    queryKey: ['printer-settings', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('printers').select(PRINTER_COLUMNS)
        .eq('restaurant_id', restaurantId!).eq('enabled', true).order('created_at');
      if (error) throw error;
      return (data || []) as Printer[];
    },
  });

  const getConfig = (purpose: PrintPurpose): PrinterConfig => {
    const printer = (query.data || []).find(p => p.purposes.includes(purpose));
    return printer ? { ...printerConfig(printer), purpose } : defaultPrinterConfig(purpose);
  };

  return { ...query, getConfig };
}
