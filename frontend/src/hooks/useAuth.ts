import { useState, useEffect, useCallback } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { Identity } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { ENABLE_E2E_TEST_BYPASS } from '../config/buildFlags.json';

/**
 * Maximum delegation lifetime: 30 minutes in nanoseconds.
 * Rationale: Short-lived delegations minimize the window of exposure if a client session
 * is left unattended on a voting or administrative workstation.
 *
 * Documented @dfinity/auth-client storage behavior:
 * By design, @dfinity/auth-client uses IdbStorage (IndexedDB database "auth-client-db",
 * object store "ic-keyval") to persist three keys across page reloads:
 *   1. "identity" — ECDSA P-256 session keypair (CryptoKeyPair or Ed25519 serialized key)
 *   2. "delegation" — Signed DelegationChain returned by Internet Identity
 *   3. "iv" — Initialization vector for storage encryption
 * Calling authClient.logout() deletes "identity" and "delegation" from IndexedDB.
 * No voter passphrase, plaintext ballot choice, or trustee secret share is ever passed to AuthClient.
 */
export const MAX_DELEGATION_TTL_NS = BigInt(30 * 60 * 1_000_000_000); // 30 minutes
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export interface AuthContextType {
  isAuthenticated: boolean;
  identity: Identity | null;
  principal: Principal | null;
  principalText: string;
  sessionExpired: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

function isDelegationValid(identity: Identity | null): boolean {
  if (!identity) return false;
  const maybeDelegation = identity as unknown as {
    getDelegation?: () => { delegations?: Array<{ delegation: { expiration: bigint } }> };
  };
  if (typeof maybeDelegation.getDelegation === 'function') {
    const chain = maybeDelegation.getDelegation();
    if (chain?.delegations && chain.delegations.length > 0) {
      const nowNs = BigInt(Date.now()) * 1_000_000n;
      for (const d of chain.delegations) {
        if (d.delegation.expiration <= nowNs) {
          return false;
        }
      }
    }
  }
  return true;
}

export function useAuth(): AuthContextType {
  const [authClient, setAuthClient] = useState<AuthClient | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const clearAuthState = useCallback(async (client: AuthClient | null, expired: boolean = false) => {
    if (client) {
      try {
        await client.logout();
      } catch {
        // Ignore logout storage error
      }
    }
    setIdentity(null);
    setPrincipal(null);
    setSessionExpired(expired);
  }, []);

  const initAuth = useCallback(async () => {
    try {
      if (ENABLE_E2E_TEST_BYPASS) {
        if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test_auth') === 'true') {
          const testPrincipal = Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai');
          setPrincipal(testPrincipal);
          setIsLoading(false);
          return;
        }
      }

      const client = await AuthClient.create({
        idleOptions: {
          idleTimeout: IDLE_TIMEOUT_MS,
          disableDefaultIdleCallback: true,
          onIdle: () => {
            clearAuthState(client, true);
          },
        },
      });
      setAuthClient(client);

      const isAuthed = await client.isAuthenticated();
      if (isAuthed) {
        const id = client.getIdentity();
        if (isDelegationValid(id) && !id.getPrincipal().isAnonymous()) {
          setIdentity(id);
          setPrincipal(id.getPrincipal());
          setSessionExpired(false);
        } else {
          await clearAuthState(client, true);
        }
      }
    } catch {
      // Safe fallback to unauthenticated state without leaking internal error details
    } finally {
      setIsLoading(false);
    }
  }, [clearAuthState]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Periodically check delegation expiration every 15 seconds while authenticated
  useEffect(() => {
    if (!authClient || !identity) return;
    const timer = setInterval(async () => {
      const stillAuthed = await authClient.isAuthenticated();
      if (!stillAuthed || !isDelegationValid(identity)) {
        await clearAuthState(authClient, true);
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [authClient, identity, clearAuthState]);

  const login = async () => {
    if (!authClient) return;

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const identityProvider = isLocal
      ? 'http://127.0.0.1:4943/?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai'
      : 'https://identity.ic0.app';

    await new Promise<void>((resolve, reject) => {
      authClient.login({
        identityProvider,
        maxTimeToLive: MAX_DELEGATION_TTL_NS,
        onSuccess: () => {
          const id = authClient.getIdentity();
          setIdentity(id);
          setPrincipal(id.getPrincipal());
          setSessionExpired(false);
          resolve();
        },
        onError: (err) => {
          reject(new Error(err || 'Internet Identity authentication failed'));
        },
      });
    });
  };

  const logout = async () => {
    await clearAuthState(authClient, false);
  };

  return {
    isAuthenticated: !!principal && !principal.isAnonymous(),
    identity,
    principal,
    principalText: principal ? principal.toText() : 'Anonymous',
    sessionExpired,
    login,
    logout,
    isLoading,
  };
}
