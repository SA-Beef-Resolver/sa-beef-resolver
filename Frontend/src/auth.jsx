import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, setUnauthorizedHandler } from './api';

const AuthContext = createContext(null);
const STORAGE_KEY = 'beef-resolver-session';

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null; } catch { return null; }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    const saved = loadSession();
    if (saved?.token) setToken(saved.token);
    return saved;
  });

  const signOut = useCallback(() => {
    setToken('');
    try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage may be blocked */ }
    setSession(null);
  }, []);

  useEffect(() => { setUnauthorizedHandler(signOut); }, [signOut]);

  const store = useCallback((response) => {
    const next = { token: response.access_token, user: response.user, expiresAt: response.expires_at };
    setToken(next.token);
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setSession(next);
  }, []);

  const value = useMemo(() => ({
    user: session?.user || null,
    signIn: async (email, password) => store(await api.login({ email, password })),
    signUp: async (email, password, displayName) => store(await api.register({ email, password, display_name: displayName })),
    signOut
  }), [session, store, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
