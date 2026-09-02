'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');
const nodemailer = require('nodemailer');

const { uploadImages, UPLOAD_DIR } = require('../src/controllers/upload.controller');
const errorHandler = require('../src/middleware/errorHandler');

// A real 1x1 PNG, so multer sees genuine image bytes and a real mimetype.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * The upload handler needs no database, so it is mounted on a bare app — this
 * suite runs everywhere and guards the multer 2.x integration.
 */
const buildApp = () => {
  const app = express();
  app.post('/uploads', uploadImages);
  app.use(errorHandler);
  return app;
};

describe('Admin image upload (multer)', () => {
  const written = [];

  afterAll(() => {
    // Remove anything this suite wrote into server/uploads.
    written.forEach((file) => fs.rmSync(path.join(UPLOAD_DIR, file), { force: true }));
  });

  it('stores uploaded images and returns their public URLs', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('images', PNG, 'chicken.png')
      .attach('images', PNG, 'khasi.png');

    expect(res.status).toBe(201);
    expect(res.body.urls).toHaveLength(2);

    res.body.urls.forEach((url) => {
      expect(url).toMatch(/^http:\/\/localhost:5000\/uploads\/.+\.png$/);
      const filename = url.split('/').pop();
      written.push(filename);
      expect(fs.existsSync(path.join(UPLOAD_DIR, filename))).toBe(true);
    });
  });

  it('rejects a file that is not an allowed image type', async () => {
    const res = await request(buildApp())
      .post('/uploads')
      .attach('images', Buffer.from('#!/bin/sh\nrm -rf /'), 'payload.sh');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/JPEG, PNG, WebP, or AVIF/i);
  });

  it('rejects a request with no file attached', async () => {
    const res = await request(buildApp()).post('/uploads');

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no image files/i);
  });
});

describe('Nodemailer transport', () => {
  it('builds an SMTP transport with the configured options', () => {
    const transport = nodemailer.createTransport({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });

    expect(typeof transport.sendMail).toBe('function');
  });
});
