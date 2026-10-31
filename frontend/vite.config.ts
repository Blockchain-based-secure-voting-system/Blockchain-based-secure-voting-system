import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isE2E = mode === 'e2e';
  return {
    plugins: [
      react(),
      {
        name: 'e2e-build-flags',
        transform(code, id) {
          if (id.endsWith('buildFlags.json')) {
            return {
              code: `export const ENABLE_E2E_TEST_BYPASS = ${isE2E ? 'true' : 'false'}; export default { ENABLE_E2E_TEST_BYPASS: ${isE2E ? 'true' : 'false'} };`,
              map: null,
            };
          }
        },
      },
    ],
    define: {
      'process.env': {},
    },
    server: {
      port: 3000,
      headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' http://127.0.0.1:4943 http://localhost:4943 https://icp0.io https://*.icp0.io https://icp-api.io https://identity.ic0.app; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      },
    },
    preview: {
      port: 3000,
      headers: {
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' http://127.0.0.1:4943 http://localhost:4943 https://icp0.io https://*.icp0.io https://icp-api.io https://identity.ic0.app; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      },
    },
    build: {
      outDir: isE2E ? 'dist-e2e' : 'dist',
    },
    // @ts-ignore
    test: {
      globals: true,
      environment: 'jsdom',
      pool: 'threads',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    },
  };
});

