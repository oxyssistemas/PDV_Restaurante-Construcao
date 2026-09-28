import { adminClient, verifyMetaSignature } from '../_shared/marketing.ts';

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    if (VERIFY_TOKEN && url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
    }
    return new Response('forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  const raw = await req.text();
  if (!(await verifyMetaSignature(raw, req.headers.get('x-hub-signature-256')))) return new Response('invalid signature', { status: 401 });

  try {
    const payload = JSON.parse(raw);
    const admin = adminClient();
    for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const phoneId = v.metadata?.phone_number_id;
      if (!phoneId) continue;
      const { data: accounts } = await admin.from('marketing_accounts').select('restaurant_id').eq('kind', 'whatsapp').eq('external_id', phoneId).eq('selected', true);
      for (const acc of accounts ?? []) {
        const rid = acc.restaurant_id;
        for (const m of v.messages ?? []) {
          const contact = (v.contacts ?? []).find((c: any) => c.wa_id === m.from);
          const body = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? `[${m.type}]`;
          const now = new Date(Number(m.timestamp) * 1000 || Date.now()).toISOString();
          const { data: existing } = await admin.from('whatsapp_conversations').select('id, unread_count').eq('restaurant_id', rid).eq('phone', m.from).maybeSingle();
          let convId = existing?.id;
          if (existing) {
            await admin.from('whatsapp_conversations').update({ last_message: body, last_message_at: now, last_inbound_at: now, unread_count: existing.unread_count + 1, contact_name: contact?.profile?.name ?? undefined }).eq('id', existing.id);
          } else {
            const { data } = await admin.from('whatsapp_conversations').insert({ restaurant_id: rid, phone: m.from, contact_name: contact?.profile?.name ?? null, last_message: body, last_message_at: now, last_inbound_at: now, unread_count: 1 }).select('id').single();
            convId = data?.id;
          }
          if (convId) await admin.from('whatsapp_messages').upsert({ restaurant_id: rid, conversation_id: convId, direction: 'in', body, message_type: m.type, external_id: m.id, status: 'received', created_at: now }, { onConflict: 'restaurant_id,external_id', ignoreDuplicates: true });
        }
        for (const s of v.statuses ?? []) {
          await admin.from('whatsapp_messages').update({ status: s.status, error_message: s.errors?.[0]?.title ?? null }).eq('restaurant_id', rid).eq('external_id', s.id);
        }
      }
    }
  } catch (e) {
    console.error('whatsapp-webhook', e);
  }
  return new Response('ok', { status: 200 });
});
