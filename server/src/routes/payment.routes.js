'use strict';

const express = require('express');
const controller = require('../controllers/payment.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const { paymentLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/methods', controller.listPaymentMethods);

/*
 * eSewa redirects the customer's browser to these two routes, so they cannot
 * require a session: the redirect arrives cross-site and the cookie may not.
 * What guards them is the signature on the payload and the server-to-server
 * status check; the rate limit is what stops a flood of forged blobs.
 */
router.get('/esewa/success', paymentLimiter, controller.esewaSuccess);
router.post('/esewa/success', paymentLimiter, controller.esewaSuccess);
router.get('/esewa/failure', paymentLimiter, controller.esewaFailure);
router.post('/esewa/failure', paymentLimiter, controller.esewaFailure);

// Used when the SPA captures the callback itself and settles over the API.
router.post('/esewa/verify', paymentLimiter, validate(validators.verifyPayment), controller.verifyEsewaPayment);

module.exports = router;
