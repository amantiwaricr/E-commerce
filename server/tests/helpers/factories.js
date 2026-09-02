'use strict';

const User = require('../../src/models/User');
const Product = require('../../src/models/Product');
const { signToken } = require('../../src/middleware/auth');

let counter = 0;

const createUser = async (overrides = {}) => {
  counter += 1;
  return User.create({
    name: `Test Customer ${counter}`,
    email: `customer${counter}@example.com`,
    googleId: `google-sub-${counter}`,
    role: 'customer',
    phone: '9801234567',
    ...overrides,
  });
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

const shippingAddress = (overrides = {}) => ({
  recipientName: 'Sita Sharma',
  phone: '9801234567',
  street: 'Jhamsikhel Road 12',
  city: 'Lalitpur',
  district: 'Bagmati',
  landmark: 'Near Labim Mall',
  ...overrides,
});

module.exports = { createUser, createAdmin, createProduct, authHeader, shippingAddress };
