import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

/**
 * Sessão do CLIENTE da loja online (quem faz pedido), separada da sessão da equipe:
 * no mesmo navegador o caixa continua logado no sistema mesmo se um cliente entrar na loja.
 */
export const storeClient = createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storageKey: 'oxys-store-auth',
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
