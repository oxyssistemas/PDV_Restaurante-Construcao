import { createClient } from 'npm:@supabase/supabase-js@2';

// Boleto e Pix das contas a receber pela conta Asaas da própria loja.
//   { action: 'save_key', restaurantId, apiKey, sandbox }  → admin guarda a chave (conferida no Asaas)
//   { action: 'boleto', restaurantId, receivableId }        → gera a cobrança (boleto + Pix) da conta a receber
//   POST ?token=<token da loja>  (webhook do Asaas)          → pagamento confirmado dá baixa na conta a receber

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const base = (sandbox: boolean) => (sandbox ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3');

async function asaas(key: string, sandbox: boolean, path: string, init: RequestInit = {}) {
  const res = await fetch(`${base(sandbox)}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'OxysRestaurante', access_token: key, ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.errors?.[0]?.description ?? `Asaas respondeu ${res.status}`);
  return body;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    const url = new URL(req.url);

    // ---------- webhook do Asaas ----------
    const hook = url.searchParams.get('token');
    if (hook) {
      const { data: integ } = await sb.from('finance_integrations').select('restaurant_id').eq('asaas_webhook_token', hook).maybeSingle();
      if (!integ) return json({ ok: false }, 401);
      const ev = await req.json().catch(() => ({}));
      const pay = ev?.payment;
      if (pay?.id && ['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED_IN_CASH'].includes(ev?.event)) {
        await sb.from('accounts_receivable').update({
          status: 'received', received_at: new Date().toISOString(), payment_method: pay.billingType === 'PIX' ? 'pix' : pay.billingType === 'CREDIT_CARD' ? 'credit_card' : 'boleto',
        }).eq('restaurant_id', integ.restaurant_id).eq('boleto_provider', 'asaas').eq('boleto_id', pay.id);
      }
      return json({ ok: true });
    }

    // ---------- ações da equipe ----------
    const body = await req.json().catch(() => ({}));
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: auth } = await sb.auth.getUser(token);
    const user = auth?.user;
    if (!user) return json({ error: 'Entre no sistema.' }, 401);
    const rid = String(body?.restaurantId ?? '');
    if (!UUID.test(rid)) return json({ error: 'Loja inválida.' }, 400);

    if (body?.action === 'save_key') {
      const { data: isAdmin } = await sb.rpc('has_module_access', { _user_id: user.id, _restaurant_id: rid, _module: 'settings', _edit: true });
      if (!isAdmin) return json({ error: 'Só o administrador configura a conta Asaas.' }, 403);
      const key = String(body?.apiKey ?? '').trim();
      const sandbox = body?.sandbox === true;
      if (!key) {
        await sb.from('finance_integrations').upsert({ restaurant_id: rid, asaas_api_key: null, asaas_sandbox: sandbox });
        return json({ ok: true });
      }
      await asaas(key, sandbox, '/finance/balance'); // confere a chave
      const { data } = await sb.from('finance_integrations').upsert({ restaurant_id: rid, asaas_api_key: key, asaas_sandbox: sandbox })
        .select('asaas_webhook_token').single();
      return json({ ok: true, webhookUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/asaas?token=${data?.asaas_webhook_token}` });
    }

    if (body?.action === 'webhook_url') {
      const { data: ok } = await sb.rpc('has_module_access', { _user_id: user.id, _restaurant_id: rid, _module: 'settings', _edit: true });
      if (!ok) return json({ error: 'Sem permissão.' }, 403);
      const { data } = await sb.from('finance_integrations').select('asaas_webhook_token').eq('restaurant_id', rid).maybeSingle();
      return json({ webhookUrl: data ? `${Deno.env.get('SUPABASE_URL')}/functions/v1/asaas?token=${data.asaas_webhook_token}` : null });
    }

    if (body?.action === 'boleto') {
      const { data: can } = await sb.rpc('has_module_access', { _user_id: user.id, _restaurant_id: rid, _module: 'crm', _edit: true });
      if (!can) return json({ error: 'Sem permissão.' }, 403);
      const { data: integ } = await sb.from('finance_integrations').select('asaas_api_key, asaas_sandbox').eq('restaurant_id', rid).maybeSingle();
      if (!integ?.asaas_api_key) return json({ error: 'Configure a conta Asaas em Admin → Configurações.' }, 400);
      const { data: r } = await sb.from('accounts_receivable').select('*').eq('id', String(body?.receivableId ?? '')).eq('restaurant_id', rid).maybeSingle();
      if (!r) return json({ error: 'Conta a receber não encontrada.' }, 404);
      if (r.status !== 'open') return json({ error: 'Esta conta não está em aberto.' }, 400);
      const doc = String(r.customer_document ?? '').replace(/\D/g, '');
      if (![11, 14].includes(doc.length)) return json({ error: 'Informe o CPF ou CNPJ do cliente na conta a receber.' }, 400);
      const key = integ.asaas_api_key, sandbox = integ.asaas_sandbox;
      // cliente no Asaas (pelo CPF/CNPJ)
      const found = await asaas(key, sandbox, `/customers?cpfCnpj=${doc}`);
      const customer = found?.data?.[0]?.id ?? (await asaas(key, sandbox, '/customers', {
        method: 'POST',
        body: JSON.stringify({ name: r.customer_name || 'Cliente', cpfCnpj: doc, email: r.customer_email || undefined, mobilePhone: r.customer_phone || undefined, notificationDisabled: false }),
      })).id;
      const today = new Date().toISOString().slice(0, 10);
      const pay = await asaas(key, sandbox, '/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer, billingType: 'UNDEFINED', value: Number(r.amount), dueDate: r.due_date < today ? today : r.due_date,
          description: String(r.description).slice(0, 500), externalReference: r.id,
        }),
      });
      const [line, pix] = await Promise.all([
        asaas(key, sandbox, `/payments/${pay.id}/identificationField`).catch(() => null),
        asaas(key, sandbox, `/payments/${pay.id}/pixQrCode`).catch(() => null),
      ]);
      await sb.from('accounts_receivable').update({
        boleto_provider: 'asaas', boleto_id: pay.id, boleto_url: pay.invoiceUrl ?? pay.bankSlipUrl ?? null,
        boleto_barcode: line?.identificationField ?? null, pix_code: pix?.payload ?? null,
      }).eq('id', r.id);
      return json({ url: pay.invoiceUrl ?? pay.bankSlipUrl, barcode: line?.identificationField ?? null, pix: pix?.payload ?? null });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erro inesperado' }, 400);
  }
});
