'use strict';

const Cart = require('../models/Cart');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { priceItems } = require('../services/pricing.service');

/** Loads (or lazily creates) the signed-in user's cart. */
const getOrCreateCart = async (userId) => {
  const existing = await Cart.findOne({ user: userId });
  if (existing) return existing;
  return Cart.create({ user: userId, items: [] });
};

/**
 * Re-prices a cart against current products and drops lines whose product was
 * deleted or unpublished, so the cart a customer sees is always purchasable.
 */
const buildCartResponse = async (cart) => {
  await cart.populate('items.product');

  const validEntries = [];
  const removed = [];
  let changed = false;

  for (const line of cart.items) {
    const product = line.product;
    if (!product || !product.isAvailable || product.stock <= 0) {
      removed.push(product?.name || 'An item');
      changed = true;
      continue;
    }
    const quantity = Math.min(line.quantity, product.stock);
    if (quantity !== line.quantity) changed = true;
    validEntries.push({ product, quantity });
  }

  if (changed) {
    cart.items = validEntries.map((e) => ({ product: e.product._id, quantity: e.quantity }));
    await cart.save();
  }

  const priced = priceItems(validEntries);
  return {
    items: priced.items.map((item, index) => ({
      ...item,
      stock: validEntries[index].product.stock,
      maxQuantity: Math.min(99, validEntries[index].product.stock),
    })),
    itemsTotal: priced.itemsTotal,
    deliveryCharge: priced.deliveryCharge,
    totalAmount: priced.totalAmount,
    removed,
  };
};

/** GET /api/cart */
const getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  return res.json({ success: true, cart: await buildCartResponse(cart) });
});

/** POST /api/cart/items — adds to (or increments) a cart line. */
const addItem = asyncHandler(async (req, res) => {
  const { productId, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  if (!product.isAvailable || product.stock <= 0) throw ApiError.badRequest(`${product.name} is out of stock`);

  const cart = await getOrCreateCart(req.user._id);
  const line = cart.items.find((i) => i.product.toString() === product._id.toString());
  const nextQuantity = (line?.quantity || 0) + Number(quantity);

  if (nextQuantity > product.stock) {
    throw ApiError.badRequest(`Only ${product.stock} ${product.unit} of ${product.name} left in stock`);
  }

  if (line) line.quantity = nextQuantity;
  else cart.items.push({ product: product._id, quantity: Number(quantity) });

  await cart.save();
  return res.status(201).json({ success: true, cart: await buildCartResponse(cart) });
});

/** PATCH /api/cart/items/:productId — sets an absolute quantity. */
const updateItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const cart = await getOrCreateCart(req.user._id);
  const line = cart.items.find((i) => i.product.toString() === req.params.productId);
  if (!line) throw ApiError.notFound('That item is not in your cart');

  const product = await Product.findById(req.params.productId);
  if (!product) throw ApiError.notFound('Product not found');
  if (quantity > product.stock) {
    throw ApiError.badRequest(`Only ${product.stock} ${product.unit} of ${product.name} left in stock`);
  }

  line.quantity = Number(quantity);
  await cart.save();
  return res.json({ success: true, cart: await buildCartResponse(cart) });
});

/** DELETE /api/cart/items/:productId */
const removeItem = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = cart.items.filter((i) => i.product.toString() !== req.params.productId);
  await cart.save();
  return res.json({ success: true, cart: await buildCartResponse(cart) });
});

/** DELETE /api/cart */
const clearCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  cart.items = [];
  await cart.save();
  return res.json({ success: true, cart: await buildCartResponse(cart) });
});

/**
 * POST /api/cart/merge — folds a guest's local cart into the DB cart on login.
 * Quantities are taken as the larger of the two, capped at available stock.
 */
const mergeCart = asyncHandler(async (req, res) => {
  const incoming = Array.isArray(req.body.items) ? req.body.items : [];
  const cart = await getOrCreateCart(req.user._id);

  for (const entry of incoming) {
    // eslint-disable-next-line no-await-in-loop
    const product = await Product.findById(entry.productId);
    if (!product || !product.isAvailable || product.stock <= 0) continue;

    const quantity = Math.min(Math.max(1, Number(entry.quantity) || 1), product.stock);
    const line = cart.items.find((i) => i.product.toString() === product._id.toString());
    if (line) line.quantity = Math.min(Math.max(line.quantity, quantity), product.stock);
    else cart.items.push({ product: product._id, quantity });
  }

  await cart.save();
  return res.json({ success: true, cart: await buildCartResponse(cart) });
});

module.exports = { getCart, addItem, updateItem, removeItem, clearCart, mergeCart, getOrCreateCart, buildCartResponse };
