import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi, type LocalUser } from '@/lib/local-auth';

type AuthState = {
  user: LocalUser | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  endSession: () => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<AuthState | null>(null);
export const SESSION_EXPIRED = 'estetica:session-expired';

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const identity = useRef<string | null>(null);
  const previousRole = useRef<LocalUser['role'] | null>(null);
  const generation = useRef(0);
  const transition = (next: LocalUser | null) => {
    if (identity.current !== (next?.id ?? null) || previousRole.current !== (next?.role ?? null)) client.clear();
    identity.current = next?.id ?? null;
    previousRole.current = next?.role ?? null;
    setUser(next);
  };
  const refresh = async () => {
    const requestId = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await authApi.me();
      if (requestId !== generation.current) return;
      transition(result.user);
    } catch (cause) {
      if (requestId !== generation.current) return;
      transition(null);
      setError(cause instanceof Error ? cause.message : 'No se pudo verificar el acceso.');
    } finally {
      if (requestId === generation.current) setLoading(false);
    }
  };
  const endSession = () => {
    ++generation.current;
    transition(null);
    client.clear();
    setError(null);
    setLoading(false);
  };
  useEffect(() => {
    void refresh();
    const expire = () => {
      ++generation.current;
      transition(null);
      client.clear();
      setError(null);
      setLoading(false);
    };
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener(SESSION_EXPIRED, expire);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      ++generation.current;
      window.removeEventListener(SESSION_EXPIRED, expire);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);
  const login = async (email: string, password: string) => {
    const { user: next } = await authApi.login(email, password);
    ++generation.current;
    transition(next);
    setError(null);
    setLoading(false);
  };
  const logout = async () => {
    endSession();
    try { await authApi.logout(); }
    finally { client.clear(); }
  };
  return <Context.Provider value={{ user, loading, error, refresh, endSession, login, logout }}>{children}</Context.Provider>;
}

export function useLocalAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider is required');
  return value;
}