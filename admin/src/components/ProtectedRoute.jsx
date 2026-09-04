import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loader from './Loader';
import Mark from './Mark';

/**
 * The entire panel is admin-only. A signed-in customer is shown a refusal
 * rather than being bounced to the login screen, which would just loop.
 */
export default function ProtectedRoute() {
  const { isAuthenticated, isAdmin, loading, logout } = useAuth();
  const location = useLocation();

  if (loading) return <Loader label="Checking your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  if (!isAdmin) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <Mark className="mark" />
          <h1>Admin access required</h1>
          <p className="muted small">
            You are signed in, but this account does not have the <code>admin</code> role, so the panel is not
            available to you.
          </p>
          <button type="button" className="btn block" style={{ marginTop: 16 }} onClick={logout}>
            Sign in with a different account
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
