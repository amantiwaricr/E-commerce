import { useState } from 'react';

/** Password input with a show/hide toggle and optional strength hint. */
export default function PasswordField({ id, label, value, onChange, error, hint, autoComplete = 'current-password' }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          style={{ paddingRight: 62 }}
          required
        />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setVisible((v) => !v)}
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', padding: '4px 9px' }}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {hint && !error && <span className="small muted">{hint}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}
