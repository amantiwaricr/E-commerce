'use strict';

const Product = require('../models/Product');
const asyncHandler = require('../utils/asyncHandler');
const { env } = require('../config/env');
const { buildSitemap, buildRobotsTxt, STATIC_ROUTES } = require('../services/sitemap.service');

/** Cached: the catalogue changes far more slowly than crawlers ask for it. */
const CACHE_SECONDS = 3600;

/** GET /sitemap.xml — every page worth indexing, built from the live catalogue. */
const sitemap = asyncHandler(async (req, res) => {
  const products = await Product.find({ isAvailable: true })
    .select('slug updatedAt')
    .sort({ updatedAt: -1 })
    .limit(50000) // The sitemap protocol's own ceiling for one file.
    .lean();

  res.type('application/xml');
  res.set('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
  return res.send(buildSitemap({ siteUrl: env.siteUrl, products }));
});

/**
 * GET /robots.txt
 *
 * Served by the API as well as the site so the sitemap line always carries the
 * right absolute URL — a relative one is ignored by every crawler.
 */
const robots = asyncHandler(async (req, res) => {
  res.type('text/plain');
  res.set('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
  return res.send(buildRobotsTxt({ siteUrl: env.siteUrl, apiUrl: env.backendUrl }));
});

module.exports = { sitemap, robots, STATIC_ROUTES };
