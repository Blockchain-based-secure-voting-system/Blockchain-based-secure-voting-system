import { useState, useEffect, useCallback } from 'react';
import { AuthClient } from '@dfinity/auth-client';
import { Identity } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';

export interface AuthContextType {
  isAuthenticated: boolean;
  identity: Identity | null;
  principal: Principal | null;
  principalText: string;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

export function useAuth(): AuthContextType {
  const [authClient, setAuthClient] = useState<AuthClient | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [principal, setPrincipal] = useState<Principal | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const initAuth = useCallback(async () => {
    try {
      const client = await AuthClient.create();
      setAuthClient(client);

      const isAuthed = await client.isAuthenticated();
      if (isAuthed) {
        const id = client.getIdentity();
        setIdentity(id);
        setPrincipal(id.getPrincipal());
      }
    } catch (err) {
      console.error('Failed to initialize Internet Identity AuthClient:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const login = async () => {
    if (!authClient) return;

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const identityProvider = isLocal
      ? `http://127.0.0.1:4943/?canisterId=rdmx6-jaaaa-aaaaa-aaadq-cai`
      : 'https://identity.ic0.app';

    await new Promise<void>((resolve, reject) => {
      authClient.login({
        identityProvider,
        maxTimeToLive: BigInt(8 * 60 * 60 * 1_000_000_000), // 8 hours in nanoseconds
        onSuccess: () => {
          const id = authClient.getIdentity();
          setIdentity(id);
          setPrincipal(id.getPrincipal());
          resolve();
        },
        onError: (err) => {
          console.error('Internet Identity login error:', err);
          reject(err);
        },
      });
    });
  };

  const logout = async () => {
    if (!authClient) return;
    await authClient.logout();
    setIdentity(null);
    setPrincipal(null);
  };

  return {
    isAuthenticated: !!identity && !principal?.isAnonymous(),
    identity,
    principal,
    principalText: principal ? principal.toText() : 'Anonymous',
    login,
    logout,
    isLoading,
  };
}
