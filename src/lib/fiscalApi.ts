import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/lib/functionError';
import type { NfceDocument } from '@/lib/printing';

export type FiscalConfig = {
  provider: string; provider_label: string; needs_company_sync: boolean;
  account: { synced_at: string | null; last_error: string | null; registered: boolean } | null;
};

async function call<T>(restaurantId: string, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>('fiscal', { body: { restaurantId, action, ...extra } });
  if (error) throw new Error(await edgeErrorMessage(error));
  if (data && 'error' in data && data.error) throw new Error(String(data.error));
  return data as T;
}

type EmitResponse = { result: string | null; invoice: { id: string; status: string; number: string | null; error_message: string | null } };

export const fiscalApi = {
  config: (rid: string) => call<FiscalConfig>(rid, 'config'),
  emit: (rid: string, invoiceId: string) => call<EmitResponse>(rid, 'emit', { invoiceId }),
  emitOrder: (rid: string, orderId: string, customer?: { name?: string; document?: string }) =>
    call<EmitResponse>(rid, 'emit_order', { orderId, customerName: customer?.name, customerDocument: customer?.document }),
  cancel: (rid: string, invoiceId: string, reason: string) => call<{ ok: true }>(rid, 'cancel', { invoiceId, reason }),
  danfe: (rid: string, invoiceId: string) => call<{ document: NfceDocument }>(rid, 'danfe', { invoiceId }),
  print: (rid: string, invoiceId: string) => call<{ printers: number }>(rid, 'print', { invoiceId }),
  syncCompany: (rid: string, certificatePassword?: string) => call<{ ok: true }>(rid, 'sync_company', { certificatePassword }),
};

export const SIMULATED_PROVIDER = 'simulado';
