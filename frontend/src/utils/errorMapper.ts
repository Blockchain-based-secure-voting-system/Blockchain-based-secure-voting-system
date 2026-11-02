import { CANISTER_ERROR_MAP } from '../content/errors';

/**
 * Detects whether a canister/replica error indicates that the temporary ICP Playground
 * demo backend has expired (20-minute TTL) or its WebAssembly module is not installed.
 */
export function isDemoBackendExpiredError(err: unknown): boolean {
  if (!err) return false;
  const raw = typeof err === 'string'
    ? err
    : err instanceof Error
      ? err.message
      : String(err);

  return /canister_not_found|DestinationInvalid|IC0301|IC0537|has no wasm module|code_uninstall|Canister .* not found|Wrong Network or Canister Not Deployed/i.test(
    raw
  );
}

/**
 * Maps raw canister, network, or WebAssembly errors to safe, user-facing messages.
 * Strips stack traces, raw hex dumps of secrets, and internal state details.
 */
export function mapToSafeErrorMessage(err: unknown, fallbackContext: string = 'Operation failed'): string {
  if (!err) {
    return `${fallbackContext}: An unknown error occurred.`;
  }

  const raw = typeof err === 'string'
    ? err
    : err instanceof Error
      ? err.message
      : String(err);

  // Strip multi-line stack traces and long hex dumps (> 24 hex characters)
  const firstLine = raw.split('\n')[0].trim();
  const sanitized = firstLine.replace(/(?:0x)?[0-9a-fA-F]{24,}/g, '[REDACTED_HEX]');

  // 1. Check canonical canister error vocabulary map (exact match or prefix match)
  if (CANISTER_ERROR_MAP[firstLine]) {
    return CANISTER_ERROR_MAP[firstLine];
  }
  for (const [key, mappedMessage] of Object.entries(CANISTER_ERROR_MAP)) {
    if (firstLine.includes(key)) {
      return mappedMessage;
    }
  }

  // 2. Map known network / replica / Wasm errors to clear, safe messages
  if (/fetch|network|ECONNREFUSED|ERR_CONNECTION_REFUSED|Failed to fetch|unreachable/i.test(firstLine)) {
    return 'Cannot reach the backend API server. Verify the server is running and retry.';
  }
  if (/Wrong Network|Canister Not Deployed|canister_not_found|DestinationInvalid|IC0301|IC0537|has no wasm module|code_uninstall|Canister .* not found/i.test(firstLine)) {
    return 'Wrong Network or Canister Not Deployed: The configured Canister ID was not found or the temporary ICP Playground backend (20-minute TTL) has expired. Run ./scripts/deploy_demo.sh or dfx deploy canister to redeploy.';
  }
  if (/delegation.*expired|session.*expired|Invalid signature.*expiry/i.test(firstLine)) {
    return 'Your Internet Identity session has expired. Please sign in again to continue.';
  }
  if (/Double-vote detected|nullifier.*already/i.test(firstLine)) {
    return 'Double-vote prevented: A ballot with this nullifier has already been recorded on-chain.';
  }
  if (/not registered|unregistered|voter.*not.*eligible/i.test(firstLine)) {
    return 'Voter authorization rejected: Your Principal ID is not on the registered voter list.';
  }
  if (/only.*admin|unauthorized|caller is not admin/i.test(firstLine)) {
    return 'Authorization denied: Only the configured Election Administrator Principal can perform this action.';
  }
  if (/invalid.*phase|wrong phase|phase.*must be/i.test(firstLine)) {
    return 'Action not permitted in the current election lifecycle phase.';
  }
  if (/range proof|ZK range proof/i.test(firstLine)) {
    return 'Cryptographic range proof verification failed. Ballot could not be verified as a valid 0 or 1 choice.';
  }
  if (/Chaum-Pedersen|decryption proof/i.test(firstLine)) {
    return 'Chaum-Pedersen zero-knowledge decryption proof verification failed.';
  }
  if (/Invalid master public key/i.test(firstLine)) {
    return 'Invalid Trustee Master Public Key format.';
  }
  if (/Invalid secret key|Failed to parse shares|Failed to combine threshold shares/i.test(firstLine)) {
    return 'Failed to reconstruct threshold key: Ensure at least n valid trustee shares were provided.';
  }
  if (/discrete log/i.test(firstLine)) {
    return 'Failed to solve discrete logarithm for tally within the specified bound. Check trustee shares or tally bound.';
  }
  if (/WebAssembly|voting_crypto_wasm/i.test(firstLine)) {
    return 'Cryptographic WebAssembly module failed to initialize.';
  }

  // Ensure no stack frames or internal paths leak
  if (/at\s+\S+\s*\(|file:\/\/|node_modules|wasm-bindgen/i.test(sanitized)) {
    return `${fallbackContext}: Internal processing error.`;
  }

  // Cap length to avoid dumping internal structures
  const bounded = sanitized.length > 160 ? `${sanitized.slice(0, 157)}...` : sanitized;
  return bounded || `${fallbackContext}.`;
}
