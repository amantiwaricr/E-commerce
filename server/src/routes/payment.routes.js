'use strict';

const express = require('express');
const controller = require('../controllers/payment.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');

const router = express.Router();

router.get('/methods', controller.listPaymentMethods);

// eSewa redirects the customer's browser to these two routes.
router.get('/esewa/success', controller.esewaSuccess);
router.post('/esewa/success', controller.esewaSuccess);
router.get('/esewa/failure', controller.esewaFailure);
router.post('/esewa/failure', controller.esewaFailure);

// Used when the SPA captures the callback itself and settles over the API.
router.post('/esewa/verify', validate(validators.verifyPayment), controller.verifyEsewaPayment);

module.exports = router;
