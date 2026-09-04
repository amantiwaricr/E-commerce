import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Mark from '../components/Mark';
import Loader from '../components/Loader';
import { useAuth } from '../context/AuthContext';
import { IS_DEV, IS_GOOGLE_CONFIGURED, STORE_NAME } from '../config';

export default function LoginPage() {
  const { isAuthenticated, loading, loginWithGoogle, loginAsDev } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/';

  if (loading) return <Loader label="Checking your session…" />;
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;

  const finish = (signIn) => async (arg) => {
    setBusy(true);
    setError('');
    try {
      await signIn(arg);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(
        err.status === 404
          ? 'The development login is not enabled. Run `npm run setup` and restart `npm run dev`.'
          : err.message
      );
      setBusy(false);
    }
  };

  const handleGoogle = finish((response) => loginWithGoogle(response.credential));
  const handleDev = finish(() => loginAsDev());

  return (
    <div className="login-shell">
      <div className="login-card">
        <Mark className="mark" />
        <h1>{STORE_NAME}</h1>
        <p className="muted small">Staff sign-in — admin accounts only.</p>

        {error && <div className="alert error" style={{ marginTop: 16 }}>{error}</div>}

        {busy ? (
          <Loader label="Signing you in…" />
        ) : IS_GOOGLE_CONFIGURED ? (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0 6px' }}>
            <GoogleLogin
              onSuccess={handleGoogle}
              onError={() => setError('Google sign-in was cancelled or failed. Please try again.')}
              useOneTap={false}
              text="signin_with"
              shape="pill"
            />
          </div>
        ) : (
          <div className="alert error" style={{ textAlign: 'left', marginTop: 16 }}>
            <strong>Google sign-in is not configured yet.</strong>
            <p style={{ margin: '8px 0 0' }}>
              Set the same client ID in <code>admin/.env</code> as <code>VITE_GOOGLE_CLIENT_ID</code> and in{' '}
              <code>server/.env</code> as <code>GOOGLE_CLIENT_ID</code>, and add{' '}
              <code>http://localhost:5174</code> to that OAuth client&apos;s authorised JavaScript origins.
              Restart afterwards — Vite reads <code>.env</code> only at startup.
            </p>
          </div>
        )}

        {IS_DEV && !IS_GOOGLE_CONFIGURED && !busy && (
          <div style={{ borderTop: '1px solid var(--line)', marginTop: 18, paddingTop: 18 }}>
            <button type="button" className="btn dark block" onClick={handleDev}>
              Continue without Google (development only)
            </button>
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Signs you in as the seeded admin. Never available in a production build.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
