import { Link } from 'react-router-dom';
import Icon from './Icon';

/** The card shell every dashboard panel sits in: label row, tools, body. */
export default function Card({ title, icon, to, toLabel = 'Open', tools, children, className = '', ...rest }) {
  return (
    <section className={`card ${className}`} {...rest}>
      <header className="card-head">
        <h3>
          {icon && <Icon name={icon} size={15} />}
          {title}
        </h3>
        <div className="card-tools">
          {tools}
          {to && (
            <Link className="icon-btn" to={to} aria-label={toLabel} title={toLabel}>
              <Icon name="arrowUpRight" size={14} />
            </Link>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}
