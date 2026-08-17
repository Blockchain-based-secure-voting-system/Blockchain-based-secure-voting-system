import React from 'react';
import type { ElectionPhase } from '../declarations/canister/canister.did';

export const PhaseBadge: React.FC<{ phase?: ElectionPhase | null }> = ({ phase }) => {
  if (!phase) {
    return <span className="badge badge-setup">Not Initialized</span>;
  }

  if ('Setup' in phase) {
    return <span className="badge badge-setup">Phase 1: Setup</span>;
  }
  if ('Voting' in phase) {
    return <span className="badge badge-voting">Phase 2: Voting Open</span>;
  }
  if ('Tallying' in phase) {
    return <span className="badge badge-tallying">Phase 3: Tallying</span>;
  }
  if ('Complete' in phase) {
    return <span className="badge badge-complete">Phase 4: Complete & Verified</span>;
  }

  return <span className="badge badge-setup">Unknown</span>;
};
