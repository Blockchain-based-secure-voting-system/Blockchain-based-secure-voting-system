import React from 'react';
import type { ElectionPhase } from '../declarations/canister/canister.did';

export function getPhaseName(phase?: ElectionPhase | null): 'Not Initialized' | 'Setup' | 'Voting' | 'Tallying' | 'Complete' {
  if (!phase) return 'Not Initialized';
  if ('Setup' in phase) return 'Setup';
  if ('Voting' in phase) return 'Voting';
  if ('Tallying' in phase) return 'Tallying';
  if ('Complete' in phase) return 'Complete';
  return 'Not Initialized';
}

export const PhaseBadge: React.FC<{ phase?: ElectionPhase | null }> = ({ phase }) => {
  const name = getPhaseName(phase);

  if (name === 'Setup') {
    return <span className="badge">Phase 1: Setup</span>;
  }
  if (name === 'Voting') {
    return <span className="badge">Phase 2: Voting Open</span>;
  }
  if (name === 'Tallying') {
    return <span className="badge">Phase 3: Tallying</span>;
  }
  if (name === 'Complete') {
    return <span className="badge">Phase 4: Complete &amp; Verified</span>;
  }

  return <span className="badge badge-neutral">Not Initialized</span>;
};
