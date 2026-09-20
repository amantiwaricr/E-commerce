# Deploying Fresh Meat Nepal

Three things to put somewhere, plus a database:

| | what it is | where it goes |
|---|---|---|
| `server/` | Node API | a host that runs a process (Render, Railway, Fly, a VPS) |
| `client/dist` | static files | any static host, or nginx |
| `admin/dist` | static files | the same, but never indexed |
| MongoDB | the data | MongoDB Atlas, or a container on your own box |

Run `npm run predeploy` before every deployment. It reads the `.env` files the
build will use and refuses anything that only works locally — an example JWT
secret, a `localhost` database, a bundle with a development API address baked
into it. It exits non-zero, so CI can gate on it.

---

## 1. Decide whether the site and the API share a domain

This is the one decision that changes the configuration, so make it first.

**Same domain** — `freshmeatnepal.com` and `freshmeatnepal.com/api`. The
session cookie is first-party and simply works. `deploy/nginx.conf` is this
layout. Prefer it.

**Different domains** — `freshmeatnepal.com` and `api.freshmeatnepal.com`. The
cookie is now cross-site, so it needs `COOKIE_SAMESITE=none` *and*
`COOKIE_SECURE=true`, and browsers that block third-party cookies will drop it
anyway. `npm run predeploy` fails if you pick this without setting both.

---

## 2. The database

MongoDB Atlas has a free tier that is enough to start. Create a cluster, add a
database user, and allow your host's IP.

The connection string goes in `MONGODB_URI`. TLS is detected automatically from
an `mongodb+srv://` URL — see `server/src/utils/mongoTls.js`.

Do not expose MongoDB to the internet without authentication. An open instance
is found by scanners within hours, not weeks.

## 3. Secrets

```bash
# In server/.env, on the host — never in the repository.
JWT_SECRET=$(openssl rand -hex 48)     # or: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
npm run keys:txn                       # writes TXN_SIGNING_KEY; without it the API refuses to boot in production
```

Also set `SEED_ADMIN_EMAIL` and a long `SEED_ADMIN_PASSWORD`, run `npm run
seed` once, then **remove the password from the environment**. It exists to
create the first admin, not to sit next to the data it protects.

## 4. Public addresses

Set these before building. Vite bakes `VITE_*` values into the bundle, so a
value changed afterwards has no effect until you rebuild.

```ini
# server/.env
FRONTEND_URL=https://freshmeatnepal.com
BACKEND_URL=https://freshmeatnepal.com
ADMIN_URL=https://freshmeatnepal.com/admin
SITE_URL=https://freshmeatnepal.com
COOKIE_SECURE=true

# client/.env
VITE_API_URL=https://freshmeatnepal.com/api
VITE_SITE_URL=https://freshmeatnepal.com

# admin/.env
VITE_API_URL=https://freshmeatnepal.com/api
```

## 5. Build and check

```bash
npm run build       # client and admin, including the pre-render and sitemap
npm run predeploy   # must pass
```

## 6. Ship it

**One VPS, one domain** — the simplest thing that works:

```bash
docker compose -f deploy/docker-compose.yml --env-file server/.env up -d --build
sudo cp deploy/nginx.conf /etc/nginx/sites-available/freshmeatnepal
sudo ln -s /etc/nginx/sites-available/freshmeatnepal /etc/nginx/sites-enabled/
sudo rsync -a client/dist/ /var/www/fresh-meat-nepal/client/
sudo rsync -a admin/dist/  /var/www/fresh-meat-nepal/admin/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d freshmeatnepal.com -d www.freshmeatnepal.com
```

**A platform** — point it at `server/Dockerfile` (or set the build command to
`npm ci --omit=dev` and the start command to `npm start`, working directory
`server`). Put the two `dist` folders on any static host; `client/vercel.json`
and `client/public/_redirects` carry the routing and caching rules for Vercel
and Netlify respectively.

## 7. Afterwards

```bash
npm run doctor                                   # against the production .env
curl https://freshmeatnepal.com/api/health
curl https://freshmeatnepal.com/robots.txt       # must name the real domain
```

Then place one real order end to end and confirm the confirmation email
arrives. Nothing else tells you the SMTP credentials, the eSewa credentials and
the database are all correct at the same time.

---

## Free hosting, no domain

Vercel, Netlify and Render all give you a `*.vercel.app` / `*.netlify.app` /
`*.onrender.com` address with TLS, at no cost. The two front-ends deploy to
them as they are.

The API is the part that needs thought, for two reasons:

**Uploads do not survive.** Product photographs go through `multer` to
`server/uploads` on local disk. Serverless and free container tiers give you an
ephemeral filesystem, so an uploaded image disappears on the next deploy or
cold start. Either host the API somewhere with a real disk, or put images
somewhere else and paste their URLs — the admin product form accepts a URL as
well as a file, so this works today without code changes.

**Two free subdomains are not the same site.** `shop.vercel.app` and
`api.vercel.app` look related and are not: `vercel.app` is on the Public Suffix
List, so browsers treat every deployment under it as a separate site, and a
`SameSite=Lax` cookie is never sent between them. Sign-in still works, because
the API returns a token in the login response and the client sends it as an
`Authorization` header — but set `COOKIE_SAMESITE=none` and
`COOKIE_SECURE=true` if you want the cookie to work too. `npm run predeploy`
knows the difference and says which case you are in.

A workable free split:

| | where | why |
|---|---|---|
| storefront, admin | Vercel or Netlify | static, instant, free TLS |
| API | Render / Railway / Fly free tier | a real process, not a function |
| database | MongoDB Atlas free tier | 512 MB is plenty to start |
| images | paste URLs, or an object store | the free tiers have no durable disk |

Free API tiers usually sleep when idle, so the first request after a quiet
period takes a few seconds. That is fine for a demo and not fine for a shop
taking orders.

---

## Things that bite

**Pre-rendered routes must be served as themselves.** `npm run build` writes
`dist/shop/index.html` and ten others, each with its own title and canonical
URL, for crawlers that do not run JavaScript. A blanket "rewrite everything to
index.html" rule throws that away and gives every page the home page's
description.

In nginx that means `try_files $uri $uri/index.html /index.html` — not
`$uri/`, which answers `/shop` with a 301 to `/shop/` while the page itself
declares `/shop` as canonical.

**`X-Forwarded-Proto` is load-bearing.** The API reads it to know the visitor
arrived over TLS. Without it `req.secure` is false, the HTTPS redirect loops,
and `secure` cookies are never set. Every proxy in front of the API must send
it.

**`index.html` must not be cached.** Its asset URLs carry content hashes that
change on every deploy; a cached copy points at files that no longer exist, and
the site is blank for anyone holding one.

**eSewa stays in sandbox until you change it.** `ESEWA_MODE=sandbox` with
`EPAYTEST` takes no real money. `npm run predeploy` warns while it is set, and
fails if the mode is production while the credentials are still the published
test ones.
