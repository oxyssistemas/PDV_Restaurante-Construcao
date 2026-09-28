import { adminClient, json } from '../_shared/marketing.ts';

const CRON_SECRET = Deno.env.get('MARKETING_STATE_SECRET') ?? '';

// Importa as rotinas do marketing-api dinamicamente para evitar iniciar o servidor dele.
Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET || !CRON_SECRET) return json({ error: 'forbidden' }, 403);
  const admin = adminClient();
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1`;
  void base;
  const results = { published: 0, failed: 0 };

  const { data: due } = await admin.from('marketing_posts').select('id, restaurant_id')
    .eq('status', 'scheduled').lte('scheduled_for', new Date().toISOString()).limit(20);
  const { publishPost, syncAdMetrics } = await import('./jobs.ts');
  for (const p of due ?? []) {
    try { await publishPost(admin, p.restaurant_id, p.id); results.published++; } catch { results.failed++; }
  }

  const hour = new Date().getUTCHours();
  if (hour === 9) {
    const { data: camps } = await admin.from('ad_campaigns').select('*').not('external_ids->>campaign', 'is', null).in('status', ['active', 'paused']);
    for (const c of camps ?? []) await syncAdMetrics(admin, c.restaurant_id, c).catch(() => null);
  }
  return json(results);
});
