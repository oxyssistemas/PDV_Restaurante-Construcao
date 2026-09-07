import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

export const IFOOD_BASE = 'https://merchant-api.ifood.com.br';

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

export const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE);

/** Valida o usuário e o vínculo dele com o restaurante. */
export async function requireRestaurantAccess(
  req: Request,
  restaurantId: string,
  roles: string[],
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Não autenticado' }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return json({ error: 'Não autenticado' }, 401);

  const { data } = await admin()
    .from('user_roles').select('role')
    .eq('user_id', user.id).eq('restaurant_id', restaurantId);
  const ok = (data || []).some((r: { role: string }) => roles.includes(r.role));
  if (!ok) return json({ error: 'Sem permissão para este restaurante' }, 403);
  return { userId: user.id };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Token de aplicação do iFood (client credentials), com cache em memória. */
export async function ifoodToken(): Promise<string> {
  const clientId = Deno.env.get('IFOOD_CLIENT_ID');
  const clientSecret = Deno.env.get('IFOOD_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('IFOOD_CREDENTIALS_MISSING');
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const body = new URLSearchParams({
    grantType: 'client_credentials',
    clientId,
    clientSecret,
  });
  const res = await fetch(`${IFOOD_BASE}/authentication/v1.0/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${res.status}] ${text}`);
  const data = JSON.parse(text);
  cachedToken = {
    value: data.accessToken,
    expiresAt: Date.now() + (Number(data.expiresIn) || 3600) * 1000,
  };
  return cachedToken.value;
}

/** Chamada autenticada à API do iFood. Lança erro com status + corpo do iFood. */
export async function ifoodFetch(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<{ status: number; body: unknown }> {
  const token = await ifoodToken();
  const res = await fetch(`${IFOOD_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    console.error(`iFood ${path} falhou [${res.status}]: ${text}`);
    throw new Error(`[${res.status}] ${text}`);
  }
  return { status: res.status, body: parsed };
}

export function credentialsError(e: unknown) {
  return e instanceof Error && e.message === 'IFOOD_CREDENTIALS_MISSING';
}
