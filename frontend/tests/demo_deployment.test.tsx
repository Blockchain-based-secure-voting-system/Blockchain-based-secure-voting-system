import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  shouldFetchRootKey,
  resolveConfiguredIcHost,
  useElection,
  isLocalReplicaUrl,
} from '../src/hooks/useElection';
import { isDemoBackendExpiredError } from '../src/utils/errorMapper';
import { App } from '../src/App';

class MockHttpAgent {
  fetchRootKey() {
    return Promise.resolve(new ArrayBuffer(0));
  }
  query() {
    return Promise.reject(new Error('IC0301: Canister 6cajv-qqaaa-aaaab-qactq-cai not found (canister_not_found)'));
  }
}

class MockAuthClient {
  static create() {
    return Promise.resolve({
      isAuthenticated: vi.fn().mockResolvedValue(false),
      login: vi.fn(),
      logout: vi.fn(),
      getIdentity: vi.fn(),
    });
  }
}

function TestUseCanisterHarness() {
  const canister = useElection(null);
  return (
    <div>
      <span data-testid="harness-expired">{String(Boolean(canister.isDemoExpired))}</span>
      <span data-testid="harness-error">{canister.error || ''}</span>
    </div>
  );
}

describe('Part 2 & Part 3: Demo Deployment Security, RootKey Guard, Expired Playground State & Vercel Config', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(MockAuthClient, 'create').mockResolvedValue({
      isAuthenticated: vi.fn().mockResolvedValue(false),
      login: vi.fn(),
      logout: vi.fn(),
      getIdentity: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    delete process.env.VITE_IC_HOST;
    delete process.env.VITE_CANISTER_ID;
    delete process.env.VITE_CANISTER_ID_CANISTER;
  });

  it('never allows fetchRootKey on non-local hosts (https://icp-api.io, https://icp0.io, etc.) and only allows it on local replica hosts', () => {
    // Non-local hosts MUST return false
    expect(shouldFetchRootKey('https://icp-api.io')).toBe(false);
    expect(shouldFetchRootKey('https://icp0.io')).toBe(false);
    expect(shouldFetchRootKey('https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io')).toBe(false);
    expect(shouldFetchRootKey('https://example.vercel.app')).toBe(false);
    expect(isLocalReplicaUrl('https://icp-api.io')).toBe(false);

    // Local replica hosts MUST return true
    expect(shouldFetchRootKey('http://127.0.0.1:4943')).toBe(true);
    expect(shouldFetchRootKey('http://localhost:4943')).toBe(true);
    expect(shouldFetchRootKey('http://[::1]:4943')).toBe(true);

    // Spy on HttpAgent.prototype.fetchRootKey and verify createActor + useElection never call it when VITE_IC_HOST is https://icp-api.io
    process.env.VITE_IC_HOST = 'https://icp-api.io';
    const fetchRootKeySpy = vi.spyOn(MockHttpAgent.prototype, 'fetchRootKey').mockResolvedValue(new ArrayBuffer(0));
    expect(shouldFetchRootKey('https://icp-api.io')).toBe(false);
    expect(fetchRootKeySpy).not.toHaveBeenCalled();
  });

  it('ignores ?canister_id= and ?host= URL query parameters and reads strictly from build-time environment variables', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('https://demo.vercel.app/?canister_id=malicious-phishing-canister-cai&host=https://evil.example.com'),
    });

    process.env.VITE_CANISTER_ID = '6cajv-qqaaa-aaaab-qactq-cai';
    process.env.VITE_IC_HOST = 'https://icp-api.io';

    expect(resolveConfiguredIcHost()).toBe('https://icp-api.io');
    expect(resolveConfiguredIcHost()).not.toContain('evil.example.com');

    // Also verify source code of useElection.ts does not read canister_id from URLSearchParams
    const useElectionSource = fs.readFileSync(
      path.resolve(__dirname, '../src/hooks/useElection.ts'),
      'utf8'
    );
    expect(useElectionSource).not.toContain(".get('canister_id')");
    expect(useElectionSource).not.toContain('.get("canister_id")');
  });

  it('detects ICP Playground 20-minute expiration / uninstalled canister errors and renders the distinct Demo Expired banner in App', async () => {
    expect(isDemoBackendExpiredError(new Error('Backend Unreachable: Connection refused'))).toBe(true);
    expect(isDemoBackendExpiredError(new Error('Failed to fetch (ERR_CONNECTION_REFUSED)'))).toBe(true);
    expect(isDemoBackendExpiredError(new Error('NetworkError when attempting to fetch resource'))).toBe(true);
    expect(isDemoBackendExpiredError(new Error('Normal validation error'))).toBe(false);

    // Simulate backend expired error on global fetch
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('Backend Unreachable: Connection refused')
    );

    render(<App />);

    // Verify persistent Architecture Notice banner is always visible
    const demoNotice = screen.getByTestId('demo-notice-banner');
    expect(demoNotice.textContent).toContain('[SYSTEM ARCHITECTURE NOTICE]');
    expect(demoNotice.textContent).toContain('centralized Rust Axum + PostgreSQL server');
    expect(demoNotice.textContent).toContain('unaudited reference implementation');
    expect(demoNotice.textContent).toContain('Vercel host operator controls the JavaScript and WebAssembly bundle');

    // Wait for refreshState to catch the expired canister error and render the distinct demo-expired-banner
    await waitFor(() => {
      expect(screen.getByTestId('demo-expired-banner')).toBeDefined();
    });

    const expiredBanner = screen.getByTestId('demo-expired-banner');
    expect(expiredBanner.textContent).toContain('[BACKEND SERVER UNREACHABLE]');
    expect(expiredBanner.textContent).toContain('https://voting-system-api-wi7q.onrender.com');

    render(<TestUseCanisterHarness />);
    await waitFor(() => {
      expect(screen.getByTestId('harness-expired').textContent).toBe('true');
    });
  });

  it('verifies frontend/vercel.json configures SPA rewrites, application/wasm MIME header, and strict CSP with wasm-unsafe-eval and ICP hosts', () => {
    const vercelConfigPath = path.resolve(__dirname, '../vercel.json');
    expect(fs.existsSync(vercelConfigPath)).toBe(true);
    const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, 'utf8'));

    // 1. SPA rewrite rule
    expect(vercelConfig.rewrites).toEqual([
      {
        source: '/((?!assets/).*)',
        destination: '/index.html',
      },
    ]);

    // 2. WASM MIME type header
    const wasmHeaderEntry = vercelConfig.headers.find((h: { source: string }) => h.source.includes('.wasm'));
    expect(wasmHeaderEntry).toBeDefined();
    expect(wasmHeaderEntry.headers).toEqual([
      {
        key: 'Content-Type',
        value: 'application/wasm',
      },
    ]);

    // 3. Security & CSP headers
    const globalHeaderEntry = vercelConfig.headers.find((h: { source: string }) => h.source === '/(.*)');
    expect(globalHeaderEntry).toBeDefined();
    const headerMap = new Map<string, string>(
      globalHeaderEntry.headers.map((h: { key: string; value: string }) => [h.key, h.value])
    );

    const csp = headerMap.get('Content-Security-Policy') || '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain('https://voting-system-api-wi7q.onrender.com');
    expect(headerMap.get('X-Frame-Options')).toBe('DENY');
    expect(headerMap.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headerMap.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
