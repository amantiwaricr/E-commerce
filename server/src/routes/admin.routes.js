'use strict';

const express = require('express');
const adminController = require('../controllers/admin.controller');
const productController = require('../controllers/product.controller');
const uploadController = require('../controllers/upload.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Every route below this line is admin-only.
router.use(requireAuth, requireAdmin);

router.get('/stats', adminController.getDashboardStats);

// Products
router.get('/products', validate(validators.listProducts), productController.adminListProducts);
router.post('/products', validate(validators.productBody(false)), productController.createProduct);
router.get('/products/:id', validate([validators.objectId('id')]), productController.adminGetProduct);
router.patch('/products/:id', validate([validators.objectId('id'), ...validators.productBody(true)]), productController.updateProduct);
router.patch('/products/:id/availability', validate([validators.objectId('id')]), productController.toggleAvailability);
router.delete('/products/:id', validate([validators.objectId('id')]), productController.deleteProduct);

// Orders
router.get('/orders', adminController.listOrders);
router.get('/orders/:orderNumber', validate(validators.orderNumberParam), adminController.getOrder);
router.patch('/orders/:orderNumber/status', validate(validators.updateOrderStatus), adminController.updateOrderStatus);
router.patch('/orders/:orderNumber/tracking', validate(validators.updateTracking), adminController.updateTracking);

// Users
router.get('/users', adminController.listUsers);
router.patch('/users/:id/block', validate([validators.objectId('id')]), adminController.setUserBlocked);

// Image uploads
router.post('/uploads', uploadController.uploadImages);

module.exports = router;
