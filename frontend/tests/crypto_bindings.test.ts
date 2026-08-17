import { describe, it, expect } from 'vitest';
import { idlFactory } from '../src/declarations/canister/canister.did.js';

describe('Frontend Candid IDL Definition & Interface Compatibility', () => {
  it('should initialize canister IDL factory correctly', () => {
    const mockIDL: any = {
      Variant: (types: any) => ({ type: 'variant', types }),
      Record: (fields: any) => ({ type: 'record', fields }),
      Vec: (item: any) => ({ type: 'vec', item }),
      Opt: (item: any) => ({ type: 'opt', item }),
      Text: 'text',
      Nat64: 'nat64',
      Nat8: 'nat8',
      Bool: 'bool',
      Principal: 'principal',
      Null: null,
      Func: (args: any, ret: any, modes: any) => ({ args, ret, modes }),
      Service: (methods: any) => ({ type: 'service', methods }),
    };

    const service = idlFactory({ IDL: mockIDL });
    expect(service).toBeDefined();
    expect(service.type).toBe('service');
    expect(service.methods).toHaveProperty('create_election');
    expect(service.methods).toHaveProperty('register_voters');
    expect(service.methods).toHaveProperty('open_voting');
    expect(service.methods).toHaveProperty('cast_ballot');
    expect(service.methods).toHaveProperty('close_voting');
    expect(service.methods).toHaveProperty('submit_decryption_proof');
    expect(service.methods).toHaveProperty('get_election_details');
    expect(service.methods).toHaveProperty('get_encrypted_tally');
  });
});
