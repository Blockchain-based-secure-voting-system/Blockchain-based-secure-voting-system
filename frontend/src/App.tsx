import { useState, useEffect, useCallback } from 'react';
import { Navbar, type ThemeMode } from './components/Navbar';
import { HomeView } from './views/HomeView';
import { PublicView } from './views/PublicView';
import { VoterView } from './views/VoterView';
import { AdminView } from './views/AdminView';
import { TrusteeView } from './views/TrusteeView';
import { LearnView } from './views/LearnView';
import { HelpView } from './views/HelpView';
import { WalkthroughModal } from './components/WalkthroughModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { useCanister } from './hooks/useCanister';
import { ROUTES, type RoutePath, type WalkthroughRole } from './content/copy';
import { AlertCircle, RefreshCw, Clock } from 'lucide-react';

function getInitialTheme(): ThemeMode {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  }
  return 'light';
}

function normalizeRoutePath(pathname: string): RoutePath {
  const validPaths = ROUTES.map((r) => r.path);
  if (validPaths.includes(pathname as RoutePath)) {
    return pathname as RoutePath;
  }
  return '/';
}

export function App() {
  const [currentPath, setCurrentPath] = useState<RoutePath>(() =>
    typeof window !== 'undefined' ? normalizeRoutePath(window.location.pathname) : '/'
  );
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [walkthroughOpen, setWalkthroughOpen] = useState<boolean>(false);
  const [walkthroughRole, setWalkthroughRole] = useState<WalkthroughRole>('voter');

  const auth = useAuth();
  const canister = useCanister(auth.identity);

  const navigateTo = useCallback((path: RoutePath) => {
    if (typeof window !== 'undefined') {
      const search = window.location.search || '';
      const targetUrl = `${path}${search}`;
      if (window.location.pathname !== path) {
        window.history.pushState({ path }, '', targetUrl);
      }
    }
    setCurrentPath(path);
  }, []);

  const handleOpenWalkthrough = useCallback((role: WalkthroughRole) => {
    setWalkthroughRole(role);
    setWalkthroughOpen(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setCurrentPath(normalizeRoutePath(window.location.pathname));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const handleToggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <ErrorBoundary>
      <div className="app-container">
        <Navbar
          currentPath={currentPath}
          onNavigate={navigateTo}
          onOpenWalkthrough={handleOpenWalkthrough}
          auth={auth}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          phase={canister.electionDetails?.phase}
        />

        <div className="alert alert-info" role="note" aria-label="System Architecture Notice" data-testid="demo-notice-banner">
          <Clock size={18} aria-hidden="true" />
          <div style={{ width: '100%' }}>
            <strong>[SYSTEM ARCHITECTURE NOTICE]:</strong> (1) The backend runs as a centralized Rust Axum + PostgreSQL server
            on Render with an append-only cryptographic bulletin board.
            (2) Ballots are encrypted client-side in your browser using BN254 WebAssembly and zero-knowledge range proofs before reaching the network.
            (3) This codebase is an <strong>unaudited reference implementation</strong> and must not be used for binding public
            elections without an independent security audit. (4) When hosted on Vercel, the <strong>Vercel host operator controls
            the JavaScript and WebAssembly bundle</strong> served to your browser that encrypts ballots client-side.
          </div>
        </div>

        {canister.isDemoExpired && (
          <div className="alert alert-danger" role="alert" aria-live="assertive" data-testid="demo-expired-banner">
            <AlertCircle size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>[BACKEND SERVER UNREACHABLE]:</strong> The election server at <code>https://voting-system-api-wi7q.onrender.com</code> could
                not be reached. Verify that the backend is deployed and active on Render or locally, and retry.
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={canister.refreshState}
                disabled={canister.loading}
              >
                <RefreshCw size={14} aria-hidden="true" /> Retry Connection
              </button>
            </div>
          </div>
        )}

        {auth.sessionExpired && (
          <div className="alert alert-info" role="status" aria-live="polite" data-testid="session-expired-banner">
            <Clock size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>[SESSION EXPIRED]:</strong> Your authentication session has expired. You have been returned
                to a signed-out state. Reconnect when ready.
              </span>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void auth.login()}>
                Re-Authenticate Now
              </button>
            </div>
          </div>
        )}

        {canister.isSlowNetwork && canister.loading && (
          <div className="alert alert-info" role="status" aria-live="polite" data-testid="slow-network-banner">
            <Clock size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>[SLOW NETWORK DETECTED]:</strong> Server verification is taking longer than expected (&gt;3s).
                The backend server may be busy processing cryptographic operations.
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={canister.refreshState}>
                <RefreshCw size={14} aria-hidden="true" /> Retry Now
              </button>
            </div>
          </div>
        )}

        {canister.error && (
          <div className="alert alert-danger" role="alert" aria-live="assertive" data-testid="canister-error-banner">
            <AlertCircle size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>[BACKEND CONNECTION ERROR]:</strong> {canister.error}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={canister.refreshState}
                disabled={canister.loading}
              >
                <RefreshCw size={14} aria-hidden="true" /> Retry Connection
              </button>
            </div>
          </div>
        )}

        <main id="main-content" aria-label="Election Portal Content" tabIndex={-1}>
          {currentPath === '/' && (
            <HomeView
              canister={canister}
              onNavigate={navigateTo}
              onOpenWalkthrough={handleOpenWalkthrough}
            />
          )}
          {currentPath === '/verify' && (
            <PublicView
              canister={canister}
              onNavigate={navigateTo}
              onOpenWalkthrough={handleOpenWalkthrough}
            />
          )}
          {currentPath === '/vote' && (
            <VoterView
              canister={canister}
              auth={auth}
              onNavigate={navigateTo}
              onOpenWalkthrough={handleOpenWalkthrough}
            />
          )}
          {currentPath === '/admin' && (
            <AdminView
              canister={canister}
              auth={auth}
              onNavigate={navigateTo}
              onOpenWalkthrough={handleOpenWalkthrough}
            />
          )}
          {currentPath === '/trustee' && (
            <TrusteeView
              canister={canister}
              onNavigate={navigateTo}
              onOpenWalkthrough={handleOpenWalkthrough}
            />
          )}
          {currentPath === '/learn' && (
            <LearnView
              canister={canister}
              onNavigate={navigateTo}
              onOpenWalkthrough={handleOpenWalkthrough}
            />
          )}
          {currentPath === '/help' && (
            <HelpView
              canister={canister}
              onNavigate={navigateTo}
              onOpenWalkthrough={handleOpenWalkthrough}
            />
          )}
        </main>

        <WalkthroughModal
          isOpen={walkthroughOpen}
          initialRole={walkthroughRole}
          onClose={() => setWalkthroughOpen(false)}
          onNavigate={navigateTo}
        />
      </div>
    </ErrorBoundary>
  );
}

export default App;
