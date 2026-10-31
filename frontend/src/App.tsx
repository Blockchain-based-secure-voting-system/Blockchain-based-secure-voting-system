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

        {auth.sessionExpired && (
          <div className="alert alert-info" role="status" aria-live="polite" data-testid="session-expired-banner">
            <Clock size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>[SESSION EXPIRED]:</strong> Your Internet Identity delegation has expired. You have been returned
                to a signed-out state. Reconnect when ready.
              </span>
              <button type="button" className="btn btn-primary btn-sm" onClick={auth.login}>
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
                <strong>[SLOW NETWORK DETECTED]:</strong> Canister verification is taking longer than expected (&gt;3s).
                The Internet Computer replica may be busy verifying elliptic-curve proofs.
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
                <strong>[CANISTER CONNECTION ERROR]:</strong> {canister.error}
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
