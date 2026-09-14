'use strict';

const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const SORT_OPTIONS = {
  newest: { createdAt: -1 },
  'price-asc': { price: 1 },
  'price-desc': { price: -1 },
  name: { name: 1 },
  rating: { rating: -1 },
};

const HISTOGRAM_BUCKETS = 28;

/** Splits a comma-separated query value into a clean list. */
const toList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 25);

/** Builds a Mongo filter from validated query params. */
const buildFilter = (query, { adminView = false } = {}) => {
  const filter = {};

  if (query.category) filter.category = query.category;
  if (query.search) filter.$text = { $search: String(query.search) };

  const tags = toList(query.tags);
  if (tags.length) filter.tags = { $in: tags };

  const minRating = Number(query.minRating);
  if (Number.isFinite(minRating) && minRating > 0) filter.rating = { $gte: minRating };

  const min = Number(query.minPrice);
  const max = Number(query.maxPrice);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    filter.price = {};
    if (Number.isFinite(min)) filter.price.$gte = min;
    if (Number.isFinite(max)) filter.price.$lte = max;
  }

  if (adminView) {
    if (query.availability === 'available') filter.isAvailable = true;
    if (query.availability === 'unavailable') filter.isAvailable = false;
  } else {
    // The storefront only ever exposes products the admin has published.
    filter.isAvailable = true;
    if (query.availability === 'in-stock') filter.stock = { $gt: 0 };
  }

  return filter;
};

/** GET /api/products — public, paginated, filterable catalogue. */
const listProducts = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(60, Math.max(1, Number(query.limit) || 12));
  const filter = buildFilter(query);
  const sort = SORT_OPTIONS[query.sort] || SORT_OPTIONS.newest;

  const [items, total] = await Promise.all([
    Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean({ virtuals: true }),
    Product.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    products: items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/**
 * GET /api/products/facets
 * Everything the storefront sidebar needs in one round trip: the catalogue's
 * price bounds and distribution, the tag list with counts, category counts and
 * how many products sit at each star threshold.
 */
const getFacets = asyncHandler(async (req, res) => {
  const published = { isAvailable: true };

  const [bounds, categories, tags, ratings] = await Promise.all([
    Product.aggregate([
      { $match: published },
      { $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' }, avg: { $avg: '$price' } } },
    ]),
    Product.aggregate([{ $match: published }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    Product.aggregate([
      { $match: published },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 24 },
    ]),
    Product.aggregate([
      { $match: { ...published, rating: { $gt: 0 } } },
      { $group: { _id: { $floor: '$rating' }, count: { $sum: 1 } } },
    ]),
  ]);

  const min = Math.floor(bounds[0]?.min ?? 0);
  const max = Math.ceil(bounds[0]?.max ?? 0);

  // A fixed-width histogram of the price distribution, drawn under the slider.
  let histogram = [];
  if (max > min) {
    const width = (max - min) / HISTOGRAM_BUCKETS;
    const rows = await Product.aggregate([
      { $match: published },
      {
        $bucket: {
          groupBy: '$price',
          boundaries: Array.from({ length: HISTOGRAM_BUCKETS + 1 }, (_, i) => min + i * width),
          default: 'overflow',
          output: { count: { $sum: 1 } },
        },
      },
    ]);
    const counts = new Map(rows.filter((r) => r._id !== 'overflow').map((r) => [Math.round(r._id), r.count]));
    histogram = Array.from({ length: HISTOGRAM_BUCKETS }, (_, i) => counts.get(Math.round(min + i * width)) || 0);
  }

  return res.json({
    success: true,
    facets: {
      price: { min, max, average: Math.round(bounds[0]?.avg ?? 0), histogram },
      categories: Product.PRODUCT_CATEGORIES.map((name) => ({
        name,
        count: categories.find((c) => c._id === name)?.count || 0,
      })),
      tags: tags.map((t) => ({ name: t._id, count: t.count })),
      ratings: [4, 3, 2, 1].map((stars) => ({
        stars,
        count: ratings.filter((r) => r._id >= stars).reduce((sum, r) => sum + r.count, 0),
      })),
    },
  });
});

/** GET /api/products/categories — categories with live product counts. */
const listCategories = asyncHandler(async (req, res) => {
  const counts = await Product.aggregate([
    { $match: { isAvailable: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return res.json({
    success: true,
    categories: Product.PRODUCT_CATEGORIES.map((name) => ({
      name,
      count: counts.find((c) => c._id === name)?.count || 0,
    })),
  });
});

/** GET /api/products/:slug */
const getProductBySlug = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug }).lean({ virtuals: true });
  if (!product || !product.isAvailable) throw ApiError.notFound('Product not found');
  return res.json({ success: true, product });
});

/** GET /api/admin/products — admin view, includes unpublished products. */
const adminListProducts = asyncHandler(async (req, res) => {
  const query = req.safeQuery || req.query;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const filter = buildFilter(query, { adminView: true });

  const [items, total] = await Promise.all([
    Product.find(filter)
      .sort(SORT_OPTIONS[query.sort] || SORT_OPTIONS.newest)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
    Product.countDocuments(filter),
  ]);

  return res.json({
    success: true,
    products: items,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

/** GET /api/admin/products/:id */
const adminGetProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).lean({ virtuals: true });
  if (!product) throw ApiError.notFound('Product not found');
  return res.json({ success: true, product });
});

/** POST /api/admin/products */
const createProduct = asyncHandler(async (req, res) => {
  const { name, description, category, price, stock, images, isAvailable, unit, tags, rating, reviewCount, isFeatured } =
    req.body;
  const product = await Product.create({
    name,
    description,
    category,
    price,
    stock,
    unit,
    images: Array.isArray(images) ? images : [],
    tags: Array.isArray(tags) ? tags : [],
    isAvailable: isAvailable !== undefined ? Boolean(isAvailable) : true,
    isFeatured: Boolean(isFeatured),
    rating: rating || 0,
    reviewCount: reviewCount || 0,
  });
  return res.status(201).json({ success: true, product: product.toJSON() });
});

/** PATCH /api/admin/products/:id */
const updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const updatable = [
    'name', 'description', 'category', 'price', 'stock', 'unit',
    'images', 'isAvailable', 'tags', 'rating', 'reviewCount', 'isFeatured',
  ];
  for (const field of updatable) {
    if (req.body[field] !== undefined) product[field] = req.body[field];
  }
  await product.save();

  return res.json({ success: true, product: product.toJSON() });
});

/** DELETE /api/admin/products/:id */
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  return res.json({ success: true, message: 'Product deleted' });
});

/** PATCH /api/admin/products/:id/availability */
const toggleAvailability = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  product.isAvailable = req.body.isAvailable !== undefined ? Boolean(req.body.isAvailable) : !product.isAvailable;
  await product.save();
  return res.json({ success: true, product: product.toJSON() });
});

module.exports = {
  listProducts,
  getFacets,
  listCategories,
  getProductBySlug,
  adminListProducts,
  adminGetProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  toggleAvailability,
};
