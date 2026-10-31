import React, { useState } from 'react';
import type { UseCanisterReturn } from '../hooks/useCanister';
import type { AuthContextType } from '../hooks/useAuth';
import { ADMIN_ELECTION_CHECKLIST, type RoutePath, type WalkthroughRole } from '../content/copy';
import { PhaseBadge, getPhaseName } from '../components/PhaseBadge';
import { GlossaryTerm, OrientationBanner } from '../components/OrientationBanner';
import {
  validateElectionTitle,
  validateHexString,
  validatePrincipalList,
  validateTimestamps,
} from '../utils/validation';
import { mapToSafeErrorMessage } from '../utils/errorMapper';
import { PlusCircle, UserPlus, Play, Square, AlertCircle, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';

export const AdminView: React.FC<{
  canister: UseCanisterReturn;
  auth: AuthContextType;
  onNavigate?: (path: RoutePath) => void;
  onOpenWalkthrough?: (role: WalkthroughRole) => void;
}> = ({ canister, auth, onNavigate, onOpenWalkthrough }) => {
  const { electionDetails, createElection, registerVoters, openVoting, closeVoting } = canister;

  const [title, setTitle] = useState('');
  const [trusteePk, setTrusteePk] = useState('');
  const [startTimeSec, setStartTimeSec] = useState<string>('0');
  const [endTimeSec, setEndTimeSec] = useState<string>('0');
  const [voterPrincipalsText, setVoterPrincipalsText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<'open' | 'close' | null>(null);

  const phase = electionDetails?.phase;
  const phaseName = getPhaseName(phase);
  const isSetup = phaseName === 'Setup';
  const isVoting = phaseName === 'Voting';

  const handleCreateElection = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const titleCheck = validateElectionTitle(title);
    if (!titleCheck.valid) {
      setStatusMessage({ type: 'error', text: titleCheck.error || 'Invalid election title.' });
      return;
    }

    const pkCheck = validateHexString(trusteePk, 'Trustee Master Public Key', 32, 128);
    if (!pkCheck.valid) {
      setStatusMessage({ type: 'error', text: pkCheck.error || 'Invalid Trustee Master Public Key.' });
      return;
    }

    let startBig = 0n;
    let endBig = 0n;
    try {
      startBig = BigInt(startTimeSec.trim() || '0');
      endBig = BigInt(endTimeSec.trim() || '0');
    } catch {
      setStatusMessage({ type: 'error', text: 'Start and End timestamps must be valid non-negative integers.' });
      return;
    }

    const timeCheck = validateTimestamps(startBig, endBig);
    if (!timeCheck.valid) {
      setStatusMessage({ type: 'error', text: timeCheck.error || 'Invalid timestamps.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await createElection(title.trim(), trusteePk.trim(), startBig, endBig);
      setStatusMessage({ type: 'success', text: res });
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: mapToSafeErrorMessage(err, 'Failed to create election') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterVoters = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const listCheck = validatePrincipalList(voterPrincipalsText);
    if (!listCheck.valid) {
      setStatusMessage({ type: 'error', text: listCheck.error || 'Invalid voter Principal IDs.' });
      return;
    }

    try {
      setIsSubmitting(true);
      const added = await registerVoters(listCheck.principals);
      setStatusMessage({
        type: 'success',
        text: `Successfully registered ${added.toString()} voter principals.`,
      });
      setVoterPrincipalsText('');
    } catch (err: unknown) {
      setStatusMessage({ type: 'error', text: mapToSafeErrorMessage(err, 'Failed to register voters') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const executePhaseTransition = async (transition: 'open' | 'close') => {
    setPendingTransition(null);
    setStatusMessage(null);
    try {
      setIsSubmitting(true);
      if (transition === 'open') {
        const res = await openVoting();
        setStatusMessage({ type: 'success', text: res });
      } else {
        const res = await closeVoting();
        setStatusMessage({ type: 'success', text: res });
      }
    } catch (err: unknown) {
      setStatusMessage({
        type: 'error',
        text: mapToSafeErrorMessage(err, `Failed to ${transition} voting phase`),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="stack-lg">
      <OrientationBanner
        electionDetails={electionDetails}
        walkthroughRole="admin"
        onOpenWalkthrough={onOpenWalkthrough}
        onNavigate={onNavigate}
        orientation={{
          whereAmI: 'Run an Election (/admin) — Election administrator setup, voter roll management, and phase transition controls.',
          whatCanIDoNow: isSetup
            ? 'Configure election parameters, add eligible voter Principal IDs, or transition the canister from Setup to Voting.'
            : isVoting
              ? 'Monitor voting progress and close the Voting phase when the scheduled deadline arrives.'
              : `Current phase is ${phaseName}. Administrative setup and voter registration are locked.`,
          whatHappensNext:
            'Once Voting is closed (Tallying phase), trustees combine key shares in /trustee to submit the Chaum-Pedersen proof.',
          whatIfSomethingGoesWrong:
            'If validation fails on any form field, your typed inputs are preserved so you can correct the line without re-entering the entire form.',
        }}
      />

      <section className="card" aria-labelledby="admin-portal-heading">
        <div className="row-between">
          <div className="stack-sm">
            <h2 id="admin-portal-heading" className="card-title">
              Election Administration
            </h2>
            <p className="text-secondary">
              Configure the{' '}
              <GlossaryTerm term="threshold" onNavigate={onNavigate}>
                threshold
              </GlossaryTerm>{' '}
              <GlossaryTerm term="trustee" onNavigate={onNavigate}>
                trustee
              </GlossaryTerm>{' '}
              public key so voters can submit encrypted{' '}
              <GlossaryTerm term="ciphertext" onNavigate={onNavigate}>
                ciphertexts
              </GlossaryTerm>{' '}
              with{' '}
              <GlossaryTerm term="nullifier" onNavigate={onNavigate}>
                nullifiers
              </GlossaryTerm>{' '}
              and{' '}
              <GlossaryTerm term="proof" onNavigate={onNavigate}>
                zero-knowledge proofs
              </GlossaryTerm>
              .
            </p>
          </div>
          <PhaseBadge phase={phase} />
        </div>

        {!auth.isAuthenticated && (
          <div className="alert alert-info" role="status">
            <Lock size={18} aria-hidden="true" />
            <span>
              <strong>Admin Authentication Required:</strong> Connect your Internet Identity above. All administrative mutations are strictly verified against the canister admin Principal on-chain.
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
              <AlertCircle size={18} aria-hidden="true" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </section>

      <div className="grid-2">
        {/* Create Election Card */}
        <section className="card" aria-labelledby="init-election-heading">
          <h3 id="init-election-heading" className="card-title">
            <PlusCircle size={20} aria-hidden="true" /> Initialize Election
          </h3>
          <form onSubmit={handleCreateElection} className="stack-md" autoComplete="off">
            <div className="form-group">
              <label htmlFor="election-title-input" className="form-label">
                Election Title
              </label>
              <input
                id="election-title-input"
                type="text"
                className="form-input"
                autoComplete="off"
                placeholder="e.g. 2026 Governance Referendum"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!auth.isAuthenticated || isSubmitting}
              />
            </div>
            <div className="form-group">
              <label htmlFor="trustee-pk-input" className="form-label">
                Trustee Master Public Key (0x...)
              </label>
              <input
                id="trustee-pk-input"
                type="text"
                className="form-input text-mono"
                autoComplete="off"
                placeholder="0x04..."
                value={trusteePk}
                onChange={(e) => setTrusteePk(e.target.value)}
                disabled={!auth.isAuthenticated || isSubmitting}
              />
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label htmlFor="start-time-input" className="form-label">
                  Start Timestamp (Unix sec)
                </label>
                <input
                  id="start-time-input"
                  type="number"
                  className="form-input"
                  autoComplete="off"
                  min={0}
                  value={startTimeSec}
                  onChange={(e) => setStartTimeSec(e.target.value)}
                  disabled={!auth.isAuthenticated || isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="end-time-input" className="form-label">
                  End Timestamp (Unix sec)
                </label>
                <input
                  id="end-time-input"
                  type="number"
                  className="form-input"
                  autoComplete="off"
                  min={0}
                  value={endTimeSec}
                  onChange={(e) => setEndTimeSec(e.target.value)}
                  disabled={!auth.isAuthenticated || isSubmitting}
                />
              </div>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!auth.isAuthenticated || isSubmitting}
            >
              Initialize Election in Setup Phase
            </button>
          </form>
        </section>

        {/* Register Voters Card */}
        <section className="card" aria-labelledby="register-voters-heading">
          <h3 id="register-voters-heading" className="card-title">
            <UserPlus size={20} aria-hidden="true" /> Register Eligible Voters
          </h3>
          {!isSetup && (
            <p className="text-muted">
              Disabled: Voter registration is only permitted during the <strong>Setup</strong> phase (current phase: <strong>{phaseName}</strong>).
            </p>
          )}
          <form onSubmit={handleRegisterVoters} className="stack-md" autoComplete="off">
            <div className="form-group">
              <label htmlFor="voter-principals-textarea" className="form-label">
                Voter Principals (One per line)
              </label>
              <textarea
                id="voter-principals-textarea"
                className="form-textarea"
                autoComplete="off"
                placeholder={'2vxsx-fae\nbkyz2-fmaaa-aaaaa-qaaaq-cai'}
                value={voterPrincipalsText}
                onChange={(e) => setVoterPrincipalsText(e.target.value)}
                disabled={!isSetup || !auth.isAuthenticated || isSubmitting}
              />
            </div>
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={!isSetup || !auth.isAuthenticated || isSubmitting || !voterPrincipalsText.trim()}
            >
              Add Voters to Registry
            </button>
          </form>
        </section>
      </div>

      {/* Phase Transition Actions */}
      <section className="card" aria-labelledby="phase-controls-heading">
        <h3 id="phase-controls-heading" className="card-title">
          Election Phase Controls
        </h3>
        <p className="text-secondary">
          Strict state machine guarded on canister: Setup &rarr; Voting &rarr; Tallying &rarr; Complete. Phase transitions are irreversible.
        </p>

        <div className="row-wrap">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setPendingTransition('open')}
            disabled={!isSetup || !auth.isAuthenticated || isSubmitting}
          >
            <Play size={16} aria-hidden="true" /> Open Voting Phase
          </button>
          <button
            type="button"
            className="btn btn-outline-danger"
            onClick={() => setPendingTransition('close')}
            disabled={!isVoting || !auth.isAuthenticated || isSubmitting}
          >
            <Square size={16} aria-hidden="true" /> Close Voting &amp; Begin Tallying
          </button>
        </div>

        {pendingTransition && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-phase-title">
            <div className="modal-card">
              <h4 id="confirm-phase-title" className="card-title">
                <AlertTriangle size={20} aria-hidden="true" /> Confirm Irreversible Phase Transition
              </h4>
              {pendingTransition === 'open' ? (
                <p className="text-secondary">
                  Transitioning from <strong>Setup</strong> to <strong>Voting</strong> will freeze voter registration and open encrypted ballot submission for all registered voters. This action cannot be undone.
                </p>
              ) : (
                <p className="text-secondary">
                  Transitioning from <strong>Voting</strong> to <strong>Tallying</strong> will permanently close ballot submission and lock the homomorphic encrypted tally for trustee decryption. This action cannot be undone.
                </p>
              )}
              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => executePhaseTransition(pendingTransition)}
                  disabled={isSubmitting}
                >
                  {pendingTransition === 'open'
                    ? 'Confirm & Open Voting'
                    : 'Confirm & Close Voting'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setPendingTransition(null)}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Election-Run Checklist for Administrators (Part 3.4) */}
      <section className="card" aria-labelledby="admin-checklist-heading" data-testid="admin-election-checklist">
        <div className="row-between">
          <h3 id="admin-checklist-heading" className="card-title">
            Election-Run Checklist (Administrator Procedure)
          </h3>
          <span className="badge badge-neutral">6 Operational Steps</span>
        </div>
        <p className="text-secondary">
          Follow this checklist in order when organizing an election to ensure the Trustee Master Public Key, voter
          registry, and phase deadlines are verified before opening ballot submission:
        </p>
        <div className="grid-2">
          {ADMIN_ELECTION_CHECKLIST.map((item) => (
            <div key={item.id} className="stat-box">
              <span className="stat-label">{item.phase}</span>
              <strong>{item.title}</strong>
              <p className="text-secondary" style={{ fontSize: '0.84rem' }}>
                {item.detail}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
