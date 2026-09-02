import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { formatDay } from '../utils/format';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(
    user?.addresses?.[0] || { label: 'Home', recipientName: user?.name || '', phone: '', street: '', city: '', district: '', landmark: '' }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateProfile({ phone, addresses: [address] });
      toast.success('Profile saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setAddressField = (field) => (event) => setAddress((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="container page" style={{ maxWidth: 620 }}>
      <div className="page-head">
        <h1>My profile</h1>
      </div>

      <section className="panel" style={{ marginBottom: 18 }}>
        <div className="row">
          {user.avatar && <img className="avatar" src={user.avatar} alt="" style={{ width: 52, height: 52 }} />}
          <div>
            <strong>{user.name}</strong>
            <p className="small muted" style={{ margin: 0 }}>
              {user.email} · joined {formatDay(user.createdAt)}
            </p>
            <span className="badge brand" style={{ marginTop: 6 }}>
              {user.role}
            </span>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 14, marginBottom: 0 }}>
          Your name and email come from your Google account and are managed there.
        </p>
      </section>

      {error && <div className="alert error">{error}</div>}

      <form className="panel" onSubmit={save}>
        <h3>Contact & default delivery address</h3>

        <div className="field">
          <label htmlFor="phone">WhatsApp / mobile number</label>
          <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9801234567" />
          <span className="small muted">Order confirmations are sent here on WhatsApp.</span>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="recipientName">Recipient name</label>
            <input id="recipientName" value={address.recipientName || ''} onChange={setAddressField('recipientName')} />
          </div>
          <div className="field">
            <label htmlFor="addressPhone">Delivery contact</label>
            <input id="addressPhone" value={address.phone || ''} onChange={setAddressField('phone')} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="street">Street address</label>
          <input id="street" value={address.street || ''} onChange={setAddressField('street')} />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="city">City</label>
            <input id="city" value={address.city || ''} onChange={setAddressField('city')} />
          </div>
          <div className="field">
            <label htmlFor="district">District</label>
            <input id="district" value={address.district || ''} onChange={setAddressField('district')} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="landmark">Landmark</label>
          <input id="landmark" value={address.landmark || ''} onChange={setAddressField('landmark')} />
        </div>

        <button className="btn" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}
