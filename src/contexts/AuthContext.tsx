import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { ROLE_PRIORITY } from '@/lib/roles';

type AppRole = 'super_admin' | 'admin' | 'manager' | 'supervisor' | 'waiter' | 'kitchen' | 'cashier' | 'finance' | 'delivery' | 'courier' | 'hr' | 'marketing';

/** Loja em que a pessoa trabalha (matriz ou filial). */
export interface StoreRef { id: string; name: string; parent_id: string | null }

interface UserRole {
  role: AppRole;
  restaurant_id: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  roles: UserRole[];
  currentRole: UserRole | null;
  setCurrentRole: (role: UserRole) => void;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  isSuperAdmin: boolean;
  /** Lojas em que a pessoa tem cargo (dono e supervisor: matriz e filiais). */
  stores: StoreRef[];
  /** Troca a loja em que a pessoa está trabalhando (as regras de acesso passam a olhar essa loja). */
  switchStore: (restaurantId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);

  const [stores, setStores] = useState<StoreRef[]>([]);

  const fetchRoles = async (userId: string) => {
    const [{ data }, { data: active }] = await Promise.all([
      supabase.from('user_roles').select('role, restaurant_id').eq('user_id', userId),
      supabase.from('user_active_restaurant').select('restaurant_id').eq('user_id', userId).maybeSingle(),
    ]);

    const userRoles = (data || []).map(r => ({
      role: r.role as AppRole,
      restaurant_id: r.restaurant_id,
    }));
    setRoles(userRoles);

    // loja ativa: a escolhida (se ainda tem cargo nela) ou a primeira; vale o cargo de maior alcance nela
    const storeIds = [...new Set(userRoles.map(r => r.restaurant_id).filter((id): id is string => !!id))];
    const activeId = active?.restaurant_id && storeIds.includes(active.restaurant_id) ? active.restaurant_id : storeIds[0] ?? null;
    const here = userRoles.filter(r => r.restaurant_id === activeId)
      .sort((a, b) => ROLE_PRIORITY.indexOf(a.role) - ROLE_PRIORITY.indexOf(b.role));
    setCurrentRole(here[0] ?? userRoles[0] ?? null);

    if (storeIds.length > 1) {
      const { data: rs } = await supabase.from('restaurants').select('id, name, parent_id').in('id', storeIds);
      // matriz primeiro, depois as filiais em ordem alfabética
      setStores((rs || []).sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id) || a.name.localeCompare(b.name)));
    } else {
      setStores([]);
    }
    return userRoles;
  };

  const switchStore = async (restaurantId: string) => {
    const { error } = await supabase.rpc('set_active_restaurant', { _restaurant_id: restaurantId });
    if (error) throw error;
    // recomeça na tela inicial da loja escolhida (com o cargo que a pessoa tem nela)
    window.location.assign('/');
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setTimeout(() => fetchRoles(session.user.id), 0);
        } else {
          setRoles([]);
          setCurrentRole(null);
          setStores([]);
        }
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRoles([]);
    setCurrentRole(null);
  };

  const isSuperAdmin = roles.some(r => r.role === 'super_admin');

  return (
    <AuthContext.Provider value={{
      user, session, loading, roles, currentRole, setCurrentRole,
      signIn, signOut, isSuperAdmin, stores, switchStore,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
