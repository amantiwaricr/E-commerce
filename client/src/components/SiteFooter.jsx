import { Link } from 'react-router-dom';

import Emblem from './Emblem';
import { BoxIcon, ClockIcon, MailIcon, PhoneIcon, PinIcon, ShieldIcon, WalletIcon } from './icons';
import { formatNpr } from '../utils/format';
import {
  CATEGORIES, FREE_DELIVERY_THRESHOLD, STORE_ADDRESS, STORE_MAP_LINK, STORE_NAME,
  SUPPORT_EMAIL, SUPPORT_PHONE,
} from '../config';

/**
 * Link columns. Every destination is a route that exists; the two in-page
 * anchors carry the leading `/` so they work from any page — the landing page
 * scrolls to them once it has mounted.
 */
const FOOTER_LINKS = [
  {
    title: 'Shop',
    links: [
      { label: 'Meat Market', to: '/shop' },
      ...CATEGORIES.map((name) => ({ label: name, to: `/shop?category=${encodeURIComponent(name)}` })),
    ],
  },
  {
    title: 'Your account',
    links: [
      { label: 'Orders & tracking', to: '/orders' },
      { label: 'Favourites', to: '/favourites' },
      { label: 'Basket', to: '/cart' },
      { label: 'Profile', to: '/profile' },
    ],
  },
  {
    title: 'Ordering',
    links: [
      { label: 'How it works', to: '/#how' },
      { label: 'Create an account', to: '/register' },
      { label: 'Sign in', to: '/login' },
      { label: 'Visit the shop', to: '/#visit' },
    ],
  },
];

const PAYMENT_NOTES = [
  { Icon: WalletIcon, label: 'eSewa wallet' },
  { Icon: ShieldIcon, label: 'Debit / credit card' },
  { Icon: BoxIcon, label: 'Cash on delivery' },
];

/** The store footer. Shared by the landing page and every page of the shop. */
export default function SiteFooter() {
  return (
    <footer className="home-footer">
      <div className="foot-wrap">
        <div className="foot-top">
          <div className="foot-brand">
            <Link className="home-brand" to="/">
              <Emblem className="emblem" />
              <div>
                <div className="word">{STORE_NAME}</div>
                <span className="sub">FRESH · HALAL · NEPAL</span>
              </div>
            </Link>
            <p>
              Meat cut to order the morning you buy it, kept in an unbroken cold chain from our
              Balkumari counter to your kitchen anywhere in the Kathmandu Valley.
            </p>

            <div className="foot-contact">
              <a href={STORE_MAP_LINK} target="_blank" rel="noreferrer">
                <PinIcon width={15} height={15} />
                {STORE_ADDRESS.line1}, {STORE_ADDRESS.line2}
              </a>
              <a href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, '')}`}>
                <PhoneIcon width={15} height={15} />
                {SUPPORT_PHONE}
              </a>
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                <MailIcon width={15} height={15} />
                {SUPPORT_EMAIL}
              </a>
              <span>
                <ClockIcon width={15} height={15} />
                {STORE_ADDRESS.hours}
              </span>
            </div>
          </div>

          {FOOTER_LINKS.map((column) => (
            <nav className="foot-col" key={column.title} aria-label={column.title}>
              <h4>{column.title}</h4>
              <ul>
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.label}`}>
                    <Link to={link.to}>{link.label}</Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="foot-pay">
          <span className="foot-pay-label">We accept</span>
          {PAYMENT_NOTES.map(({ Icon, label }) => (
            <span className="pay-chip" key={label}>
              <Icon width={15} height={15} />
              {label}
            </span>
          ))}
          <span className="foot-pay-note">
            Free delivery inside the Valley over {formatNpr(FREE_DELIVERY_THRESHOLD)} · Order before
            4 PM for same-day delivery
          </span>
        </div>

        <div className="foot-bottom">
          <span>
            © {new Date().getFullYear()} {STORE_NAME}. All rights reserved.
          </span>
          <span>
            Registered in Lalitpur, Bagmati Province, Nepal · Prices in Nepalese rupees, inclusive
            of applicable taxes
          </span>
        </div>
      </div>
    </footer>
  );
}
