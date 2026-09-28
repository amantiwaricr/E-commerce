'use strict';

const express = require('express');
const controller = require('../controllers/product.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const reviews = require('../controllers/review.controller');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/', validate(validators.listProducts), controller.listProducts);
router.get('/categories', controller.listCategories);
router.get('/facets', controller.getFacets);
router.get('/:slug', controller.getProductBySlug);

// Ratings and reviews. Writing one needs a delivered order with the product.
router.get('/:slug/reviews', reviews.listProductReviews);
router.get('/:slug/reviews/mine', requireAuth, reviews.getMyReview);
router.put('/:slug/reviews/mine', requireAuth, writeLimiter, validate(validators.saveReview), reviews.saveMyReview);
router.delete('/:slug/reviews/mine', requireAuth, writeLimiter, reviews.deleteMyReview);

module.exports = router;
