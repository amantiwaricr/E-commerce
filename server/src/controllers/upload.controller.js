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

module.exports = { uploadImages, UPLOAD_DIR };
