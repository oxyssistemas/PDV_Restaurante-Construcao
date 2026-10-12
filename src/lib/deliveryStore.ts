import { supabase } from '@/integrations/supabase/client';
import { storeClient } from '@/integrations/supabase/storeClient';
import { publicOrigin } from '@/lib/native';
import type { OptionGroup } from '@/lib/menuOptions';
import type { Promotion } from '@/lib/promotions';

/** Loja online (delivery próprio): www.oxysrestaurante.app/pedir/<slug> */

export type StoreZone = { name: string; fee: number };
export type PublicStore = {
  slug: string; name: string; logo: string | null; is_open: boolean;
  delivery_enabled: boolean; pickup_enabled: boolean; min_order: number; default_fee: number; zones: StoreZone[];
  eta_minutes: number; pickup_eta_minutes: number; payment_methods: string[];
  whatsapp: string | null; address: string | null; hours_text: string | null; notice: string | null;
  hero: { title: string | null; highlight: string | null; subtitle: string | null; image: string | null };
  featured_item_ids: string[];
  /** taxa por bairro (zones) ou por distância (km, calculada pelo endereço no servidor) */
  fee_mode?: 'zones' | 'distance'; max_km?: number | null;
};
export type StorePromotion = { id: string; title: string; subtitle: string | null; image: string | null; menu_item_id: string | null };
export type StoreItem = {
  id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null;
  /** Tamanho, sabores (meio a meio) e adicionais do prato */
  option_groups?: OptionGroup[];
};
export type StoreData = {
  store: PublicStore; promotions: StorePromotion[]; categories: { id: string; name: string }[]; items: StoreItem[];
  /** happy hour e leve X pague Y que valem no delivery (selos e prévia do desconto) */
  auto_promotions?: Promotion[];
};

export type CustomerProfile = { name: string; phone: string; address: string | null; complement: string | null };
export type MyOrder = {
  id: string; code: string; created_at: string; delivery_status: string; order_type: string; total: number; delivery_fee: number; discount?: number; public_token: string | null;
  order_items: { quantity: number; status: string; options_text?: string | null; menu_items: { name: string } | null }[];
};
export type CustomerAccount = { email: string | null; profile: CustomerProfile | null; orders: MyOrder[]; cashback?: { balance: number; percent: number } | null };

export type TrackedOrder = {
  id: string; code: string; order_type: string; delivery_status: string; total: number; delivery_fee: number; discount?: number; coupon_code?: string | null;
  customer_name: string | null; customer_address: string | null; payment_hint: string | null; change_for: number | null; created_at: string;
  order_items: { quantity: number; unit_price: number; status: string; notes: string | null; options_text?: string | null; menu_items: { name: string } | null }[];
};
export type TrackData = { order: TrackedOrder; store: { slug: string; whatsapp: string | null; eta_minutes: number; pickup_eta_minutes: number } | null; review_ref?: string };

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Dinheiro', credit_card: 'Cartão de crédito', debit_card: 'Cartão de débito', pix: 'Pix', counter: 'no caixa (totem)',
};

export const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** Fotos da vitrine (banner e promoções) ficam no bucket público "store-media". */
export const STORE_MEDIA = 'store-media';
export const SUGGESTIONS_FOLDER = 'sugestoes';
export const storeMediaUrl = (path: string | null | undefined) =>
  !path ? null : /^https?:\/\//.test(path) ? path : supabase.storage.from(STORE_MEDIA).getPublicUrl(path).data.publicUrl;

export const storeUrl = (slug: string) => `${publicOrigin()}/pedir/${slug}`;

/** Link do WhatsApp com mensagem pronta (o robô reconhece o código do pedido). */
export const waLink = (phone: string, text: string) => `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

/** Chamadas da loja online; vão com a sessão do cliente (quando logado). */
export async function callStore<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await storeClient.functions.invoke('delivery-store', { body });
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
