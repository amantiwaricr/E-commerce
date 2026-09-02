'use strict';

const express = require('express');
const { env } = require('../config/env');

const router = express.Router();

router.get('/health', (req, res) =>
  res.json({ success: true, service: env.store.name, status: 'ok', time: new Date().toISOString() })
);

router.use('/auth', require('./auth.routes'));
router.use('/products', require('./product.routes'));
router.use('/cart', require('./cart.routes'));
router.use('/orders', require('./order.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
