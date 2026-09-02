import { Link } from 'react-router-dom';
import { STORE_NAME, SUPPORT_PHONE } from '../config';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h4>{STORE_NAME}</h4>
            <p className="small">
              Farm-fresh and expertly processed meat, cut to order and delivered cold across Kathmandu Valley.
            </p>
          </div>

          <div>
            <h4>Shop</h4>
            <ul>
              <li>
                <Link to="/products?category=Fresh%20Meat">Fresh Meat</Link>
              </li>
              <li>
                <Link to="/products?category=Processed%20Meat">Processed Meat</Link>
              </li>
              <li>
                <Link to="/products?category=Marinated">Marinated</Link>
              </li>
              <li>
                <Link to="/products?category=Seafood">Seafood</Link>
              </li>
            </ul>
          </div>

          <div>
            <h4>Help</h4>
            <ul>
              <li>
                <Link to="/orders">Track an order</Link>
              </li>
              <li>Payment: eSewa, card, cash on delivery</li>
              <li>Delivery: same day inside the Valley</li>
            </ul>
          </div>

          <div>
            <h4>Contact</h4>
            <ul>
              <li>{SUPPORT_PHONE}</li>
              <li>Kathmandu, Nepal</li>
              <li>Sun–Fri, 7 AM – 7 PM</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          © {new Date().getFullYear()} {STORE_NAME}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
