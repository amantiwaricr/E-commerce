import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Mark from '../components/Mark';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { STORE_NAME } from '../config';

export default function LoginPage() {
  const { isAuthenticated, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/';

  if (loading) return <Loader label="Checking your session…" />;
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email, form.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(
        err.status === 403 && err.fieldErrors?.some((e) => e.message === 'unverified')
          ? 'That account has not verified its email address yet.'
          : err.message
      );
      setForm((f) => ({ ...f, password: '' }));
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <Mark className="mark" />
        <h1>{STORE_NAME}</h1>
        <p className="muted small">Staff sign-in — admin accounts only.</p>

        {error && <div className="alert error" style={{ marginTop: 16, textAlign: 'left' }}>{error}</div>}

        {busy ? (
          <Loader label="Signing you in…" />
        ) : (
          <form onSubmit={submit} style={{ textAlign: 'left', marginTop: 18 }}>
            <div className="field">
              <label htmlFor="email">Email address</label>
              <input id="email" type="email" value={form.email} onChange={setField('email')} autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={setField('password')}
                autoComplete="current-password"
                required
              />
            </div>
            <button className="btn block" type="submit">Sign in</button>
          </form>
        )}

        <p className="small muted" style={{ marginTop: 16, marginBottom: 0 }}>
          The admin account is created by <code>npm run seed</code>.
        </p>
      </div>
    </div>
  );
}
