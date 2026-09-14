import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BoxIcon, HeartIcon, UserIcon } from './icons';
import { useAuth } from '../context/AuthContext';

/** Avatar, or the initial when no photo has been uploaded. */
export const Avatar = ({ user, size = 34 }) =>
  user?.avatar ? (
    <img className="avatar" src={user.avatar} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {(user?.name || '?').charAt(0).toUpperCase()}
    </span>
  );

export default function AccountMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);

  // Close on an outside click or Escape, as a menu is expected to.
  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      if (!wrap.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const signOut = async () => {
    setOpen(false);
    await logout();
    navigate('/');
  };

  return (
    <div className="account" ref={wrap}>
      <button
        type="button"
        className="avatar-btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
      >
        <Avatar user={user} />
      </button>

      {open && (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <Avatar user={user} size={40} />
            <div style={{ minWidth: 0 }}>
              <strong className="truncate" style={{ display: 'block' }}>{user.name}</strong>
              <span className="small muted truncate" style={{ display: 'block' }}>{user.email}</span>
            </div>
          </div>

          <Link to="/profile" role="menuitem" onClick={() => setOpen(false)}>
            <UserIcon width={16} height={16} /> Update profile
          </Link>
          <Link to="/profile#photo" role="menuitem" onClick={() => setOpen(false)}>
            <span className="ico-photo" aria-hidden="true">◑</span> Change photo
          </Link>
          <Link to="/orders" role="menuitem" onClick={() => setOpen(false)}>
            <BoxIcon width={16} height={16} /> My orders
          </Link>
          <Link to="/favourites" role="menuitem" onClick={() => setOpen(false)}>
            <HeartIcon width={16} height={16} /> Favourites
          </Link>

          <button type="button" role="menuitem" className="danger" onClick={signOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
