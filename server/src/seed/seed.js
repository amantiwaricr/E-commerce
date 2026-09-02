'use strict';

/**
 * Seeds the sample catalogue and an initial admin user.
 *
 *   npm run seed              # upsert products + admin
 *   npm run seed -- --fresh   # wipe products first
 *
 * The admin is created without a googleId placeholder collision: the account is
 * matched by email on first Google sign-in and linked automatically.
 */

const mongoose = require('mongoose');
const { env } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const Product = require('../models/Product');
const User = require('../models/User');

const products = require('./products.data');

const log = (...args) => console.log('[seed]', ...args); // eslint-disable-line no-console

const seedProducts = async ({ fresh }) => {
  if (fresh) {
    const { deletedCount } = await Product.deleteMany({});
    log(`removed ${deletedCount} existing products`);
  }

  let created = 0;
  let updated = 0;
  for (const data of products) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await Product.findOne({ name: data.name });
    if (existing) {
      Object.assign(existing, data);
      // eslint-disable-next-line no-await-in-loop
      await existing.save();
      updated += 1;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await Product.create(data);
      created += 1;
    }
  }
  log(`products: ${created} created, ${updated} updated`);
};

const seedAdmin = async () => {
  const email = env.seed.adminEmail.toLowerCase();
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      log(`promoted existing user ${email} to admin`);
    } else {
      log(`admin ${email} already exists`);
    }
    return;
  }

  await User.create({
    name: env.seed.adminName,
    email,
    // Placeholder: replaced with the real Google subject on first sign-in.
    googleId: `seed-admin:${email}`,
    role: 'admin',
  });
  log(`admin created: ${email} — sign in with this Gmail address to claim it`);
};

const run = async () => {
  const fresh = process.argv.includes('--fresh');
  await connectDB();
  log(`connected to ${mongoose.connection.name}`);

  await seedProducts({ fresh });
  await seedAdmin();

  await disconnectDB();
  log('done');
};

run().catch(async (err) => {
  console.error('[seed] failed:', err); // eslint-disable-line no-console
  await disconnectDB().catch(() => {});
  process.exit(1);
});
