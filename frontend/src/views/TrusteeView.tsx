import React, { useState } from 'react';
import type { UseCanisterReturn } from '../hooks/useCanister';
import { generateThresholdKeys, combineKeyShares, decryptAndProveTally } from '../crypto';
import { PhaseBadge } from '../components/PhaseBadge';
import { Key, CheckCircle2, AlertTriangle, Cpu, Copy, Check } from 'lucide-react';

export const TrusteeView: React.FC<{ canister: UseCanisterReturn }> = ({ canister }) => {
  const { electionDetails, encryptedTally, submitDecryptionProof } = canister;

  // Keygen state
  const [thresholdN, setThresholdN] = useState<number>(3);
  const [totalSharesM, setTotalSharesM] = useState<number>(5);
  const [generatedSetup, setGeneratedSetup] = useState<any>(null);
  const [copiedShareIndex, setCopiedShareIndex] = useState<number | null>(null);

  // Tally & Decrypt state
  const [sharesInputText, setSharesInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [decryptionResult, setDecryptionResult] = useState<any>(null);

  const phase = electionDetails?.phase;
  const isTallyingPhase = phase && 'Tallying' in phase;

  const handleGenerateThresholdKeys = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsProcessing(true);
      setStatusMessage(null);
      const setup = await generateThresholdKeys(thresholdN, totalSharesM);
      setGeneratedSetup(setup);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to generate threshold keys' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedShareIndex(index);
    setTimeout(() => setCopiedShareIndex(null), 2000);
  };

  const handleDecryptAndFinalize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!encryptedTally) {
      setStatusMessage({ type: 'error', text: 'Encrypted tally not available from canister.' });
      return;
    }
    if (!sharesInputText.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter at least n trustee shares.' });
      return;
    }

    try {
      setIsProcessing(true);
      setStatusMessage(null);
      setDecryptionResult(null);

      // Parse shares: format "1:0x1234..." or "1, 0x1234"
      const lines = sharesInputText.split('\n').map((l) => l.trim()).filter(Boolean);
      const parsedShares = lines.map((line) => {
        const parts = line.includes(':') ? line.split(':') : line.split(',');
        return {
          index: parseInt(parts[0].trim(), 10),
          share_hex: parts[1].trim(),
        };
      });

      // 1. Lagrange Reconstruction of Secret Key (in browser memory only)
      const reconstructedSk = await combineKeyShares(parsedShares);

      // 2. Solve Discrete Log & Generate Chaum-Pedersen Zero-Knowledge Proof
      const result = await decryptAndProveTally(
        reconstructedSk,
        encryptedTally.c1_hex,
        encryptedTally.c2_hex,
        10000
      );

      setDecryptionResult(result);

      // 3. Submit proof to Canister
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

      // Clear sensitive memory
      setSharesInputText('');
    } catch (err: any) {
      console.error('Threshold decryption error:', err);
      setStatusMessage({ type: 'error', text: err.message || 'Decryption proof generation failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">Trustee Key Custody Portal</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              n-of-m Shamir threshold secret sharing & Chaum-Pedersen ZK decryption.
            </p>
          </div>
          <PhaseBadge phase={phase} />
        </div>

        {statusMessage && (
          <div className={`alert ${statusMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* Threshold Setup & Keygen */}
        <div className="card">
          <div className="card-title">
            <Key size={20} /> Generate n-of-m Threshold Keys
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Generates Master Public Key and distributes shares to trustees.
          </p>

          <form onSubmit={handleGenerateThresholdKeys} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Threshold (n)</label>
                <input
                  type="number"
                  className="form-input"
                  min="2"
                  max="10"
                  value={thresholdN}
                  onChange={(e) => setThresholdN(parseInt(e.target.value, 10))}
                  disabled={isProcessing}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Total Shares (m)</label>
                <input
                  type="number"
                  className="form-input"
                  min="2"
                  max="20"
                  value={totalSharesM}
                  onChange={(e) => setTotalSharesM(parseInt(e.target.value, 10))}
                  disabled={isProcessing}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={isProcessing}>
              Generate Threshold Setup
            </button>
          </form>

          {generatedSetup && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Master Public Key (Use in Admin setup)</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    readOnly
                    value={generatedSetup.master_pk_hex}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', flex: 1 }}
                  />
                  <button className="btn btn-secondary" onClick={() => handleCopy(generatedSetup.master_pk_hex, 0)}>
                    {copiedShareIndex === 0 ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <label className="form-label">Trustee Key Shares ({generatedSetup.threshold}-of-{generatedSetup.total_shares})</label>
              {generatedSetup.shares.map((s: any) => (
                <div key={s.index} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', width: '65px' }}>Share #{s.index}:</span>
                  <code style={{ fontSize: '0.75rem', flex: 1, color: '#93c5fd', wordBreak: 'break-all' }}>
                    {s.index}:{s.share_hex}
                  </code>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '0.25rem 0.5rem' }}
                    onClick={() => handleCopy(`${s.index}:${s.share_hex}`, s.index)}
                  >
                    {copiedShareIndex === s.index ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Reconstruct & Decrypt Tally */}
        <div className="card">
          <div className="card-title">
            <Cpu size={20} /> Threshold Tally Decryption
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Combine threshold shares & submit Chaum-Pedersen ZK proof to canister.
          </p>

          <form onSubmit={handleDecryptAndFinalize} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Input Threshold Shares (format: <code>index:share_hex</code>, one per line)</label>
              <textarea
                className="form-textarea"
                placeholder="1:0x1234...&#10;3:0x5678...&#10;5:0x9abc..."
                value={sharesInputText}
                onChange={(e) => setSharesInputText(e.target.value)}
                disabled={!isTallyingPhase || isProcessing}
                style={{ minHeight: '120px' }}
              />
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                [Memory Security]: Key material is held strictly in local variable memory and cleared immediately upon execution.
              </span>
            </div>

            <button
              type="submit"
              className="btn btn-success"
              disabled={!isTallyingPhase || isProcessing || !sharesInputText.trim()}
            >
              {isProcessing ? 'Computing Discrete Log & Proof...' : 'Reconstruct, Prove & Finalize Tally'}
            </button>
          </form>

          {decryptionResult && (
            <div className="receipt-card" style={{ marginTop: '0.75rem' }}>
              <div className="receipt-row">
                <span className="receipt-key">Decrypted YES Tally:</span>
                <span className="receipt-val" style={{ color: '#10b981', fontWeight: 700 }}>
                  {decryptionResult.decrypted_tally.toString()}
                </span>
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
        </div>
      </div>
    </div>
  );
};
