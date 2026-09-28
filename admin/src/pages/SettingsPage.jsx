import { useEffect, useState } from 'react';
import api from '../api/client';
import Loader from '../components/Loader';
import EmptyState from '../components/EmptyState';
import Card from '../components/Card';
import Icon from '../components/Icon';
import { formatNpr } from '../utils/format';

const formatUptime = (seconds) => {
  const s = Math.max(0, Math.round(seconds || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
};

/** A yes/no setting shown as a coloured pill; `bad` picks the tone for "no". */
function Flag({ on, yes = 'On', no = 'Off', bad = 'warn' }) {
  return <span className={`badge ${on ? 'ok' : bad}`}>{on ? yes : no}</span>;
}

function Rows({ rows }) {
  return (
    <dl className="facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value === '' || value == null ? <span className="muted">Not set</span> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * What would bite on launch day, worst first. Computed here from the same
 * read-only view, so the list can never disagree with the panels below it.
 */
const readinessChecks = (settings) => {
  const { payments, notifications, security, system } = settings;
  const production = system.environment === 'production';
  const checks = [];
  const add = (tone, title, detail) => checks.push({ tone, title, detail });

  if (payments.usingTestSecret && (production || payments.esewaMode === 'live')) {
    add('danger', 'eSewa is using the public test secret', 'No real money can be collected. Set your merchant secret before taking payments.');
  }
  if (production && !security.httpsEnforced) {
    add('danger', 'HTTPS is not enforced', 'Sessions and payment redirects can travel in plain text.');
  }
  if (production && !security.cookieSecure) {
    add('warn', 'Session cookies are not marked Secure', 'Browsers will send them over plain HTTP.');
  }
  if (!security.ledgerSigning) {
    add('warn', 'Transactions are not being signed', 'Ledgers are hash-chained but unsigned. Run npm run keys:txn and restart.');
  }
  if (!notifications.email.configured) {
    add('warn', 'Order emails are not being sent', 'SMTP is not configured, so emails are written to the server log instead.');
  }
  if (!notifications.whatsapp.configured) {
    add('info', 'WhatsApp updates are off', 'Customers get email updates only.');
  }
  if (!production) {
    add('info', `Running in ${system.environment || 'an unknown'} mode`, 'Development defaults are active; deploy with NODE_ENV=production.');
  }
  const rank = { danger: 0, warn: 1, info: 2 };
  return checks.sort((a, b) => rank[a.tone] - rank[b.tone]);
};

const CHECK_ICONS = { danger: 'alert', warn: 'alert', info: 'eye' };

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/settings')
      .then(({ data }) => setSettings(data.settings))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loader />;
  if (error || !settings) return <EmptyState title="Settings unavailable" message={error} />;

  const { store, delivery, payments, notifications, security, system } = settings;
  const checks = readinessChecks(settings);
  const blocking = checks.filter((c) => c.tone === 'danger').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub">
            How the store is configured right now. These come from <code>server/.env</code>; change them there and
            restart the API. Secrets are never shown here, only whether they are set.
          </div>
        </div>
      </div>

      <Card
        title="Launch readiness"
        icon="shield"
        className="readiness"
        tools={
          <span className={`badge ${blocking ? 'danger' : checks.some((c) => c.tone === 'warn') ? 'warn' : 'ok'}`}>
            {blocking ? `${blocking} blocking` : checks.some((c) => c.tone === 'warn') ? 'Needs attention' : 'Ready'}
          </span>
        }
      >
        {checks.length === 0 ? (
          <p className="small muted">Nothing to fix — payments, HTTPS, signing and notifications are all set up.</p>
        ) : (
          <ul className="checks">
            {checks.map((check) => (
              <li key={check.title} className={check.tone}>
                <Icon name={CHECK_ICONS[check.tone]} size={16} />
                <div>
                  <strong>{check.title}</strong>
                  <div className="small muted">{check.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="settings-grid">
        <Card title="Store" icon="store">
          <Rows
            rows={[
              ['Name', store.name],
              ['Address', store.address],
              ['Support phone', store.supportPhone],
              ['Support email', store.supportEmail],
              ['Registration', store.registration],
              ['Storefront URL', store.siteUrl && <a className="link" href={store.siteUrl} target="_blank" rel="noreferrer">{store.siteUrl}</a>],
            ]}
          />
        </Card>

        <Card title="Delivery" icon="pin">
          <Rows
            rows={[
              ['Delivery charge', formatNpr(delivery.charge)],
              ['Free delivery above', delivery.freeAbove ? formatNpr(delivery.freeAbove) : 'Never free'],
              ['Promised delivery', delivery.eta],
            ]}
          />
        </Card>

        <Card title="Payments" icon="wallet">
          <Rows
            rows={[
              ['eSewa mode', <span className={`badge ${payments.esewaMode === 'live' ? 'ok' : 'info'}`}>{payments.esewaMode}</span>],
              ['Merchant code', payments.merchantCode && <code>{payments.merchantCode}</code>],
              ['Merchant secret', <Flag on={!payments.usingTestSecret} yes="Your own" no="Public test secret" bad={system.environment === 'production' ? 'danger' : 'warn'} />],
              ['Card payments', <Flag on={payments.cardEnabled} yes="Enabled" no="Disabled" bad="" />],
              ['Cash on delivery', <Flag on={payments.cashOnDelivery} yes="Enabled" no="Disabled" bad="" />],
            ]}
          />
        </Card>

        <Card title="Notifications" icon="bell">
          <Rows
            rows={[
              ['Email', <Flag on={notifications.email.configured} yes="Sending" no="Logged only" />],
              ['SMTP server', notifications.email.host && `${notifications.email.host}${notifications.email.port ? `:${notifications.email.port}` : ''}`],
              ['From address', notifications.email.from],
              ['WhatsApp', <Flag on={notifications.whatsapp.configured} yes={notifications.whatsapp.provider} no="Off" bad="" />],
            ]}
          />
        </Card>

        <Card title="Security" icon="shield">
          <Rows
            rows={[
              ['HTTPS enforced', <Flag on={security.httpsEnforced} yes="Yes, with HSTS" no="No" />],
              ['TLS served by the API', <Flag on={security.servesTlsDirectly} yes={`Yes, TLS ${security.tlsMinVersion.replace(/^TLSv/, '')}+`} no="No (proxy or plain HTTP)" bad="" />],
              ['Secure cookies', <Flag on={security.cookieSecure} yes={`Yes, SameSite=${security.cookieSameSite}`} no={`No, SameSite=${security.cookieSameSite}`} />],
              ['Transaction signing', <Flag on={security.ledgerSigning} yes="Ed25519" no="Off" />],
              ['Signing key', security.ledgerKeyId && <code>{security.ledgerKeyId}</code>],
              ['Retired keys kept', security.retiredKeys],
            ]}
          />
        </Card>

        <Card title="System" icon="gauge">
          <Rows
            rows={[
              ['Environment', <span className={`badge ${system.environment === 'production' ? 'ok' : 'info'}`}>{system.environment}</span>],
              ['Database', system.databaseHost && <code>{system.databaseHost}</code>],
              ['App version', system.appVersion],
              ['Node.js', system.nodeVersion],
              ['API uptime', formatUptime(system.uptimeSeconds)],
            ]}
          />
        </Card>
      </div>
    </>
  );
}
