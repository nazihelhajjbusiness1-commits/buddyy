import { defineConfig } from 'vite';
import { avatarkitVitePlugin } from '@spatius/avatarkit/vite';

export default defineConfig({
  plugins: [avatarkitVitePlugin()],
  server: {
    port: 5173,
    // Proxy API calls to the backend so the browser sees everything on one
    // origin (localhost:5173). This makes the auth cookie first-party, which
    // avoids Brave/Safari cross-site cookie blocking and removes the need for CORS.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        auth: 'auth.html',
      },
    },
  },
});
