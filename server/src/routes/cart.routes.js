'use strict';

const express = require('express');
const controller = require('../controllers/cart.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.getCart);
router.post('/items', validate(validators.addCartItem), controller.addItem);
router.patch('/items/:productId', validate(validators.updateCartItem), controller.updateItem);
router.delete('/items/:productId', controller.removeItem);
router.delete('/', controller.clearCart);
router.post('/merge', validate(validators.mergeCart), controller.mergeCart);

module.exports = router;
