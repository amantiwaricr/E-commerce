import { ClockIcon, PhoneIcon, PinIcon, ShieldIcon, TruckIcon } from './icons';
import { STORE_ADDRESS, STORE_MAP_LINK, SUPPORT_PHONE } from '../config';

/**
 * The thin maroon strip above the header: how to reach the shop, and the
 * three promises the reference design leads with. The centre panel is a
 * notch — a darker slab clipped out of the maroon.
 */
export default function UtilityBar() {
  return (
    <div className="utility-bar">
      <div className="ub-inner">
        <a className="ub-item" href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, '')}`}>
          <PhoneIcon width={14} height={14} />
          {SUPPORT_PHONE}
        </a>
        <a className="ub-item" href={STORE_MAP_LINK} target="_blank" rel="noreferrer">
          <PinIcon width={14} height={14} />
          {STORE_ADDRESS.line1}
        </a>

        <span className="ub-notch">
          <ShieldIcon width={14} height={14} />
          100% HALAL CERTIFIED
        </span>

        <span className="ub-item">
          <ClockIcon width={14} height={14} />
          {STORE_ADDRESS.hoursShort}
        </span>
        <span className="ub-item ub-last">
          <TruckIcon width={16} height={16} />
          Same-Day<br />Delivery
        </span>
      </div>
    </div>
  );
}
