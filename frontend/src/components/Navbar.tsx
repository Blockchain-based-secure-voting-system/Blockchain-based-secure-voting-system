import React from 'react';
import {
  ShieldCheck,
  UserCheck,
  Key,
  Eye,
  LogIn,
  LogOut,
  CheckCircle2,
  Sun,
  Moon,
  Home,
  BookOpen,
  HelpCircle,
  Compass,
} from 'lucide-react';
import type { AuthContextType } from '../hooks/useAuth';
import type { ElectionPhase } from '../declarations/canister/canister.did';
import type { RoutePath, WalkthroughRole } from '../content/copy';
import { getPhaseName } from './PhaseBadge';

export type ThemeMode = 'light' | 'dark';

interface NavbarProps {
  currentPath: RoutePath;
  onNavigate: (path: RoutePath) => void;
  onOpenWalkthrough: (role: WalkthroughRole) => void;
  auth: AuthContextType;
  theme: ThemeMode;
  onToggleTheme: () => void;
  phase?: ElectionPhase | null;
}

const PHASES: Array<'Setup' | 'Voting' | 'Tallying' | 'Complete'> = ['Setup', 'Voting', 'Tallying', 'Complete'];

const NAV_ITEMS: Array<{ path: RoutePath; label: string; icon: React.ReactNode }> = [
  { path: '/', label: 'Home', icon: <Home size={15} aria-hidden="true" /> },
  { path: '/vote', label: 'Vote', icon: <UserCheck size={15} aria-hidden="true" /> },
  { path: '/verify', label: 'Verify results', icon: <Eye size={15} aria-hidden="true" /> },
  { path: '/admin', label: 'Run an election', icon: <ShieldCheck size={15} aria-hidden="true" /> },
  { path: '/trustee', label: 'Trustee', icon: <Key size={15} aria-hidden="true" /> },
  { path: '/learn', label: 'Learn', icon: <BookOpen size={15} aria-hidden="true" /> },
  { path: '/help', label: 'Accessibility and help', icon: <HelpCircle size={15} aria-hidden="true" /> },
];

export const Navbar: React.FC<NavbarProps> = ({
  currentPath,
  onNavigate,
  onOpenWalkthrough,
  auth,
  theme,
  onToggleTheme,
  phase,
}) => {
  const activePhase = getPhaseName(phase);

  const defaultWalkthroughRole: WalkthroughRole =
    currentPath === '/admin'
      ? 'admin'
      : currentPath === '/trustee'
        ? 'trustee'
        : currentPath === '/verify'
          ? 'observer'
          : 'voter';

  return (
    <div className="stack-md">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="header-nav">
        <div className="brand-section">
          <ShieldCheck className="brand-icon" size={28} aria-hidden="true" />
          <div className="stack-sm">
            <span className="brand-title">ICP Zero-Knowledge Voting</span>
            <div>
              <span className="brand-badge">BN254 Homomorphic ElGamal</span>
            </div>
          </div>
        </div>

        <nav className="role-tabs" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const isActive = currentPath === item.path;
            return (
              <a
                key={item.path}
                href={item.path}
                className={`role-tab-btn ${isActive ? 'active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                style={{ textDecoration: 'none' }}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.path);
                }}
              >
                {item.icon} {item.label}
              </a>
            );
          })}
        </nav>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onOpenWalkthrough(defaultWalkthroughRole)}
            aria-label="Open Guided Role Walkthrough"
          >
            <Compass size={14} aria-hidden="true" /> Walkthrough
          </button>

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
