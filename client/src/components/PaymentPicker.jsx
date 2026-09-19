import { CardIcon, CheckIcon, LockIcon, TruckIcon, WalletIcon } from './icons';

/**
 * How each method presents itself. The API supplies the label, the wording and
 * whether it is switched on for this store; what belongs to the interface — the
 * mark, the tone, the one-word promise — lives here, so adding a wallet later
 * is one entry rather than a new branch in the markup.
 */
const LOOK = {
  esewa: { Icon: WalletIcon, tone: 'esewa', tag: 'Instant' },
  cod: { Icon: TruckIcon, tone: 'cod', tag: 'On arrival' },
  card: { Icon: CardIcon, tone: 'card', tag: 'Secure' },
};

/** What actually happens after the button is pressed, per method. */
const OUTCOME = {
  esewa: 'You will be taken to eSewa to approve the payment, then straight back here.',
  cod: 'Pay the rider in cash when your order arrives. Please keep the exact amount ready.',
  card: 'Your card is processed by eSewa’s gateway. This store never sees or stores the number.',
};

export default function PaymentPicker({ methods, value, onChange, loading }) {
  if (loading) {
    return (
      <div className="paypick" aria-busy="true">
        {[0, 1, 2].map((n) => (
          <div className="skel" key={n} style={{ height: 58, borderRadius: 13 }} />
        ))}
      </div>
    );
  }

  if (!methods.length) {
    return (
      <p className="small muted" style={{ margin: 0 }}>
        Payment options could not be loaded. Refresh the page and try again.
      </p>
    );
  }

  return (
    <>
      {/* A fieldset, not a div: the legend is what a screen reader announces
          before reading the options, and radios need a shared group to arrow
          between. */}
      <fieldset className="paypick-set">
        <legend className="sr-only">Payment method</legend>

        <div className="paypick">
          {methods.map((method) => {
            const { Icon, tone, tag } = LOOK[method.id] || { Icon: WalletIcon, tone: '', tag: '' };
            const chosen = value === method.id;

            return (
              <label
                key={method.id}
                className={`payopt ${tone} ${chosen ? 'on' : ''} ${method.enabled ? '' : 'off'}`}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={method.id}
                  checked={chosen}
                  disabled={!method.enabled}
                  onChange={() => onChange(method.id)}
                />

                <span className="payopt-mark" aria-hidden="true">
                  <Icon width={18} height={18} />
                </span>

                <span className="payopt-body">
                  <span className="payopt-name">
                    {method.label}
                    {method.enabled && tag && <span className="payopt-tag">{tag}</span>}
                  </span>
                  <span className="payopt-desc">
                    {method.enabled ? method.description : 'Not enabled for this store yet'}
                  </span>
                </span>

                <span className="payopt-tick" aria-hidden="true">
                  <CheckIcon width={12} height={12} />
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {OUTCOME[value] && (
        <p className="payopt-outcome">
          <LockIcon width={14} height={14} />
          <span>{OUTCOME[value]}</span>
        </p>
      )}
    </>
  );
}
