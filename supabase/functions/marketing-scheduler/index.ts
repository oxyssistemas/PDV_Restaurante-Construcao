import { adminClient, json } from '../_shared/marketing.ts';
import { processPost, syncAdMetrics } from '../_shared/jobs.ts';

// Chamado a cada minuto pelo pg_cron (migração marketing_publishing_hub) com o segredo guardado no Vault.
Deno.serve(async (req) => {
  const admin = adminClient();
  const { data: secret } = await admin.rpc('marketing_cron_secret');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return json({ error: 'forbidden' }, 403);

  const now = new Date().toISOString();
  const [{ data: due }, { data: running }] = await Promise.all([
    admin.from('marketing_posts').select('id').eq('status', 'scheduled').lte('scheduled_for', now).limit(10),
    admin.from('marketing_posts').select('id').eq('status', 'publishing').limit(20),
  ]);

  const results = { started: 0, checked: 0, failed: 0 };
  for (const p of due ?? []) {
    await admin.from('marketing_posts').update({ status: 'publishing' }).eq('id', p.id).eq('status', 'scheduled');
    try { await processPost(admin, p.id); results.started++; } catch (e) { console.error('scheduler', p.id, e); results.failed++; }
  }
  for (const p of running ?? []) {
    try { await processPost(admin, p.id); results.checked++; } catch (e) { console.error('scheduler', p.id, e); results.failed++; }
  }

  // Métricas de anúncios uma vez por dia.
  const d = new Date();
  if (d.getUTCHours() === 9 && d.getUTCMinutes() === 0) {
    const { data: camps } = await admin.from('ad_campaigns').select('*').not('external_ids->>campaign', 'is', null).in('status', ['active', 'paused']);
    for (const c of camps ?? []) await syncAdMetrics(admin, c.restaurant_id, c).catch(() => null);
  }
  return json(results);
});
