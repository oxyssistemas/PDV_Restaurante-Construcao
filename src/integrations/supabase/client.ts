import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { AUTH_STORAGE_KEY, IS_CENTRAL, takeHandoff } from '@/lib/central';

// Sem internet o app abre pela central da loja, que responde no mesmo formato da nuvem.
const SUPABASE_URL = IS_CENTRAL ? window.location.origin : import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Sessão trazida na troca nuvem ⇄ central (antes de criar o cliente).
takeHandoff();

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: typeof window !== 'undefined' ? localStorage : undefined,
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true,
  }
});
