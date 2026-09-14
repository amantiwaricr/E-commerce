'use strict';

const express = require('express');
const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const validators = require('./validators');
const { requireAuth } = require('../middleware/auth');
const { uploadAvatar } = require('../controllers/upload.controller');
const { authLimiter, otpLimiter } = require('../middleware/rateLimit');

const router = express.Router();

router.post('/register', authLimiter, validate(validators.register), controller.register);
router.post('/login', authLimiter, validate(validators.login), controller.login);
router.post('/verify-email', otpLimiter, validate(validators.verifyEmail), controller.verifyEmail);
router.post('/resend-code', otpLimiter, validate(validators.resendCode), controller.resendCode);
router.post('/logout', controller.logout);
router.get('/me', requireAuth, controller.getMe);
router.patch('/me', requireAuth, validate(validators.updateProfile), controller.updateProfile);
router.post('/change-password', requireAuth, validate(validators.changePassword), controller.changePassword);
router.post('/me/avatar', requireAuth, uploadAvatar);

module.exports = router;
