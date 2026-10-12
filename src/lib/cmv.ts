import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Custo do prato (CMV) a partir da ficha técnica: ingredientes do estoque × custo unitário.
 * Combo = soma do custo de cada item que o compõe.
 */
export type CostInventory = { id: string; name: string; unit: string | null; cost_per_unit: number | string | null };
export type CostIngredient = { menu_item_id: string; inventory_id: string; quantity: number | string };
export type CostComponent = { parent_item_id: string; component_item_id: string; quantity: number | string };
export type CostItem = { id: string; name: string; price: number | string; is_combo?: boolean | null };

export type ItemCost = {
  cost: number;
  /** ficha técnica vazia (sem ingredientes / combo sem itens) */
  noRecipe: boolean;
  /** algum ingrediente sem custo cadastrado no estoque */
  missingCost: boolean;
  lines: { name: string; unit: string | null; quantity: number; unitCost: number; cost: number }[];
};

const round4 = (n: number) => Math.round(n * 10000) / 10000;

export function computeCosts(items: CostItem[], ingredients: CostIngredient[], components: CostComponent[], inventory: CostInventory[]) {
  const inv = new Map(inventory.map(i => [i.id, i]));
  const out = new Map<string, ItemCost>();

  const direct = (itemId: string): ItemCost => {
    const lines = ingredients.filter(g => g.menu_item_id === itemId).map(g => {
      const i = inv.get(g.inventory_id);
      const quantity = Number(g.quantity), unitCost = Number(i?.cost_per_unit ?? 0);
      return { name: i?.name ?? 'Ingrediente removido', unit: i?.unit ?? null, quantity, unitCost, cost: round4(quantity * unitCost) };
    });
    return { cost: round4(lines.reduce((s, l) => s + l.cost, 0)), noRecipe: !lines.length, missingCost: lines.some(l => l.unitCost <= 0), lines };
  };

  for (const it of items) {
    if (!it.is_combo) { out.set(it.id, direct(it.id)); continue; }
    const parts = components.filter(c => c.parent_item_id === it.id);
    const lines = parts.map(c => {
      const child = items.find(x => x.id === c.component_item_id);
      const childCost = direct(c.component_item_id);
      const quantity = Number(c.quantity);
      return { name: child?.name ?? 'Item removido', unit: 'un', quantity, unitCost: childCost.cost, cost: round4(quantity * childCost.cost), child: childCost };
    });
    out.set(it.id, {
      cost: round4(lines.reduce((s, l) => s + l.cost, 0)), noRecipe: !lines.length,
      missingCost: lines.some(l => l.child.noRecipe || l.child.missingCost),
      lines: lines.map(({ child: _child, ...l }) => l),
    });
  }
  return out;
}

/** CMV % = custo ÷ preço de venda. */
export const cmvPercent = (cost: number, price: number) => (price > 0 ? (cost / price) * 100 : null);

/** Faixas usuais de restaurante: até 30% ótimo, até 38% atenção, acima disso alto. */
export function cmvTone(pct: number | null) {
  if (pct == null) return 'text-muted-foreground';
  if (pct <= 30) return 'text-emerald-500';
  if (pct <= 38) return 'text-amber-500';
  return 'text-destructive';
}

/** Tudo o que o cálculo precisa, de uma vez. */
export function useCostData(restaurantId?: string | null) {
  return useQuery({
    queryKey: ['cmv-data', restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const rid = restaurantId!;
      const [items, ingredients, components, inventory] = await Promise.all([
        supabase.from('menu_items').select('id, name, price, is_combo, available, category_id, menu_categories(name)').eq('restaurant_id', rid).eq('is_rodizio_charge', false).order('name'),
        supabase.from('menu_item_ingredients').select('menu_item_id, inventory_id, quantity').eq('restaurant_id', rid),
        supabase.from('menu_item_components').select('parent_item_id, component_item_id, quantity').eq('restaurant_id', rid),
        supabase.from('inventory').select('id, name, unit, cost_per_unit').eq('restaurant_id', rid),
      ]);
      for (const r of [items, ingredients, components, inventory]) if (r.error) throw r.error;
      const list = items.data ?? [];
      return {
        items: list,
        inventory: inventory.data ?? [],
        costs: computeCosts(list, ingredients.data ?? [], components.data ?? [], inventory.data ?? []),
      };
    },
  });
}
