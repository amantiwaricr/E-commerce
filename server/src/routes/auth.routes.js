'use strict';

const express = require('express');
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/google', authLimiter, validate(validators.googleLogin), controller.googleLogin);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.getMe);
router.patch('/me', requireAuth, validate(validators.updateProfile), controller.updateProfile);

module.exports = router;
