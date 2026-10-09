// is_restaurant_active da nuvem: loja ativa e fora de teste grátis vencido (dela ou da matriz).
const expired = (r) => !!r?.trial_ends_at && Date.parse(r.trial_ends_at) <= Date.now();

/** r: linha de restaurants; find(id): busca outra loja (a matriz). */
function restaurantActive(r, find) {
  if (!r || r.status !== 'active' || expired(r)) return false;
  return !(r.parent_id && expired(find(r.parent_id)));
}

module.exports = { restaurantActive };
