import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { layout, toEposXml, toPlainText, toStarPrnt } from '../_shared/receipt.ts';

// Impressoras que buscam os cupons sozinhas, sem computador:
//   Star CloudPRNT ............ https://<projeto>.supabase.co/functions/v1/cloud-print/star/CHAVE
//   Epson Server Direct Print . https://<projeto>.supabase.co/functions/v1/cloud-print/epson/CHAVE
// A CHAVE é a da impressora (Configurações → Impressoras → link da impressora). Fica no caminho
// porque o CloudPRNT usa o parâmetro "token" para identificar o cupom.

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const STALE_MS = 2 * 60_000;

async function printerByToken(sb: SupabaseClient, token: string | null, connection: 'cloudprnt' | 'epson_sdp') {
  if (!token || token.length < 20) return null;
  const { data } = await sb.from('printers').select('id, restaurant_id, name, enabled, width, copies, header_note, footer_note, connection')
    .eq('device_token', token).maybeSingle();
  if (!data || data.connection !== connection) return null;
  await sb.from('printers').update({ last_seen_at: new Date().toISOString() }).eq('id', data.id);
  return data;
}

/** Próximo cupom da impressora (na fila ou travado há mais de 2 minutos), sem reservar. */
async function nextJob(sb: SupabaseClient, printerId: string) {
  const now = Date.now();
  const { data } = await sb.from('print_jobs').select('id, document, status')
    .eq('printer_id', printerId)
    .or(`status.eq.queued,and(status.eq.printing,claimed_at.lt."${new Date(now - STALE_MS).toISOString()}")`)
    .gte('created_at', new Date(now - 60 * 60_000).toISOString())
    .order('created_at').limit(1).maybeSingle();
  return data;
}

async function claim(sb: SupabaseClient, job: { id: string; status: string }, by: string) {
  const { data } = await sb.from('print_jobs').update({ status: 'printing', claimed_by: by, claimed_at: new Date().toISOString(), attempts: 1 })
    .eq('id', job.id).eq('status', job.status).select('id').maybeSingle();
  return !!data;
}

async function finish(sb: SupabaseClient, printerId: string, jobId: string | null, ok: boolean, error?: string) {
  let q = sb.from('print_jobs').update(ok
    ? { status: 'done', printed_at: new Date().toISOString(), error: null }
    : { status: 'error', error: (error ?? 'A impressora recusou o cupom').slice(0, 500) })
    .eq('printer_id', printerId).eq('status', 'printing');
  if (jobId) q = q.eq('id', jobId);
  await q;
}

// ---------- Star CloudPRNT ----------
const STAR_TYPES = ['application/vnd.star.starprnt', 'text/plain'];

async function star(req: Request, url: URL, key: string | null) {
  const sb = db();
  const printer = await printerByToken(sb, key, 'cloudprnt');
  if (!printer) return new Response('Impressora não encontrada', { status: 404 });

  if (req.method === 'POST') { // consulta periódica
    const job = printer.enabled ? await nextJob(sb, printer.id) : null;
    return Response.json(job ? { jobReady: true, mediaTypes: STAR_TYPES, jobToken: job.id } : { jobReady: false });
  }

  if (req.method === 'GET') { // a impressora pede o cupom
    const type = url.searchParams.get('type') ?? STAR_TYPES[0];
    const wanted = url.searchParams.get('token');
    let job = await nextJob(sb, printer.id);
    if (wanted && job?.id !== wanted) {
      const { data } = await sb.from('print_jobs').select('id, document, status').eq('id', wanted).eq('printer_id', printer.id).maybeSingle();
      if (data && (data.status === 'queued' || data.status === 'printing')) job = data;
    }
    if (!job || !(await claim(sb, job, 'cloudprnt'))) return new Response('', { status: 404 });
    const ops = layout(job.document, { width: printer.width, copies: printer.copies, header_note: printer.header_note, footer_note: printer.footer_note });
    return type === 'text/plain'
      ? new Response(toPlainText(ops, printer.width), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Star-Cut': 'partial; feed=true' } })
      : new Response(new Blob([toStarPrnt(ops, printer.width)]), { headers: { 'Content-Type': 'application/vnd.star.starprnt' } });
  }

  if (req.method === 'DELETE') { // confirmação: code=200 OK, ou código de erro
    const code = url.searchParams.get('code') ?? '200';
    await finish(sb, printer.id, url.searchParams.get('token'), code.startsWith('2'), `Impressora Star respondeu: ${code}`);
    return new Response('', { status: 200 });
  }
  return new Response('', { status: 405 });
}

// ---------- Epson Server Direct Print ----------
const xmlHeader = '<?xml version="1.0" encoding="utf-8"?>';

async function epson(req: Request, key: string | null) {
  const sb = db();
  const printer = await printerByToken(sb, key, 'epson_sdp');
  if (!printer) return new Response('Impressora não encontrada', { status: 404 });
  if (req.method !== 'POST') return new Response('', { status: 405 });

  const form = new URLSearchParams(await req.text());
  const kind = form.get('ConnectionType');

  if (kind === 'SetResponse') { // resultado da impressão anterior
    const xml = form.get('ResponseFile') ?? '';
    const jobId = xml.match(/<printjobid>([^<]+)<\/printjobid>/)?.[1] ?? null;
    const ok = /success="true"/.test(xml);
    const code = xml.match(/code="([^"]*)"/)?.[1];
    await finish(sb, printer.id, jobId, ok, `Impressora Epson respondeu: ${code || 'erro'}`);
    return new Response('', { status: 200 });
  }

  // GetRequest: entrega o próximo cupom (ou resposta vazia)
  const job = printer.enabled ? await nextJob(sb, printer.id) : null;
  if (!job || !(await claim(sb, job, 'epson_sdp'))) {
    return new Response(`${xmlHeader}<PrintRequestInfo Version="2.00"></PrintRequestInfo>`, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
  }
  const ops = layout(job.document, { width: printer.width, copies: printer.copies, header_note: printer.header_note, footer_note: printer.footer_note });
  const body = `${xmlHeader}<PrintRequestInfo Version="2.00"><ePOSPrint><Parameter><devid>local_printer</devid><timeout>10000</timeout>` +
    `<printjobid>${job.id}</printjobid></Parameter><PrintData>${toEposXml(ops, printer.width)}</PrintData></ePOSPrint></PrintRequestInfo>`;
  return new Response(body, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  try {
    const parts = url.pathname.split('/').filter(Boolean);
    const i = parts.findIndex(p => p === 'star' || p === 'epson');
    const key = i >= 0 ? parts[i + 1] ?? null : null;
    if (parts[i] === 'star') return await star(req, url, key);
    if (parts[i] === 'epson') return await epson(req, key);
    return new Response('Use /cloud-print/star/CHAVE ou /cloud-print/epson/CHAVE', { status: 404 });
  } catch (e) {
    console.error('cloud-print', e);
    return new Response('Erro interno', { status: 500 });
  }
});
