import { useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Loader from '../components/Loader';
import { GOOGLE_CLIENT_ID, STORE_NAME } from '../config';

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

        {!GOOGLE_CLIENT_ID ? (
          <div className="alert error">
            Google sign-in is not configured. Set <code>VITE_GOOGLE_CLIENT_ID</code> in the frontend environment.
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
