import { Route, Routes } from 'react-router-dom';

import TopBar from './components/TopBar';
import Toaster from './components/Toaster';
import ProtectedRoute from './components/ProtectedRoute';

import ShopPage from './pages/ShopPage';
import FavouritesPage from './pages/FavouritesPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CartPage from './pages/CartPage';
import LoginPage from './pages/LoginPage';
import CheckoutPage from './pages/CheckoutPage';
import PaymentFailedPage from './pages/PaymentFailedPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';
import { STORE_NAME } from './config';

export default function App() {
  return (
    <div className="viewport">
      <div className="shell">
        <TopBar />

        <div className="shell-body">
          <Routes>
            <Route path="/" element={<ShopPage />} />
            <Route path="/products/:slug" element={<ProductDetailPage />} />
            <Route path="/favourites" element={<FavouritesPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/checkout/failed" element={<PaymentFailedPage />} />

            <Route element={<ProtectedRoute />}>
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:orderNumber" element={<OrderDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>

        <footer className="site-footer">
          © {new Date().getFullYear()} {STORE_NAME} · Kathmandu, Nepal · eSewa, card &amp; cash on delivery
        </footer>
      </div>

      <Toaster />
    </div>
  );
}
