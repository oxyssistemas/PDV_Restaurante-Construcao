import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { defaultPrinterConfig, PrintPurpose, PrinterConfig, ThermalWidth } from '@/lib/printing';

function toConfig(row: any, purpose: PrintPurpose): PrinterConfig {
  return {
    purpose,
    enabled: row?.enabled ?? true,
    model: row?.model ?? 'generic',
    device_name: row?.device_name ?? null,
    width: (row?.width as ThermalWidth) ?? '80mm',
    copies: row?.copies ?? 1,
    header_note: row?.header_note ?? null,
    footer_note: row?.footer_note ?? null,
  };
}

/** Configurações de impressoras térmicas do restaurante, por tipo de impressão. */
export function usePrinterSettings(restaurantId?: string | null) {
  const query = useQuery({
    queryKey: ['printer-settings', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('printer_settings')
        .select('*')
        .eq('restaurant_id', restaurantId!);
      if (error) throw error;
      return data || [];
    },
  });

  const getConfig = (purpose: PrintPurpose): PrinterConfig => {
    const row = (query.data || []).find((r: any) => r.purpose === purpose);
    return row ? toConfig(row, purpose) : defaultPrinterConfig(purpose);
  };

  return { ...query, getConfig };
}
