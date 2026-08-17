import React from 'react';
import { ShieldCheck, UserCheck, Key, Eye, LogIn, LogOut, CheckCircle2 } from 'lucide-react';
import type { AuthContextType } from '../hooks/useAuth';

export type Role = 'public' | 'voter' | 'admin' | 'trustee';

interface NavbarProps {
  currentRole: Role;
  onSelectRole: (role: Role) => void;
  auth: AuthContextType;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRole, onSelectRole, auth }) => {
  return (
    <header className="header-nav">
      <div className="brand-section">
        <ShieldCheck className="text-blue-500" size={28} />
        <div>
          <div className="brand-title">ICP Zero-Knowledge Voting</div>
          <div className="brand-badge">BN254 Homomorphic ElGamal</div>
        </div>
      </div>

      <nav className="role-tabs">
        <button
          className={`role-tab-btn ${currentRole === 'public' ? 'active' : ''}`}
          onClick={() => onSelectRole('public')}
        >
          <Eye size={15} style={{ display: 'inline', marginRight: '4px' }} /> Public Tally
        </button>
        <button
          className={`role-tab-btn ${currentRole === 'voter' ? 'active' : ''}`}
          onClick={() => onSelectRole('voter')}
        >
          <UserCheck size={15} style={{ display: 'inline', marginRight: '4px' }} /> Voter
        </button>
        <button
          className={`role-tab-btn ${currentRole === 'admin' ? 'active' : ''}`}
          onClick={() => onSelectRole('admin')}
        >
          <ShieldCheck size={15} style={{ display: 'inline', marginRight: '4px' }} /> Admin
        </button>
        <button
          className={`role-tab-btn ${currentRole === 'trustee' ? 'active' : ''}`}
          onClick={() => onSelectRole('trustee')}
        >
          <Key size={15} style={{ display: 'inline', marginRight: '4px' }} /> Trustee Key Custody
        </button>
      </nav>

      <div>
        {auth.isAuthenticated ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              <CheckCircle2 size={14} color="#10b981" style={{ display: 'inline', marginRight: '4px' }} />
              {auth.principalText.slice(0, 5)}...{auth.principalText.slice(-3)}
            </span>
            <button className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }} onClick={auth.logout}>
              <LogOut size={14} /> Disconnect
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }} onClick={auth.login}>
            <LogIn size={14} /> Internet Identity
          </button>
        )}
      </div>
    </header>
  );
};
