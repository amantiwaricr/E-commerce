'use strict';

const express = require('express');
const controller = require('../controllers/favourite.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/', controller.listFavourites);
router.post('/:productId', validate([validators.objectId('productId')]), controller.addFavourite);
router.delete('/:productId', validate([validators.objectId('productId')]), controller.removeFavourite);

module.exports = router;
