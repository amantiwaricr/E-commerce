import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { clearToken, getToken, setToken } from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on boot: the cookie or stored token decides who we are.
  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        const { data } = await api.get('/auth/me');
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restore();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Creates the account and triggers the verification email. No session yet. */
  const register = useCallback(async (payload) => {
    const { data } = await api.post('/auth/register', payload);
    return data;
  }, []);

  /** Confirms the emailed code; on success the account is active and signed in. */
  const verifyEmail = useCallback(async (email, code) => {
    const { data } = await api.post('/auth/verify-email', { email, code });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const resendCode = useCallback(async (email) => {
    const { data } = await api.post('/auth/resend-code', { email });
    return data;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
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

  const updateProfile = useCallback(async (payload) => {
    const { data } = await api.patch('/auth/me', payload);
    setUser(data.user);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'admin',
      hasToken: Boolean(getToken()),
      isEmailVerified: Boolean(user?.isEmailVerified),
      register,
      verifyEmail,
      resendCode,
      login,
      logout,
      updateProfile,
    }),
    [user, loading, register, verifyEmail, resendCode, login, logout, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};
