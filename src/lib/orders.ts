export type AppRoleName =
  | 'super_admin' | 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'finance' | 'delivery' | 'courier';

export const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  waiter: 'Garçom',
  kitchen: 'Cozinha',
  cashier: 'Caixa',
  finance: 'Financeiro',
  delivery: 'Delivery',
  courier: 'Entregador',
};

export const orderTypeLabels: Record<string, string> = {
  dine_in: 'Mesa',
  delivery: 'Delivery',
  takeaway: 'Retirada',
};

export const deliveryStatusLabels: Record<string, string> = {
  pending: 'Aguardando',
  preparing: 'Em preparo',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

/** Campos de autoria gravados em toda comanda/pedido criado. */
export function authorFields(
  user: { id: string; email?: string | null } | null,
  role?: string | null
) {
  return {
    created_by: user?.id ?? null,
    created_by_name: user?.email ?? null,
    created_by_role: role ?? null,
  };
}

export function authorLabel(order: {
  created_by_name?: string | null;
  created_by_role?: string | null;
}) {
  const who = order.created_by_name?.split('@')[0];
  const role = order.created_by_role ? roleLabels[order.created_by_role] : null;
  if (who && role) return `${who} (${role})`;
  return who || role || 'Desconhecido';
}
