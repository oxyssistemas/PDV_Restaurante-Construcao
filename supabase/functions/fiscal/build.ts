import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { FiscalRejection, type NfceInput, type NfceItem } from './providers.ts';

// Códigos de forma de pagamento da NFC-e (tPag).
const PAYMENT_CODES: Record<string, string> = { cash: '01', credit_card: '03', debit_card: '04', pix: '17' };
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Monta os dados da NFC-e a partir da nota (e do pedido ligado a ela). */
export async function buildNfce(admin: SupabaseClient, invoice: any): Promise<NfceInput> {
  const { data: p } = await admin.from('fiscal_profiles').select('*').eq('restaurant_id', invoice.restaurant_id).maybeSingle();
  if (!p) throw new FiscalRejection('Configuração fiscal não preenchida (Configurações → Configuração fiscal).');
  if (!p.active) throw new FiscalRejection('Emissão de NFC-e desativada na configuração fiscal do restaurante.');

  const defaults = {
    ncm: p.default_ncm || '', cfop: p.default_cfop || '5102', tax_code: p.default_csosn || '102',
    origin: p.default_origin ?? '0', unit: p.default_unit || 'UN',
  };

  let items: NfceItem[] = [];
  let payments: { code: string; amount: number }[] = [];
  let change = 0;
  let deliveryFee = 0;

  if (invoice.order_id) {
    const [{ data: order }, { data: rows }, { data: pays }] = await Promise.all([
      admin.from('orders').select('delivery_fee').eq('id', invoice.order_id).maybeSingle(),
      admin.from('order_items')
        .select('quantity, unit_price, status, menu_item_id, menu_items(id, name, ncm, cfop, csosn, origin, commercial_unit)')
        .eq('order_id', invoice.order_id).neq('status', 'cancelled').order('created_at'),
      admin.from('payments').select('method, amount, change_amount').eq('order_id', invoice.order_id).order('created_at'),
    ]);
    deliveryFee = Number(order?.delivery_fee ?? 0);
    items = (rows ?? []).map((r: any) => {
      const m = r.menu_items ?? {};
      const q = Number(r.quantity), price = Number(r.unit_price);
      return {
        code: String(m.id ?? r.menu_item_id ?? 'ITEM').slice(0, 8).toUpperCase(),
        description: String(m.name ?? 'Item').slice(0, 120),
        ncm: m.ncm || defaults.ncm, cfop: m.cfop || defaults.cfop, tax_code: m.csosn || defaults.tax_code,
        origin: String(m.origin ?? defaults.origin), unit: m.commercial_unit || defaults.unit,
        quantity: q, unit_price: price, total: round2(q * price),
      };
    });
    payments = (pays ?? []).map((x: any) => ({ code: PAYMENT_CODES[x.method] ?? '99', amount: Number(x.amount) }));
    change = round2((pays ?? []).reduce((s: number, x: any) => s + Number(x.change_amount ?? 0), 0));
  } else {
    // Nota manual: usa os itens gravados na própria nota.
    items = ((invoice.items ?? []) as any[]).map((i, idx) => ({
      code: `M${idx + 1}`, description: String(i.name ?? 'Item').slice(0, 120), ncm: defaults.ncm, cfop: defaults.cfop,
      tax_code: defaults.tax_code, origin: String(defaults.origin), unit: defaults.unit,
      quantity: Number(i.quantity), unit_price: Number(i.unit_price), total: round2(Number(i.quantity) * Number(i.unit_price)),
    }));
    payments = ((invoice.payments ?? []) as any[]).map(x => ({ code: PAYMENT_CODES[x.method] ?? '99', amount: Number(x.amount) }));
  }

  // Taxa de entrega vai como "outras despesas" no primeiro item.
  if (deliveryFee > 0 && items.length) items[0] = { ...items[0], other_expenses: deliveryFee };

  const total = round2(items.reduce((s, i) => s + i.total, 0) + deliveryFee - Number(invoice.discount ?? 0));
  if (!payments.length) payments = [{ code: '01', amount: total }];
  // A NFC-e exige que a soma dos pagamentos cubra o valor; diferença de centavos vai no primeiro pagamento.
  const paid = round2(payments.reduce((s, x) => s + x.amount, 0));
  if (paid < total) payments[0] = { ...payments[0], amount: round2(payments[0].amount + total - paid) };

  return {
    ref: invoice.id,
    restaurantId: invoice.restaurant_id,
    environment: p.environment,
    emitter: {
      cnpj: p.cnpj ?? '', legal_name: p.legal_name ?? '', trade_name: p.trade_name, state_registration: p.state_registration,
      municipal_registration: p.municipal_registration, tax_regime: p.tax_regime ?? 'simples_nacional', street: p.street,
      number: p.number, complement: p.complement, district: p.district, city: p.city, city_code: p.city_code,
      state: p.state, zip_code: p.zip_code, phone: p.phone, series: Number(p.nfce_series ?? 1),
    },
    items, payments, change, total, discount: Number(invoice.discount ?? 0),
    consumer: { document: invoice.customer_document || null, name: invoice.customer_name || null },
  };
}
