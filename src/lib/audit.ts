import { supabase } from '@/integrations/supabase/client';

export interface AuditParams {
  restaurantId: string;
  action: 'create' | 'update' | 'delete' | 'status' | 'print' | 'issue';
  entity: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
  role?: string | null;
}

const actionLabels: Record<string, string> = {
  create: 'Criou',
  update: 'Editou',
  delete: 'Excluiu',
  status: 'Alterou status',
  print: 'Imprimiu',
  issue: 'Emitiu',
};

export const auditActionLabel = (a: string) => actionLabels[a] ?? a;

export const entityLabels: Record<string, string> = {
  customer: 'Cliente',
  supplier: 'Fornecedor',
  payable: 'Conta a pagar',
  invoice: 'Nota fiscal',
  order: 'Pedido',
  menu_item: 'Item do cardápio',
  inventory: 'Estoque',
};

/** Registra uma alteração no log de auditoria. Nunca lança erro para não travar a ação principal. */
export async function logAudit(params: AuditParams) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('audit_logs').insert({
      restaurant_id: params.restaurantId,
      user_id: user.id,
      user_email: user.email ?? null,
      user_role: params.role ?? null,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId ?? null,
      summary: params.summary,
      before_data: (params.before ?? null) as never,
      after_data: (params.after ?? null) as never,
    });
  } catch (e) {
    console.error('audit log failed', e);
  }
}
