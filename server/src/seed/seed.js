'use strict';

/**
 * Seeds the sample catalogue and an initial admin user.
 *
 *   npm run seed              # upsert products + admin
 *   npm run seed -- --fresh   # wipe products first
 *
 * The admin is matched by email, so re-seeding updates the existing record
 * rather than creating a second administrator.
 */

const crypto = require('crypto');
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
    let changed = false;
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      changed = true;
      log(`promoted existing user ${email} to admin`);
    }
    // A seeded admin is trusted, so it never has to verify its own address.
    if (!existing.isEmailVerified) {
      existing.isEmailVerified = true;
      changed = true;
    }
    if (changed) await existing.save();
    else log(`admin ${email} already exists`);
    return;
  }

  // Without a configured password, generate one and show it exactly once.
  const generated = !env.seed.adminPassword;
  const password = env.seed.adminPassword || crypto.randomBytes(9).toString('base64url');

  const admin = new User({
    name: env.seed.adminName,
    email,
    role: 'admin',
    isEmailVerified: true,
  });
  await admin.setPassword(password);
  await admin.save();

  log(`admin created: ${email}`);
  if (generated) {
    log(`  password: ${password}`);
    log('  (generated because SEED_ADMIN_PASSWORD is empty — save it now, it is not shown again)');
  } else {
    log('  password: the value of SEED_ADMIN_PASSWORD in server/.env');
  }
  log('  sign in at the admin panel: http://localhost:5174');
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
