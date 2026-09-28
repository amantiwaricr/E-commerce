import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Toaster from './components/Toaster';
import ScrollManager from './components/ScrollManager';
import EmptyState from './components/EmptyState';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import ProductFormPage from './pages/ProductFormPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import UsersPage from './pages/UsersPage';
import CustomerDetailPage from './pages/CustomerDetailPage';
import InventoryPage from './pages/InventoryPage';
import PaymentsPage from './pages/PaymentsPage';
import SettingsPage from './pages/SettingsPage';
import ReviewsPage from './pages/ReviewsPage';

export default function App() {
  return (
    <>
      <ScrollManager />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="products" element={<ProductsPage />} />
            <Route path="products/new" element={<ProductFormPage />} />
            <Route path="products/:id" element={<ProductFormPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="orders/:orderNumber" element={<OrderDetailPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="reviews" element={<ReviewsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<CustomerDetailPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={<EmptyState title="404 — page not found" actionLabel="Back to dashboard" actionTo="/" />}
            />
          </Route>
        </Route>
      </Routes>

      <Toaster />
    </>
  );
}
