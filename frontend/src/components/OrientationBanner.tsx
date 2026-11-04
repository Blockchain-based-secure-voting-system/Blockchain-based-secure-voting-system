import React from 'react';
import { GLOSSARY, type GlossaryKey, type RoutePath, type ScreenOrientation, type WalkthroughRole } from '../content/copy';
import { formatCanisterTime, isVotingDeadlineExpiredButPhaseOpen, PHASE_VOCABULARY, resolvePhaseKey } from '../content/errors';
import type { ElectionDetails } from '../types/election';

interface GlossaryTermProps {
  term: GlossaryKey;
  children?: React.ReactNode;
  onNavigate?: (path: RoutePath) => void;
}

export const GlossaryTerm: React.FC<GlossaryTermProps> = ({ term, children, onNavigate }) => {
  const entry = GLOSSARY[term];
  return (
    <a
      href={`/learn#glossary-${term}`}
      onClick={(e) => {
        if (onNavigate) {
          e.preventDefault();
          onNavigate('/learn');
          setTimeout(() => {
            const el = document.getElementById(`glossary-${term}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
        }
      }}
      title={`${entry.label}: ${entry.plainDefinition}`}
      style={{
        color: 'var(--cobalt-accent-text)',
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '3px',
        fontWeight: 600,
      }}
    >
      {children || entry.label}
    </a>
  );
};

interface DeadlineBadgeProps {
  label: string;
  timestampNsOrSec: bigint;
}

export const DeadlineDisplay: React.FC<DeadlineBadgeProps> = ({ label, timestampNsOrSec }) => {
  const formatted = formatCanisterTime(timestampNsOrSec);
  return (
    <span
      tabIndex={0}
      title={formatted.utcFormatted}
      style={{
        display: 'inline-block',
        borderBottom: formatted.isSet ? '1px dotted var(--text-muted)' : 'none',
        cursor: formatted.isSet ? 'help' : 'default',
      }}
    >
      <strong>{label}:</strong> {formatted.localFormatted}{' '}
      {formatted.isSet && (
        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
          ({formatted.utcFormatted})
        </span>
      )}
    </span>
  );
};

interface OrientationBannerProps {
  orientation: ScreenOrientation;
  electionDetails: ElectionDetails | null;
  walkthroughRole?: WalkthroughRole;
  onOpenWalkthrough?: (role: WalkthroughRole) => void;
  onNavigate?: (path: RoutePath) => void;
}

export const OrientationBanner: React.FC<OrientationBannerProps> = ({
  orientation,
  electionDetails,
  walkthroughRole,
  onOpenWalkthrough,
  onNavigate,
}) => {
  const phaseKey = resolvePhaseKey(electionDetails?.phase);
  const phaseInfo = phaseKey ? PHASE_VOCABULARY[phaseKey] : null;
  const isDeadlineExpiredWhileOpen = isVotingDeadlineExpiredButPhaseOpen(
    electionDetails?.phase,
    electionDetails?.end_time
  );

  return (
    <section
      aria-label="Page Orientation and Election Phase Summary"
      className="card mb-6"
      style={{ borderLeft: '4px solid var(--cobalt-primary)', padding: '1.15rem 1.25rem' }}
    >
      <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <span className="badge badge-cobalt">
            {phaseInfo ? phaseInfo.badgeLabel : 'Server Status: Syncing / Uninitialized'}
          </span>
          {electionDetails && (electionDetails.start_time > 0n || electionDetails.end_time > 0n) && (
            <span className="text-secondary" style={{ fontSize: '0.85rem' }}>
              <DeadlineDisplay label="Opens" timestampNsOrSec={electionDetails.start_time} />
              {' · '}
              <DeadlineDisplay label="Closes" timestampNsOrSec={electionDetails.end_time} />
            </span>
          )}
        </div>

        {walkthroughRole && onOpenWalkthrough && (
          <button
            type="button"
            className="btn-secondary"
            style={{ minHeight: '36px', padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
            onClick={() => onOpenWalkthrough(walkthroughRole)}
          >
            Guided Walkthrough ({walkthroughRole.toUpperCase()})
          </button>
        )}
      </div>

      {isDeadlineExpiredWhileOpen && (
        <div className="status-banner mb-4" role="status" aria-live="polite" data-testid="deadline-expired-banner">
          <span className="status-prefix">[DEADLINE PASSED — AWAITING ADMIN TRANSITION]:</span> The scheduled voting
          closing time ({formatCanisterTime(electionDetails!.end_time).localFormatted} /{' '}
          {formatCanisterTime(electionDetails!.end_time).utcFormatted}) has passed by wall-clock time. New ballots will
          be rejected by the server deadline check, and the administrator should now transition the phase from{' '}
          <strong>Voting</strong> to <strong>Tallying</strong> in{' '}
          {onNavigate ? (
            <a
              href={`/admin${typeof window !== 'undefined' ? window.location.search : ''}`}
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/admin');
              }}
              style={{ color: 'var(--cobalt-accent-text)', fontWeight: 700 }}
            >
              Run an election (/admin)
            </a>
          ) : (
            '/admin'
          )}
          .
        </div>
      )}

      <div className="grid grid-cols-2" style={{ gap: '0.85rem', fontSize: '0.88rem' }}>
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>Where am I?</strong>
          <p className="text-secondary" style={{ marginTop: '0.2rem' }}>
            {orientation.whereAmI}
          </p>
        </div>
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>What can I do now?</strong>
          <p className="text-secondary" style={{ marginTop: '0.2rem' }}>
            {orientation.whatCanIDoNow}
          </p>
        </div>
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>What happens next?</strong>
          <p className="text-secondary" style={{ marginTop: '0.2rem' }}>
            {orientation.whatHappensNext}
          </p>
        </div>
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>What if something goes wrong?</strong>
          <p className="text-secondary" style={{ marginTop: '0.2rem' }}>
            {orientation.whatIfSomethingGoesWrong}
          </p>
        </div>
      </div>
    </section>
  );
};
