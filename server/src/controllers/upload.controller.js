'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

/** Admin product image upload — images only, 5 MB each, 8 per request. */
const uploadMiddleware = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPEG, PNG, WebP, or AVIF images are allowed'));
    }
    return cb(null, true);
  },
}).array('images', 8);

/** Customers may upload a single, smaller profile photo. */
const avatarMiddleware = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPEG, PNG, WebP, or AVIF images are allowed'));
    }
    return cb(null, true);
  },
}).single('avatar');

/** POST /api/auth/me/avatar — sets the signed-in customer's profile photo. */
const uploadAvatar = (req, res, next) =>
  avatarMiddleware(req, res, async (err) => {
    if (err) {
      const tooBig = err.code === 'LIMIT_FILE_SIZE';
      return next(err instanceof ApiError ? err : ApiError.badRequest(tooBig ? 'Images must be 2 MB or smaller' : err.message));
    }
    if (!req.file) return next(ApiError.badRequest('No image was uploaded'));

    try {
      req.user.avatar = `${env.backendUrl}/uploads/${req.file.filename}`;
      await req.user.save();
      return res.json({ success: true, user: req.user.toPublicJSON() });
    } catch (saveError) {
      return next(saveError);
    }
  });

/** POST /api/admin/uploads — returns absolute URLs for the stored files. */
const uploadImages = (req, res, next) =>
  uploadMiddleware(req, res, (err) => {
    if (err) return next(err instanceof ApiError ? err : ApiError.badRequest(err.message));
    if (!req.files?.length) return next(ApiError.badRequest('No image files were uploaded'));
    return res.status(201).json({
      success: true,
      urls: req.files.map((file) => `${env.backendUrl}/uploads/${file.filename}`),
    });
  });

module.exports = { uploadImages, uploadAvatar, UPLOAD_DIR };
