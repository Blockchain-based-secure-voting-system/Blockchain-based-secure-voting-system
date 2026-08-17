import React, { useState } from 'react';
import { Principal } from '@dfinity/principal';
import type { UseCanisterReturn } from '../hooks/useCanister';
import type { AuthContextType } from '../hooks/useAuth';
import { PhaseBadge } from '../components/PhaseBadge';
import { PlusCircle, UserPlus, Play, Square, AlertCircle, CheckCircle2 } from 'lucide-react';

export const AdminView: React.FC<{ canister: UseCanisterReturn; auth: AuthContextType }> = ({ canister, auth }) => {
  const { electionDetails, createElection, registerVoters, openVoting, closeVoting } = canister;

  const [title, setTitle] = useState('');
  const [trusteePk, setTrusteePk] = useState('');
  const [voterPrincipalsText, setVoterPrincipalsText] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const phase = electionDetails?.phase;
  const isSetup = phase && 'Setup' in phase;
  const isVoting = phase && 'Voting' in phase;

  const handleCreateElection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !trusteePk) {
      setStatusMessage({ type: 'error', text: 'Please provide both election title and trustee public key.' });
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      const res = await createElection(title, trusteePk.trim(), BigInt(0), BigInt(0));
      setStatusMessage({ type: 'success', text: res });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to create election' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegisterVoters = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voterPrincipalsText.trim()) return;

    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      const lines = voterPrincipalsText.split('\n').map((l) => l.trim()).filter(Boolean);
      const principals = lines.map((p) => Principal.fromText(p));
      const added = await registerVoters(principals);
      setStatusMessage({ type: 'success', text: `Successfully registered ${added.toString()} voter principals.` });
      setVoterPrincipalsText('');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to register voters' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenVoting = async () => {
    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      const res = await openVoting();
      setStatusMessage({ type: 'success', text: res });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to open voting' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseVoting = async () => {
    try {
      setIsSubmitting(true);
      setStatusMessage(null);
      const res = await closeVoting();
      setStatusMessage({ type: 'success', text: res });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to close voting' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 className="card-title">Election Administration</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Manage election parameters, voter registry, and lifecycle phases.
            </p>
          </div>
          <PhaseBadge phase={phase} />
        </div>

        {statusMessage && (
          <div className={`alert ${statusMessage.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
            {statusMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{statusMessage.text}</span>
          </div>
        )}
      </div>

      <div className="grid-2">
        {/* Create Election Card */}
        <div className="card">
          <div className="card-title">
            <PlusCircle size={20} /> Initialize Election
          </div>
          <form onSubmit={handleCreateElection} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Election Title</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 2026 Governance Referendum"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!auth.isAuthenticated || isSubmitting}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Trustee Master Public Key (0x...)</label>
              <input
                type="text"
                className="form-input"
                placeholder="0x04..."
                value={trusteePk}
                onChange={(e) => setTrusteePk(e.target.value)}
                disabled={!auth.isAuthenticated || isSubmitting}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!auth.isAuthenticated || isSubmitting}
            >
              Initialize Election in Setup Phase
            </button>
          </form>
        </div>

        {/* Register Voters Card */}
        <div className="card">
          <div className="card-title">
            <UserPlus size={20} /> Register Eligible Voters
          </div>
          <form onSubmit={handleRegisterVoters} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Voter Principals (One per line)</label>
              <textarea
                className="form-textarea"
                placeholder="2vxsx-fae&#10;bkyz2-fmaaa-aaaaa-qaaaq-cai"
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
        </div>
      </div>

      {/* Phase Transition Actions */}
      <div className="card">
        <div className="card-title">Election Phase Controls</div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          Strict state machine guarded on canister: Setup &rarr; Voting &rarr; Tallying &rarr; Complete.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-success"
            onClick={handleOpenVoting}
            disabled={!isSetup || !auth.isAuthenticated || isSubmitting}
          >
            <Play size={16} /> Open Voting Phase
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleCloseVoting}
            disabled={!isVoting || !auth.isAuthenticated || isSubmitting}
            style={{ color: '#ef4444' }}
          >
            <Square size={16} /> Close Voting & Begin Tallying
          </button>
        </div>
      </div>
    </div>
  );
};
