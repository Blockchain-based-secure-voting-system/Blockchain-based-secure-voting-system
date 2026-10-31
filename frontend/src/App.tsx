import { useState, useEffect } from 'react';
import { Navbar, Role, ThemeMode } from './components/Navbar';
import { PublicView } from './views/PublicView';
import { VoterView } from './views/VoterView';
import { AdminView } from './views/AdminView';
import { TrusteeView } from './views/TrusteeView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAuth } from './hooks/useAuth';
import { useCanister } from './hooks/useCanister';
import { AlertCircle, RefreshCw, Clock } from 'lucide-react';

function getInitialTheme(): ThemeMode {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  }
  return 'light';
}

export function App() {
  const [currentRole, setCurrentRole] = useState<Role>('public');
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const auth = useAuth();
  const canister = useCanister(auth.identity);

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
          currentRole={currentRole}
          onSelectRole={setCurrentRole}
          auth={auth}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          phase={canister.electionDetails?.phase}
        />

        {auth.sessionExpired && (
          <div className="alert alert-info" role="status" aria-live="polite">
            <Clock size={18} aria-hidden="true" />
            <span>
              <strong>Session Expired:</strong> Your Internet Identity delegation has expired. You have been returned to a logged-out state. Reconnect when ready.
            </span>
          </div>
        )}

        {canister.error && (
          <div className="alert alert-danger" role="alert" aria-live="assertive">
            <AlertCircle size={18} aria-hidden="true" />
            <div className="row-between" style={{ width: '100%' }}>
              <span>
                <strong>Cannot Reach Canister:</strong> {canister.error}
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

        <main aria-label="Election Portal Content">
          {currentRole === 'public' && <PublicView canister={canister} />}
          {currentRole === 'voter' && <VoterView canister={canister} auth={auth} />}
          {currentRole === 'admin' && <AdminView canister={canister} auth={auth} />}
          {currentRole === 'trustee' && <TrusteeView canister={canister} />}
        </main>
      </div>
    </ErrorBoundary>
  );
}

export default App;
