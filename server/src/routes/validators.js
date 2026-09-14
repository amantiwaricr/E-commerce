'use strict';

const { body, param, query } = require('express-validator');
const Product = require('../models/Product');
const Order = require('../models/Order');
const { isValidNepaliPhone } = require('../utils/phone');

const objectId = (name, location = param) =>
  location(name).isMongoId().withMessage('Must be a valid id');

const productBody = (partial = false) => {
  const maybe = (chain) => (partial ? chain.optional() : chain);
  return [
    maybe(body('name').trim().notEmpty().withMessage('Name is required')).isLength({ max: 160 }),
    maybe(body('description').trim().notEmpty().withMessage('Description is required')).isLength({ max: 4000 }),
    maybe(body('category').isIn(Product.PRODUCT_CATEGORIES)).withMessage(
      `Category must be one of: ${Product.PRODUCT_CATEGORIES.join(', ')}`
    ),
    maybe(body('price').isFloat({ min: 0 })).withMessage('Price must be zero or more'),
    maybe(body('stock').isInt({ min: 0 })).withMessage('Stock must be zero or more'),
    body('unit').optional().isIn(Product.PRODUCT_UNITS).withMessage('Unsupported unit'),
    body('images').optional().isArray({ max: 8 }).withMessage('At most 8 images'),
    body('images.*').optional().isString().trim().isLength({ max: 500 }),
    body('tags').optional().isArray({ max: 20 }),
    body('tags.*').optional().isString().trim().isLength({ max: 40 }),
    body('isAvailable').optional().isBoolean().toBoolean(),
    body('isFeatured').optional().isBoolean().toBoolean(),
    body('rating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
    body('reviewCount').optional().isInt({ min: 0 }).toInt(),
  ];
};

const shippingAddressBody = [
  body('shippingAddress.recipientName').trim().notEmpty().withMessage('Recipient name is required').isLength({ max: 120 }),
  body('shippingAddress.phone')
    .trim()
    .notEmpty()
    .withMessage('Contact number is required')
    .custom((value) => isValidNepaliPhone(value))
    .withMessage('Enter a valid Nepali mobile number, e.g. 9801234567'),
  body('shippingAddress.street').trim().notEmpty().withMessage('Street address is required').isLength({ max: 200 }),
  body('shippingAddress.city').trim().notEmpty().withMessage('City is required').isLength({ max: 80 }),
  body('shippingAddress.district').optional().trim().isLength({ max: 80 }),
  body('shippingAddress.landmark').optional().trim().isLength({ max: 160 }),
  body('shippingAddress.notes').optional().trim().isLength({ max: 400 }),
];

module.exports = {
  objectId,
  productBody,
  shippingAddressBody,

  register: [
    body('name').trim().notEmpty().withMessage('Your name is required').isLength({ max: 120 }),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .bail()
      .isEmail()
      .withMessage('Enter a valid email address')
      .bail()
      .isLength({ max: 254 })
      .normalizeEmail({ gmail_remove_dots: false }),
    body('password')
      .isString()
      .withMessage('A password is required')
      .bail()
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be at least 8 characters')
      .bail()
      .custom((value) => !/^\d+$/.test(value))
      .withMessage('Password cannot be only numbers')
      .bail()
      .custom((value, { req }) => !value.toLowerCase().includes(String(req.body.email || '').split('@')[0].toLowerCase()))
      .withMessage('Password must not contain your email address'),
  ],

  login: [
    body('email').trim().notEmpty().withMessage('Email is required').bail().isEmail().withMessage('Enter a valid email address'),
    body('password').isString().notEmpty().withMessage('Password is required'),
    body('scope').optional().isIn(['storefront', 'admin']).withMessage('Unknown sign-in scope'),
  ],

  verifyEmail: [
    body('email').trim().isEmail().withMessage('Enter a valid email address'),
    body('code')
      .trim()
      .matches(/^\d{4}$/)
      .withMessage('Enter the 4-digit code from your email'),
  ],

  resendCode: [body('email').trim().isEmail().withMessage('Enter a valid email address')],

  changePassword: [
    body('currentPassword').isString().notEmpty().withMessage('Your current password is required'),
    body('newPassword')
      .isString()
      .isLength({ min: 8, max: 128 })
      .withMessage('New password must be at least 8 characters')
      .bail()
      .custom((value) => !/^\d+$/.test(value))
      .withMessage('Password cannot be only numbers'),
  ],

  updateProfile: [
    body('name').optional().trim().isLength({ min: 1, max: 120 }),
    body('phone')
      .optional({ values: 'falsy' })
      .trim()
      .custom((value) => isValidNepaliPhone(value))
      .withMessage('Enter a valid Nepali mobile number'),
    body('addresses').optional().isArray({ max: 10 }),
  ],

  listProducts: [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 60 }).toInt(),
    query('category').optional().isIn(Product.PRODUCT_CATEGORIES),
    query('minPrice').optional().isFloat({ min: 0 }).toFloat(),
    query('maxPrice').optional().isFloat({ min: 0 }).toFloat(),
    query('search').optional().trim().isLength({ max: 100 }),
    query('sort').optional().isIn(['newest', 'price-asc', 'price-desc', 'name', 'rating']),
    query('minRating').optional().isFloat({ min: 0, max: 5 }).toFloat(),
    query('tags').optional().trim().isLength({ max: 300 }),
    query('availability').optional().isIn(['in-stock', 'available', 'unavailable']),
  ],

  addCartItem: [
    body('productId').isMongoId().withMessage('Must be a valid product id'),
    body('quantity').optional().isInt({ min: 1, max: 99 }).toInt(),
  ],

  updateCartItem: [
    param('productId').isMongoId().withMessage('Must be a valid product id'),
    body('quantity').isInt({ min: 1, max: 99 }).toInt().withMessage('Quantity must be between 1 and 99'),
  ],

  mergeCart: [
    body('items').isArray({ max: 50 }).withMessage('Items must be an array'),
    body('items.*.productId').isMongoId(),
    body('items.*.quantity').optional().isInt({ min: 1, max: 99 }).toInt(),
  ],

  createOrder: [
    body('paymentMethod').isIn(Order.PAYMENT_METHODS).withMessage('Choose eSewa, card, or cash on delivery'),
    body('deliveryMethod').optional().isIn(Order.DELIVERY_METHODS).withMessage('Choose standard delivery or pick up'),
    ...shippingAddressBody,
  ],

  orderNumberParam: [param('orderNumber').trim().matches(/^FMN-\d{4}-\d{5}$/).withMessage('Invalid order number')],

  updateOrderStatus: [
    param('orderNumber').trim().matches(/^FMN-\d{4}-\d{5}$/).withMessage('Invalid order number'),
    body('status').isIn(Order.ORDER_STATUSES).withMessage('Unknown order status'),
    body('note').optional().trim().isLength({ max: 500 }),
  ],

  updateTracking: [
    param('orderNumber').trim().matches(/^FMN-\d{4}-\d{5}$/).withMessage('Invalid order number'),
    body('carrier').optional().trim().isLength({ max: 120 }),
    body('trackingCode').optional().trim().isLength({ max: 120 }),
    body('estimatedDelivery').optional().trim().isLength({ max: 160 }),
    body('note').optional().trim().isLength({ max: 500 }),
  ],

  verifyPayment: [body('data').isString().notEmpty().withMessage('Payment data is required')],
};
