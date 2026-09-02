'use strict';

const express = require('express');
const controller = require('../controllers/order.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.use(requireAuth);

router.post('/', writeLimiter, validate(validators.createOrder), controller.createOrder);
router.get('/', controller.listMyOrders);
router.get('/:orderNumber', validate(validators.orderNumberParam), controller.getMyOrder);
router.post('/:orderNumber/cancel', validate(validators.orderNumberParam), controller.cancelMyOrder);
router.post('/:orderNumber/pay', writeLimiter, validate(validators.orderNumberParam), controller.retryPayment);

module.exports = router;
