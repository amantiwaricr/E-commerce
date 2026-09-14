import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import PasswordField from '../components/PasswordField';
import { STORE_NAME } from '../config';

export default function LoginPage() {
  const { isAuthenticated, loading, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/shop';

  if (loading) return <Loader label="Checking your session…" />;
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}!`);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      // An unverified account is sent to the code screen rather than dead-ended.
      if (err.status === 403 && err.fieldErrors?.some((e) => e.message === 'unverified')) {
        navigate('/verify', { state: { email: form.email.trim().toLowerCase(), from: location.state?.from } });
        return;
      }
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 430 }}>
      <div className="panel">
        <h1 style={{ fontSize: '1.35rem', marginBottom: 4 }}>Sign in</h1>
        <p className="muted small" style={{ marginTop: 0 }}>
          Welcome back to {STORE_NAME}.
        </p>

        {error && <div className="alert error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={setField('email')}
              autoComplete="email"
              placeholder="you@example.com"
              required
            />
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={setField('password')}
            autoComplete="current-password"
          />

          <button className="btn block" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 18, marginBottom: 0, textAlign: 'center' }}>
          New here? <Link to="/register" style={{ color: 'var(--violet)', fontWeight: 600 }}>Create an account</Link>
        </p>
      </div>
    </div>
  );
}
