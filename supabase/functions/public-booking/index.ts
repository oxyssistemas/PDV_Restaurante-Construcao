import { createClient } from 'npm:@supabase/supabase-js@2';
import { dedicatedFor, relay } from '../_shared/relay.ts';
import { planAllows } from '../_shared/plan.ts';

// Reserva online e fila de espera (sem login): www.oxysrestaurante.app/reservar/<endereço> e /fila/<código>
//   { action: 'info', slug }                                   → loja, horários e regras
//   { action: 'slots', slug, date, party }                     → horários com mesa livre no dia
//   { action: 'book', slug, date, time, party, name, phone }   → cria a reserva (mesa escolhida no banco)
//   { action: 'queue_join', slug, name, phone, party }         → entra na fila de espera (se a loja liberou)
//   { action: 'queue_status', token } / 'queue_leave'          → posição na fila / sair da fila

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const nowLocal = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? 'info');
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

    // fila: pelo código do cliente
    if (action === 'queue_status' || action === 'queue_leave') {
      const token = String(body?.token ?? '');
      if (!UUID.test(token)) return json({ error: 'Fila não encontrada.' }, 404);
      const { data: w } = await sb.from('waitlist').select('id, restaurant_id, name, party_size, status, created_at, called_at').eq('public_token', token).maybeSingle();
      if (!w) return json({ error: 'Fila não encontrada.' }, 404);
      const target = await dedicatedFor(sb as any, { restaurantId: w.restaurant_id });
      if (target) return relay(target, 'public-booking', body);
      if (action === 'queue_leave' && ['waiting', 'called'].includes(w.status)) {
        await sb.from('waitlist').update({ status: 'cancelled' }).eq('id', w.id);
        return json({ ok: true });
      }
      const { count } = await sb.from('waitlist').select('id', { count: 'exact', head: true })
        .eq('restaurant_id', w.restaurant_id).eq('status', 'waiting').lt('created_at', w.created_at);
      const { data: r } = await sb.from('restaurants').select('name').eq('id', w.restaurant_id).maybeSingle();
      return json({ name: w.name, party: w.party_size, status: w.status, position: w.status === 'waiting' ? (count ?? 0) + 1 : null, restaurant: r?.name ?? '', called_at: w.called_at });
    }

    const slug = String(body?.slug ?? '').toLowerCase();
    if (!SLUG.test(slug)) return json({ error: 'Página não encontrada.' }, 404);
    const { data: s } = await sb.from('booking_settings').select('*, restaurants!inner(id, name, status)').eq('slug', slug).maybeSingle();
    const rest = (s as any)?.restaurants;
    if (!s || rest?.status !== 'active' || !(s.online_enabled || s.waitlist_online)) return json({ error: 'Página não encontrada.' }, 404);
    if (!(await planAllows(sb, s.restaurant_id, 'reservations'))) return json({ error: 'Página não encontrada.' }, 404);
    const target = await dedicatedFor(sb as any, { restaurantId: s.restaurant_id });
    if (target) return relay(target, 'public-booking', body);

    if (action === 'info') {
      const { data: b } = await sb.from('branding_settings').select('brand_name').eq('restaurant_id', s.restaurant_id).maybeSingle();
      return json({
        name: b?.brand_name?.trim() || rest.name, online_enabled: s.online_enabled, waitlist_online: s.waitlist_online,
        hours: s.hours, min_party: s.min_party, max_party: s.max_party, advance_days: s.advance_days, notice: s.notice,
        duration_minutes: s.duration_minutes, today: nowLocal().date,
      });
    }

    if (action === 'slots') {
      if (!s.online_enabled) return json({ error: 'Reserva online desligada.' }, 400);
      const date = String(body?.date ?? '');
      const party = Math.trunc(Number(body?.party));
      if (!DATE.test(date) || !(party >= 1)) return json({ error: 'Escolha a data e o número de pessoas.' }, 400);
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      const h = (s.hours as Record<string, [string, string]>)?.[String(dow)];
      if (!h) return json({ slots: [] });
      const [{ data: tables }, { data: res }] = await Promise.all([
        sb.from('restaurant_tables').select('id, capacity').eq('restaurant_id', s.restaurant_id).gte('capacity', party),
        sb.from('reservations').select('table_id, start_time, end_time').eq('restaurant_id', s.restaurant_id).eq('reservation_date', date).eq('status', 'confirmed'),
      ]);
      const now = nowLocal();
      const slots: string[] = [];
      for (let m = toMin(h[0]); m <= toMin(h[1]); m += s.slot_minutes) {
        if (date === now.date && m < now.minutes + s.min_notice_minutes) continue;
        const end = m + s.duration_minutes;
        const free = (tables ?? []).some(t => !(res ?? []).some(r => r.table_id === t.id && toMin(r.start_time.slice(0, 5)) < end && toMin(r.end_time.slice(0, 5)) > m));
        if (free) slots.push(toTime(m));
      }
      return json({ slots });
    }

    if (action === 'book') {
      const date = String(body?.date ?? ''), time = String(body?.time ?? '');
      if (!DATE.test(date) || !TIME.test(time)) return json({ error: 'Escolha a data e o horário.' }, 400);
      const { data, error } = await sb.rpc('book_online', {
        _restaurant_id: s.restaurant_id, _date: date, _time: time, _party: Math.trunc(Number(body?.party)) || 0,
        _name: String(body?.name ?? '').slice(0, 80), _phone: String(body?.phone ?? '').slice(0, 20), _notes: String(body?.notes ?? '').slice(0, 300),
      });
      if (error) return json({ error: error.message }, 400);
      return json(data);
    }

    if (action === 'queue_join') {
      if (!s.waitlist_online) return json({ error: 'A fila online está desligada.' }, 400);
      const name = String(body?.name ?? '').trim().slice(0, 80);
      const phone = String(body?.phone ?? '').replace(/\D/g, '').slice(0, 13);
      const party = Math.trunc(Number(body?.party));
      if (name.length < 2) return json({ error: 'Informe seu nome.' }, 400);
      if (phone.length < 10) return json({ error: 'Informe um WhatsApp com DDD.' }, 400);
      if (!(party >= 1 && party <= 50)) return json({ error: 'Informe quantas pessoas.' }, 400);
      const { count } = await sb.from('waitlist').select('id', { count: 'exact', head: true })
        .eq('restaurant_id', s.restaurant_id).eq('phone', phone).in('status', ['waiting', 'called']);
      if (count) return json({ error: 'Este telefone já está na fila.' }, 400);
      const { data, error } = await sb.from('waitlist')
        .insert({ restaurant_id: s.restaurant_id, name, phone, party_size: party, source: 'online' }).select('public_token').single();
      if (error) return json({ error: 'Não foi possível entrar na fila.' }, 400);
      return json({ token: data.public_token });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (e) {
    console.error('public-booking', e);
    return json({ error: 'Erro inesperado. Tente novamente.' }, 500);
  }
});
