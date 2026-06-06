import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api } from '../api/client';

const STORAGE_KEY = 'epson_qc_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (auth?.token) {
      api.defaults.headers.common.Authorization = `Bearer ${auth.token}`;
    }
  }, [auth]);

  const login = useCallback(async (username, password) => {
    const { data } = await api.post('/auth/login', { username, password });
    const payload = { user: data.user, token: data.token };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    api.defaults.headers.common.Authorization = `Bearer ${data.token}`;
    setAuth(payload);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    delete api.defaults.headers.common.Authorization;
    setAuth(null);
  }, []);

  useEffect(() => {
    function handleUnauthorized(event) {
      const url = event?.detail?.url;
      if (url && url.includes('/auth/login')) {
        return;
      }
      logout();
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('auth:unauthorized', handleUnauthorized);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('auth:unauthorized', handleUnauthorized);
      }
    };
  }, [logout]);

  const value = useMemo(
    () => ({
      user: auth?.user ?? null,
      token: auth?.token ?? null,
      login,
      logout,
      isAuthenticated: !!auth?.user,
    }),
    [auth, login, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
