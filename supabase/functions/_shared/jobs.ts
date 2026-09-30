import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  getAccount, getCredential, google, GOOGLE_ADS_API, graph, HttpError, MEDIA_BUCKET, mediaUrl, tiktok,
} from './marketing.ts';

// ---------- Central de publicação ----------
// Cada rede segue: pending → (processing) → published | error.
// "processing" é para quem processa a mídia de forma assíncrona (vídeo no Instagram, TikTok);
// o agendador (marketing-scheduler) volta a checar a cada minuto.

export type Channel = 'facebook' | 'instagram' | 'tiktok';
export type ChannelResult = {
  status: 'pending' | 'processing' | 'published' | 'error';
  id?: string; url?: string; error?: string; ref?: string; started_at?: string;
};
type Post = {
  id: string; restaurant_id: string; channels: string[]; caption: string; image_path: string | null;
  media_type: 'none' | 'image' | 'video'; results: Record<string, ChannelResult>; options: Record<string, any>;
};

const PROCESSING_TIMEOUT_MS = 30 * 60_000;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);

async function startFacebook(admin: SupabaseClient, post: Post): Promise<ChannelResult> {
  const page = await getAccount(admin, post.restaurant_id, 'facebook_page');
  const tok = page.metadata?.page_token;
  if (!tok) throw new HttpError(409, 'Reconecte a conta da Meta');
  let r: any;
  if (post.media_type === 'image') {
    r = await graph(`/${page.external_id}/photos`, tok, { method: 'POST', params: { url: await mediaUrl(admin, post.image_path!), caption: post.caption } });
  } else if (post.media_type === 'video') {
    r = await graph(`/${page.external_id}/videos`, tok, { method: 'POST', params: { file_url: await mediaUrl(admin, post.image_path!), description: post.caption } });
  } else {
    r = await graph(`/${page.external_id}/feed`, tok, { method: 'POST', params: { message: post.caption } });
  }
  const id = r.post_id ?? r.id;
  return { status: 'published', id, url: `https://www.facebook.com/${id}` };
}

async function publishInstagramContainer(ig: any, containerId: string): Promise<ChannelResult | null> {
  const tok = ig.metadata?.page_token;
  const c = await graph(`/${containerId}`, tok, { params: { fields: 'status_code,status' } });
  if (c.status_code === 'IN_PROGRESS') return null;
  if (c.status_code !== 'FINISHED') throw new HttpError(400, `Instagram recusou a mídia (${c.status || c.status_code})`);
  const p = await graph(`/${ig.external_id}/media_publish`, tok, { method: 'POST', params: { creation_id: containerId } });
  const info = await graph(`/${p.id}`, tok, { params: { fields: 'permalink' } }).catch(() => null);
  return { status: 'published', id: p.id, url: info?.permalink };
}

async function startInstagram(admin: SupabaseClient, post: Post): Promise<ChannelResult> {
  if (post.media_type === 'none') throw new HttpError(400, 'O Instagram exige uma foto ou vídeo');
  const ig = await getAccount(admin, post.restaurant_id, 'instagram');
  const tok = ig.metadata?.page_token;
  if (!tok) throw new HttpError(409, 'Reconecte a conta da Meta');
  const url = await mediaUrl(admin, post.image_path!);
  const params = post.media_type === 'video'
    ? { media_type: 'REELS', video_url: url, caption: post.caption, share_to_feed: 'true' }
    : { image_url: url, caption: post.caption };
  const c = await graph(`/${ig.external_id}/media`, tok, { method: 'POST', params });
  // Foto costuma ficar pronta na hora; vídeo fica para o agendador.
  if (post.media_type === 'image') {
    for (let i = 0; i < 5; i++) {
      const done = await publishInstagramContainer(ig, c.id);
      if (done) return done;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return { status: 'processing', ref: c.id, started_at: new Date().toISOString() };
}

async function checkInstagram(admin: SupabaseClient, post: Post, r: ChannelResult): Promise<ChannelResult> {
  const ig = await getAccount(admin, post.restaurant_id, 'instagram');
  return (await publishInstagramContainer(ig, r.ref!)) ?? r;
}

async function startTiktok(admin: SupabaseClient, post: Post): Promise<ChannelResult> {
  if (post.media_type === 'none') throw new HttpError(400, 'O TikTok exige uma foto ou vídeo');
  const tok = await getCredential(admin, post.restaurant_id, 'tiktok');
  const creator = await tiktok('/post/publish/creator_info/query/', tok, {});
  const options: string[] = creator.privacy_level_options ?? [];
  const wanted = post.options?.tiktok_privacy;
  const privacy = options.includes(wanted) ? wanted : (options.includes('SELF_ONLY') ? 'SELF_ONLY' : options[0]);
  const flags = { disable_comment: false, disable_duet: false, disable_stitch: false };

  if (post.media_type === 'image') {
    const r = await tiktok('/post/publish/content/init/', tok, {
      post_info: { title: post.caption.slice(0, 90), description: post.caption.slice(0, 4000), privacy_level: privacy, disable_comment: false, auto_add_music: true },
      source_info: { source: 'PULL_FROM_URL', photo_cover_index: 0, photo_images: [await mediaUrl(admin, post.image_path!, true)] },
      post_mode: 'DIRECT_POST', media_type: 'PHOTO',
    });
    return { status: 'processing', ref: r.publish_id, started_at: new Date().toISOString() };
  }

  // Vídeo: envio direto do arquivo (não depende de domínio verificado). Até 64 MB vai em um pedaço só.
  const { data: file, error } = await admin.storage.from(MEDIA_BUCKET).download(post.image_path!);
  if (error || !file) throw new HttpError(500, 'Não foi possível ler o vídeo');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const init = await tiktok('/post/publish/video/init/', tok, {
    post_info: { title: post.caption.slice(0, 2200), privacy_level: privacy, ...flags },
    source_info: { source: 'FILE_UPLOAD', video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 },
  });
  const up = await fetch(init.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'video/mp4', 'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}` },
    body: bytes,
  });
  if (!up.ok) throw new HttpError(502, `TikTok recusou o envio do vídeo (${up.status})`);
  return { status: 'processing', ref: init.publish_id, started_at: new Date().toISOString() };
}

async function checkTiktok(admin: SupabaseClient, post: Post, r: ChannelResult): Promise<ChannelResult> {
  const tok = await getCredential(admin, post.restaurant_id, 'tiktok');
  const s = await tiktok('/post/publish/status/fetch/', tok, { publish_id: r.ref });
  if (s.status === 'FAILED') throw new HttpError(400, `TikTok: ${s.fail_reason ?? 'falha ao publicar'}`);
  if (s.status === 'PUBLISH_COMPLETE' || s.status === 'SEND_TO_USER_INBOX') {
    const id = s.publicaly_available_post_id?.[0] ? String(s.publicaly_available_post_id[0]) : undefined;
    return { status: 'published', id, url: id ? `https://www.tiktok.com/video/${id}` : undefined };
  }
  return r;
}

const START: Record<Channel, (a: SupabaseClient, p: Post) => Promise<ChannelResult>> = {
  facebook: startFacebook, instagram: startInstagram, tiktok: startTiktok,
};
const CHECK: Partial<Record<Channel, (a: SupabaseClient, p: Post, r: ChannelResult) => Promise<ChannelResult>>> = {
  instagram: checkInstagram, tiktok: checkTiktok,
};

function overallStatus(channels: string[], results: Record<string, ChannelResult>) {
  const st = channels.map(c => results[c]?.status ?? 'pending');
  if (st.some(s => s === 'pending' || s === 'processing')) return 'publishing';
  if (st.every(s => s === 'published')) return 'published';
  if (st.every(s => s === 'error')) return 'error';
  return 'partial';
}

/**
 * Avança uma publicação: inicia as redes pendentes e confere as que estão processando.
 * Usa uma trava curta para o agendador e o botão "publicar agora" não publicarem em dobro.
 */
export async function processPost(admin: SupabaseClient, postId: string) {
  const { data: post } = await admin.from('marketing_posts')
    .update({ locked_until: new Date(Date.now() + 3 * 60_000).toISOString() })
    .eq('id', postId)
    .or(`locked_until.is.null,locked_until.lt."${new Date().toISOString()}"`)
    .select('*').maybeSingle();
  if (!post) return null; // outro processo já está cuidando dela

  const results: Record<string, ChannelResult> = { ...(post.results ?? {}) };
  try {
    for (const ch of post.channels as Channel[]) {
      const cur = results[ch] ?? { status: 'pending' };
      if (cur.status === 'published' || cur.status === 'error') continue;
      try {
        if (cur.status === 'processing') {
          if (cur.started_at && Date.now() - new Date(cur.started_at).getTime() > PROCESSING_TIMEOUT_MS) {
            throw new HttpError(504, 'A rede demorou demais para processar a mídia');
          }
          results[ch] = CHECK[ch] ? await CHECK[ch]!(admin, post, cur) : cur;
        } else {
          if (!START[ch]) throw new HttpError(400, 'Rede não suportada');
          results[ch] = await START[ch](admin, post);
        }
      } catch (e) {
        results[ch] = { ...cur, status: 'error', error: errMsg(e) };
      }
    }
  } finally {
    const status = overallStatus(post.channels, results);
    const errors = Object.entries(results).filter(([, r]) => r.status === 'error').map(([c, r]) => `${c}: ${r.error}`);
    await admin.from('marketing_posts').update({
      results, status, locked_until: null,
      error_message: errors.length ? errors.join(' | ').slice(0, 1000) : null,
      published_at: status === 'published' || status === 'partial' ? new Date().toISOString() : post.published_at,
      external_ids: Object.fromEntries(Object.entries(results).filter(([, r]) => r.id).map(([c, r]) => [c, r.id])),
    }).eq('id', post.id);
  }
  return results;
}

// ---------- Anúncios (antes em marketing-api) ----------
export async function syncAdMetrics(admin: SupabaseClient, restaurantId: string, campaign: any) {
  const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const rows: any[] = [];
  let status = campaign.status;
  if (campaign.platform === 'meta') {
    const tok = await getCredential(admin, restaurantId, 'meta');
    const c = await graph(`/${campaign.external_ids.campaign}`, tok, { params: { fields: 'effective_status' } });
    status = String(c.effective_status).toLowerCase();
    const r = await graph(`/${campaign.external_ids.campaign}/insights`, tok, { params: { fields: 'spend,impressions,clicks,actions', time_increment: '1', date_preset: 'last_30d' } });
    for (const d of r.data ?? []) {
      const conv = (d.actions ?? []).find((a: any) => a.action_type?.includes('messaging_conversation_started'))?.value ?? 0;
      rows.push({ metric_date: d.date_start, spend: Number(d.spend ?? 0), impressions: Number(d.impressions ?? 0), clicks: Number(d.clicks ?? 0), conversations: Number(conv) });
    }
  } else {
    const tok = await getCredential(admin, restaurantId, 'google');
    const acc = await getAccount(admin, restaurantId, 'google_ads');
    const q = `SELECT segments.date, campaign.status, metrics.cost_micros, metrics.impressions, metrics.clicks FROM campaign WHERE campaign.resource_name = '${campaign.external_ids.campaign}' AND segments.date >= '${since}'`;
    const r = await google(`${GOOGLE_ADS_API}/customers/${acc.external_id}/googleAds:search`, tok, { method: 'POST', ads: true, body: { query: q } });
    for (const row of r.results ?? []) {
      status = String(row.campaign.status).toLowerCase();
      rows.push({ metric_date: row.segments.date, spend: Number(row.metrics.costMicros ?? 0) / 1e6, impressions: Number(row.metrics.impressions ?? 0), clicks: Number(row.metrics.clicks ?? 0), conversations: 0 });
    }
  }
  if (rows.length) await admin.from('ad_metrics_daily').upsert(rows.map(r => ({ ...r, restaurant_id: restaurantId, campaign_id: campaign.id })), { onConflict: 'campaign_id,metric_date' });
  await admin.from('ad_campaigns').update({ status: status === 'enabled' ? 'active' : status, last_synced_at: new Date().toISOString(), error_message: null }).eq('id', campaign.id);
}
