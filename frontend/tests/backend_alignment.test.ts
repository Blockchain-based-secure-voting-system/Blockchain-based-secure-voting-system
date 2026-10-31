import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PHASE_VOCABULARY,
  CANISTER_ERROR_MAP,
  formatCanisterTime,
  isVotingDeadlineExpiredButPhaseOpen,
} from '../src/content/errors';
import { mapToSafeErrorMessage } from '../src/utils/errorMapper';
import { idlFactory } from '../src/declarations/canister/canister.did.js';
import { IDL } from '@dfinity/candid';

const ROOT_DIR = path.resolve(__dirname, '../..');
const CANISTER_DID_PATH = path.join(ROOT_DIR, 'canister/canister.did');
const CANISTER_RS_PATH = path.join(ROOT_DIR, 'canister/src/lib.rs');
const DECL_DID_PATH = path.join(ROOT_DIR, 'frontend/src/declarations/canister/canister.did');
const DECL_DTS_PATH = path.join(ROOT_DIR, 'frontend/src/declarations/canister/canister.did.d.ts');
const USE_CANISTER_PATH = path.join(ROOT_DIR, 'frontend/src/hooks/useCanister.ts');

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

describe('Part 1: Backend Alignment, Candid Contract & Error Vocabulary Suite', () => {
  it('verifies canister/canister.did and frontend/src/declarations/canister/canister.did are byte-for-byte identical', () => {
    const backendDid = fs.readFileSync(CANISTER_DID_PATH, 'utf8').replace(/\r\n/g, '\n').trim();
    const frontendDid = fs.readFileSync(DECL_DID_PATH, 'utf8').replace(/\r\n/g, '\n').trim();
    expect(frontendDid).toBe(backendDid);
  });

  it('enumerates every method in canister/canister.did and verifies matching signatures in canister.did.d.ts, idlFactory, and useCanister.ts', () => {
    const didSource = fs.readFileSync(CANISTER_DID_PATH, 'utf8');
    const dtsSource = fs.readFileSync(DECL_DTS_PATH, 'utf8');
    const useCanisterSource = fs.readFileSync(USE_CANISTER_PATH, 'utf8');

    // Extract service block from canister/canister.did
    const serviceMatch = didSource.match(/service\s*:\s*\{([\s\S]*?)\}/);
    expect(serviceMatch).not.toBeNull();
    const serviceBody = serviceMatch![1];

    // Parse each method line: name : (args) -> (ret) [query];
    const methodRegex = /([a-z_]+)\s*:\s*\(([^)]*)\)\s*->\s*\(([^)]*)\)(\s+query)?\s*;/g;
    const parsedMethods: Array<{
      name: string;
      args: string;
      ret: string;
      isQuery: boolean;
    }> = [];

    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(serviceBody)) !== null) {
      parsedMethods.push({
        name: match[1].trim(),
        args: match[2].trim(),
        ret: match[3].trim(),
        isQuery: Boolean(match[4]),
      });
    }

    expect(parsedMethods.length).toBe(10);

    // Build runtime service from idlFactory
    const runtimeService = idlFactory({ IDL }) as unknown as { _fields: Array<[string, IDL.FuncClass]> };
    const runtimeMethodMap = new Map<string, IDL.FuncClass>(runtimeService._fields);

    for (const method of parsedMethods) {
      // 1. Check canister.did.d.ts _SERVICE interface has exact method signature
      const dtsMethodRegex = new RegExp(`'${method.name}'\\s*:\\s*ActorMethod<\\[([\\s\\S]*?)\\],\\s*([^>]+)>`);
      const dtsMatch = dtsSource.match(dtsMethodRegex);
      expect(
        dtsMatch,
        `Missing or mismatched ActorMethod for '${method.name}' in canister.did.d.ts`
      ).not.toBeNull();

      // Verify argument count matches between .did and .d.ts
      const didArgCount = method.args === '' ? 0 : method.args.split(',').length;
      const dtsArgsRaw = dtsMatch![1].trim();
      const dtsArgCount = dtsArgsRaw === '' ? 0 : dtsArgsRaw.split(',').length;
      expect(dtsArgCount, `Argument count mismatch for ${method.name} in canister.did.d.ts`).toBe(didArgCount);

      // Verify return type correspondence between .did and .d.ts
      const dtsRet = dtsMatch![2].trim();
      if (method.ret.startsWith('Result')) {
        expect(dtsRet, `Return type for ${method.name} in canister.did.d.ts must be a Result_* variant`).toMatch(/^Result/);
      } else if (method.ret === 'bool') {
        expect(dtsRet, `Return type for ${method.name} in canister.did.d.ts must be boolean`).toBe('boolean');
      } else {
        expect(dtsRet, `Return type for ${method.name} in canister.did.d.ts must match ${method.ret}`).toBe(method.ret);
      }

      // 2. Check idlFactory runtime definition
      const idlFunc = runtimeMethodMap.get(method.name);
      expect(idlFunc, `Missing '${method.name}' in canister.did.js idlFactory`).toBeDefined();
      expect(idlFunc!.argTypes.length, `idlFactory arg count mismatch for ${method.name}`).toBe(didArgCount);
      if (method.isQuery) {
        expect(idlFunc!.annotations).toContain('query');
      } else {
        expect(idlFunc!.annotations).not.toContain('query');
      }

      // 3. Check useCanister.ts exposes camelCase typed wrapper and calls actor.<method.name>
      const camelName = snakeToCamel(method.name);
      expect(
        useCanisterSource,
        `useCanister.ts must declare '${camelName}' in UseCanisterReturn`
      ).toMatch(new RegExp(`\\b${camelName}\\s*:`));
      expect(
        useCanisterSource,
        `useCanister.ts must call 'actor.${method.name}('`
      ).toContain(`actor.${method.name}(`);
    }
  });

  it('verifies every ElectionPhase and every Err(...) string in canister/src/lib.rs is covered in frontend/src/content/errors.ts', () => {
    const rustSource = fs.readFileSync(CANISTER_RS_PATH, 'utf8');

    // 1. Check ElectionPhase variants
    const phaseEnumMatch = rustSource.match(/pub enum ElectionPhase\s*\{([\s\S]*?)\}/);
    expect(phaseEnumMatch).not.toBeNull();
    const phaseVariants = phaseEnumMatch![1]
      .split(',')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter(Boolean);

    expect(phaseVariants).toEqual(['Setup', 'Voting', 'Tallying', 'Complete']);
    for (const phase of phaseVariants) {
      expect(
        PHASE_VOCABULARY[phase as keyof typeof PHASE_VOCABULARY],
        `Missing ElectionPhase '${phase}' in PHASE_VOCABULARY`
      ).toBeDefined();
    }

    // 2. Extract only canister logic (before #[cfg(test)])
    const prodRustSource = rustSource.split('#[cfg(test)]')[0];

    // Extract return Err("...".to_string()) and format!("...", ...) inside Err / map_err
    const extractedErrors = new Set<string>();

    const literalErrRegex = /return\s+Err\(\s*"([^"]+)"\.to_string\(\)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = literalErrRegex.exec(prodRustSource)) !== null) {
      extractedErrors.add(m[1]);
    }

    const formatErrRegex = /(?:return\s+Err\(|map_err\(\|e\|\s*\{?\s*)format!\(\s*"([^"{]+)/g;
    while ((m = formatErrRegex.exec(prodRustSource)) !== null) {
      extractedErrors.add(m[1].replace(/\s*\($/, '').trim());
    }

    expect(extractedErrors.size).toBe(20);

    for (const errKey of extractedErrors) {
      expect(
        CANISTER_ERROR_MAP[errKey],
        `Canister error string "${errKey}" in canister/src/lib.rs is missing from CANISTER_ERROR_MAP in frontend/src/content/errors.ts`
      ).toBeDefined();
      expect(CANISTER_ERROR_MAP[errKey].length).toBeGreaterThan(15);

      // Also verify mapToSafeErrorMessage maps it to the exact vocabulary message
      const mapped = mapToSafeErrorMessage(new Error(`${errKey} sample detail`));
      expect(mapped).toBe(CANISTER_ERROR_MAP[errKey]);
    }
  });

  it('formats nanosecond and second canister timestamps in local time with UTC details and detects expired voting windows', () => {
    // 2026-10-31T12:00:00Z in nanoseconds
    const nsTimestamp = 1793448000n * 1_000_000_000n;
    const formatted = formatCanisterTime(nsTimestamp);
    expect(formatted.isSet).toBe(true);
    expect(formatted.utcFormatted).toBe('2026-10-31 12:00:00 UTC');
    expect(formatted.localFormatted.length).toBeGreaterThan(5);

    const zeroFormatted = formatCanisterTime(0n);
    expect(zeroFormatted.isSet).toBe(false);
    expect(zeroFormatted.localFormatted).toContain('No time limit configured');

    // Expired deadline while phase is still Voting
    const pastEndNs = BigInt(Date.now() - 60_000) * 1_000_000n;
    const futureEndNs = BigInt(Date.now() + 60_000) * 1_000_000n;

    expect(isVotingDeadlineExpiredButPhaseOpen({ Voting: null }, pastEndNs)).toBe(true);
    expect(isVotingDeadlineExpiredButPhaseOpen({ Voting: null }, futureEndNs)).toBe(false);
    expect(isVotingDeadlineExpiredButPhaseOpen({ Tallying: null }, pastEndNs)).toBe(false);
    expect(isVotingDeadlineExpiredButPhaseOpen({ Setup: null }, pastEndNs)).toBe(false);
  });
});
