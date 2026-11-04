import React, { useState, useEffect, useRef } from 'react';
import { ROLE_WALKTHROUGHS, type RoutePath, type WalkthroughRole } from '../content/copy';

interface WalkthroughModalProps {
  isOpen: boolean;
  initialRole: WalkthroughRole;
  onClose: () => void;
  onNavigate: (path: RoutePath) => void;
}

export const WalkthroughModal: React.FC<WalkthroughModalProps> = ({
  isOpen,
  initialRole,
  onClose,
  onNavigate,
}) => {
  const [role, setRole] = useState<WalkthroughRole>(initialRole);
  const [stepIdx, setStepIdx] = useState<number>(0);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setRole(initialRole);
    setStepIdx(0);
  }, [initialRole, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    closeBtnRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setStepIdx((prev) => Math.min(prev + 1, ROLE_WALKTHROUGHS[role].steps.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setStepIdx((prev) => Math.max(prev - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, role, onClose]);

  if (!isOpen) return null;

  const walkthrough = ROLE_WALKTHROUGHS[role];
  const currentStep = walkthrough.steps[stepIdx] || walkthrough.steps[0];
  const totalSteps = walkthrough.steps.length;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="walkthrough-modal-title"
      aria-describedby="walkthrough-modal-desc"
      ref={dialogRef}
      data-testid="walkthrough-modal"
    >
      <div className="modal-card" style={{ maxWidth: '640px' }}>
        <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <span className="badge badge-cobalt">Interactive Role Walkthrough</span>
          <button
            ref={closeBtnRef}
            type="button"
            className="btn-secondary"
            style={{ minHeight: '36px', padding: '0.3rem 0.75rem', fontSize: '0.82rem' }}
            onClick={onClose}
            aria-label="Skip and close walkthrough"
          >
            Skip Walkthrough (Esc)
          </button>
        </div>

        {/* Role Selector Tabs */}
        <div
          role="tablist"
          aria-label="Select role walkthrough"
          className="flex gap-2 mb-4"
          style={{ flexWrap: 'wrap', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}
        >
          {(['voter', 'observer', 'admin', 'trustee'] as WalkthroughRole[]).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={role === r}
              className={role === r ? 'btn-primary' : 'btn-secondary'}
              style={{ minHeight: '36px', padding: '0.35rem 0.8rem', fontSize: '0.82rem' }}
              onClick={() => {
                setRole(r);
                setStepIdx(0);
              }}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)} Guide
            </button>
          ))}
        </div>

        <h2 id="walkthrough-modal-title" style={{ marginBottom: '0.25rem' }}>
          {walkthrough.roleTitle}
        </h2>
        <p id="walkthrough-modal-desc" className="text-secondary mb-4" style={{ fontSize: '0.9rem' }}>
          {walkthrough.roleSubtitle}
        </p>

        {/* Live Step Announcement Region */}
        <div
          aria-live="polite"
          aria-atomic="true"
          style={{
            padding: '1.1rem',
            backgroundColor: 'var(--bg-subtle)',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            marginBottom: '1rem',
          }}
        >
          <div className="flex justify-between items-center mb-2">
            <span className="badge badge-neutral">
              Step {currentStep.stepNumber} of {totalSteps}
            </span>
            <span className="text-muted" style={{ fontSize: '0.78rem' }}>
              Use Left/Right arrow keys or buttons below
            </span>
          </div>

          <h3 style={{ fontSize: '1.08rem', marginBottom: '0.5rem' }}>{currentStep.title}</h3>
          <p className="text-secondary mb-4" style={{ lineHeight: 1.55 }}>
            {currentStep.plainSummary}
          </p>

          {currentStep.devicePrivacyNote && (
            <div
              className="grid grid-cols-2 mb-4"
              style={{
                gap: '0.75rem',
                padding: '0.85rem',
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                fontSize: '0.82rem',
              }}
            >
              <div>
                <strong style={{ color: 'var(--cobalt-accent-text)', display: 'block', marginBottom: '0.35rem' }}>
                  What Leaves Your Device (Sent to Server):
                </strong>
                <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                  {currentStep.devicePrivacyNote.leavesDevice.map((item, i) => (
                    <li key={i} style={{ marginBottom: '0.25rem' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '0.35rem' }}>
                  What NEVER Leaves Your Device:
                </strong>
                <ul style={{ paddingLeft: '1.1rem', margin: 0 }}>
                  {currentStep.devicePrivacyNote.neverLeavesDevice.map((item, i) => (
                    <li key={i} style={{ marginBottom: '0.25rem' }}>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <p style={{ fontSize: '0.84rem', margin: 0 }}>
            <strong>Tip:</strong> {currentStep.actionHint}
          </p>
        </div>

        <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn-secondary"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((prev) => Math.max(prev - 1, 0))}
          >
            Previous Step
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onNavigate(walkthrough.targetRoute);
                onClose();
              }}
            >
              Go to {walkthrough.targetRoute}
            </button>
            {stepIdx < totalSteps - 1 ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setStepIdx((prev) => Math.min(prev + 1, totalSteps - 1))}
              >
                Next Step
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={onClose}>
                Finish Walkthrough
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
