import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { layout, toBase64, toEscPos } from '../_shared/receipt.ts';

// Agente local de impressão (pasta print-agent / public/agente).
// - O admin gera a chave do restaurante (ação create_key, com login).
// - O agente usa a chave no cabeçalho x-agent-key para buscar cupons (poll) e confirmar (ack).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const STALE_MS = 2 * 60_000;

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE);

async function sha256(s: string) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
  return Array.from(d).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function agentRestaurant(db: SupabaseClient, key: string | null) {
  if (!key || key.length < 20) throw new HttpError(401, 'Chave do agente ausente');
  const { data } = await db.from('print_agent_keys').select('restaurant_id').eq('key_hash', await sha256(key)).maybeSingle();
  if (!data) throw new HttpError(401, 'Chave do agente inválida ou substituída. Gere uma nova em Configurações → Impressoras.');
  return data.restaurant_id as string;
}

async function adminOf(req: Request, restaurantId: unknown) {
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) throw new HttpError(401, 'Não autenticado');
  if (typeof restaurantId !== 'string') throw new HttpError(400, 'Restaurante inválido');
  const { data: { user } } = await createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } }).auth.getUser();
  if (!user) throw new HttpError(401, 'Não autenticado');
  const db = admin();
  const { data: rows } = await db.from('user_roles').select('role, restaurant_id').eq('user_id', user.id);
  if (!(rows ?? []).some(r => r.role === 'super_admin' || (r.role === 'admin' && r.restaurant_id === restaurantId))) {
    throw new HttpError(403, 'Só o administrador do restaurante gerencia o agente');
  }
  return db;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const agentKey = req.headers.get('x-agent-key');

    // ---------- chamadas do agente ----------
    if (agentKey) {
      const db = admin();
      const rid = await agentRestaurant(db, agentKey);
      const now = new Date();
      await db.from('print_agent_keys').update({ last_seen_at: now.toISOString(), agent_info: body.info ?? null }).eq('restaurant_id', rid);

      if (body.action === 'ack') {
        const results: { job_id: string; ok: boolean; error?: string }[] = Array.isArray(body.results) ? body.results : [];
        for (const r of results) {
          await db.from('print_jobs').update(r.ok
            ? { status: 'done', printed_at: now.toISOString(), error: null }
            : { status: 'error', error: String(r.error ?? 'Falha no agente').slice(0, 500) })
            .eq('id', r.job_id).eq('restaurant_id', rid).eq('status', 'printing');
        }
        return json({ ok: true });
      }

      // poll: entrega e reserva os cupons das impressoras do tipo "agente"
      const { data: printers } = await db.from('printers').select('id, name, address, width, copies, header_note, footer_note, enabled')
        .eq('restaurant_id', rid).eq('connection', 'agent');
      const active = (printers ?? []).filter(p => p.enabled && p.address);
      if (active.length) await db.from('printers').update({ last_seen_at: now.toISOString() }).in('id', active.map(p => p.id));
      const byId = Object.fromEntries(active.map(p => [p.id, p]));
      if (!active.length) return json({ jobs: [], printers: [] });

      const { data: queued } = await db.from('print_jobs').select('id, printer_id, purpose, document, status, claimed_at')
        .in('printer_id', active.map(p => p.id))
        .or(`status.eq.queued,and(status.eq.printing,claimed_at.lt."${new Date(now.getTime() - STALE_MS).toISOString()}")`)
        .gte('created_at', new Date(now.getTime() - 60 * 60_000).toISOString())
        .order('created_at').limit(10);

      const jobs = [];
      for (const j of queued ?? []) {
        const { data: claimed } = await db.from('print_jobs')
          .update({ status: 'printing', claimed_by: 'agente-local', claimed_at: now.toISOString(), attempts: 1 })
          .eq('id', j.id).eq('status', j.status).select('id').maybeSingle();
        if (!claimed) continue;
        const p = byId[j.printer_id];
        const ops = layout(j.document, { width: p.width, copies: p.copies, header_note: p.header_note, footer_note: p.footer_note });
        jobs.push({ job_id: j.id, printer: { id: p.id, name: p.name, address: p.address }, data: toBase64(toEscPos(ops, p.width)) });
      }
      return json({ jobs, printers: active.map(p => ({ id: p.id, name: p.name, address: p.address })) });
    }

    // ---------- chamadas do painel (admin) ----------
    const db = await adminOf(req, body.restaurantId);
    if (body.action === 'status') {
      const { data } = await db.from('print_agent_keys').select('key_hint, created_at, last_seen_at, agent_info').eq('restaurant_id', body.restaurantId).maybeSingle();
      return json({ key: data ?? null });
    }
    if (body.action === 'create_key') {
      const key = `oxys_${Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      await db.from('print_agent_keys').upsert({
        restaurant_id: body.restaurantId, key_hash: await sha256(key), key_hint: key.slice(-4),
        created_at: new Date().toISOString(), last_seen_at: null, agent_info: null,
      });
      return json({ key }); // mostrada uma única vez
    }
    throw new HttpError(400, 'Ação inválida');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error('print-agent', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, status);
  }
});
