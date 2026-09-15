import { LeafIcon, ShieldIcon, SnowIcon, TruckIcon } from './icons';

/**
 * The four-up reassurance band the reference repeats under the product,
 * the cart and the basket summary.
 */
const POINTS = [
  { Icon: ShieldIcon, title: '100% Halal', note: 'Slaughtered to halal standards' },
  { Icon: LeafIcon, title: 'Cut Fresh Daily', note: 'No preservatives added' },
  { Icon: SnowIcon, title: 'Cold Chain', note: 'Kept at 0–4°C throughout' },
  { Icon: TruckIcon, title: 'Same-Day Delivery', note: 'Across the Kathmandu Valley' },
];

export default function TrustStrip({ compact = false }) {
  return (
    <div className={`trust-strip ${compact ? 'compact' : ''}`}>
      {POINTS.map(({ Icon, title, note }) => (
        <div className="trust-item" key={title}>
          <Icon width={compact ? 17 : 21} height={compact ? 17 : 21} />
          <div>
            <b>{title}</b>
            {!compact && <small>{note}</small>}
          </div>
        </div>
      ))}
    </div>
  );
}
