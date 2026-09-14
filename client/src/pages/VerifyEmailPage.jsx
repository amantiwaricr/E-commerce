import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import CodeInput from '../components/CodeInput';

const CODE_LENGTH = 4;

export default function VerifyEmailPage() {
  const { verifyEmail, resendCode } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || '';
  const redirectTo = location.state?.from?.pathname || '/shop';

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  // Shown only when the server could not email the code (no SMTP locally).
  const [devCode, setDevCode] = useState(location.state?.devCode || '');
  const submitted = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  const submit = async (value) => {
    if (submitted.current) return;
    submitted.current = true;
    setBusy(true);
    setError('');

    try {
      const user = await verifyEmail(email, value);
      toast.success(`Welcome, ${user.name.split(' ')[0]}! Your account is ready.`);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
      setCode('');
      setBusy(false);
      submitted.current = false;
    }
  };

  // Submit as soon as the last digit lands, so there is nothing extra to press.
  const onChange = (value) => {
    setCode(value);
    setError('');
    if (value.length === CODE_LENGTH) submit(value);
  };

  const resend = async () => {
    setError('');
    try {
      const data = await resendCode(email);
      setDevCode(data.devCode || '');
      setCooldown(60);
      toast.success(data.message);
    } catch (err) {
      setError(err.message);
      const wait = Number((err.message.match(/(\d+)\s*second/) || [])[1]);
      if (wait) setCooldown(wait);
    }
  };

  if (!email) return <Navigate to="/register" replace />;

  return (
    <div className="container page" style={{ maxWidth: 430 }}>
      <div className="panel" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.35rem', marginBottom: 4 }}>Check your email</h1>
        <p className="muted small" style={{ marginTop: 0 }}>
          We sent a {CODE_LENGTH}-digit code to <strong style={{ color: 'var(--ink)' }}>{email}</strong>.
        </p>

        {devCode && (
          <div className="alert info" style={{ textAlign: 'left' }}>
            <strong>Email is not configured on this server.</strong>
            <p style={{ margin: '6px 0 0' }}>
              Your code is <strong style={{ fontSize: '1.1rem', letterSpacing: 2 }}>{devCode}</strong>. Set the
              <code> SMTP_*</code> values in <code>server/.env</code> to have codes emailed instead.
            </p>
          </div>
        )}

        {error && <div className="alert error">{error}</div>}

        <CodeInput value={code} onChange={onChange} length={CODE_LENGTH} disabled={busy} />

        {busy && <p className="small muted">Verifying…</p>}

        <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className="btn secondary sm" onClick={resend} disabled={busy || cooldown > 0}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send a new code'}
          </button>
        </div>

        <p className="small muted" style={{ marginTop: 16, marginBottom: 0 }}>
          Wrong address? <Link to="/register" style={{ color: 'var(--violet)', fontWeight: 600 }}>Start again</Link>
        </p>
      </div>
    </div>
  );
}
