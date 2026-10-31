import React from 'react';
import { ShieldCheck, UserCheck, Key, Eye, LogIn, LogOut, CheckCircle2, Sun, Moon } from 'lucide-react';
import type { AuthContextType } from '../hooks/useAuth';
import type { ElectionPhase } from '../declarations/canister/canister.did';
import { getPhaseName } from './PhaseBadge';

export type Role = 'public' | 'voter' | 'admin' | 'trustee';
export type ThemeMode = 'light' | 'dark';

interface NavbarProps {
  currentRole: Role;
  onSelectRole: (role: Role) => void;
  auth: AuthContextType;
  theme: ThemeMode;
  onToggleTheme: () => void;
  phase?: ElectionPhase | null;
}

const PHASES: Array<'Setup' | 'Voting' | 'Tallying' | 'Complete'> = ['Setup', 'Voting', 'Tallying', 'Complete'];

export const Navbar: React.FC<NavbarProps> = ({
  currentRole,
  onSelectRole,
  auth,
  theme,
  onToggleTheme,
  phase,
}) => {
  const activePhase = getPhaseName(phase);

  return (
    <div className="stack-md">
      <header className="header-nav">
        <div className="brand-section">
          <ShieldCheck className="brand-icon" size={28} aria-hidden="true" />
          <div className="stack-sm">
            <h1 className="brand-title">ICP Zero-Knowledge Voting</h1>
            <div>
              <span className="brand-badge">BN254 Homomorphic ElGamal</span>
            </div>
          </div>
        </div>

        <nav className="role-tabs" aria-label="Election Role Portals">
          <button
            type="button"
            className={`role-tab-btn ${currentRole === 'public' ? 'active' : ''}`}
            aria-current={currentRole === 'public' ? 'page' : undefined}
            onClick={() => onSelectRole('public')}
          >
            <Eye size={15} aria-hidden="true" /> Public Tally
          </button>
          <button
            type="button"
            className={`role-tab-btn ${currentRole === 'voter' ? 'active' : ''}`}
            aria-current={currentRole === 'voter' ? 'page' : undefined}
            onClick={() => onSelectRole('voter')}
          >
            <UserCheck size={15} aria-hidden="true" /> Voter
          </button>
          <button
            type="button"
            className={`role-tab-btn ${currentRole === 'admin' ? 'active' : ''}`}
            aria-current={currentRole === 'admin' ? 'page' : undefined}
            onClick={() => onSelectRole('admin')}
          >
            <ShieldCheck size={15} aria-hidden="true" /> Admin
          </button>
          <button
            type="button"
            className={`role-tab-btn ${currentRole === 'trustee' ? 'active' : ''}`}
            aria-current={currentRole === 'trustee' ? 'page' : undefined}
            onClick={() => onSelectRole('trustee')}
          >
            <Key size={15} aria-hidden="true" /> Trustee Key Custody
          </button>
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onToggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? (
              <>
                <Moon size={14} aria-hidden="true" /> Dark Theme
              </>
            ) : (
              <>
                <Sun size={14} aria-hidden="true" /> Light Theme
              </>
            )}
          </button>

          {auth.isAuthenticated ? (
            <div className="row-wrap">
              <span className="text-mono" aria-label="Authenticated Principal">
                <CheckCircle2 size={14} aria-hidden="true" />{' '}
                {auth.principalText.slice(0, 5)}...{auth.principalText.slice(-3)}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={auth.logout}>
                <LogOut size={14} aria-hidden="true" /> Disconnect
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary btn-sm" onClick={auth.login}>
              <LogIn size={14} aria-hidden="true" /> Internet Identity
            </button>
          )}
        </div>
      </header>

      <div className="phase-banner" role="status" aria-live="polite" aria-label="Persistent Election Lifecycle Phase Indicator">
        <div>
          <span>Active Canister Lifecycle Phase: </span>
          <strong>{activePhase}</strong>
        </div>
        <div className="phase-steps">
          {PHASES.map((p) => (
            <span
              key={p}
              className={`phase-step-pill ${activePhase === p ? 'current' : ''}`}
              aria-current={activePhase === p ? 'step' : undefined}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
