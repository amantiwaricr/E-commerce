import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

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
      proxy: {
        '/uploads': { target: apiOrigin, changeOrigin: true },
      },
    },
    build: { outDir: 'dist', sourcemap: false },
  };
});
