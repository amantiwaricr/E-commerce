import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

import fs from 'node:fs';
import path from 'node:path';

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


export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  let apiOrigin = 'http://localhost:5000';
  try {
    apiOrigin = new URL(env.VITE_API_URL || 'http://localhost:5000/api').origin;
  } catch {
    // Malformed VITE_API_URL — fall back to the development default.
  }

  return {
    plugins: [react()],
    server: {
      // The storefront owns 5173; the admin panel runs alongside it.
      port: 5174,
      https: devHttps(env),
      proxy: {
        '/uploads': { target: apiOrigin, changeOrigin: true },
      },
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
