import { useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Avatar } from '../components/AccountMenu';
import PasswordField from '../components/PasswordField';
import { formatDay } from '../utils/format';
import useSeo from '../hooks/useSeo';
import { seoFor } from '../seo/pages';

export default function ProfilePage() {
  useSeo({ ...seoFor('/profile'), path: '/profile' });

  const { user, updateProfile, uploadAvatar, changePassword } = useAuth();
  const toast = useToast();
  const fileInput = useRef(null);

  const [details, setDetails] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const addresses = user?.addresses || [];

  const saveDetails = async (event) => {
    event.preventDefault();
    setBusy('details');
    setError('');
    try {
      await updateProfile({ name: details.name.trim(), phone: details.phone.trim() });
      toast.success('Profile saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const choosePhoto = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBusy('photo');
    setError('');
    try {
      await uploadAvatar(file);
      toast.success('Photo updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setBusy('password');
    setError('');
    try {
      await changePassword(passwords.currentPassword, passwords.newPassword);
      setPasswords({ currentPassword: '', newPassword: '' });
      toast.success('Password changed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  /** Moves an address to the front, which is what checkout prefills. */
  const makeDefault = async (index) => {
    const next = [addresses[index], ...addresses.filter((_, i) => i !== index)];
    setBusy(`address-${index}`);
    try {
      await updateProfile({ addresses: next });
      toast.success('Default delivery address updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  const removeAddress = async (index) => {
    setBusy(`address-${index}`);
    try {
      await updateProfile({ addresses: addresses.filter((_, i) => i !== index) });
      toast.success('Address removed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="container page" style={{ maxWidth: 680 }}>
      <div className="page-head">
        <h1>My profile</h1>
      </div>

      {error && <div className="alert error">{error}</div>}

      <section className="panel" id="photo" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
          <Avatar user={user} size={72} />
          <div style={{ minWidth: 0 }}>
            <strong style={{ fontSize: '1.05rem' }}>{user.name}</strong>
            <p className="small muted" style={{ margin: '2px 0 10px' }}>
              {user.email} · joined {formatDay(user.createdAt)}
            </p>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              onChange={choosePhoto}
              hidden
            />
            <div className="row">
              <button
                type="button"
                className="btn secondary sm"
                onClick={() => fileInput.current?.click()}
                disabled={busy === 'photo'}
              >
                {busy === 'photo' ? 'Uploading…' : user.avatar ? 'Change photo' : 'Add photo'}
              </button>
              <span className="badge info">{user.role}</span>
            </div>
            <p className="small muted" style={{ margin: '8px 0 0' }}>JPEG, PNG, WebP or AVIF, up to 2 MB.</p>
          </div>
        </div>
      </section>

      <form className="panel" onSubmit={saveDetails} style={{ marginBottom: 16 }}>
        <h3>Your details</h3>

        <div className="field-row">
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" value={details.name} onChange={(e) => setDetails((d) => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="field">
            <label htmlFor="phone">Mobile number</label>
            <input
              id="phone"
              value={details.phone}
              onChange={(e) => setDetails((d) => ({ ...d, phone: e.target.value }))}
              placeholder="9801234567"
            />
            <span className="small muted">Order updates are sent here on WhatsApp.</span>
          </div>
        </div>

        <p className="small muted" style={{ marginTop: 0 }}>
          Your email address ({user.email}) is verified and cannot be changed here.
        </p>

        <button className="btn" type="submit" disabled={busy === 'details'}>
          {busy === 'details' ? 'Saving…' : 'Save details'}
        </button>
      </form>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3>Delivery addresses</h3>

        {addresses.length === 0 ? (
          <p className="muted small" style={{ margin: 0 }}>
            No addresses saved yet. The address you use at checkout is kept here automatically, so you only
            type it once.
          </p>
        ) : (
          <div className="saved-addresses">
            {addresses.map((address, index) => (
              <div className={`saved-address ${index === 0 ? 'on' : ''}`} key={`${address.street}-${index}`}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong className="truncate" style={{ display: 'block' }}>{address.street}</strong>
                  <span className="small muted">
                    {address.city}
                    {address.district ? `, ${address.district}` : ''} · {address.recipientName} · {address.phone}
                  </span>
                </span>

                {index === 0 ? (
                  <span className="badge info">Default</span>
                ) : (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => makeDefault(index)}
                    disabled={busy === `address-${index}`}
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => removeAddress(index)}
                  disabled={busy === `address-${index}`}
                  aria-label={`Remove ${address.street}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <form className="panel" onSubmit={savePassword}>
        <h3>Change password</h3>

        <PasswordField
          id="currentPassword"
          label="Current password"
          value={passwords.currentPassword}
          onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
          autoComplete="current-password"
        />
        <PasswordField
          id="newPassword"
          label="New password"
          value={passwords.newPassword}
          onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
          autoComplete="new-password"
          hint="At least 8 characters, not all digits."
        />

        <button className="btn" type="submit" disabled={busy === 'password'}>
          {busy === 'password' ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
