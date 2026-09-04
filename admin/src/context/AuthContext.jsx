import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { clearToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/auth/me')
      .then(({ data }) => !cancelled && setUser(data.user))
      .catch(() => !cancelled && setUser(null))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, []);

  const loginWithGoogle = useCallback(async (credential) => {
    const { data } = await api.post('/auth/google', { credential });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  /** Development-only sign-in; the endpoint does not exist in production. */
  const loginAsDev = useCallback(async () => {
    const { data } = await api.post('/auth/dev-login');
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearToken();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      // This whole app is admin-only: a signed-in customer is still refused.
      isAdmin: user?.role === 'admin',
      loginWithGoogle,
      loginAsDev,
      logout,
    }),
    [user, loading, loginWithGoogle, loginAsDev, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
