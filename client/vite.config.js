import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import fs from 'node:fs';
import path from 'node:path';

import { seoFiles } from './scripts/seo-files.js';

/**
 * Serves the dev server over HTTPS when a certificate is configured.
 *
 * Without this the site is on http:// however the API is served, so the
 * browser shows no padlock, `secure` cookies are never stored, and anything
 * that only happens over TLS cannot be tested locally. `npm run ssl:dev` at
 * the repo root generates a certificate and fills these in.
 */
const devHttps = (env) => {
  const key = env.SSL_KEY_PATH;
  const cert = env.SSL_CERT_PATH;
  if (!key || !cert) return undefined;

  const resolve = (file) => (path.isAbsolute(file) ? file : path.resolve(process.cwd(), file));
  const [keyPath, certPath] = [resolve(key), resolve(cert)];

  for (const [label, file] of [['SSL_KEY_PATH', keyPath], ['SSL_CERT_PATH', certPath]]) {
    if (!fs.existsSync(file)) {
      console.warn(`  ! ${label} points at ${file}, which does not exist — serving plain HTTP.`);
      console.warn('    Run `npm run ssl:dev` from the project root.');
      return undefined;
    }
  }

  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
};


/**
 * Serves /robots.txt and /sitemap.xml from the dev server.
 *
 * Vite serves the SPA's index.html for anything it does not recognise, so
 * without this an auditor asking for /robots.txt gets a page of HTML — which
 * reads as a broken robots.txt, not a missing one. Production gets the same two
 * files written into dist/ by the prerender step, from the same builder.
 */
const seoRoutes = (env) => ({
  name: 'fresh-meat-seo-routes',
  configureServer(server) {
    const siteUrl = () => {
      const address = server.httpServer?.address();
      if (env.VITE_SITE_URL) return env.VITE_SITE_URL;
      // Before anything is configured, describe the port actually being served.
      const scheme = server.config.server.https ? 'https' : 'http';
      return address ? `${scheme}://localhost:${address.port}` : 'http://localhost:5173';
    };

    server.middlewares.use(async (req, res, next) => {
      const route = (req.url || '').split('?')[0];
      if (route !== '/robots.txt' && route !== '/sitemap.xml') return next();

      const files = await seoFiles({ siteUrl: siteUrl(), apiUrl: env.VITE_API_URL });
      const xml = route === '/sitemap.xml';
      res.setHeader('Content-Type', xml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.statusCode = 200;
      return res.end(xml ? files.sitemap : files.robots);
    });
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // Derived from VITE_API_URL so changing the backend port is a single edit
  // in client/.env — nothing here needs touching.
  let apiOrigin = 'http://localhost:5000';
  try {
    apiOrigin = new URL(env.VITE_API_URL || 'http://localhost:5000/api').origin;
  } catch {
    // Malformed VITE_API_URL — fall back to the development default.
  }

  return {
    plugins: [react(), seoRoutes(env)],
    server: {
      port: 5173,
      https: devHttps(env),
      // Serves product images uploaded through the admin panel during development.
      proxy: {
        '/uploads': { target: apiOrigin, changeOrigin: true },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
