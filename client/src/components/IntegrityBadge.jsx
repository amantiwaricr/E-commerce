import { useEffect, useState } from 'react';
import api from '../api/client';
import { LockIcon, ShieldIcon } from './icons';

/**
 * Whether this order's signed transaction record still checks out.
 *
 * The verdict comes from the server re-verifying the chain, not from a flag
 * stored next to the data — a stored "verified: true" would be exactly as
 * editable as the amounts it vouches for.
 *
 * Quiet on failure to load: an unreachable endpoint is not evidence of
 * tampering, and telling a customer their receipt is suspect because a request
 * timed out would be worse than saying nothing.
 */
export default function IntegrityBadge({ orderNumber }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .get(`/orders/${orderNumber}/integrity`)
      .then(({ data }) => live && setState(data.integrity))
      .catch(() => live && setState(null));
    return () => {
      live = false;
    };
  }, [orderNumber]);

  if (!state) return null;

  const { valid, signed, receipt, entries } = state;

  return (
    <section className={`integrity ${valid ? 'ok' : 'bad'}`}>
      <span className="integrity-mark" aria-hidden="true">
        {valid ? <ShieldIcon width={17} height={17} /> : <LockIcon width={17} height={17} />}
      </span>

      <div className="integrity-body">
        <strong>
          {valid
            ? signed
              ? 'Transaction record verified'
              : 'Transaction record intact, but unsigned'
            : 'Transaction record does not verify'}
        </strong>
        <p>
          {valid
            ? `${entries} signed ${entries === 1 ? 'entry' : 'entries'}, hash-chained and checked with SHA-256 and Ed25519.`
            : 'This order’s history no longer matches its signature. Please contact support before acting on it.'}
        </p>
        {receipt && (
          <code className="integrity-digest" title="The receipt digest, also printed on your bill">
            {receipt}
          </code>
        )}
      </div>
    </section>
  );
}
