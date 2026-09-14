'use strict';

const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** GET /api/favourites — the signed-in customer's saved products. */
const listFavourites = asyncHandler(async (req, res) => {
  await req.user.populate('favourites');
  // Products that were deleted or unpublished simply drop out of the list.
  const products = (req.user.favourites || []).filter((p) => p && p.isAvailable);
  return res.json({ success: true, products, ids: products.map((p) => p._id.toString()) });
});

/** POST /api/favourites/:productId — idempotent add. */
const addFavourite = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);
  if (!product) throw ApiError.notFound('Product not found');

  const already = req.user.favourites.some((id) => id.toString() === product._id.toString());
  if (!already) {
    req.user.favourites.push(product._id);
    await req.user.save();
  }

  return res.status(already ? 200 : 201).json({
    success: true,
    ids: req.user.favourites.map((id) => id.toString()),
  });
});

/** DELETE /api/favourites/:productId — idempotent remove. */
const removeFavourite = asyncHandler(async (req, res) => {
  req.user.favourites = req.user.favourites.filter((id) => id.toString() !== req.params.productId);
  await req.user.save();
  return res.json({ success: true, ids: req.user.favourites.map((id) => id.toString()) });
});

module.exports = { listFavourites, addFavourite, removeFavourite };
