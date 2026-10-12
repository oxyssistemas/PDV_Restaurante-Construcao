import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

type State = { seen: string[]; muted: boolean };
const localKey = (uid: string) => `oxy-onboarding:${uid}`;
const readLocal = (uid: string): State => {
  try { return { seen: [], muted: false, ...JSON.parse(localStorage.getItem(localKey(uid)) || '{}') }; } catch { return { seen: [], muted: false }; }
};
const writeLocal = (uid: string, s: State) => { try { localStorage.setItem(localKey(uid), JSON.stringify(s)); } catch { /* sem armazenamento */ } };

/** O que a pessoa já viu do Oxy (fica na conta; sem internet, neste aparelho). */
export function useOnboarding() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const uid = user?.id ?? null;
  const key = ['oxy-onboarding', uid];

  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!uid,
    staleTime: Infinity,
    queryFn: async (): Promise<State> => {
      const local = readLocal(uid!);
      const { data, error } = await supabase.from('user_onboarding').select('seen, muted').eq('user_id', uid!).maybeSingle();
      if (error) return local;
      // junta o que foi visto neste aparelho sem internet
      const merged = { seen: Array.from(new Set([...(data?.seen ?? []), ...local.seen])), muted: data?.muted ?? local.muted };
      writeLocal(uid!, merged);
      return merged;
    },
  });

  const save = useCallback(async (next: State) => {
    if (!uid) return;
    writeLocal(uid, next);
    qc.setQueryData(key, next);
    await supabase.from('user_onboarding').upsert({ user_id: uid, seen: next.seen, muted: next.muted, updated_at: new Date().toISOString() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, qc]);

  const state = data ?? (uid ? readLocal(uid) : { seen: [], muted: false });
  const markSeen = (id: string) => { if (!state.seen.includes(id)) void save({ ...state, seen: [...state.seen, id] }); };
  const setMuted = (muted: boolean) => void save({ ...state, muted });
  const reset = () => void save({ seen: [], muted: false });

  return { ready: !!uid && !isLoading, seen: state.seen, muted: state.muted, markSeen, setMuted, reset };
}
