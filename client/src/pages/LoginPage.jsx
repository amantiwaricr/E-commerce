import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import { IS_GOOGLE_CONFIGURED, STORE_NAME } from '../config';

export default function LoginPage() {
  const { isAuthenticated, loading, loginWithGoogle } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/';

  if (loading) return <Loader label="Checking your session…" />;
  if (isAuthenticated) return <Navigate to={redirectTo} replace />;

  const handleSuccess = async (response) => {
    setBusy(true);
    setError('');
    try {
      const user = await loginWithGoogle(response.credential);
      toast.success(`Welcome, ${user.name.split(' ')[0]}!`);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 460 }}>
      <div className="panel" style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.4rem' }}>Sign in to {STORE_NAME}</h1>
        <p className="muted small">
          We use your Google account only — no password to remember, and your order updates go straight to your Gmail.
        </p>

        {error && <div className="alert error">{error}</div>}

        {!IS_GOOGLE_CONFIGURED ? (
          <div className="alert error" style={{ textAlign: 'left' }}>
            <strong>Google sign-in is not configured yet.</strong>
            <p style={{ margin: '8px 0 0' }}>
              Create an OAuth 2.0 Web client ID in the Google Cloud Console with{' '}
              <code>http://localhost:5173</code> as an authorised JavaScript origin, then set the same value in{' '}
              <code>client/.env</code> as <code>VITE_GOOGLE_CLIENT_ID</code> and in <code>server/.env</code> as{' '}
              <code>GOOGLE_CLIENT_ID</code>. Restart <code>npm run dev</code> afterwards — Vite only reads{' '}
              <code>.env</code> at startup.
            </p>
          </div>
        ) : busy ? (
          <Loader label="Signing you in…" />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '22px 0' }}>
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={() => setError('Google sign-in was cancelled or failed. Please try again.')}
              useOneTap={false}
              text="continue_with"
              shape="pill"
            />
          </div>
        )}

        <p className="small muted" style={{ marginBottom: 0 }}>
          By continuing you agree to receive order updates by email and WhatsApp.
        </p>
      </div>
    </div>
  );
}
