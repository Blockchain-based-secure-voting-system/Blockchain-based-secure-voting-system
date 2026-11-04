import { describe, it, expect } from 'vitest';
import { defaultApiClient, ElectionApiClient } from '../src/api/client';

describe('Centralized REST API Client & Cryptographic Interface Compatibility', () => {
  it('should initialize ElectionApiClient and expose all core voting methods', () => {
    expect(defaultApiClient).toBeDefined();
    expect(defaultApiClient).toBeInstanceOf(ElectionApiClient);
    expect(typeof defaultApiClient.getElection).toBe('function');
    expect(typeof defaultApiClient.getEncryptedTally).toBe('function');
    expect(typeof defaultApiClient.voterLogin).toBe('function');
    expect(typeof defaultApiClient.castBallot).toBe('function');
    expect(typeof defaultApiClient.getBulletin).toBe('function');
    expect(typeof defaultApiClient.hasNullifierBeenUsed).toBe('function');
    expect(typeof defaultApiClient.createElection).toBe('function');
    expect(typeof defaultApiClient.issueCredentials).toBe('function');
    expect(typeof defaultApiClient.openVoting).toBe('function');
    expect(typeof defaultApiClient.closeVoting).toBe('function');
    expect(typeof defaultApiClient.finalizeTally).toBe('function');
  });
});
