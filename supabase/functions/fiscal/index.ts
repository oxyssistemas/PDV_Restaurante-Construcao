import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { buildNfce } from './build.ts';
import { currentProvider, FiscalRejection, type Account, type Environment, type ProviderContext } from './providers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MAX_ATTEMPTS = 6;
const BACKOFF_MIN = [1, 2, 5, 10, 30, 60];

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 800);

async function providerContext(db: SupabaseClient, restaurantId: string): Promise<ProviderContext> {
  const { data: account } = await db.from('fiscal_provider_accounts').select('company_ref, token_homologation, token_production')
    .eq('restaurant_id', restaurantId).maybeSingle();
  return {
    account: account as Account | null,
    // Numeração própria (usada pelo emissor simulado; a Focus controla a dela).
    nextNumber: async () => {
      for (let i = 0; i < 5; i++) {
        const { data: p } = await db.from('fiscal_profiles').select('nfce_next_number').eq('restaurant_id', restaurantId).single();
        const n = Number(p?.nfce_next_number ?? 1);
        const { data: ok } = await db.from('fiscal_profiles').update({ nfce_next_number: n + 1 })
          .eq('restaurant_id', restaurantId).eq('nfce_next_number', n).select('id');
        if (ok?.length) return n;
      }
      throw new Error('Não foi possível reservar o número da nota');
    },
  };
}

/** Documento do DANFE NFC-e para a impressora térmica. */
async function danfeDocument(db: SupabaseClient, invoice: any) {
  const input = await buildNfce(db, invoice);
  const { data: brand } = await db.from('branding_settings').select('brand_name').eq('restaurant_id', invoice.restaurant_id).maybeSingle();
  const e = input.emitter;
  return {
    kind: 'nfce',
    restaurant_name: brand?.brand_name?.trim() || e.trade_name || e.legal_name,
    emitter: {
      legal_name: e.legal_name, trade_name: e.trade_name, cnpj: e.cnpj, state_registration: e.state_registration,
      address: [e.street, e.number, e.complement, e.district, e.city && `${e.city}/${e.state}`].filter(Boolean).join(', '),
    },
    environment: invoice.environment,
    number: invoice.number, series: invoice.series, issued_at: invoice.issued_at, access_key: invoice.access_key,
    protocol: invoice.protocol, consult_url: invoice.consult_url, qrcode_url: invoice.qrcode_url,
    consumer: input.consumer,
    items: input.items.map(i => ({ code: i.code, name: i.description, quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, total: i.total })),
    delivery_fee: input.items.reduce((s, i) => s + (i.other_expenses ?? 0), 0),
    discount: input.discount, total: input.total,
    payments: input.payments, change: input.change,
  };
}

async function enqueueDanfe(db: SupabaseClient, invoice: any, onlyAuto: boolean) {
  let q = db.from('printers').select('id').eq('restaurant_id', invoice.restaurant_id).eq('enabled', true).contains('purposes', ['nfce']);
  if (onlyAuto) q = q.eq('auto_print', true);
  const { data: printers } = await q;
  if (!printers?.length) return 0;
  const document = await danfeDocument(db, invoice);
  await db.from('print_jobs').insert(printers.map(p => ({
    restaurant_id: invoice.restaurant_id, printer_id: p.id, purpose: 'nfce', order_id: invoice.order_id, document,
  })));
  return printers.length;
}

/** Tenta emitir uma nota. Trava a linha para dois processos não emitirem a mesma nota. */
async function processInvoice(db: SupabaseClient, invoiceId: string) {
  const now = new Date();
  const { data: invoice } = await db.from('fiscal_invoices')
    .update({ locked_until: new Date(now.getTime() + 2 * 60_000).toISOString() })
    .eq('id', invoiceId).eq('status', 'pending')
    .or(`locked_until.is.null,locked_until.lt."${now.toISOString()}"`)
    .select('*').maybeSingle();
  if (!invoice) return null;

  const provider = currentProvider();
  const attempts = Number(invoice.attempts ?? 0) + 1;
  try {
    const input = await buildNfce(db, invoice);
    const ctx = await providerContext(db, invoice.restaurant_id);
    const result = invoice.provider_response?.status === 'processing' && provider.consult
      ? await provider.consult(invoice.id, input.environment, ctx)
      : await provider.emit(input, ctx);

    if (result.status === 'processing') {
      await db.from('fiscal_invoices').update({
        attempts, locked_until: null, provider: provider.key, provider_response: { status: 'processing', raw: result.raw },
        next_attempt_at: new Date(Date.now() + 30_000).toISOString(),
      }).eq('id', invoice.id);
      return 'processing';
    }
    if (result.status === 'rejected') throw new FiscalRejection(result.message);

    const update = {
      status: 'issued', attempts, locked_until: null, next_attempt_at: null, error_message: null,
      provider: provider.key, provider_ref: invoice.id, number: result.number, series: result.series,
      access_key: result.access_key, protocol: result.protocol, issued_at: result.authorized_at,
      qrcode_url: result.qrcode_url, consult_url: result.consult_url, xml_url: result.xml_url, pdf_url: result.pdf_url,
      environment: input.environment, subtotal: input.total + input.discount, total: input.total,
      items: input.items.map(i => ({ name: i.description, quantity: i.quantity, unit_price: i.unit_price })),
      payments: input.payments, provider_response: { status: 'authorized', raw: result.raw },
    };
    await db.from('fiscal_invoices').update(update).eq('id', invoice.id);
    await enqueueDanfe(db, { ...invoice, ...update }, true);
    return 'issued';
  } catch (e) {
    const final = e instanceof FiscalRejection || attempts >= MAX_ATTEMPTS;
    await db.from('fiscal_invoices').update({
      status: final ? 'error' : 'pending', attempts, locked_until: null, error_message: errMsg(e), provider: provider.key,
      next_attempt_at: final ? null : new Date(Date.now() + BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)] * 60_000).toISOString(),
    }).eq('id', invoice.id);
    return final ? 'error' : 'retry';
  }
}

async function processQueue(db: SupabaseClient, invoiceId?: string) {
  if (invoiceId) return { [invoiceId]: await processInvoice(db, invoiceId) };
  const { data } = await db.from('fiscal_invoices').select('id').eq('status', 'pending')
    .or(`next_attempt_at.is.null,next_attempt_at.lte."${new Date().toISOString()}"`).order('created_at').limit(10);
  const out: Record<string, unknown> = {};
  for (const { id } of data ?? []) out[id] = await processInvoice(db, id);
  return out;
}

/** Usuário logado e seu papel no restaurante. */
async function authorize(req: Request, restaurantId: unknown, roles: string[]) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Não autenticado');
  if (typeof restaurantId !== 'string' || !/^[0-9a-f-]{36}$/i.test(restaurantId)) throw new HttpError(400, 'Restaurante inválido');
  const { data: { user } } = await createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (!user) throw new HttpError(401, 'Não autenticado');
  const db = admin();
  const { data: rows } = await db.from('user_roles').select('role, restaurant_id').eq('user_id', user.id);
  const ok = (rows ?? []).some(r => r.role === 'super_admin' || (r.restaurant_id === restaurantId && roles.includes(r.role)));
  if (!ok) throw new HttpError(403, 'Sem permissão para a parte fiscal deste restaurante');
  return { user, db };
}

async function invoiceOf(db: SupabaseClient, restaurantId: string, invoiceId: unknown) {
  if (typeof invoiceId !== 'string') throw new HttpError(400, 'Nota inválida');
  const { data } = await db.from('fiscal_invoices').select('*').eq('id', invoiceId).eq('restaurant_id', restaurantId).maybeSingle();
  if (!data) throw new HttpError(404, 'Nota não encontrada');
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));

    // Chamada interna (gatilho de pagamento / cron)
    const cronSecret = req.headers.get('x-cron-secret');
    if (cronSecret) {
      const db = admin();
      const { data: secret } = await db.rpc('fiscal_cron_secret');
      if (!secret || cronSecret !== secret) return json({ error: 'forbidden' }, 403);
      return json(await processQueue(db, typeof body.invoice_id === 'string' ? body.invoice_id : undefined));
    }

    const rid = body.restaurantId;
    const provider = currentProvider();
    switch (body.action) {
      case 'config': {
        const { db } = await authorize(req, rid, ['admin', 'finance', 'cashier']);
        const { data: acc } = await db.from('fiscal_provider_accounts').select('provider, company_ref, synced_at, last_error')
          .eq('restaurant_id', rid).maybeSingle();
        return json({
          provider: provider.key, provider_label: provider.label, needs_company_sync: provider.needsCompanySync,
          account: acc ? { synced_at: acc.synced_at, last_error: acc.last_error, registered: !!acc.company_ref } : null,
        });
      }
      case 'emit_order': {
        const { db, user } = await authorize(req, rid, ['admin', 'finance', 'cashier']);
        const orderId = String(body.orderId ?? '');
        const { data: order } = await db.from('orders').select('id, customer_name, total, delivery_fee').eq('id', orderId).eq('restaurant_id', rid).maybeSingle();
        if (!order) throw new HttpError(404, 'Pedido não encontrado');
        const { data: existing } = await db.from('fiscal_invoices').select('id, status').eq('order_id', orderId).neq('status', 'cancelled').maybeSingle();
        if (existing?.status === 'issued') throw new HttpError(409, 'Este pedido já tem NFC-e emitida');
        const { data: profile } = await db.from('fiscal_profiles').select('environment').eq('restaurant_id', rid).maybeSingle();
        const id = existing?.id ?? (await db.from('fiscal_invoices').insert({
          restaurant_id: rid, order_id: orderId, status: 'pending', customer_name: body.customerName || order.customer_name || 'Consumidor',
          customer_document: body.customerDocument || null, subtotal: Number(order.total), discount: 0, total: Number(order.total),
          environment: profile?.environment ?? 'homologation', provider: provider.key, created_by: user.id,
        }).select('id').single()).data!.id;
        await db.from('fiscal_invoices').update({ status: 'pending', next_attempt_at: null, locked_until: null }).eq('id', id);
        const result = await processInvoice(db, id);
        const { data: inv } = await db.from('fiscal_invoices').select('id, status, number, error_message').eq('id', id).single();
        return json({ result, invoice: inv });
      }
      case 'emit': {
        const { db } = await authorize(req, rid, ['admin', 'finance', 'cashier']);
        const inv = await invoiceOf(db, rid, body.invoiceId);
        if (inv.status === 'issued' || inv.status === 'cancelled') throw new HttpError(409, 'Esta nota já foi emitida ou cancelada');
        await db.from('fiscal_invoices').update({ status: 'pending', attempts: 0, next_attempt_at: null, locked_until: null, error_message: null }).eq('id', inv.id);
        const result = await processInvoice(db, inv.id);
        const { data: after } = await db.from('fiscal_invoices').select('id, status, number, error_message').eq('id', inv.id).single();
        return json({ result, invoice: after });
      }
      case 'cancel': {
        const { db, user } = await authorize(req, rid, ['admin', 'finance']);
        const inv = await invoiceOf(db, rid, body.invoiceId);
        const reason = String(body.reason ?? '').trim();
        if (reason.length < 15 || reason.length > 255) throw new HttpError(400, 'A justificativa precisa ter entre 15 e 255 caracteres');
        if (inv.status !== 'issued') {
          // Nota que nem chegou à SEFAZ: só sai da fila.
          await db.from('fiscal_invoices').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason, next_attempt_at: null }).eq('id', inv.id);
          return json({ ok: true });
        }
        if (inv.issued_at && Date.now() - new Date(inv.issued_at).getTime() > 30 * 60_000) {
          throw new HttpError(409, 'O prazo de cancelamento da NFC-e (30 minutos após a autorização) já passou');
        }
        try {
          const r = await provider.cancel(inv.id, inv.environment as Environment, reason, await providerContext(db, rid));
          await db.from('fiscal_invoices').update({
            status: 'cancelled', cancelled_at: new Date().toISOString(), cancel_reason: reason,
            provider_response: { ...(inv.provider_response ?? {}), cancel: r.raw, cancel_protocol: r.protocol, cancelled_by: user.id },
          }).eq('id', inv.id);
          return json({ ok: true });
        } catch (e) {
          throw new HttpError(e instanceof FiscalRejection ? 400 : 502, errMsg(e));
        }
      }
      case 'danfe': {
        const { db } = await authorize(req, rid, ['admin', 'finance', 'cashier']);
        const inv = await invoiceOf(db, rid, body.invoiceId);
        if (inv.status !== 'issued') throw new HttpError(409, 'Só notas autorizadas têm DANFE');
        return json({ document: await danfeDocument(db, inv) });
      }
      case 'print': {
        const { db } = await authorize(req, rid, ['admin', 'finance', 'cashier']);
        const inv = await invoiceOf(db, rid, body.invoiceId);
        if (inv.status !== 'issued') throw new HttpError(409, 'Só notas autorizadas têm DANFE');
        return json({ printers: await enqueueDanfe(db, inv, false) });
      }
      case 'sync_company': {
        const { db } = await authorize(req, rid, ['admin']);
        if (!provider.syncCompany) return json({ ok: true, skipped: true });
        const { data: p } = await db.from('fiscal_profiles').select('*').eq('restaurant_id', rid).maybeSingle();
        if (!p) throw new HttpError(400, 'Preencha e salve a configuração fiscal primeiro');
        const { data: acc } = await db.from('fiscal_provider_accounts').select('company_ref, token_homologation, token_production').eq('restaurant_id', rid).maybeSingle();
        let certificate: { base64: string; password: string } | null = null;
        if (body.certificatePassword) {
          if (!p.certificate_path) throw new HttpError(400, 'Envie o certificado A1 antes');
          const { data: file, error } = await db.storage.from('fiscal-certificates').download(p.certificate_path);
          if (error || !file) throw new HttpError(500, 'Não foi possível ler o certificado enviado');
          const bytes = new Uint8Array(await file.arrayBuffer());
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          certificate = { base64: btoa(bin), password: String(body.certificatePassword) };
        }
        try {
          const account = await provider.syncCompany({
            cnpj: p.cnpj ?? '', legal_name: p.legal_name ?? '', trade_name: p.trade_name, state_registration: p.state_registration,
            municipal_registration: p.municipal_registration, tax_regime: p.tax_regime ?? 'simples_nacional', street: p.street,
            number: p.number, complement: p.complement, district: p.district, city: p.city, city_code: p.city_code, state: p.state,
            zip_code: p.zip_code, phone: p.phone, series: Number(p.nfce_series ?? 1), email: null, csc_id: p.csc_id,
            csc_token: p.csc_token, next_number: Number(p.nfce_next_number ?? 1),
          }, certificate, acc as Account | null);
          await db.from('fiscal_provider_accounts').upsert({
            restaurant_id: rid, provider: provider.key, ...account, synced_at: new Date().toISOString(), last_error: null, updated_at: new Date().toISOString(),
          });
          return json({ ok: true });
        } catch (e) {
          await db.from('fiscal_provider_accounts').upsert({ restaurant_id: rid, provider: provider.key, last_error: errMsg(e), updated_at: new Date().toISOString() });
          throw new HttpError(400, errMsg(e));
        }
      }
      default:
        throw new HttpError(400, 'Ação inválida');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('fiscal', e);
    return json({ error: errMsg(e) }, status);
  }
});
