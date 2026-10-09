// Funções do plano do restaurante (tela Planos do super admin). Chave ausente = liberada.
// deno-lint-ignore no-explicit-any
export async function planAllows(sb: any, restaurantId: string, feature: string): Promise<boolean> {
  const { data, error } = await sb.rpc('restaurant_has_feature', { _restaurant_id: restaurantId, _feature: feature });
  if (error) return true; // na dúvida não derruba a venda
  return data !== false;
}

export const OFF_PLAN = 'Este recurso não faz parte do plano da loja.';
