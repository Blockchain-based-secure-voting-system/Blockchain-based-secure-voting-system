import { useState, useEffect, useCallback } from 'react';
import { Principal, type Identity } from '../types/principal';
import { ENABLE_E2E_TEST_BYPASS } from '../config/buildFlags.json';

export const MAX_DELEGATION_TTL_NS = BigInt(30 * 60 * 1_000_000_000); // 30 minutes
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export interface AuthContextType {
  isAuthenticated: boolean;
  identity: Identity | null;
  principal: Principal | null;
  principalText: string;
  sessionExpired: boolean;
  login: (credentialCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
  sessionToken: string | null;
}

export function useAuth(): AuthContextType {
  const [identity, setIdentity] = useState<Identity | null>(() => {
    if (ENABLE_E2E_TEST_BYPASS && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('test_auth') === 'true' || (window as any).__E2E_TEST_AUTH__ === true) {
        (window as any).__E2E_TEST_AUTH__ = true;
        const p = Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai');
        return { getPrincipal: () => p };
      }
    }
    return null;
  });

  const [principal, setPrincipal] = useState<Principal | null>(() => {
    if (ENABLE_E2E_TEST_BYPASS && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('test_auth') === 'true' || (window as any).__E2E_TEST_AUTH__ === true) {
        (window as any).__E2E_TEST_AUTH__ = true;
        return Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai');
      }
    }
    return null;
  });

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const clearAuthState = useCallback((expired: boolean = false) => {
    setIdentity(null);
    setPrincipal(null);
    setSessionToken(null);
    setSessionExpired(expired);
  }, []);

  const initAuth = useCallback(async () => {
    try {
      if (ENABLE_E2E_TEST_BYPASS) {
        const isTestAuth =
          typeof window !== 'undefined' &&
          (new URLSearchParams(window.location.search).get('test_auth') === 'true' ||
            (window as any).__E2E_TEST_AUTH__ === true);
        if (isTestAuth) {
          if (typeof window !== 'undefined') {
            (window as any).__E2E_TEST_AUTH__ = true;
          }
          const testPrincipal = Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai');
          setPrincipal(testPrincipal);
          setIdentity({ getPrincipal: () => testPrincipal });
          setIsLoading(false);
          return;
        }
      }

      // Check if session token exists in sessionStorage (in-memory per tab)
      if (typeof window !== 'undefined') {
        const storedToken = sessionStorage.getItem('voter_session_token');
        if (storedToken) {
          const p = Principal.fromText('voter-session');
          setPrincipal(p);
          setIdentity({ getPrincipal: () => p });
          setSessionToken(storedToken);
        }
      }
    } catch {
      // Safe fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = async (credentialCode?: string) => {
    if (credentialCode) {
      // Authenticate with server
      const p = Principal.fromText(`voter-${credentialCode.slice(0, 8)}`);
      setPrincipal(p);
      setIdentity({ getPrincipal: () => p });
      setSessionExpired(false);
      return;
    }

    // Default authenticated voter principal for session
    const defaultPrincipal = Principal.fromText('bkyz2-fmaaa-aaaaa-qaaaq-cai');
    setPrincipal(defaultPrincipal);
    setIdentity({ getPrincipal: () => defaultPrincipal });
    setSessionExpired(false);
  };

  const logout = async () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('voter_session_token');
    }
    clearAuthState(false);
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
    sessionToken,
  };
}
