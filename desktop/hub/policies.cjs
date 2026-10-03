// As mesmas regras de acesso da nuvem (RLS do banco), tabela por tabela, para a central responder a cada
// pessoa exatamente o que a nuvem responderia. Cada política daqui corresponde a uma política do banco
// (pg_policies) — ao mudar uma política no banco, mude aqui também.
//
// Como no Postgres: políticas do mesmo comando somam (OR); "ALL" vale para todos os comandos;
// sem política para o comando = não pode.

function helpers(mirror, uid) {
  const person = mirror.staff.find(s => s.user_id === uid);
  // papéis da pessoa em todos os restaurantes (has_role olha todos)
  const roles = person?.roles || mirror.rows('user_roles').filter(r => r.user_id === uid);
  const has = (role) => roles.some(r => r.role === role);
  const any = (...list) => list.some(has);
  const belongs = (rid) => roles.some(r => r.restaurant_id === rid);                    // user_belongs_to_restaurant
  const home = [...roles].filter(r => r.role !== 'super_admin' && r.restaurant_id)       // get_user_restaurant_id
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id)))[0]?.restaurant_id ?? null;
  const active = (rid) => mirror.rows('restaurants').some(r => r.id === rid && r.status === 'active'); // is_restaurant_active
  const mine = (rid) => rid != null && rid === home && active(rid);   // restaurant_id = get_user_restaurant_id(uid) AND ativo
  const order = (id) => mirror.rows('orders').find(o => o.id === id);
  const myCouriers = () => mirror.rows('couriers').filter(c => c.user_id === uid).map(c => c.id);
  return { uid, has, any, belongs, home, active, mine, order, myCouriers, roles };
}

function policies(h) {
  const { uid, has, any, belongs, home, active, mine, order } = h;
  const sup = () => has('super_admin');
  const viewActive = (r) => belongs(r.restaurant_id) && active(r.restaurant_id);
  return {
    audit_logs: [
      { cmd: 'INSERT', check: r => belongs(r.restaurant_id) && r.user_id === uid },
      { cmd: 'SELECT', using: r => sup() || (belongs(r.restaurant_id) && any('admin', 'finance')) },
    ],
    branding_settings: [
      // gravação exige módulo liberado (module_guard) — e internet, de qualquer forma
      { cmd: 'ALL', using: () => sup() },
      { cmd: 'SELECT', using: r => belongs(r.restaurant_id) || sup() },
    ],
    cash_movements: [
      { cmd: 'ALL', using: r => any('cashier', 'admin') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: r => has('finance') && mine(r.restaurant_id) },
    ],
    cash_registers: [
      { cmd: 'ALL', using: r => any('cashier', 'admin') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: r => has('finance') && mine(r.restaurant_id) },
    ],
    couriers: [
      { cmd: 'ALL', using: r => (has('admin') && belongs(r.restaurant_id) && active(r.restaurant_id)) || sup() },
      { cmd: 'UPDATE', using: r => r.user_id === uid },
      { cmd: 'SELECT', using: r => belongs(r.restaurant_id) || sup() },
    ],
    ifood_orders: [
      { cmd: 'SELECT', using: r => sup() || belongs(r.restaurant_id) },
      { cmd: 'UPDATE', using: r => h.roles.some(x => x.restaurant_id === r.restaurant_id && ['admin', 'cashier', 'delivery', 'kitchen'].includes(x.role)) },
    ],
    kitchen_sessions: [
      { cmd: 'UPDATE', using: r => any('kitchen', 'admin') && mine(r.restaurant_id) },
      { cmd: 'INSERT', check: r => any('kitchen', 'admin') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: viewActive },
    ],
    menu_categories: [
      { cmd: 'ALL', using: r => has('admin') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: viewActive },
    ],
    menu_items: [
      { cmd: 'ALL', using: r => has('admin') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: viewActive },
    ],
    module_permissions: [
      { cmd: 'ALL', using: r => (belongs(r.restaurant_id) && has('admin')) || sup() },
      { cmd: 'SELECT', using: r => r.user_id === uid || (belongs(r.restaurant_id) && has('admin')) || sup() },
    ],
    notifications: [
      { cmd: 'INSERT', check: r => sup() || (has('admin') && belongs(r.restaurant_id) && active(r.restaurant_id)) },
      { cmd: 'UPDATE', using: viewActive },
      { cmd: 'SELECT', using: viewActive },
    ],
    order_items: [
      { cmd: 'SELECT', using: r => { const o = order(r.order_id); return !!o && belongs(o.restaurant_id) && active(o.restaurant_id); } },
      { cmd: 'INSERT', check: r => { const o = order(r.order_id); return !!o && any('waiter', 'cashier', 'delivery', 'admin') && mine(o.restaurant_id); } },
      { cmd: 'DELETE', using: r => { const o = order(r.order_id); return !!o && any('waiter', 'cashier', 'admin') && mine(o.restaurant_id); } },
      { cmd: 'UPDATE', using: r => { const o = order(r.order_id); return !!o && any('waiter', 'kitchen', 'cashier', 'delivery', 'admin') && mine(o.restaurant_id); } },
    ],
    orders: [
      { cmd: 'ALL', using: r => has('admin') && mine(r.restaurant_id) },
      { cmd: 'UPDATE', using: r => has('courier') && active(r.restaurant_id) && h.myCouriers().includes(r.courier_id) },
      { cmd: 'SELECT', using: viewActive },
      { cmd: 'INSERT', check: r => any('waiter', 'cashier', 'delivery', 'admin') && mine(r.restaurant_id) },
      { cmd: 'UPDATE', using: r => any('waiter', 'kitchen', 'cashier', 'delivery') && mine(r.restaurant_id) },
    ],
    payments: [
      { cmd: 'ALL', using: r => any('cashier', 'admin') && mine(r.restaurant_id) },
      { cmd: 'INSERT', check: r => has('delivery') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: r => has('delivery') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: r => has('finance') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: r => has('waiter') && mine(r.restaurant_id) },
    ],
    plans: [
      { cmd: 'ALL', using: () => sup() },
      { cmd: 'SELECT', using: () => true },
    ],
    print_jobs: [
      { cmd: 'UPDATE', using: r => belongs(r.restaurant_id) },
      { cmd: 'INSERT', check: r => belongs(r.restaurant_id) && h.printerOf(r) },
      { cmd: 'SELECT', using: r => belongs(r.restaurant_id) },
    ],
    printers: [
      { cmd: 'ALL', using: r => has('admin') && r.restaurant_id === home },
      { cmd: 'SELECT', using: r => belongs(r.restaurant_id) },
    ],
    reservations: [
      { cmd: 'ALL', using: r => any('admin', 'waiter') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: viewActive },
    ],
    restaurant_tables: [
      { cmd: 'ALL', using: r => has('admin') && mine(r.restaurant_id) },
      { cmd: 'UPDATE', using: r => has('cashier') && mine(r.restaurant_id) },
      { cmd: 'SELECT', using: viewActive },
      { cmd: 'ALL', using: () => sup() },
      // garçom muda o status da mesa, mas não pode liberá-la (só o caixa/admin)
      { cmd: 'UPDATE', using: r => has('waiter') && mine(r.restaurant_id), check: r => has('waiter') && mine(r.restaurant_id) && r.status !== 'free' },
    ],
    restaurants: [
      { cmd: 'UPDATE', using: r => has('admin') && belongs(r.id) && r.status === 'active' },
      { cmd: 'ALL', using: () => sup() },
      { cmd: 'SELECT', using: r => belongs(r.id) && r.status === 'active' },
    ],
    user_roles: [
      { cmd: 'INSERT', check: r => has('admin') && mine(r.restaurant_id) && !['admin', 'super_admin'].includes(r.role) },
      { cmd: 'DELETE', using: r => has('admin') && mine(r.restaurant_id) && !['admin', 'super_admin'].includes(r.role) },
      { cmd: 'UPDATE', using: r => has('admin') && mine(r.restaurant_id) && !['admin', 'super_admin'].includes(r.role) },
      { cmd: 'SELECT', using: r => has('admin') && r.restaurant_id === home },
      { cmd: 'ALL', using: () => sup() },
      { cmd: 'SELECT', using: r => r.user_id === uid },
    ],
  };
}

/** Permissões de uma pessoa (uid) no espelho. */
function authorizer(mirror, uid) {
  const h = helpers(mirror, uid);
  h.printerOf = (job) => mirror.rows('printers').some(p => p.id === job.printer_id && p.restaurant_id === job.restaurant_id);
  const all = policies(h);
  const of = (table, cmd) => (all[table] || []).filter(p => p.cmd === 'ALL' || p.cmd === cmd);
  const using = (p, row) => !!p.using && p.using(row);
  const check = (p, row) => (p.check ? p.check(row) : !!p.using && p.using(row));
  return {
    uid,
    canSelect: (table, row) => of(table, 'SELECT').some(p => using(p, row)),
    canInsert: (table, row) => of(table, 'INSERT').some(p => check(p, row)),
    canUpdate: (table, row) => of(table, 'UPDATE').some(p => using(p, row)),
    checkUpdate: (table, row) => of(table, 'UPDATE').some(p => check(p, row)),
    canDelete: (table, row) => of(table, 'DELETE').some(p => using(p, row)),
  };
}

module.exports = { authorizer };
