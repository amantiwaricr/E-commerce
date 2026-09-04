import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Toaster from './components/Toaster';
import EmptyState from './components/EmptyState';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import ProductFormPage from './pages/ProductFormPage';
import OrdersPage from './pages/OrdersPage';
import OrderDetailPage from './pages/OrderDetailPage';
import UsersPage from './pages/UsersPage';

export default function App() {
  return (
    <>
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
            <Route path="users" element={<UsersPage />} />
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
