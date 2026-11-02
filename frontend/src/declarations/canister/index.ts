import type { _SERVICE } from './canister.did.d.ts';

const envMeta = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env) || {};

export const canisterId =
  (typeof process !== 'undefined' && (process?.env?.VITE_CANISTER_ID || process?.env?.CANISTER_ID_CANISTER)) ||
  envMeta.VITE_CANISTER_ID ||
  envMeta.VITE_CANISTER_ID_CANISTER ||
  'bkyz2-fmaaa-aaaaa-qaaaq-cai';

export interface CreateActorOptions {
  agentOptions?: Record<string, unknown>;
  actorOptions?: Record<string, unknown>;
  agent?: unknown;
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
  _canId: string = canisterId,
  _options: CreateActorOptions = {}
): _SERVICE => {
  return {} as _SERVICE;
};
