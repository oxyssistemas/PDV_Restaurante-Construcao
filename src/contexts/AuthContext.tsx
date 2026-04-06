import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'super_admin' | 'admin' | 'waiter' | 'kitchen' | 'cashier' | 'finance';

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
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [currentRole, setCurrentRole] = useState<UserRole | null>(null);

  const fetchRoles = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role, restaurant_id')
      .eq('user_id', userId);
    
    const userRoles = (data || []).map(r => ({
      role: r.role as AppRole,
      restaurant_id: r.restaurant_id,
    }));
    setRoles(userRoles);
    
    if (userRoles.length > 0 && !currentRole) {
      setCurrentRole(userRoles[0]);
    }
    return userRoles;
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
      signIn, signOut, isSuperAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
