import { supabase } from '@/integrations/supabase/client';
import { publicOrigin } from '@/lib/native';

/** Loja online (delivery próprio): www.oxysrestaurante.app/pedir/<slug> */

export type StoreZone = { name: string; fee: number };
export type PublicStore = {
  slug: string; name: string; logo: string | null; is_open: boolean;
  delivery_enabled: boolean; pickup_enabled: boolean; min_order: number; default_fee: number; zones: StoreZone[];
  eta_minutes: number; pickup_eta_minutes: number; payment_methods: string[];
  whatsapp: string | null; address: string | null; hours_text: string | null; notice: string | null;
};
export type StoreItem = { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null };
export type StoreData = { store: PublicStore; categories: { id: string; name: string }[]; items: StoreItem[] };

export type TrackedOrder = {
  id: string; code: string; order_type: string; delivery_status: string; total: number; delivery_fee: number;
  customer_name: string | null; customer_address: string | null; payment_hint: string | null; change_for: number | null; created_at: string;
  order_items: { quantity: number; unit_price: number; status: string; notes: string | null; menu_items: { name: string } | null }[];
};
export type TrackData = { order: TrackedOrder; store: { slug: string; whatsapp: string | null; eta_minutes: number; pickup_eta_minutes: number } | null };

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', pix: 'Pix',
};

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

export const storeUrl = (slug: string) => `${publicOrigin()}/pedir/${slug}`;

/** Link do WhatsApp com mensagem pronta (o robô reconhece o código do pedido). */
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

export async function callStore<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('delivery-store', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error || error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

/** Ações da equipe no robô de WhatsApp. */
export async function callBot<T = { ok: true }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('whatsapp-bot', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const parsed = ctx ? await ctx.json().catch(() => null) : null;
    throw new Error(parsed?.error || error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}
