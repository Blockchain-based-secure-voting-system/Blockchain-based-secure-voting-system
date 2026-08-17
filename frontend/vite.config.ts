import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
  },
  server: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      external: ['voting_crypto_wasm'],
    },
  },
  // @ts-ignore
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
