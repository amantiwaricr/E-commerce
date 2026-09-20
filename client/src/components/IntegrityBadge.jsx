import { useEffect, useState } from 'react';
import api from '../api/client';
import { LockIcon, ShieldIcon } from './icons';

/**
 * Whether this order's transaction record still checks out.
 *
 * The verdict comes from the server re-verifying the chain, not from a flag
 * stored next to the data — a stored "verified: true" would be exactly as
 * editable as the amounts it vouches for.
 *
 * Three outcomes, not two. An order recorded before the store generated a
 * signing key is *unsigned*, which is not the same as *altered*, and saying
 * "contact support" about a perfectly good order because of a setup step
 * nobody took is a false alarm that teaches people to ignore the real one.
 *
 * Quiet when the request fails: an unreachable endpoint is not evidence of
 * anything.
 */
const STATES = {
  verified: {
    tone: 'ok',
    title: 'Transaction record verified',
    body: (n) =>
      `${n} ${n === 1 ? 'entry' : 'entries'}, hash-chained and signed. Nothing has been altered since it was recorded.`,
  },
  unsigned: {
    tone: 'info',
    title: 'Transaction record intact',
    body: (n) =>
      `${n} ${n === 1 ? 'entry' : 'entries'}, hash-chained and unaltered. This store has not enabled digital signatures, so the record cannot also prove where it came from.`,
  },
  partial: {
    tone: 'warn',
    title: 'Transaction record intact, but not fully signed',
    body: () =>
      'Nothing has been altered. Some entries carry no signature — usually because they were recorded before the store’s signing key existed.',
  },
  broken: {
    tone: 'bad',
    title: 'Transaction record does not verify',
    body: () => 'This order’s history no longer matches what was recorded. Please contact support before acting on it.',
  },
};

const stateOf = ({ valid, intact, signed, signingConfigured }) => {
  if (valid) return 'verified';
  if (!intact) return 'broken';
  return signingConfigured ? 'partial' : 'unsigned';
};

export default function IntegrityBadge({ orderNumber }) {
  const [report, setReport] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .get(`/orders/${orderNumber}/integrity`)
      .then(({ data }) => live && setReport(data.integrity))
      .catch(() => live && setReport(null));
    return () => {
      live = false;
    };
  }, [orderNumber]);

  if (!report) return null;

  const state = STATES[stateOf(report)];

  return (
    <section className={`integrity ${state.tone}`}>
      <span className="integrity-mark" aria-hidden="true">
        {state.tone === 'bad' ? <LockIcon width={17} height={17} /> : <ShieldIcon width={17} height={17} />}
      </span>

      <div className="integrity-body">
        <strong>{state.title}</strong>
        <p>{state.body(report.entries)}</p>
        {report.receipt && (
          <code className="integrity-digest" title="The receipt digest, also printed on your bill">
            {report.receipt}
          </code>
        )}
      </div>
    </section>
  );
}
