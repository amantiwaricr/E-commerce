# Fresh Meat Nepal

A full-stack MERN e-commerce platform for selling fresh and processed meat in Nepal —
email + password accounts verified by a 4-digit emailed code, eSewa / card /
cash-on-delivery payments, order tracking, an admin panel, and automated email +
WhatsApp order notifications.

```
.
├── server/          Express + MongoDB REST API
│   ├── src/
│   │   ├── config/          env loading and validation, DB connection
│   │   ├── controllers/     auth, product, cart, order, payment, admin, upload
│   │   ├── middleware/      auth/RBAC, validation, sanitisation, errors, rate limits
│   │   ├── models/          User, Product, Cart, Order, Counter
│   │   ├── routes/          route tables + express-validator chains
│   │   ├── services/        eSewa, email, WhatsApp, notifications, pricing, templates
│   │   ├── seed/            sample catalogue + initial admin
│   │   └── utils/           order numbers, money, phone, sanitising, logging
│   ├── tests/       Jest + supertest suites
│   └── .env.example
└── client/          React 18 + Vite SPA (storefront + admin panel)
    ├── src/
    │   ├── api/             axios instance with auth + error normalising
    │   ├── components/      navbar, product card, timeline, route guards, toasts
    │   ├── context/         Auth, Cart, Toast providers
    │   ├── pages/           storefront pages
    │   └── pages/admin/     admin dashboard, products, orders, customers
    └── .env.example
```

---

## 1. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | `node -v` |
| npm | ≥ 9 | ships with Node |
| MongoDB | ≥ 6 | local install or a free MongoDB Atlas cluster |

You will also need, before going live:

- A **Google OAuth 2.0 Web client ID** (free)
- An **eSewa merchant account** (sandbox credentials are public and work out of the box)
- **SMTP credentials** for order emails (a Gmail App Password is enough)
- A **WhatsApp Business API** account — Meta Cloud API or Twilio (optional; disabled by default)

---

## 2. Install

```bash
git clone <your-repo-url> fresh-meat-nepal
cd fresh-meat-nepal

# installs both server/ and client/ dependencies
npm run install:all
```

---

## 3. Configure

### Quick path

```bash
npm run setup
```

Creates any missing `.env` file from its example, restores settings that an
existing file has lost (your current values are kept), keeps the three apps
pointed at the same API port, and prompts for the three values
that cannot be defaulted — your Google client ID (written to both files, since
they must match), the Gmail address that becomes the store admin, and the API
port. Re-run it any time; it edits values in place. It also takes flags for
non-interactive use:

```bash
npm run setup -- --google-client-id=123-abc.apps.googleusercontent.com --admin-email=me@gmail.com --port=5001
```

To configure by hand instead, follow the two sections below.

### Something not working?

```bash
npm run doctor
```

Checks the configuration that local development depends on — that both apps and
the API share one Google client ID, that the ports line up, that MongoDB is
reachable — and prints exactly what to change. Start here when Google sign-in
fails: a mismatched client ID between `client/.env` and `server/.env` fails
silently at Google and is the usual cause.

### Backend

```bash
cp server/.env.example server/.env
```

Then edit `server/.env`:

| Variable | What it is |
|---|---|
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/fresh-meat-nepal`, or your Atlas connection string |
| `JWT_SECRET` | A long random string — generate with `openssl rand -hex 48` |
| `GOOGLE_CLIENT_ID` | OAuth client ID from step 4 |
| `FRONTEND_URL` / `BACKEND_URL` | Public URLs; used for CORS, eSewa callbacks and tracking links |
| `ESEWA_*` | Payment settings — see step 5 |
| `SMTP_*`, `MAIL_FROM_*` | Order confirmation emails — see step 6 |
| `WHATSAPP_PROVIDER` + provider keys | WhatsApp notifications — see step 7 |
| `DELIVERY_CHARGE`, `FREE_DELIVERY_THRESHOLD` | Pricing rules applied at checkout |

### Frontend

```bash
cp client/.env.example client/.env
```

`VITE_GOOGLE_CLIENT_ID` **must** be the same client ID as the server's `GOOGLE_CLIENT_ID`,
and `VITE_API_URL` must point at the API (`http://localhost:5000/api` in development).

> Everything in `client/.env` is compiled into the browser bundle. Never put a secret there.

---

### Exploring without Google

Setting up OAuth takes a few minutes, and until it is done there is no way to
sign in at all. If `npm run setup` is run without a client ID it writes
`ENABLE_DEV_LOGIN=true` to `server/.env`, and the sign-in page offers
**"Continue without Google (development only)"**, which issues a session for the
seeded admin so checkout, order tracking and `/admin` all work.

That route is mounted only when `ENABLE_DEV_LOGIN=true` **and** `NODE_ENV` is not
`production`; a production build never renders the button and the endpoint
returns 404. Re-run `npm run setup` with a real client ID to switch it off and
use Google properly.

## 4. Accounts and email verification

There is no third-party sign-in. A customer registers with their own email address
and a password of their choosing, and the account stays inactive until they enter a
4-digit code sent to that address — which is what proves the address is real.

**The flow**

1. `POST /api/auth/register` creates the account with `isEmailVerified: false`,
   hashes the password with bcrypt, and emails a 4-digit code.
2. Signing in before verifying is refused with `403` and a flag the UI uses to
   open the code screen rather than dead-ending.
3. `POST /api/auth/verify-email` checks the code, activates the account and
   issues the session in one step, so the customer is signed in immediately.
4. `POST /api/auth/resend-code` issues a new code, no more than once a minute.

**How the code is protected.** Four digits is only 10,000 possibilities, so the
code is never the only defence: it is stored bcrypt-hashed (never in plain text),
expires after 10 minutes, is invalidated after 5 wrong attempts, is single-use,
and the endpoints are rate-limited per IP on top of the per-account attempt cap.

**Password rules.** At least 8 characters, not all digits, and not built from the
email name. Stored as a bcrypt hash with `select: false`, so it is excluded from
queries by default and can never be serialised into a response by accident.

**Without SMTP configured**, codes cannot be emailed — so outside production the
code is printed in the server terminal and shown on the verification screen,
which keeps local development usable. This never happens when `NODE_ENV=production`,
and never when SMTP is configured; there are tests for both.

A half-filled `SMTP_*` block counts as *not* configured. Placeholder values such
as `your-16-char-app-password` are recognised as unfilled, because a server that
believes it can send email will neither deliver a code nor show you one.

**The admin account** is created by `npm run seed` with `SEED_ADMIN_PASSWORD`
(or a generated password printed once), pre-verified, and signs in at the admin
panel with the same email and password.

## 5. eSewa setup (payments)

The integration uses **eSewa ePay v2**.

**Sandbox** works with no account at all — the defaults in `.env.example` are eSewa's public
test credentials:

```env
ESEWA_MODE=sandbox
ESEWA_MERCHANT_CODE=EPAYTEST
ESEWA_SECRET_KEY=8gBm/:&EnhH.1/q
```

Test logins for the sandbox wallet are published in
[eSewa's developer documentation](https://developer.esewa.com.np/).

**Production**: once eSewa issues your merchant code and secret,

```env
ESEWA_MODE=production
ESEWA_MERCHANT_CODE=your-merchant-code
ESEWA_SECRET_KEY=your-secret-key
```

Give eSewa these callback URLs (the server also sends them with every transaction):

- Success: `https://your-api-domain.com/api/payments/esewa/success`
- Failure: `https://your-api-domain.com/api/payments/esewa/failure`

**How a payment flows**

1. The customer checks out; the server creates the order (`pending` / `unpaid`), reserves stock,
   and generates a `transaction_uuid`.
2. The server returns the signed form fields — the HMAC-SHA256 signature is computed from
   `total_amount`, `transaction_uuid` and `product_code` using the merchant secret.
3. The browser POSTs that form to eSewa and the customer pays.
4. eSewa redirects back to the success URL with a base64 `data` payload. The server verifies
   its signature, **then calls eSewa's transaction-status API** and compares the confirmed
   amount against the order total.
5. Only if the status is `COMPLETE` and the amounts match is the order marked `paid` and
   `confirmed`, and the notifications sent. A replayed callback is a no-op.
6. A failed or abandoned payment cancels the order and returns the reserved stock.

**Card payments** are routed through eSewa's card gateway. Set `ESEWA_CARD_ENABLED=false` if
card processing is not enabled on your merchant account — the option is then greyed out at
checkout and rejected server-side.

---

## 6. Email setup

Order emails go out through Nodemailer over SMTP.

For Gmail:

1. Enable 2-Step Verification on the Google account.
2. Create an [App Password](https://myaccount.google.com/apppasswords).
3. Fill in:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=orders@yourdomain.com
SMTP_PASSWORD=the-16-character-app-password
MAIL_FROM_ADDRESS=orders@yourdomain.com
```

Any transactional provider (SendGrid, Mailgun, Amazon SES) works too — just point the SMTP
variables at it. If SMTP is left blank the app logs a warning and skips the email; orders are
never blocked by a notification failure.

---

## 7. WhatsApp setup

Set `WHATSAPP_PROVIDER` to `meta`, `twilio`, or `none` (the default — messages are skipped).

**Meta WhatsApp Cloud API**

```env
WHATSAPP_PROVIDER=meta
META_WHATSAPP_TOKEN=your-permanent-access-token
META_WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
```

Get both from Meta for Developers → your app → WhatsApp → API Setup. Note that Meta only
allows free-form text messages within 24 hours of a customer messaging you; outside that
window you must send an approved template.

**Twilio**

```env
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

Nepali numbers are normalised automatically: `9801234567`, `098-01234567` and `+977 9801234567`
all become `9779801234567`.

---

## 8. Seed the database

```bash
npm run seed              # upserts 12 sample products + the admin account
npm run seed -- --fresh   # wipes existing products first
```

The admin account is created from `SEED_ADMIN_EMAIL`. Sign in with **that same Gmail address**
and the seeded record is claimed and linked to your Google ID, keeping `role: "admin"`.

To promote an existing user by hand instead:

```js
// mongosh
use('fresh-meat-nepal');
db.users.updateOne({ email: 'you@gmail.com' }, { $set: { role: 'admin' } });
```

There are no schema migrations — Mongoose creates collections and indexes on first write.

---

## 9. Run

**Development** (API on :5000, SPA on :5173, both with hot reload):

If port 5000 is taken on your machine, change it in one place per package —
`PORT` and `BACKEND_URL` in `server/.env`, and `VITE_API_URL` in `client/.env`.
The Vite dev proxy follows `VITE_API_URL` automatically.

```bash
npm run dev
```

Or run them separately:

```bash
npm run dev:server
npm run dev:client
```

**Production**

```bash
npm run build                     # builds client/dist
NODE_ENV=production npm start     # serves the API
```

Deploy `client/dist` as static files (Netlify, Vercel, nginx, S3+CloudFront) and the API as a
Node service. In production the server refuses to boot without `JWT_SECRET`, `GOOGLE_CLIENT_ID`
and `MONGODB_URI`. Terminate TLS in front of the API, and for a cross-site deployment (SPA and
API on different domains) set:

```env
COOKIE_SAME_SITE=none
COOKIE_SECURE=true
```

Because the SPA uses client-side routing, configure your static host to rewrite unknown paths
to `index.html`.

---

## 10. Tests

```bash
npm test                  # from the repo root, or: npm test --prefix server
```

The suites cover the critical flows:

| File | Covers |
|---|---|
| `tests/auth.test.js` | Registration, verification, attempt limits, expiry, resend throttling, sign-in, RBAC |
| `tests/authvalidation.test.js` | Email and password rules, code format (no database needed) |
| `tests/otp.test.js` | Code generation, hashing, expiry, cooldown, and that codes are never echoed in production |
| `tests/order.test.js` | Cart pricing, checkout, stock reservation, cancellation, status transitions |
| `tests/payment.test.js` | eSewa callbacks, status verification, amount tampering, idempotency, retries |
| `tests/esewa.test.js` | Signature generation and callback signature verification |
| `tests/units.test.js` | Pricing rules, phone normalisation, input sanitising, notification templates |
| `tests/upload.test.js` | Admin image upload: storage, mimetype rejection, empty requests |
| `tests/catalogue.test.js` | Facets, tag and rating filters, favourites |
| `tests/devlogin.test.js` | Development login: disabled by default, refused in production, roles when enabled |

`esewa.test.js`, `units.test.js` and `upload.test.js` need nothing but Node. The other three need MongoDB:
by default `mongodb-memory-server` downloads and starts one automatically. On a machine that
cannot reach `fastdl.mongodb.org`, those suites **skip themselves with a warning** rather than
failing the run — point them at a real database instead:

```bash
# from the repo root (or from server/) — needs a MongoDB listening on that URI
MONGODB_TEST_URI=mongodb://127.0.0.1:27017/fmn-test npm test
```

No MongoDB installed? Start a throwaway one:

```bash
docker run -d --name fmn-mongo -p 27017:27017 mongo:7
```

If the URI cannot be reached the run says so and skips those suites rather than hanging.
On Windows PowerShell, set the variable first:

```powershell
$env:MONGODB_TEST_URI = "mongodb://127.0.0.1:27017/fmn-test"; npm test
```

---

## 11. API reference

Every response is JSON. Errors come back as
`{ "success": false, "message": "...", "errors": [{ "field", "message" }] }`.

### Auth
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create an account and send a verification code |
| POST | `/api/auth/verify-email` | Public | Confirm the 4-digit code; activates the account and signs in |
| POST | `/api/auth/resend-code` | Public | Send a new code (once per minute) |
| POST | `/api/auth/login` | Public | Sign in; refuses unverified accounts with `403` |
| POST | `/api/auth/change-password` | Customer | Change password, current one required |
| GET | `/api/auth/me` | Customer | Current user |
| PATCH | `/api/auth/me` | Customer | Update phone / saved addresses |
| POST | `/api/auth/logout` | Public | Clear the session cookie |

### Catalogue
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/products` | Public | List with `category`, `search`, `minPrice`, `maxPrice`, `minRating`, `tags`, `availability`, `sort`, `page` |
| GET | `/api/products/facets` | Public | Price bounds + histogram, tag counts, category counts, rating counts — everything the sidebar needs in one call |
| GET | `/api/products/categories` | Public | Categories with product counts |
| GET | `/api/products/:slug` | Public | Product detail |

### Favourites
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/favourites` | Customer | Saved products |
| POST | `/api/favourites/:productId` | Customer | Save (idempotent) |
| DELETE | `/api/favourites/:productId` | Customer | Unsave (idempotent) |

### Cart
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/cart` | Customer | Current cart, re-priced |
| POST | `/api/cart/items` | Customer | Add / increment an item |
| PATCH | `/api/cart/items/:productId` | Customer | Set an absolute quantity |
| DELETE | `/api/cart/items/:productId` | Customer | Remove a line |
| DELETE | `/api/cart` | Customer | Empty the cart |
| POST | `/api/cart/merge` | Customer | Fold a guest cart in after sign-in |

### Orders
| Method | Endpoint | Access | Description |
|---|---|---|---|
| POST | `/api/orders` | Customer | Place an order from the cart |
| GET | `/api/orders` | Customer | Order history |
| GET | `/api/orders/:orderNumber` | Customer | Order detail + tracking timeline |
| POST | `/api/orders/:orderNumber/cancel` | Customer | Cancel before dispatch |
| POST | `/api/orders/:orderNumber/pay` | Customer | Retry an abandoned online payment |

### Payments
| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/payments/methods` | Public | Enabled payment options |
| GET/POST | `/api/payments/esewa/success` | eSewa | Success callback → verifies and settles |
| GET/POST | `/api/payments/esewa/failure` | eSewa | Failure callback → cancels and releases stock |
| POST | `/api/payments/esewa/verify` | Public | Settle a payment from a client-captured callback |

### Admin (`role: "admin"` required)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/stats` | Dashboard metrics |
| GET/POST | `/api/admin/products` | List (incl. hidden) / create |
| GET/PATCH/DELETE | `/api/admin/products/:id` | Read / update / delete |
| PATCH | `/api/admin/products/:id/availability` | Publish or hide |
| POST | `/api/admin/uploads` | Upload up to 8 product images |
| GET | `/api/admin/orders` | Filter by status, payment, date, order number |
| GET | `/api/admin/orders/:orderNumber` | Order detail with customer |
| PATCH | `/api/admin/orders/:orderNumber/status` | Advance the status (notifies the customer) |
| PATCH | `/api/admin/orders/:orderNumber/tracking` | Carrier, code, ETA, timeline note |
| GET | `/api/admin/users` | List customers |
| PATCH | `/api/admin/users/:id/block` | Block / unblock |

---

## 12. Data model

**User** — `name`, `email` (unique, indexed), `passwordHash` (bcrypt, `select: false`),
`isEmailVerified`, `emailVerification{ codeHash, expiresAt, attempts, lastSentAt }`
(all `select: false`), `avatar`, `role` (`customer` \| `admin`), `phone`,
`addresses[]`, `favourites[]`, `isBlocked`, `lastLoginAt`, timestamps.

**Product** — `name`, `slug` (unique, indexed), `description`, `category`, `price`, `unit`,
`stock`, `images[]`, `isAvailable`, `tags[]`, `rating`, `reviewCount`, `isFeatured`, timestamps.
Text index on name/description/tags; compound index on `category + price`; index on `rating`.
A product rated 4.8+ earns the storefront's "Top item" flag; the featured one takes the hero tile.

**Cart** — `user` (unique), `items[{ product, quantity }]`.

**Order** — `orderNumber` (unique, indexed, `FMN-YYMM-NNNNN`), `user`, `items[]` (denormalised
so history survives product edits), `itemsTotal`, `deliveryCharge`, `totalAmount`,
`paymentMethod`, `deliveryMethod` (`standard` | `pickup` — pick-up carries no delivery charge),
`paymentStatus`, `payment{ transactionUuid, referenceId, paidAt, … }`,
`orderStatus`, `shippingAddress`, `trackingInfo{ carrier, trackingCode, estimatedDelivery,
timeline[] }`, `notifications`, timestamps.

Order statuses move `pending → confirmed → processing → shipped → delivered`, with
`cancelled` reachable from any non-terminal state. Illegal transitions are rejected.

---

## 13. Security notes

- Passwords are bcrypt-hashed (cost 12) and the hash is never selected into a response.
- A sign-in failure gives one message for a wrong password and an unknown address, so
  responses cannot be used to discover which addresses are registered.
- Sessions are JWTs delivered in an `httpOnly`, `sameSite` cookie (a `Bearer` header also works).
- All request bodies, params and queries are stripped of MongoDB operator keys before use.
- Every write endpoint is validated with `express-validator`; prices and totals are always
  recomputed server-side from the database, never trusted from the client.
- Stock is reserved with conditional atomic updates, so concurrent checkouts cannot oversell.
- eSewa callbacks are signature-verified **and** confirmed against eSewa's status API, with the
  paid amount compared to the order total before anything is marked paid.
- Rate limits apply globally, and more tightly to sign-in and order creation.
- `helmet`, `hpp` and an origin allowlist for CORS are enabled by default.
- Secrets live only in `.env`; production boots fail fast if a required one is missing.

---

## License

MIT
