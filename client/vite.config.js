import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // Derived from VITE_API_URL so changing the backend port is a single edit
  // in client/.env — nothing here needs touching.
  let apiOrigin = 'http://localhost:5000';
  try {
    apiOrigin = new URL(env.VITE_API_URL || 'http://localhost:5000/api').origin;
  } catch {
    // Malformed VITE_API_URL — fall back to the development default.
  }

  return {
    plugins: [react()],
    server: {
      port: 5173,
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
