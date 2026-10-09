import { createClient } from 'npm:@supabase/supabase-js@2';

// Teste grátis (público, sem login): www.oxysrestaurante.app/cadastro
//   { name, restaurant, document, phone, email, password } → cria a loja (todas as funções por 14 dias) e o dono como admin.
// Ao fim do prazo a loja para sozinha (is_restaurant_active) até a Oxys liberar um plano.

const TRIAL_DAYS = 14;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

function validCpf(c: string) {
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function validCnpj(c: string) {
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (len: number) => {
    let sum = 0, pos = len - 7;
    for (let i = 0; i < len; i++) { sum += Number(c[i]) * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método inválido' }, 405);
  try {
    const b = await req.json().catch(() => ({}));
    // campo escondido do formulário: robôs preenchem, pessoas não
    if (b?.website) return json({ ok: true, trialEndsAt: new Date().toISOString() });

    const name = String(b?.name ?? '').trim().slice(0, 80);
    const restaurant = String(b?.restaurant ?? '').trim().slice(0, 80);
    const phoneDigits = digits(b?.phone);
    const phone = phoneDigits.length >= 10 && phoneDigits.length <= 11 ? `55${phoneDigits}` : phoneDigits;
    const email = String(b?.email ?? '').trim().toLowerCase();
    const document = digits(b?.document);
    const password = String(b?.password ?? '');

    if (name.length < 2) return json({ error: 'Informe seu nome.' }, 400);
    if (restaurant.length < 2) return json({ error: 'Informe o nome do restaurante.' }, 400);
    if (!(document.length === 11 ? validCpf(document) : validCnpj(document))) return json({ error: 'Informe um CPF ou CNPJ válido.' }, 400);
    if (!/^\d{12,13}$/.test(phone)) return json({ error: 'Informe um WhatsApp com DDD.' }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) return json({ error: 'Informe um email válido.' }, 400);
    if (password.length < 8 || password.length > 72) return json({ error: 'A senha precisa ter pelo menos 8 caracteres.' }, 400);

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null;

    // limites contra abuso: um teste por CPF/CNPJ, um por WhatsApp e no máximo 3 por endereço de internet por dia
    const { count: byDoc } = await sb.from('trial_signups').select('id', { count: 'exact', head: true }).eq('document', document);
    if ((byDoc ?? 0) > 0) return json({ error: `Este ${document.length === 11 ? 'CPF' : 'CNPJ'} já fez um teste grátis. Fale com a Oxys para continuar.` }, 409);
    const { count: byPhone } = await sb.from('trial_signups').select('id', { count: 'exact', head: true }).eq('phone', phone);
    if ((byPhone ?? 0) > 0) return json({ error: 'Este WhatsApp já fez um teste grátis. Fale com a Oxys para continuar.' }, 409);
    if (ip) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: byIp } = await sb.from('trial_signups').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since);
      if ((byIp ?? 0) >= 3) return json({ error: 'Muitos cadastros a partir desta conexão. Tente de novo amanhã ou fale com a Oxys.' }, 429);
    }

    const { data: existing } = await sb.rpc('find_user_id_by_email', { _email: email });
    if (existing) return json({ error: 'Este email já tem conta no Oxys. Entre pelo login ou use outro email.' }, 409);

    // reserva o documento antes de criar a conta (dois cadastros ao mesmo tempo não passam)
    const { data: signup, error: dupErr } = await sb.from('trial_signups').insert({ email, phone, ip, document }).select('id').single();
    if (dupErr || !signup) {
      if (dupErr?.code === '23505') return json({ error: `Este ${document.length === 11 ? 'CPF' : 'CNPJ'} já fez um teste grátis. Fale com a Oxys para continuar.` }, 409);
      throw dupErr ?? new Error('cadastro');
    }
    const release = () => sb.from('trial_signups').delete().eq('id', signup.id);

    const { data: created, error: userErr } = await sb.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { name, phone, kind: 'trial_owner' },
    });
    if (userErr || !created.user) {
      await release();
      const exists = /already|registered|exists/i.test(userErr?.message ?? '');
      return json({ error: exists ? 'Este email já tem conta no Oxys. Entre pelo login.' : 'Não foi possível criar a conta.' }, exists ? 409 : 400);
    }
    const userId = created.user.id;

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: rest, error: restErr } = await sb.from('restaurants').insert({
      name: restaurant, phone, plan_code: 'enterprise', trial_ends_at: trialEndsAt, branch_limit: 0, status: 'active',
    }).select('id').single();
    if (restErr || !rest) {
      await sb.auth.admin.deleteUser(userId);
      await release();
      throw restErr ?? new Error('restaurante');
    }

    const { error: roleErr } = await sb.from('user_roles').insert({ user_id: userId, role: 'admin', restaurant_id: rest.id });
    if (roleErr) {
      await sb.from('restaurants').delete().eq('id', rest.id);
      await sb.auth.admin.deleteUser(userId);
      await release();
      throw roleErr;
    }

    await sb.from('trial_signups').update({ restaurant_id: rest.id, user_id: userId }).eq('id', signup.id);
    // boas-vindas no sino do admin
    await sb.from('notifications').insert({
      restaurant_id: rest.id, title: 'Bem-vindo ao Oxys!', target_roles: ['admin'],
      message: `Seu teste grátis vai até ${new Date(trialEndsAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Todas as funções estão liberadas.`,
    }).then(() => null, () => null);

    return json({ ok: true, trialEndsAt });
  } catch (e) {
    console.error('trial-signup', e);
    return json({ error: 'Não foi possível criar a conta agora. Tente de novo em alguns minutos.' }, 500);
  }
});
