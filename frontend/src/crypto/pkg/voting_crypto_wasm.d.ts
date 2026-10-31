/* tslint:disable */
/* eslint-disable */

export function combine_threshold_shares_wasm(shares_js: any): string;

export function decrypt_and_prove_tally_wasm(sk_hex: string, c1_sum_hex: string, c2_sum_hex: string, max_bound: bigint): any;

export function generate_threshold_trustee_keys(threshold: bigint, total_shares: bigint): any;

export function generate_voter_ballot(master_pk_hex: string, voter_secret_hex: string, election_id: string, vote: number): any;

export function verify_ballot_range_proof(master_pk_hex: string, c1_hex: string, c2_hex: string, range_proof_js: any): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly combine_threshold_shares_wasm: (a: any) => [number, number, number, number];
    readonly decrypt_and_prove_tally_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: bigint) => [number, number, number];
    readonly generate_threshold_trustee_keys: (a: bigint, b: bigint) => [number, number, number];
    readonly generate_voter_ballot: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly verify_ballot_range_proof: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
