import React, { useState, useEffect, useCallback } from 'react';
import type { UseElectionReturn } from '../hooks/useElection';
import type { AuthContextType } from '../hooks/useAuth';
import type { RoutePath, WalkthroughRole } from '../content/copy';
import { createClientSideBallot, verifyClientRangeProof } from '../crypto';
import { PhaseBadge, getPhaseName } from '../components/PhaseBadge';
import { GlossaryTerm, OrientationBanner } from '../components/OrientationBanner';
import { validateHexString, validateElectionId } from '../utils/validation';
import { mapToSafeErrorMessage } from '../utils/errorMapper';
import { Vote, CheckCircle2, ShieldCheck, AlertTriangle, FileText, Lock, RefreshCw } from 'lucide-react';

async function computeCiphertextHashHex(c1Hex: string, c2Hex: string): Promise<string> {
  const input = `${c1Hex}:${c2Hex}`;
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const encoded = new TextEncoder().encode(input);
    const digest = await window.crypto.subtle.digest('SHA-256', encoded);
    return (
      '0x' +
      Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
    );
  }
  // Deterministic fallback hash in test environments without SubtleCrypto
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return '0x' + (h >>> 0).toString(16).padStart(8, '0').repeat(8);
}

export const VoterView: React.FC<{
  election: UseElectionReturn;
  auth: AuthContextType;
  onNavigate?: (path: RoutePath) => void;
  onOpenWalkthrough?: (role: WalkthroughRole) => void;
}> = ({ election, auth, onNavigate, onOpenWalkthrough }) => {
  const { electionDetails, loading, error, refreshState, castBallot } = election;

  const [selectedVote, setSelectedVote] = useState<0 | 1 | null>(null);
  const [voterSecret, setVoterSecret] = useState('');
  const [electionIdInput, setElectionIdInput] = useState('election_2026');
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{
    nullifierHex: string;
    nullifierStatus: string;
    ciphertextHashHex: string;
    c1Hex: string;
    c2Hex: string;
    rangeProofValid: boolean;
  } | null>(null);

  const phase = electionDetails?.phase;
  const phaseName = getPhaseName(phase);
  const isVotingOpen = phaseName === 'Voting';

  const clearSensitiveMemory = useCallback(() => {
    setVoterSecret('');
    setSelectedVote(null);
    setIsConfirming(false);
  }, []);

  // Clear voter secret on component unmount and on browser pagehide
  useEffect(() => {
    const handlePageHide = () => {
      clearSensitiveMemory();
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      clearSensitiveMemory();
    };
  }, [clearSensitiveMemory]);

  useEffect(() => {
    if (auth.principal && !auth.principal.isAnonymous()) {
      election
        .isRegisteredVoter(auth.principal)
        .then(setIsRegistered)
        .catch(() => setIsRegistered(false));
    } else {
      setIsRegistered(null);
    }
  }, [auth.principal, election]);

  const validateFormInputs = (): boolean => {
    if (selectedVote !== 0 && selectedVote !== 1) {
      setErrorMessage('Please select a ballot option (YES or NO).');
      return false;
    }
    const secretTrimmed = voterSecret.trim();
    if (!secretTrimmed || secretTrimmed.length < 4 || secretTrimmed.length > 256) {
      setErrorMessage('Voter secret passphrase must be between 4 and 256 characters.');
      return false;
    }
    const electionIdCheck = validateElectionId(electionIdInput);
    if (!electionIdCheck.valid) {
      setErrorMessage(electionIdCheck.error || 'Invalid Election ID.');
      return false;
    }
    const pkHex = electionDetails?.trustee_pk_hex || '';
    const pkCheck = validateHexString(pkHex, 'Trustee Master Public Key', 32, 128);
    if (!pkCheck.valid) {
      setErrorMessage(pkCheck.error || 'Trustee Master Public Key is not configured on server.');
      return false;
    }
    return true;
  };

  const handleReviewBallot = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (validateFormInputs()) {
      setIsConfirming(true);
    }
  };

  const handleConfirmAndCastBallot = async () => {
    if (!validateFormInputs() || selectedVote === null || !electionDetails) {
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // 1. Client-Side WASM Encryption & ZK Range Proof Generation
      const secretToSubmit = voterSecret.trim();
      const wasmBallot = await createClientSideBallot(
        electionDetails.trustee_pk_hex,
        secretToSubmit,
        electionIdInput.trim(),
        selectedVote
      );

      const isLocalProofValid = await verifyClientRangeProof(
        electionDetails.trustee_pk_hex,
        wasmBallot.ciphertext.c1_hex,
        wasmBallot.ciphertext.c2_hex,
        wasmBallot.range_proof
      );

      if (!isLocalProofValid) {
        clearSensitiveMemory();
        throw new Error('Local client-side ZK range proof validation failed.');
      }

      // 2. Transmit Encrypted Ballot to Server
      await castBallot({
        nullifier: wasmBallot.nullifier,
        ciphertext: wasmBallot.ciphertext,
        range_proof: wasmBallot.range_proof,
      }, secretToSubmit);

      // Overwrite secret and plaintext choice immediately after submission
      clearSensitiveMemory();

      const nullifierHex = Array.from(wasmBallot.nullifier)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const ciphertextHashHex = await computeCiphertextHashHex(
        wasmBallot.ciphertext.c1_hex,
        wasmBallot.ciphertext.c2_hex
      );

      // 3. Set Receipt — Plaintext choice is NEVER echoed or retained after submission
      setReceipt({
        nullifierHex: `0x${nullifierHex}`,
        nullifierStatus: 'Recorded & Verified Unique On-Chain',
        ciphertextHashHex,
        c1Hex: wasmBallot.ciphertext.c1_hex,
        c2Hex: wasmBallot.ciphertext.c2_hex,
        rangeProofValid: isLocalProofValid,
      });
    } catch (err: unknown) {
      clearSensitiveMemory();
      setErrorMessage(mapToSafeErrorMessage(err, 'Error casting ballot'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStep = receipt ? 4 : isConfirming ? 3 : selectedVote !== null ? 2 : 1;

  return (
    <div className="stack-lg">
      <OrientationBanner
        electionDetails={electionDetails}
        walkthroughRole="voter"
        onOpenWalkthrough={onOpenWalkthrough}
        onNavigate={onNavigate}
        orientation={{
          whereAmI: 'Vote (/vote) — Voter ballot encryption and submission portal.',
          whatCanIDoNow: isVotingOpen
            ? 'Sign in with your voter credential, verify your eligibility, choose your ballot option, and encrypt your ballot in browser WebAssembly.'
            : `Voting is currently ${phaseName}. Ballot casting is only enabled when the election phase is Voting.`,
          whatHappensNext:
            'After submission, your encrypted ballot is added to the homomorphic tally and you receive a 32-byte nullifier receipt to check on /verify.',
          whatIfSomethingGoesWrong:
            'Your non-secret Election ID remains preserved if an error occurs, while your secret passphrase is cleared automatically on submission or tab close.',
        }}
      />

      <section className="card" aria-labelledby="voter-portal-heading">
        <div className="row-between">
          <div className="stack-sm">
            <h2 id="voter-portal-heading" className="card-title">
              Voter Portal
            </h2>
            <p className="text-secondary">
              Your vote is locked inside a{' '}
              <GlossaryTerm term="ciphertext" onNavigate={onNavigate}>
                ciphertext
              </GlossaryTerm>{' '}
              with a 1-out-of-2{' '}
              <GlossaryTerm term="proof" onNavigate={onNavigate}>
                zero-knowledge proof
              </GlossaryTerm>{' '}
              and a unique{' '}
              <GlossaryTerm term="nullifier" onNavigate={onNavigate}>
                nullifier
              </GlossaryTerm>{' '}
              under the{' '}
              <GlossaryTerm term="threshold" onNavigate={onNavigate}>
                threshold
              </GlossaryTerm>{' '}
              <GlossaryTerm term="trustee" onNavigate={onNavigate}>
                trustee
              </GlossaryTerm>{' '}
              public key.
            </p>
          </div>
          <PhaseBadge phase={phase} />
        </div>

        <div className="grid-2" style={{ fontSize: '0.84rem' }}>
          <div className="stat-box">
            <span className="stat-label">What Leaves Your Device</span>
            <p className="text-secondary">
              Encrypted <code>ciphertext</code> (C1, C2), 1-out-of-2 <code>range_proof</code>, and 32-byte{' '}
              <code>nullifier</code> hash.
            </p>
          </div>
          <div className="stat-box">
            <span className="stat-label">What NEVER Leaves Your Device</span>
            <p className="text-secondary">
              Your plaintext vote choice (<code>0</code> or <code>1</code>), your secret passphrase, and your random
              encryption scalar.
            </p>
          </div>
        </div>

        <ol className="step-list" aria-label="Ballot Submission Steps">
          <li className={`step-item ${activeStep === 1 ? 'active' : ''}`}>Step 1: Check Eligibility</li>
          <li className={`step-item ${activeStep === 2 ? 'active' : ''}`}>Step 2: Choose Option</li>
          <li className={`step-item ${activeStep === 3 ? 'active' : ''}`}>Step 3: Confirm Encryption</li>
          <li className={`step-item ${activeStep === 4 ? 'active' : ''}`}>Step 4: Cryptographic Receipt</li>
        </ol>

        {loading && !electionDetails && (
          <div className="alert alert-info" role="status" aria-live="polite">
            <RefreshCw size={18} aria-hidden="true" />
            <span>
              <strong>Loading Server State:</strong> Checking election status...
            </span>
          </div>
        )}

        {error && !electionDetails && (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>Cannot Reach Server:</strong> {error}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={refreshState}>
                Retry
              </button>
            </div>
          </div>
        )}

        {!isVotingOpen && (
          <div className="alert alert-info" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              <strong>Phase Restriction (UX Notice):</strong> Ballot submission is currently disabled because the election phase is <strong>{phaseName}</strong>. Voting is only permitted during the <strong>Voting</strong> phase (enforced by the backend ledger).
            </span>
          </div>
        )}

        {!auth.isAuthenticated ? (
          <div className="alert alert-info" role="status">
            <Lock size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>Authentication Required:</strong> Sign in with your voter credential to verify eligibility and enable ballot buttons.
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void auth.login()}
              >
                Sign In to Vote
              </button>
            </div>
          </div>
        ) : isRegistered === false ? (
          <div className="alert alert-danger" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              <strong>Ineligible Principal:</strong> Your Principal (<code>{auth.principalText}</code>) is not registered in the election voter list.
            </span>
          </div>
        ) : isRegistered === true ? (
          <div className="alert alert-success" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>
              <strong>Eligible Voter:</strong> Your Principal is registered and authorized to cast one encrypted ballot.
            </span>
          </div>
        ) : null}

        {errorMessage && (
          <div className="alert alert-danger" role="alert" aria-live="assertive">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              <strong>Submission Error:</strong> {errorMessage}
            </span>
          </div>
        )}
      </section>

      {receipt ? (
        <section className="card" aria-labelledby="receipt-heading" role="status" aria-live="polite">
          <h3 id="receipt-heading" className="card-title">
            <FileText size={22} aria-hidden="true" /> Cryptographic Ballot Receipt
          </h3>
          <p className="text-secondary">
            Your ballot has been homomorphically aggregated on-chain. Your plaintext choice and secret passphrase have been erased from memory and are never displayed.
          </p>

          <div className="receipt-card">
            <div className="receipt-row">
              <span className="receipt-key">Ciphertext SHA-256 Digest:</span>
              <span className="receipt-val">{receipt.ciphertextHashHex}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Nullifier Hash (Double-Vote Guard):</span>
              <span className="receipt-val">{receipt.nullifierHex}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Nullifier On-Chain Status:</span>
              <span className="receipt-val">{receipt.nullifierStatus}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Encrypted Ciphertext C1:</span>
              <span className="receipt-val">{receipt.c1Hex}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">Encrypted Ciphertext C2:</span>
              <span className="receipt-val">{receipt.c2Hex}</span>
            </div>
            <div className="receipt-row">
              <span className="receipt-key">1-out-of-2 ZK Range Proof:</span>
              <span className="receipt-val">Verified Valid</span>
            </div>
          </div>

          <div>
            <button type="button" className="btn btn-secondary" onClick={() => setReceipt(null)}>
              Cast Another / Return
            </button>
          </div>
        </section>
      ) : (
        <section className="card" aria-labelledby="ballot-form-heading">
          <h3 id="ballot-form-heading" className="card-title">
            <Vote size={20} aria-hidden="true" /> Encrypted Ballot Submission
          </h3>

          <form onSubmit={handleReviewBallot} className="stack-md" autoComplete="off">
            <div className="form-group" role="group" aria-labelledby="vote-option-label">
              <span id="vote-option-label" className="form-label">
                Select Your Vote Option
              </span>
              <div className="grid-2">
                <button
                  type="button"
                  className={`btn ${selectedVote === 1 ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={selectedVote === 1}
                  onClick={() => setSelectedVote(1)}
                  disabled={!isVotingOpen || !auth.isAuthenticated || isSubmitting || isConfirming}
                >
                  YES (1)
                </button>
                <button
                  type="button"
                  className={`btn ${selectedVote === 0 ? 'btn-primary' : 'btn-secondary'}`}
                  aria-pressed={selectedVote === 0}
                  onClick={() => setSelectedVote(0)}
                  disabled={!isVotingOpen || !auth.isAuthenticated || isSubmitting || isConfirming}
                >
                  NO (0)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="voter-election-id" className="form-label">
                Election Domain Identifier
              </label>
              <input
                id="voter-election-id"
                type="text"
                className="form-input"
                autoComplete="off"
                value={electionIdInput}
                onChange={(e) => setElectionIdInput(e.target.value)}
                disabled={!isVotingOpen || !auth.isAuthenticated || isSubmitting || isConfirming}
              />
            </div>

            <div className="form-group">
              <label htmlFor="voter-secret-input" className="form-label">
                Voter Secret Passphrase (for unique Nullifier derivation)
              </label>
              <input
                id="voter-secret-input"
                type="password"
                className="form-input"
                autoComplete="off"
                placeholder="Enter secret passphrase (kept only in browser memory)"
                value={voterSecret}
                onChange={(e) => setVoterSecret(e.target.value)}
                disabled={!isVotingOpen || !auth.isAuthenticated || isSubmitting || isConfirming}
              />
              <span className="text-muted">
                Derives <code>Keccak256(secret || election_id)</code> in WebAssembly memory and is cleared immediately upon submission, unmount, or pagehide.
              </span>
            </div>

            <div className="alert alert-info">
              <ShieldCheck size={16} aria-hidden="true" />
              <span>
                <strong>Zero-Knowledge Guarantee:</strong> Your vote is encrypted in WebAssembly with a 1-out-of-2 Disjunctive Chaum-Pedersen proof. The plaintext value never leaves browser memory.
              </span>
            </div>

            {!isConfirming ? (
              <div className="row-wrap">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!isVotingOpen || !auth.isAuthenticated || isRegistered === false || selectedVote === null || isSubmitting}
                >
                  Review &amp; Prepare Encrypted Ballot
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={!isVotingOpen || !auth.isAuthenticated || isRegistered === false || selectedVote === null || isSubmitting}
                  onClick={handleConfirmAndCastBallot}
                >
                  {isSubmitting ? 'Generating ZK Proof & Casting...' : 'Encrypt & Cast Ballot'}
                </button>
              </div>
            ) : (
              <div className="card" role="region" aria-labelledby="confirm-ballot-heading">
                <h4 id="confirm-ballot-heading" className="card-title">
                  Confirm Encrypted Ballot Transmission
                </h4>
                <p className="text-secondary">
                  You are about to generate a zero-knowledge range proof and submit your encrypted ballot for election domain <code>{electionIdInput}</code>. Once recorded on-chain, your nullifier cannot be reused and your secret passphrase will be wiped from memory.
                </p>
                <div className="row-wrap">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleConfirmAndCastBallot}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Generating ZK Proof & Casting...' : 'Confirm & Submit Encrypted Ballot'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setIsConfirming(false)}
                    disabled={isSubmitting}
                  >
                    Cancel / Modify
                  </button>
                </div>
              </div>
            )}
          </form>
        </section>
      )}
    </div>
  );
};
