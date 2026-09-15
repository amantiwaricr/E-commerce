import Emblem from './Emblem';
import { STORE_NAME } from '../config';

/** Header lockup: the roundel beside a two-line gold wordmark. */
export default function Logo() {
  const [first, ...rest] = STORE_NAME.split(' ');
  return (
    <span className="logo">
      <span className="badge"><Emblem /></span>
      <span className="word">
        <span>{first}</span>
        <span>{rest.join(' ')}</span>
      </span>
    </span>
  );
}
