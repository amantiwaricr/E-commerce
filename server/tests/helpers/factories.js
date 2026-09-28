'use strict';

const User = require('../../src/models/User');
const Product = require('../../src/models/Product');
const { signToken, SCOPES } = require('../../src/middleware/auth');

let counter = 0;

const DEFAULT_PASSWORD = 'test-password-123';

const createUser = async (overrides = {}) => {
  counter += 1;
  const { password = DEFAULT_PASSWORD, ...rest } = overrides;
  const user = new User({
    name: `Test Customer ${counter}`,
    email: `customer${counter}@example.com`,
    role: 'customer',
    phone: '9801234567',
    isEmailVerified: true,
    ...rest,
  });
  await user.setPassword(password);
  await user.save();
  return user;
};

const createAdmin = (overrides = {}) => createUser({ role: 'admin', ...overrides });

const createProduct = async (overrides = {}) => {
  counter += 1;
  return Product.create({
    name: `Test Product ${counter}`,
    description: 'A test product description that is long enough to be realistic.',
    category: 'Fresh Meat',
    price: 500,
    unit: 'kg',
    stock: 10,
    images: ['https://cdn.example/test.jpg'],
    isAvailable: true,
    ...overrides,
  });
};

const authHeader = (user) => ({ Authorization: `Bearer ${signToken(user)}` });

/** An admin-panel session: the admin API refuses storefront-scoped tokens. */
const adminHeader = (user) => ({ Authorization: `Bearer ${signToken(user, SCOPES.ADMIN)}` });

const shippingAddress = (overrides = {}) => ({
  recipientName: 'Sita Sharma',
  phone: '9801234567',
  street: 'Jhamsikhel Road 12',
  city: 'Lalitpur',
  district: 'Bagmati',
  landmark: 'Near Labim Mall',
  ...overrides,
});

module.exports = { createUser, createAdmin, createProduct, authHeader, adminHeader, shippingAddress, DEFAULT_PASSWORD };
