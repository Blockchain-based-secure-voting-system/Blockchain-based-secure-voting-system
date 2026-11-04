import type { ElectionPhase } from '../types/election';

/**
 * Single source of truth mapping every election ElectionPhase variant and
 * every exact backend error string (from crates/server/src/handlers.rs) to clear,
 * plain-language user-facing explanations.
 */
export type ServerPhaseKey = 'Setup' | 'Voting' | 'Tallying' | 'Complete';

export interface PhaseDescription {
  key: ServerPhaseKey;
  badgeLabel: string;
  plainTitle: string;
  whatYouCanDoNow: string;
  whatHappensNext: string;
  whyVoterDisabled?: string;
  whyTrusteeDisabled?: string;
}

export const PHASE_VOCABULARY: Record<ServerPhaseKey, PhaseDescription> = {
  Setup: {
    key: 'Setup',
    badgeLabel: 'Phase 1: Setup',
    plainTitle: 'Election Setup and Voter Registration',
    whatYouCanDoNow: 'The election administrator configures the election title, sets the Trustee Master Public Key, and adds eligible voter Principal IDs to the registry.',
    whatHappensNext: 'Once all eligible voters are registered, the administrator opens the Voting phase.',
    whyVoterDisabled: 'Ballot casting is disabled because the election is still in the Setup phase. Wait for the administrator to open voting.',
    whyTrusteeDisabled: 'Threshold tally decryption is disabled because voting has not started or closed yet. Decryption only occurs in the Tallying phase.',
  },
  Voting: {
    key: 'Voting',
    badgeLabel: 'Phase 2: Voting Open',
    plainTitle: 'Ballot Casting Open',
    whatYouCanDoNow: 'Registered voters can sign in with their voter credential, choose YES (1) or NO (0), encrypt their ballot in the browser, and submit it with a zero-knowledge range proof.',
    whatHappensNext: 'Each accepted ballot is homomorphically added to the encrypted running total on-chain. When the voting window ends, the administrator closes voting to begin tallying.',
    whyTrusteeDisabled: 'Threshold tally decryption is disabled while voting is still open. The administrator must close voting before trustees can combine shares and decrypt the tally.',
  },
  Tallying: {
    key: 'Tallying',
    badgeLabel: 'Phase 3: Tallying',
    plainTitle: 'Voting Closed — Awaiting Threshold Decryption Proof',
    whatYouCanDoNow: 'Ballot casting is permanently closed. Election trustees now combine at least n of m secret key shares in browser memory to compute the decryption factor and submit a Chaum-Pedersen zero-knowledge proof.',
    whatHappensNext: 'The backend ledger verifies the Chaum-Pedersen proof against the stored Trustee Master Public Key and transitions the election to Complete.',
    whyVoterDisabled: 'Ballot casting is permanently closed for this election. The backend is now in the Tallying phase.',
  },
  Complete: {
    key: 'Complete',
    badgeLabel: 'Phase 4: Complete & Verified',
    plainTitle: 'Election Complete and Cryptographically Verified',
    whatYouCanDoNow: 'Anyone can inspect the final verified YES tally, the total encrypted ballots cast, the homomorphic ciphertext sum, and the on-chain Chaum-Pedersen verification status.',
    whatHappensNext: 'The election lifecycle is finished. Observers and voters can independently audit the bulletin board using the CLI audit tool.',
    whyVoterDisabled: 'This election is complete and finalized. No further ballots can be cast.',
    whyTrusteeDisabled: 'The tally has already been decrypted, verified on-chain, and finalized.',
  },
};

export function resolvePhaseKey(phase?: ElectionPhase | null): ServerPhaseKey | null {
  if (!phase) return null;
  if ('Setup' in phase) return 'Setup';
  if ('Voting' in phase) return 'Voting';
  if ('Tallying' in phase) return 'Tallying';
  if ('Complete' in phase) return 'Complete';
  return null;
}

/**
 * Exhaustive map of every literal error string or prefix returned by crates/server/src/handlers.rs.
 * Tested in tests/backend_alignment.test.ts against the actual Rust source file.
 */
export const SERVER_ERROR_MAP: Record<string, string> = {
  'Only the admin can initialize an election':
    'Authorization denied: Only the election administrator can create or reset an election.',
  'Invalid trustee public key hex:':
    'The Trustee Master Public Key is not a valid compressed BN254 G1 point in hexadecimal format. Generate a setup in the Trustee portal first.',
  'Election start_time must be earlier than end_time':
    'Invalid schedule: The election start time must be strictly earlier than the closing deadline.',
  'Voters can only be registered during the Setup phase':
    'Voter registration is locked because the election is no longer in the Setup phase.',
  'Election must be in Setup phase to open voting':
    'Voting cannot be opened because the election is not currently in the Setup phase.',
  'Trustee public key must be set before opening voting':
    'Cannot open voting until an election with a valid Trustee Master Public Key has been initialized.',
  'Voting is not currently open':
    'Ballot rejected: The election is not in the Voting phase.',
  'Voting period has not started yet':
    'Ballot rejected: The scheduled start time for voting has not been reached yet.',
  'Voting period has ended':
    'Ballot rejected: The scheduled closing deadline for voting has passed.',
  'Caller Principal':
    'Eligibility check failed: Your credential is not on the registered voter list for this election.',
  'Nullifier must be exactly 32 bytes':
    'Ballot rejected: The cryptographic nullifier hash is malformed (expected 32 bytes).',
  'Double-vote detected: nullifier has already been submitted':
    'Double-vote prevented: A ballot with this nullifier has already been recorded. Each registered voter may only cast one ballot per election.',
  'Corrupt trustee PK in server state:':
    'Server configuration error: The stored Trustee Master Public Key could not be decoded.',
  'Invalid ciphertext points on BN254 G1:':
    'Ballot rejected: The encrypted ballot points (C1, C2) are not valid points on the BN254 G1 elliptic curve.',
  'Invalid range proof deserialization:':
    'Ballot rejected: The 1-out-of-2 zero-knowledge range proof could not be decoded.',
  'Ballot Validity Proof Failed: Ciphertext does not encode valid vote 0 or 1':
    'Cryptographic range proof verification failed: The ballot could not be verified as encoding a valid 0 (NO) or 1 (YES) choice.',
  'Election is not currently in Voting phase':
    'Voting cannot be closed because the election is not currently in the Voting phase.',
  'Server is not in Tallying phase':
    'Decryption proof rejected: The election must be in the Tallying phase before a tally proof can be submitted.',
  'Invalid proof deserialization:':
    'Decryption proof rejected: The Chaum-Pedersen proof fields could not be decoded.',
  'Chaum-Pedersen Zero-Knowledge Proof VERIFICATION FAILED:':
    'Mathematical verification failed: The submitted Chaum-Pedersen proof does not match the homomorphic ciphertext sum and Trustee Master Public Key.',
};

/**
 * Formats a election timestamp (seconds or nanoseconds) (or Unix second timestamp if < 1e12) into:
 * - localFormatted: human-readable date/time in the user's local timezone
 * - utcFormatted: ISO / UTC string for hover/focus inspection
 */
export function formatElectionTime(timestampNsOrSec: bigint): {
  isSet: boolean;
  localFormatted: string;
  utcFormatted: string;
  epochMs: number;
} {
  if (timestampNsOrSec <= 0n) {
    return {
      isSet: false,
      localFormatted: 'No time limit configured',
      utcFormatted: 'UTC: Not configured (0)',
      epochMs: 0,
    };
  }
  // If timestamp is in nanoseconds (> 1e12), normalize to milliseconds.
  const epochMs =
    timestampNsOrSec > 1_000_000_000_000_000n
      ? Number(timestampNsOrSec / 1_000_000n)
      : timestampNsOrSec > 1_000_000_000_000n
        ? Number(timestampNsOrSec)
        : Number(timestampNsOrSec) * 1000;

  const date = new Date(epochMs);
  const localFormatted = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
  const utcFormatted = date.toISOString().replace('T', ' ').replace('.000Z', ' UTC');

  return {
    isSet: true,
    localFormatted,
    utcFormatted,
    epochMs,
  };
}

/**
 * Detects when the voting deadline has passed by wall-clock time while the election phase is still Voting.
 */

export function isVotingDeadlineExpiredButPhaseOpen(
  phase?: ElectionPhase | null,
  endTimeNsOrSec?: bigint,
  nowMs: number = Date.now()
): boolean {
  const key = resolvePhaseKey(phase);
  if (key !== 'Voting' || !endTimeNsOrSec || endTimeNsOrSec <= 0n) {
    return false;
  }
  const { epochMs } = formatElectionTime(endTimeNsOrSec);
  return epochMs > 0 && nowMs > epochMs;
}
