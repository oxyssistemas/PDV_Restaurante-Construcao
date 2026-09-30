import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  authorize, configured, getAccount, getCredential, google, GOOGLE_ADS_API, graph, HttpError, json, signedImage, tiktok,
} from '../_shared/marketing.ts';
import { processPost, syncAdMetrics } from '../_shared/jobs.ts';

const EDIT_ACTIONS = new Set(['select_account', 'disconnect', 'publish_post', 'reply_comment', 'wa_send', 'wa_template_create', 'wa_broadcast', 'reply_review', 'google_post', 'ads_create', 'ads_status', 'ads_budget']);
const str = (v: unknown, max: number, min = 0) => {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) throw new HttpError(400, 'Dados inválidos');
  return v.trim();
};
const digits = (v: unknown) => { const d = String(v ?? '').replace(/\D/g, ''); if (d.length < 10 || d.length > 15) throw new HttpError(400, 'Telefone inválido'); return d.length <= 11 ? `55${d}` : d; };

async function createMetaCampaign(admin: SupabaseClient, rid: string, c: any) {
  const tok = await getCredential(admin, rid, 'meta');
  const acc = await getAccount(admin, rid, 'meta_ads');
  const page = await getAccount(admin, rid, 'facebook_page');
  const act = `/act_${acc.external_id}`;
  const obj: Record<string, [string, string]> = { traffic: ['OUTCOME_TRAFFIC', 'LINK_CLICKS'], awareness: ['OUTCOME_AWARENESS', 'REACH'], engagement: ['OUTCOME_ENGAGEMENT', 'POST_ENGAGEMENT'] };
  const [objective, goal] = obj[c.objective] ?? obj.traffic;
  const ids: Record<string, string> = {};
  const camp = await graph(`${act}/campaigns`, tok, { method: 'POST', params: { name: c.name, objective, status: 'PAUSED', special_ad_categories: [] } });
  ids.campaign = camp.id;
  const t = c.targeting;
  const adset = await graph(`${act}/adsets`, tok, { method: 'POST', params: {
    name: `${c.name} - público`, campaign_id: camp.id, daily_budget: String(Math.round(c.daily_budget * 100)),
    billing_event: 'IMPRESSIONS', optimization_goal: goal, bid_strategy: 'LOWEST_COST_WITHOUT_CAP', status: 'PAUSED',
    start_time: c.start_date ? `${c.start_date}T00:00:00-0300` : undefined, end_time: c.end_date ? `${c.end_date}T23:59:00-0300` : undefined,
    targeting: { geo_locations: { custom_locations: [{ latitude: t.latitude, longitude: t.longitude, radius: t.radius_km, distance_unit: 'kilometer' }] }, age_min: t.age_min, age_max: t.age_max },
  } });
  ids.adset = adset.id;
  const picture = await signedImage(admin, c.creative.image_path);
  const creative = await graph(`${act}/adcreatives`, tok, { method: 'POST', params: {
    name: `${c.name} - criativo`,
    object_story_spec: { page_id: page.external_id, link_data: { link: c.creative.link, message: c.creative.text, name: c.creative.headline, picture: picture ?? undefined } },
  } });
  const ad = await graph(`${act}/ads`, tok, { method: 'POST', params: { name: c.name, adset_id: adset.id, creative: { creative_id: creative.id }, status: 'PAUSED' } });
  ids.ad = ad.id;
  return ids;
}

async function createGoogleCampaign(admin: SupabaseClient, rid: string, c: any) {
  const tok = await getCredential(admin, rid, 'google');
  const acc = await getAccount(admin, rid, 'google_ads');
  const cid = acc.external_id;
  const t = c.targeting;
  const kws: string[] = (c.creative.keywords ?? []).slice(0, 20);
  const headlines: string[] = (c.creative.headlines ?? []).filter(Boolean).slice(0, 15);
  const descriptions: string[] = (c.creative.descriptions ?? []).filter(Boolean).slice(0, 4);
  if (headlines.length < 3 || descriptions.length < 2 || !kws.length) throw new HttpError(400, 'Informe ao menos 3 títulos, 2 descrições e 1 palavra-chave');
  const ops: any[] = [
    { campaignBudgetOperation: { create: { resourceName: `customers/${cid}/campaignBudgets/-1`, name: `${c.name} ${Date.now()}`, amountMicros: String(Math.round(c.daily_budget * 1e6)), deliveryMethod: 'STANDARD' } } },
    { campaignOperation: { create: {
      resourceName: `customers/${cid}/campaigns/-2`, name: c.name, status: 'PAUSED', advertisingChannelType: 'SEARCH',
      campaignBudget: `customers/${cid}/campaignBudgets/-1`, maximizeClicks: {},
      networkSettings: { targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false },
      startDate: c.start_date?.replace(/-/g, ''), endDate: c.end_date?.replace(/-/g, ''),
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
    } } },
    { campaignCriterionOperation: { create: { campaign: `customers/${cid}/campaigns/-2`, proximity: { geoPoint: { latitudeInMicroDegrees: Math.round(t.latitude * 1e6), longitudeInMicroDegrees: Math.round(t.longitude * 1e6) }, radius: t.radius_km, radiusUnits: 'KILOMETERS' } } } },
    { adGroupOperation: { create: { resourceName: `customers/${cid}/adGroups/-3`, name: `${c.name} - grupo`, campaign: `customers/${cid}/campaigns/-2`, status: 'ENABLED', type: 'SEARCH_STANDARD' } } },
    { adGroupAdOperation: { create: { adGroup: `customers/${cid}/adGroups/-3`, status: 'ENABLED', ad: { finalUrls: [c.creative.link], responsiveSearchAd: {
      headlines: headlines.map(text => ({ text: text.slice(0, 30) })), descriptions: descriptions.map(text => ({ text: text.slice(0, 90) })),
    } } } } },
    ...kws.map(k => ({ adGroupCriterionOperation: { create: { adGroup: `customers/${cid}/adGroups/-3`, status: 'ENABLED', keyword: { text: k.slice(0, 80), matchType: 'PHRASE' } } } })),
  ];
  const r = await google(`${GOOGLE_ADS_API}/customers/${cid}/googleAds:mutate`, tok, { method: 'POST', ads: true, body: { mutateOperations: ops } });
  const res = r.mutateOperationResponses ?? [];
  return { budget: res[0]?.campaignBudgetResult?.resourceName, campaign: res[1]?.campaignResult?.resourceName };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const b = await req.json().catch(() => ({}));
    const action = String(b.action ?? '');
    const { user, admin } = await authorize(req, b.restaurantId, EDIT_ACTIONS.has(action));
    const rid: string = b.restaurantId;

    switch (action) {
      case 'status': {
        const { data } = await admin.from('marketing_credentials').select('provider, expires_at, updated_at').eq('restaurant_id', rid);
        return json({ configured, credentials: (data ?? []).map(c => ({ provider: c.provider, expired: c.provider === 'meta' && !!c.expires_at && new Date(c.expires_at) < new Date(), updated_at: c.updated_at })) });
      }
      case 'select_account': {
        const { data: acc } = await admin.from('marketing_accounts').select('kind').eq('id', b.accountId).eq('restaurant_id', rid).single();
        if (!acc) throw new HttpError(404, 'Conta não encontrada');
        await admin.from('marketing_accounts').update({ selected: false }).eq('restaurant_id', rid).eq('kind', acc.kind);
        await admin.from('marketing_accounts').update({ selected: true }).eq('id', b.accountId);
        return json({ ok: true });
      }
      case 'disconnect': {
        const p = ['meta', 'google', 'tiktok'].includes(b.provider) ? b.provider : 'google';
        await admin.from('marketing_credentials').delete().eq('restaurant_id', rid).eq('provider', p);
        await admin.from('marketing_accounts').delete().eq('restaurant_id', rid).eq('provider', p);
        return json({ ok: true });
      }
      case 'publish_post': {
        const postId = str(b.postId, 36, 36);
        const { data: post } = await admin.from('marketing_posts').select('id, status').eq('id', postId).eq('restaurant_id', rid).single();
        if (!post) throw new HttpError(404, 'Publicação não encontrada');
        if (post.status === 'published') return json({ ok: true });
        // Tentar de novo: volta as redes com erro para "pendente".
        if (post.status === 'error' || post.status === 'partial') {
          const { data: full } = await admin.from('marketing_posts').select('results').eq('id', postId).single();
          const results = Object.fromEntries(Object.entries(full?.results ?? {}).filter(([, r]: any) => r.status !== 'error'));
          await admin.from('marketing_posts').update({ results }).eq('id', postId);
        }
        await admin.from('marketing_posts').update({ status: 'publishing', scheduled_for: null }).eq('id', postId);
        // Acompanha por até ~40s; o que ainda estiver processando o agendador termina.
        const deadline = Date.now() + 40_000;
        let results = await processPost(admin, postId);
        while (results && Object.values(results).some((r: any) => r.status === 'processing') && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 5000));
          results = await processPost(admin, postId) ?? results;
        }
        return json({ ok: true, results });
      }
      case 'tiktok_creator_info': {
        const tok = await getCredential(admin, rid, 'tiktok');
        const c = await tiktok('/post/publish/creator_info/query/', tok, {});
        return json({ nickname: c.creator_nickname, username: c.creator_username, avatar: c.creator_avatar_url, privacy_options: c.privacy_level_options ?? [], max_video_seconds: c.max_video_post_duration_sec });
      }
      case 'post_insights': {
        const { data: posts } = await admin.from('marketing_posts').select('*').eq('restaurant_id', rid).eq('status', 'published').order('published_at', { ascending: false }).limit(20);
        const summary: Record<string, unknown> = {};
        try {
          const ig = await getAccount(admin, rid, 'instagram');
          summary.instagram = await graph(`/${ig.external_id}`, ig.metadata.page_token, { params: { fields: 'followers_count,media_count' } });
          for (const p of posts ?? []) if (p.external_ids.instagram) {
            const m = await graph(`/${p.external_ids.instagram}`, ig.metadata.page_token, { params: { fields: 'like_count,comments_count' } }).catch(() => null);
            if (m) p.metrics = { ...p.metrics, instagram: { likes: m.like_count, comments: m.comments_count } };
          }
        } catch { /* canal não conectado */ }
        try {
          const page = await getAccount(admin, rid, 'facebook_page');
          summary.facebook = await graph(`/${page.external_id}`, page.metadata.page_token, { params: { fields: 'followers_count,fan_count' } });
          for (const p of posts ?? []) if (p.external_ids.facebook) {
            const m = await graph(`/${p.external_ids.facebook}`, page.metadata.page_token, { params: { fields: 'likes.summary(true).limit(0),comments.summary(true).limit(0)' } }).catch(() => null);
            if (m) p.metrics = { ...p.metrics, facebook: { likes: m.likes?.summary?.total_count ?? 0, comments: m.comments?.summary?.total_count ?? 0 } };
          }
        } catch { /* canal não conectado */ }
        for (const p of posts ?? []) await admin.from('marketing_posts').update({ metrics: p.metrics }).eq('id', p.id);
        const today = new Date().toISOString().slice(0, 10);
        const ig = summary.instagram as any, fb = summary.facebook as any;
        if (ig) await admin.from('marketing_metrics_daily').upsert({ restaurant_id: rid, channel: 'instagram', metric_date: today, followers: ig.followers_count }, { onConflict: 'restaurant_id,channel,metric_date' });
        if (fb) await admin.from('marketing_metrics_daily').upsert({ restaurant_id: rid, channel: 'facebook', metric_date: today, followers: fb.followers_count ?? fb.fan_count }, { onConflict: 'restaurant_id,channel,metric_date' });
        return json({ summary });
      }
      case 'comments': {
        const out: any[] = [];
        const { data: posts } = await admin.from('marketing_posts').select('id, caption, external_ids').eq('restaurant_id', rid).eq('status', 'published').order('published_at', { ascending: false }).limit(10);
        for (const p of posts ?? []) {
          if (p.external_ids.instagram) {
            const ig = await getAccount(admin, rid, 'instagram').catch(() => null);
            if (ig) { const r = await graph(`/${p.external_ids.instagram}/comments`, ig.metadata.page_token, { params: { fields: 'id,text,username,timestamp,replies{text,username}' } }).catch(() => ({ data: [] }));
              for (const c of r.data ?? []) out.push({ channel: 'instagram', id: c.id, text: c.text, author: c.username, created_at: c.timestamp, post: p.caption, replies: (c.replies?.data ?? []).map((x: any) => ({ text: x.text, author: x.username })) }); }
          }
          if (p.external_ids.facebook) {
            const page = await getAccount(admin, rid, 'facebook_page').catch(() => null);
            if (page) { const r = await graph(`/${p.external_ids.facebook}/comments`, page.metadata.page_token, { params: { fields: 'id,message,from,created_time,comments{message,from}' } }).catch(() => ({ data: [] }));
              for (const c of r.data ?? []) out.push({ channel: 'facebook', id: c.id, text: c.message, author: c.from?.name, created_at: c.created_time, post: p.caption, replies: (c.comments?.data ?? []).map((x: any) => ({ text: x.message, author: x.from?.name })) }); }
          }
        }
        return json({ comments: out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) });
      }
      case 'reply_comment': {
        const text = str(b.text, 1000, 1);
        if (b.channel === 'instagram') { const ig = await getAccount(admin, rid, 'instagram'); await graph(`/${str(b.commentId, 100, 1)}/replies`, ig.metadata.page_token, { method: 'POST', params: { message: text } }); }
        else { const page = await getAccount(admin, rid, 'facebook_page'); await graph(`/${str(b.commentId, 100, 1)}/comments`, page.metadata.page_token, { method: 'POST', params: { message: text } }); }
        return json({ ok: true });
      }
      // ---------- WhatsApp ----------
      case 'wa_send': {
        const tok = await getCredential(admin, rid, 'meta');
        const wa = await getAccount(admin, rid, 'whatsapp');
        const { data: conv } = await admin.from('whatsapp_conversations').select('*').eq('id', b.conversationId).eq('restaurant_id', rid).single();
        if (!conv) throw new HttpError(404, 'Conversa não encontrada');
        const text = str(b.text, 4000, 1);
        if (!conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > 24 * 3600_000) throw new HttpError(400, 'Passaram mais de 24h desde a última mensagem do cliente. Use um modelo aprovado.');
        const r = await graph(`/${wa.external_id}/messages`, tok, { method: 'POST', params: { messaging_product: 'whatsapp', to: conv.phone, type: 'text', text: { body: text } } });
        await admin.from('whatsapp_messages').insert({ restaurant_id: rid, conversation_id: conv.id, direction: 'out', body: text, external_id: r.messages?.[0]?.id, sent_by: user.id });
        await admin.from('whatsapp_conversations').update({ last_message: text, last_message_at: new Date().toISOString(), unread_count: 0 }).eq('id', conv.id);
        return json({ ok: true });
      }
      case 'wa_templates_sync': {
        const tok = await getCredential(admin, rid, 'meta');
        const wa = await getAccount(admin, rid, 'whatsapp');
        const r = await graph(`/${wa.parent_id}/message_templates`, tok, { params: { fields: 'name,language,category,status,components', limit: '100' } });
        for (const t of r.data ?? []) {
          const body = (t.components ?? []).find((c: any) => c.type === 'BODY')?.text ?? '';
          await admin.from('whatsapp_templates').upsert({ restaurant_id: rid, name: t.name, language: t.language, category: t.category, status: t.status, body, variables: (body.match(/\{\{\d+\}\}/g) ?? []).length }, { onConflict: 'restaurant_id,name,language' });
        }
        return json({ ok: true });
      }
      case 'wa_template_create': {
        const tok = await getCredential(admin, rid, 'meta');
        const wa = await getAccount(admin, rid, 'whatsapp');
        const name = str(b.name, 60, 3).toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const body = str(b.body, 1000, 10);
        const n = (body.match(/\{\{\d+\}\}/g) ?? []).length;
        const examples: string[] = Array.isArray(b.examples) ? b.examples.slice(0, n).map(String) : [];
        if (examples.length < n) throw new HttpError(400, 'Informe um exemplo para cada variável');
        await graph(`/${wa.parent_id}/message_templates`, tok, { method: 'POST', params: { name, language: 'pt_BR', category: b.category === 'UTILITY' ? 'UTILITY' : 'MARKETING',
          components: [{ type: 'BODY', text: body, ...(n ? { example: { body_text: [examples] } } : {}) }] } });
        await admin.from('whatsapp_templates').upsert({ restaurant_id: rid, name, language: 'pt_BR', category: b.category === 'UTILITY' ? 'UTILITY' : 'MARKETING', body, status: 'PENDING', variables: n }, { onConflict: 'restaurant_id,name,language' });
        return json({ ok: true });
      }
      case 'wa_broadcast': {
        const tok = await getCredential(admin, rid, 'meta');
        const wa = await getAccount(admin, rid, 'whatsapp');
        const { data: tpl } = await admin.from('whatsapp_templates').select('*').eq('id', b.templateId).eq('restaurant_id', rid).single();
        if (!tpl || tpl.status !== 'APPROVED') throw new HttpError(400, 'Escolha um modelo aprovado pela Meta');
        const params: string[] = Array.isArray(b.params) ? b.params.map((p: unknown) => String(p).slice(0, 200)) : [];
        const { data: customers } = await admin.from('customers').select('id, name, phone').eq('restaurant_id', rid).eq('marketing_opt_in', true).not('phone', 'is', null).limit(500);
        let sent = 0, failed = 0;
        for (const c of customers ?? []) {
          try {
            const phone = digits(c.phone);
            const values = params.map(p => p.replace('{nome}', c.name.split(' ')[0]));
            const r = await graph(`/${wa.external_id}/messages`, tok, { method: 'POST', params: { messaging_product: 'whatsapp', to: phone, type: 'template',
              template: { name: tpl.name, language: { code: tpl.language }, components: tpl.variables ? [{ type: 'body', parameters: values.slice(0, tpl.variables).map(text => ({ type: 'text', text })) }] : [] } } });
            const { data: conv } = await admin.from('whatsapp_conversations').upsert({ restaurant_id: rid, phone, contact_name: c.name, customer_id: c.id, last_message: `[Modelo] ${tpl.name}`, last_message_at: new Date().toISOString() }, { onConflict: 'restaurant_id,phone' }).select('id').single();
            if (conv) await admin.from('whatsapp_messages').insert({ restaurant_id: rid, conversation_id: conv.id, direction: 'out', body: tpl.body, message_type: 'template', external_id: r.messages?.[0]?.id, sent_by: user.id });
            sent++;
          } catch { failed++; }
        }
        return json({ sent, failed });
      }
      // ---------- Google Meu Negócio ----------
      case 'reviews': {
        const tok = await getCredential(admin, rid, 'google');
        const loc = await getAccount(admin, rid, 'google_location');
        const r = await google(`https://mybusiness.googleapis.com/v4/${loc.parent_id}/${loc.external_id}/reviews?pageSize=50`, tok);
        return json({ reviews: r.reviews ?? [], average: r.averageRating, total: r.totalReviewCount });
      }
      case 'reply_review': {
        const tok = await getCredential(admin, rid, 'google');
        const loc = await getAccount(admin, rid, 'google_location');
        await google(`https://mybusiness.googleapis.com/v4/${loc.parent_id}/${loc.external_id}/reviews/${encodeURIComponent(str(b.reviewId, 200, 1))}/reply`, tok, { method: 'PUT', body: { comment: str(b.text, 4000, 1) } });
        return json({ ok: true });
      }
      case 'google_post': {
        const tok = await getCredential(admin, rid, 'google');
        const loc = await getAccount(admin, rid, 'google_location');
        const image = await signedImage(admin, b.imagePath ?? null);
        await google(`https://mybusiness.googleapis.com/v4/${loc.parent_id}/${loc.external_id}/localPosts`, tok, { method: 'POST', body: {
          languageCode: 'pt-BR', summary: str(b.text, 1500, 1), topicType: 'STANDARD', ...(image ? { media: [{ mediaFormat: 'PHOTO', sourceUrl: image }] } : {}),
        } });
        return json({ ok: true });
      }
      case 'google_metrics': {
        const tok = await getCredential(admin, rid, 'google');
        const loc = await getAccount(admin, rid, 'google_location');
        const end = new Date(Date.now() - 3 * 86400000), start = new Date(end.getTime() - 28 * 86400000);
        const d = (x: Date, p: string) => `${p}.year=${x.getFullYear()}&${p}.month=${x.getMonth() + 1}&${p}.day=${x.getDate()}`;
        const metrics = ['BUSINESS_IMPRESSIONS_MOBILE_MAPS', 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH', 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS', 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH', 'CALL_CLICKS', 'BUSINESS_DIRECTION_REQUESTS'];
        const url = `https://businessprofileperformance.googleapis.com/v1/${loc.external_id}:fetchMultiDailyMetricsTimeSeries?${metrics.map(m => `dailyMetrics=${m}`).join('&')}&${d(start, 'dailyRange.startDate')}&${d(end, 'dailyRange.endDate')}`;
        const r = await google(url, tok);
        const days: Record<string, { views: number; calls: number; directions: number }> = {};
        for (const s of r.multiDailyMetricTimeSeries ?? []) for (const ts of s.dailyMetricTimeSeries ?? []) for (const v of ts.timeSeries?.datedValues ?? []) {
          const key = `${v.date.year}-${String(v.date.month).padStart(2, '0')}-${String(v.date.day).padStart(2, '0')}`;
          days[key] ??= { views: 0, calls: 0, directions: 0 };
          const n = Number(v.value ?? 0);
          if (ts.dailyMetric === 'CALL_CLICKS') days[key].calls += n; else if (ts.dailyMetric === 'BUSINESS_DIRECTION_REQUESTS') days[key].directions += n; else days[key].views += n;
        }
        const rows = Object.entries(days).map(([metric_date, v]) => ({ restaurant_id: rid, channel: 'google', metric_date, ...v }));
        if (rows.length) await admin.from('marketing_metrics_daily').upsert(rows, { onConflict: 'restaurant_id,channel,metric_date' });
        return json({ ok: true });
      }
      // ---------- Anúncios ----------
      case 'ads_create': {
        const platform = b.platform === 'google' ? 'google' : 'meta';
        const budget = Number(b.dailyBudget);
        if (!(budget >= 6 && budget <= 10000)) throw new HttpError(400, 'Orçamento diário entre R$ 6 e R$ 10.000');
        const t = b.targeting ?? {};
        const targeting = { latitude: Number(t.latitude), longitude: Number(t.longitude), radius_km: Math.min(Math.max(Number(t.radius_km) || 5, 1), 80), age_min: Math.max(18, Number(t.age_min) || 18), age_max: Math.min(65, Number(t.age_max) || 65) };
        if (!Number.isFinite(targeting.latitude) || !Number.isFinite(targeting.longitude)) throw new HttpError(400, 'Informe a localização do público');
        const cr = b.creative ?? {};
        const creative = { text: String(cr.text ?? '').slice(0, 500), headline: String(cr.headline ?? '').slice(0, 80), link: str(cr.link, 500, 8), image_path: cr.image_path ?? null, headlines: cr.headlines ?? [], descriptions: cr.descriptions ?? [], keywords: cr.keywords ?? [] };
        if (!/^https:\/\//.test(creative.link)) throw new HttpError(400, 'O link precisa começar com https://');
        const row = { restaurant_id: rid, platform, name: str(b.name, 120, 3), objective: String(b.objective ?? 'traffic'), daily_budget: budget, start_date: b.startDate || null, end_date: b.endDate || null, targeting, creative, created_by: user.id, status: 'creating' };
        const { data: camp, error } = await admin.from('ad_campaigns').insert(row).select().single();
        if (error) throw error;
        try {
          const ids = platform === 'meta' ? await createMetaCampaign(admin, rid, camp) : await createGoogleCampaign(admin, rid, camp);
          await admin.from('ad_campaigns').update({ external_ids: ids, status: 'paused' }).eq('id', camp.id);
        } catch (e) {
          await admin.from('ad_campaigns').update({ status: 'error', error_message: e instanceof Error ? e.message : 'Erro' }).eq('id', camp.id);
          throw e;
        }
        return json({ id: camp.id });
      }
      case 'ads_status':
      case 'ads_budget': {
        const { data: camp } = await admin.from('ad_campaigns').select('*').eq('id', b.campaignId).eq('restaurant_id', rid).single();
        if (!camp?.external_ids?.campaign) throw new HttpError(404, 'Campanha não encontrada');
        const active = b.status === 'active';
        const budget = Number(b.dailyBudget);
        if (action === 'ads_budget' && !(budget >= 6 && budget <= 10000)) throw new HttpError(400, 'Orçamento inválido');
        if (camp.platform === 'meta') {
          const tok = await getCredential(admin, rid, 'meta');
          if (action === 'ads_status') {
            const s = active ? 'ACTIVE' : 'PAUSED';
            for (const id of [camp.external_ids.campaign, camp.external_ids.adset, camp.external_ids.ad].filter(Boolean)) await graph(`/${id}`, tok, { method: 'POST', params: { status: s } });
          } else await graph(`/${camp.external_ids.adset}`, tok, { method: 'POST', params: { daily_budget: String(Math.round(budget * 100)) } });
        } else {
          const tok = await getCredential(admin, rid, 'google');
          const acc = await getAccount(admin, rid, 'google_ads');
          const op = action === 'ads_status'
            ? { campaignOperation: { update: { resourceName: camp.external_ids.campaign, status: active ? 'ENABLED' : 'PAUSED' }, updateMask: 'status' } }
            : { campaignBudgetOperation: { update: { resourceName: camp.external_ids.budget, amountMicros: String(Math.round(budget * 1e6)) }, updateMask: 'amount_micros' } };
          await google(`${GOOGLE_ADS_API}/customers/${acc.external_id}/googleAds:mutate`, tok, { method: 'POST', ads: true, body: { mutateOperations: [op] } });
        }
        await admin.from('ad_campaigns').update(action === 'ads_status' ? { status: active ? 'active' : 'paused' } : { daily_budget: budget }).eq('id', camp.id);
        return json({ ok: true });
      }
      case 'ads_sync': {
        const { data: camps } = await admin.from('ad_campaigns').select('*').eq('restaurant_id', rid).not('external_ids->>campaign', 'is', null);
        const errors: string[] = [];
        for (const c of camps ?? []) await syncAdMetrics(admin, rid, c).catch(e => errors.push(`${c.name}: ${e.message}`));
        return json({ ok: true, errors });
      }
      default: throw new HttpError(400, 'Ação inválida');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error('marketing-api', e);
    return json({ error: e instanceof Error ? e.message : 'Erro' }, status);
  }
});
