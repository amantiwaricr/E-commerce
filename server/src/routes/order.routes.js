'use strict';

const express = require('express');
const controller = require('../controllers/order.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter, checkoutLimiter, paymentLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.use(requireAuth);

router.post('/', checkoutLimiter, validate(validators.createOrder), controller.createOrder);
router.get('/', controller.listMyOrders);
router.get('/:orderNumber', validate(validators.orderNumberParam), controller.getMyOrder);
router.post('/:orderNumber/cancel', validate(validators.orderNumberParam), controller.cancelMyOrder);
router.get('/:orderNumber/invoice', validate(validators.orderNumberParam), controller.downloadInvoice);
router.get('/:orderNumber/integrity', validate(validators.orderNumberParam), controller.verifyOrderIntegrity);
router.post('/:orderNumber/pay', paymentLimiter, validate(validators.orderNumberParam), controller.retryPayment);

module.exports = router;
