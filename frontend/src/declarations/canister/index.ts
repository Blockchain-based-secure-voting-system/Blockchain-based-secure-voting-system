import { Actor, HttpAgent, ActorSubclass } from '@dfinity/agent';
import { idlFactory } from './canister.did.js';
import type { _SERVICE } from './canister.did.d.ts';

const envMeta = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};

export const canisterId =
  envMeta.VITE_CANISTER_ID ||
  envMeta.VITE_CANISTER_ID_CANISTER ||
  (typeof process !== 'undefined' && (process?.env?.VITE_CANISTER_ID || process?.env?.CANISTER_ID_CANISTER)) ||
  'bkyz2-fmaaa-aaaaa-qaaaq-cai';

export interface CreateActorOptions {
  agentOptions?: Parameters<typeof HttpAgent.createSync>[0];
  actorOptions?: Parameters<typeof Actor.createActor>[1];
  agent?: HttpAgent;
}

export function isLocalReplicaUrl(hostUrl: string): boolean {
  try {
    const parsed = new URL(hostUrl);
    return (
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === 'localhost' ||
      parsed.hostname === '::1' ||
      parsed.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

export const createActor = (
  canId: string = canisterId,
  options: CreateActorOptions = {}
): ActorSubclass<_SERVICE> => {
  const configuredHost =
    envMeta.VITE_IC_HOST ||
    (typeof process !== 'undefined' && process?.env?.VITE_IC_HOST) ||
    undefined;

  const isLocalWindow =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const host = configuredHost || (isLocalWindow ? 'http://127.0.0.1:4943' : 'https://icp-api.io');

  const agent = options.agent || new HttpAgent({ host, ...options.agentOptions });

  if (!options.agent && isLocalReplicaUrl(host)) {
    agent.fetchRootKey().catch((err) => {
      console.warn('Unable to fetch root key. Check if local replica is running:', err);
    });
  }

  return Actor.createActor<_SERVICE>(idlFactory, {
    agent,
    canisterId: canId,
    ...options.actorOptions,
  });
};
