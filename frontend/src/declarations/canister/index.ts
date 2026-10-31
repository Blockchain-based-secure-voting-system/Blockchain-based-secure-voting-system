import { Actor, HttpAgent, ActorSubclass } from '@dfinity/agent';
import { idlFactory } from './canister.did.js';
import type { _SERVICE } from './canister.did.d.ts';

export const canisterId =
  (typeof process !== 'undefined' && process?.env?.CANISTER_ID_CANISTER) ||
  'bkyz2-fmaaa-aaaaa-qaaaq-cai';

export interface CreateActorOptions {
  agentOptions?: Parameters<typeof HttpAgent.createSync>[0];
  actorOptions?: Parameters<typeof Actor.createActor>[1];
  agent?: HttpAgent;
}

export const createActor = (
  canId: string = canisterId,
  options: CreateActorOptions = {}
): ActorSubclass<_SERVICE> => {
  const host = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:4943'
    : 'https://icp0.io';

  const agent = options.agent || new HttpAgent({ host, ...options.agentOptions });

  if (host.includes('127.0.0.1') || host.includes('localhost')) {
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
