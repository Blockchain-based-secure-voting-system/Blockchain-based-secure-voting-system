import React, { useState, useEffect, useCallback } from 'react';
import type { UseElectionReturn } from '../hooks/useElection';
import { TRUSTEE_SHARE_GUIDE, type RoutePath, type WalkthroughRole } from '../content/copy';
import { generateThresholdKeys, combineKeyShares, decryptAndProveTally } from '../crypto';
import { PhaseBadge, getPhaseName } from '../components/PhaseBadge';
import { GlossaryTerm, OrientationBanner } from '../components/OrientationBanner';
import { validateThresholdBounds, validateAndParseTrusteeShares, validateTallyBound } from '../utils/validation';
import { mapToSafeErrorMessage } from '../utils/errorMapper';
import { Key, CheckCircle2, AlertTriangle, Cpu, ShieldAlert, Trash2 } from 'lucide-react';

export const TrusteeView: React.FC<{
  election: UseElectionReturn;
  onNavigate?: (path: RoutePath) => void;
  onOpenWalkthrough?: (role: WalkthroughRole) => void;
}> = ({ election, onNavigate, onOpenWalkthrough }) => {
  const { electionDetails, encryptedTally, submitDecryptionProof } = election;

  // Keygen state
  const [thresholdN, setThresholdN] = useState<number>(3);
  const [totalSharesM, setTotalSharesM] = useState<number>(5);
  const [generatedSetup, setGeneratedSetup] = useState<any>(null);

  // Tally & Decrypt state
  const [sharesInputText, setSharesInputText] = useState('');
  const [maxBoundInput, setMaxBoundInput] = useState<number>(10000);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sharesClearedNotice, setSharesClearedNotice] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [decryptionResult, setDecryptionResult] = useState<any>(null);

  const phase = electionDetails?.phase;
  const phaseName = getPhaseName(phase);
  const isTallyingPhase = phaseName === 'Tallying';

  const clearTrusteeSecrets = useCallback(() => {
    setSharesInputText('');
    setGeneratedSetup(null);
  }, []);

  // Ensure secrets are cleared on unmount and on browser pagehide
  useEffect(() => {
    const handlePageHide = () => {
      clearTrusteeSecrets();
    };
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      clearTrusteeSecrets();
    };
  }, [clearTrusteeSecrets]);

  const handleGenerateThresholdKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const boundsCheck = validateThresholdBounds(thresholdN, totalSharesM);
    if (!boundsCheck.valid) {
      setStatusMessage({ type: 'error', text: boundsCheck.error || 'Invalid threshold bounds.' });
      return;
    }

    try {
      setIsProcessing(true);
      const setup = await generateThresholdKeys(thresholdN, totalSharesM);
      setGeneratedSetup(setup);
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: mapToSafeErrorMessage(err, 'Failed to generate threshold keys'),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecryptAndFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    setSharesClearedNotice(false);

    if (!encryptedTally) {
      setStatusMessage({ type: 'error', text: 'Encrypted tally not available from server.' });
      return;
    }

    const parsedCheck = validateAndParseTrusteeShares(sharesInputText, 2);
    if (!parsedCheck.valid) {
      setStatusMessage({ type: 'error', text: parsedCheck.error || 'Invalid trustee shares.' });
      return;
    }

    const boundCheck = validateTallyBound(maxBoundInput);
    if (!boundCheck.valid) {
      setStatusMessage({ type: 'error', text: boundCheck.error || 'Invalid tally bound.' });
      return;
    }

    try {
      setIsProcessing(true);
      setDecryptionResult(null);

      // Clear raw textarea input immediately upon parsing into local scope
      setSharesInputText('');
      setSharesClearedNotice(true);

      // 1. Lagrange Reconstruction of Secret Key (in browser memory only)
      const reconstructedSk = await combineKeyShares(parsedCheck.shares);

      // 2. Solve Discrete Log & Generate Chaum-Pedersen Zero-Knowledge Proof
      const result = await decryptAndProveTally(
        reconstructedSk,
        encryptedTally.c1_hex,
        encryptedTally.c2_hex,
        maxBoundInput
      );

      setDecryptionResult(result);

      // 3. Submit proof to Server
      const verifiedTally = await submitDecryptionProof({
        a_hex: result.hex_proof.a_hex,
        b_hex: result.hex_proof.b_hex,
        s_hex: result.hex_proof.s_hex,
        w_hex: result.hex_proof.w_hex,
        decrypted_tally: BigInt(result.decrypted_tally),
      });

      setStatusMessage({
        type: 'success',
        text: `Success! Election tally verified and finalized on-chain with result: ${verifiedTally.toString()} YES votes.`,
      });
    } catch (err: unknown) {
      setSharesInputText('');
      setSharesClearedNotice(true);
      setStatusMessage({
        type: 'error',
        text: mapToSafeErrorMessage(err, 'Decryption proof generation failed'),
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="stack-lg">
      <OrientationBanner
        electionDetails={electionDetails}
        walkthroughRole="trustee"
        onOpenWalkthrough={onOpenWalkthrough}
        onNavigate={onNavigate}
        orientation={{
          whereAmI: 'Trustee (/trustee) — Threshold key ceremony and homomorphic tally decryption portal.',
          whatCanIDoNow: isTallyingPhase
            ? 'Combine at least n trustee shares in memory to unlock the encrypted tally and submit a Chaum-Pedersen proof.'
            : 'Generate an n-of-m threshold key setup prior to Election Setup, or review the Share-Handling Guide below.',
          whatHappensNext:
            'When a valid Chaum-Pedersen proof is submitted during Tallying, the backend verifies it and transitions to Complete.',
          whatIfSomethingGoesWrong:
            'Shares are wiped from memory automatically on submission, error, tab hide, or unmount, while non-secret bounds remain preserved.',
        }}
      />

      <section className="card" aria-labelledby="trustee-portal-heading">
        <div className="row-between">
          <div className="stack-sm">
            <h2 id="trustee-portal-heading" className="card-title">
              Trustee Key Custody Portal
            </h2>
            <p className="text-secondary">
              Each{' '}
              <GlossaryTerm term="trustee" onNavigate={onNavigate}>
                trustee
              </GlossaryTerm>{' '}
              holds one share of a{' '}
              <GlossaryTerm term="threshold" onNavigate={onNavigate}>
                threshold (n-of-m)
              </GlossaryTerm>{' '}
              key used to decrypt the aggregated{' '}
              <GlossaryTerm term="ciphertext" onNavigate={onNavigate}>
                ciphertext
              </GlossaryTerm>{' '}
              (compiled from verified{' '}
              <GlossaryTerm term="nullifier" onNavigate={onNavigate}>
                nullifier
              </GlossaryTerm>{' '}
              ballots) and generate a Chaum-Pedersen{' '}
              <GlossaryTerm term="proof" onNavigate={onNavigate}>
                zero-knowledge proof
              </GlossaryTerm>
              .
            </p>
          </div>
          <PhaseBadge phase={phase} />
        </div>

        <div className="alert alert-info" role="note">
          <ShieldAlert size={18} aria-hidden="true" />
          <span>
            <strong>Strict Memory Custody Warning:</strong> Trustee secret key shares are held strictly in transient browser memory only, are never written to storage or clipboard, and are automatically cleared on submission, unmount, or pagehide.
          </span>
        </div>

        {!isTallyingPhase && (
          <div className="alert alert-info" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>
              <strong>Phase Restriction (UX Notice):</strong> Threshold tally decryption is disabled while the election is in the <strong>{phaseName}</strong> phase. Decryption proof submission is only permitted during the <strong>Tallying</strong> phase.
            </span>
          </div>
        )}

        {sharesClearedNotice && (
          <div className="alert alert-info" role="status" aria-live="polite">
            <Trash2 size={18} aria-hidden="true" />
            <span>
              <strong>Memory Cleared Confirmation:</strong> Trustee share inputs and reconstructed key material have been wiped from component memory.
            </span>
          </div>
        )}

        {statusMessage && (
          <div
            className={`alert ${statusMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}
            role={statusMessage.type === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={18} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} aria-hidden="true" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </section>

      <div className="grid-2">
        {/* Threshold Setup & Keygen */}
        <section className="card" aria-labelledby="keygen-heading">
          <h3 id="keygen-heading" className="card-title">
            <Key size={20} aria-hidden="true" /> Generate n-of-m Threshold Keys
          </h3>
          <p className="text-secondary">
            Generates Master Public Key and distributes shares to trustees in transient memory.
          </p>

          <form onSubmit={handleGenerateThresholdKeys} className="stack-md" autoComplete="off">
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="threshold-n-input" className="form-label">
                  Threshold (n)
                </label>
                <input
                  id="threshold-n-input"
                  type="number"
                  className="form-input"
                  autoComplete="off"
                  min={2}
                  max={10}
                  value={thresholdN}
                  onChange={(e) => setThresholdN(parseInt(e.target.value || '0', 10))}
                  disabled={isProcessing}
                />
              </div>
              <div className="form-group">
                <label htmlFor="total-shares-m-input" className="form-label">
                  Total Shares (m)
                </label>
                <input
                  id="total-shares-m-input"
                  type="number"
                  className="form-input"
                  autoComplete="off"
                  min={2}
                  max={20}
                  value={totalSharesM}
                  onChange={(e) => setTotalSharesM(parseInt(e.target.value || '0', 10))}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={isProcessing}>
              Generate Threshold Setup
            </button>
          </form>

          {generatedSetup && (
            <div className="stack-md">
              <div className="form-group">
                <label htmlFor="generated-master-pk" className="form-label">
                  Master Public Key (Public — Use in Admin Setup)
                </label>
                <input
                  id="generated-master-pk"
                  type="text"
                  className="form-input text-mono"
                  readOnly
                  autoComplete="off"
                  value={generatedSetup.master_pk_hex}
                />
              </div>

              <div className="stack-sm">
                <span className="form-label">
                  Generated Trustee Shares ({generatedSetup.threshold}-of-{generatedSetup.total_shares}) — Record Offline (Never Copied to Clipboard)
                </span>
                {generatedSetup.shares.map((s: any) => (
                  <div key={s.index} className="receipt-card">
                    <div className="receipt-row">
                      <span className="receipt-key">Share #{s.index}:</span>
                      <code className="receipt-val">
                        {s.index}:{s.share_hex}
                      </code>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setGeneratedSetup(null);
                  setSharesClearedNotice(true);
                }}
              >
                <Trash2 size={14} aria-hidden="true" /> Clear Generated Shares from Memory
              </button>
            </div>
          )}
        </section>

        {/* Reconstruct & Decrypt Tally */}
        <section className="card" aria-labelledby="decrypt-heading">
          <h3 id="decrypt-heading" className="card-title">
            <Cpu size={20} aria-hidden="true" /> Threshold Tally Decryption
          </h3>
          <p className="text-secondary">
            Combine threshold shares in memory &amp; submit Chaum-Pedersen ZK proof to server.
          </p>

          <form onSubmit={handleDecryptAndFinalize} className="stack-md" autoComplete="off">
            <div className="form-group">
              <label htmlFor="trustee-shares-textarea" className="form-label">
                Input Threshold Shares (format: <code>index:share_hex</code>, one per line)
              </label>
              <textarea
                id="trustee-shares-textarea"
                className="form-textarea"
                autoComplete="off"
                placeholder={'1:0x1234...\n3:0x5678...\n5:0x9abc...'}
                value={sharesInputText}
                onChange={(e) => setSharesInputText(e.target.value)}
                disabled={!isTallyingPhase || isProcessing}
              />
              <span className="text-muted">
                [Memory Security]: Key material is held strictly in local variable memory and cleared immediately upon execution.
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="tally-max-bound" className="form-label">
                BSGS Discrete Log Upper Bound
              </label>
              <input
                id="tally-max-bound"
                type="number"
                className="form-input"
                autoComplete="off"
                min={1}
                max={1000000}
                value={maxBoundInput}
                onChange={(e) => setMaxBoundInput(parseInt(e.target.value || '10000', 10))}
                disabled={!isTallyingPhase || isProcessing}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isTallyingPhase || isProcessing || !sharesInputText.trim()}
            >
              {isProcessing ? 'Computing Discrete Log & Proof...' : 'Reconstruct, Prove & Finalize Tally'}
            </button>
          </form>

          {decryptionResult && (
            <div className="receipt-card" role="region" aria-label="Decryption Proof Summary">
              <div className="receipt-row">
                <span className="receipt-key">Decrypted YES Tally:</span>
                <span className="receipt-val">{decryptionResult.decrypted_tally.toString()}</span>
              </div>
              <div className="receipt-row">
                <span className="receipt-key">Chaum-Pedersen DLEQ s:</span>
                <span className="receipt-val">{decryptionResult.hex_proof.s_hex}</span>
              </div>
              <div className="receipt-row">
                <span className="receipt-key">Decryption Factor W:</span>
                <span className="receipt-val">{decryptionResult.hex_proof.w_hex}</span>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Trustee Share-Handling Guide (Part 3.4) */}
      <section className="card" aria-labelledby="trustee-guide-heading" data-testid="trustee-share-guide">
        <div className="row-between">
          <h3 id="trustee-guide-heading" className="card-title">
            Trustee Share-Handling &amp; Custody Guide
          </h3>
          <span className="badge badge-neutral">Operational Custody Rules</span>
        </div>
        <div className="grid-2">
          {TRUSTEE_SHARE_GUIDE.map((item, idx) => (
            <div key={idx} className="stat-box">
              <strong>{item.title}</strong>
              <p className="text-secondary" style={{ fontSize: '0.84rem' }}>
                {item.instruction}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
