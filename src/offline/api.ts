/** Conversa com a central offline (o computador do caixa) pela rede da loja. */

export type Staff = { user_id: string; name: string; role: string };
export type Hello = {
  restaurant: { id: string; name: string } | null; ready: boolean; staff: Staff[];
  online: boolean; pendingOps: number; failedOps: number; lanUrls: string[]; lastSyncAt: string | null; error: string | null;
};
export type Item = { id: string; menu_item_id: string; name: string; quantity: number; unit_price: number; notes: string | null; status: string; created_at: string };
export type Payment = { id: string; method: string; amount: number; change_amount: number; created_at: string };
export type Order = {
  id: string; table_id: string | null; order_type: string; status: string; customer_name: string | null; customer_phone: string | null;
  customer_address: string | null; created_at: string; created_by_name: string | null; source: string | null;
  items: Item[]; payments: Payment[]; total: number; paid: number;
};
export type MenuItem = { id: string; name: string; price: number; category_id: string | null; description: string | null };
export type Table = { id: string; number: number; capacity: number; status: string };
export type HubState = Hello & {
  categories: { id: string; name: string }[]; items: MenuItem[]; tables: Table[]; orders: Order[];
  printers: { id: string; name: string; purposes: string[]; width: '58mm' | '80mm'; copies: number; header_note: string | null; footer_note: string | null; connection: string }[];
  fiscalAutoEmit: boolean; version: number; me: { user_id: string; name: string; role: string };
};

const TOKEN_KEY = 'oxys.central.token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch { /* sem armazenamento */ } };

export class AuthError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { setToken(null); throw new AuthError(body.error || 'Entre de novo'); }
  if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
  return body as T;
}

/** Dados devolvidos pela central (id do pedido criado, por exemplo). */
export type OpData = Record<string, unknown> & { id?: string };

export const api = {
  hello: () => call<Hello>('/api/hello'),
  login: (user_id: string, pin: string) => call<{ token: string; user: Staff }>('/api/login', { method: 'POST', body: JSON.stringify({ user_id, pin }) }),
  logout: () => call('/api/logout', { method: 'POST' }).catch(() => null),
  state: () => call<HubState>('/api/state'),
  op: <D = Record<string, unknown>>(type: string, data: D) => call<{ op: { id: string; type: string; data: OpData } }>('/api/op', { method: 'POST', body: JSON.stringify({ type, data }) }),
  prints: () => call<{
    jobs: PrintJobView[]; restaurant: { name: string } | null; printers: HubState['printers']; devices: Record<string, string>;
    // vias das telas completas (mesmo formato da nuvem)
    mirrorJobs?: MirrorPrintJob[]; mirrorPrinters?: MirrorPrinter[];
  }>('/api/prints'),
  printed: (id: string, error?: string) => call(`/api/prints/${id}`, { method: 'POST', body: JSON.stringify(error ? { error } : {}) }),
};

export type { PrintJob as MirrorPrintJob, Printer as MirrorPrinter } from '@/lib/printQueue';
import type { PrintJob as MirrorPrintJob, Printer as MirrorPrinter } from '@/lib/printQueue';

export type PrintJobView = { id: string; kind: 'kitchen' | 'receipt'; order: Order; items: Item[]; table: Table | null; created_at: string };

/** Avisa a cada mudança na central (pedido novo, item pronto, sincronização...). */
export function subscribe(onChange: (info: Partial<Hello> & { version: number }) => void) {
  const token = getToken();
  const es = new EventSource(`/api/events${token ? `?token=${token}` : ''}`);
  es.onmessage = e => { try { onChange(JSON.parse(e.data)); } catch { /* ignora */ } };
  return () => es.close();
}

export const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const PAYMENT_LABELS: Record<string, string> = { cash: 'Dinheiro', credit_card: 'Crédito', debit_card: 'Débito', pix: 'Pix' };
export const ROLE_LABELS: Record<string, string> = { admin: 'Administrador', cashier: 'Caixa', waiter: 'Garçom', kitchen: 'Cozinha', delivery: 'Delivery', finance: 'Financeiro' };
