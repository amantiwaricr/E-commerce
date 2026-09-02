'use strict';

const express = require('express');
const controller = require('../controllers/product.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');

const router = express.Router();

router.get('/', validate(validators.listProducts), controller.listProducts);
router.get('/categories', controller.listCategories);
router.get('/:slug', controller.getProductBySlug);

module.exports = router;
