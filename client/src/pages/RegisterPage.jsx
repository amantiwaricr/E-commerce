import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from '../components/Loader';
import PasswordField from '../components/PasswordField';
import { STORE_NAME } from '../config';

export default function RegisterPage() {
  const { isAuthenticated, loading, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (loading) return <Loader label="Checking your session…" />;
  if (isAuthenticated) return <Navigate to="/shop" replace />;

  const setField = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setFieldErrors((f) => ({ ...f, [key]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();

    if (form.password !== form.confirm) {
      setFieldErrors({ confirm: 'The two passwords do not match' });
      return;
    }

    setBusy(true);
    setError('');
    setFieldErrors({});

    try {
      const data = await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });

      // The code screen owns the rest of the flow.
      navigate('/verify', {
        state: {
          email: data.email,
          message: data.message,
          devCode: data.devCode,
          mailError: data.mailError,
          emailed: data.emailed,
          from: location.state?.from,
        },
      });
    } catch (err) {
      setError(err.message);
      setFieldErrors(Object.fromEntries((err.fieldErrors || []).map((e) => [e.field, e.message])));
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 430 }}>
      <div className="panel">
        <h1 style={{ fontSize: '1.35rem', marginBottom: 4 }}>Create your account</h1>
        <p className="muted small" style={{ marginTop: 0 }}>
          We will email you a 4-digit code to confirm your address.
        </p>

        {error && <div className="alert error">{error}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" value={form.name} onChange={setField('name')} autoComplete="name" required />
            {fieldErrors.name && <span className="error">{fieldErrors.name}</span>}
          </div>

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
            {fieldErrors.email && <span className="error">{fieldErrors.email}</span>}
            <span className="small muted">Use an address you can open — the code is sent there.</span>
          </div>

          <PasswordField
            id="password"
            label="Password"
            value={form.password}
            onChange={setField('password')}
            autoComplete="new-password"
            hint="At least 8 characters."
            error={fieldErrors.password}
          />

          <PasswordField
            id="confirm"
            label="Confirm password"
            value={form.confirm}
            onChange={setField('confirm')}
            autoComplete="new-password"
            error={fieldErrors.confirm}
          />

          <button className="btn block" type="submit" disabled={busy}>
            {busy ? 'Creating your account…' : 'Create account'}
          </button>
        </form>

        <p className="small muted" style={{ marginTop: 18, marginBottom: 0, textAlign: 'center' }}>
          Already have an account? <Link to="/login" style={{ color: 'var(--violet)', fontWeight: 600 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
