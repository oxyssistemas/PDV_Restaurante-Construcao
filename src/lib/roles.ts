/** Cargos do sistema. Gerente e supervisor (filiais, plano Enterprise) valem como admin nas lojas deles. */
export const ADMIN_LIKE = ['admin', 'manager', 'supervisor'] as const;

export const isAdminLike = (role: string | null | undefined) => !!role && (ADMIN_LIKE as readonly string[]).includes(role);

export const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  manager: 'Gerente',
  supervisor: 'Supervisor',
  waiter: 'Garçom',
  kitchen: 'Cozinha',
  cashier: 'Caixa',
  finance: 'Financeiro',
  delivery: 'Delivery',
  courier: 'Entregador',
  hr: 'RH',
  marketing: 'Marketing',
};

/** Quando a pessoa tem mais de um cargo na mesma loja, o de maior alcance vale. */
export const ROLE_PRIORITY = ['admin', 'supervisor', 'manager', 'finance', 'cashier', 'waiter', 'kitchen', 'delivery', 'hr', 'marketing', 'courier'];

/** Aviso de "chamar gerente" e outros avisos para o admin também chegam ao gerente e ao supervisor. */
export const notificationFor = (targetRoles: string[] | null | undefined, role: string | null | undefined) =>
  !role || !targetRoles || targetRoles.includes(role) || (isAdminLike(role) && targetRoles.includes('admin'));
