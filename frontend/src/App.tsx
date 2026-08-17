import { useState } from 'react';
import { Navbar, Role } from './components/Navbar';
import { PublicView } from './views/PublicView';
import { VoterView } from './views/VoterView';
import { AdminView } from './views/AdminView';
import { TrusteeView } from './views/TrusteeView';
import { useAuth } from './hooks/useAuth';
import { useCanister } from './hooks/useCanister';
import { AlertCircle } from 'lucide-react';

export function App() {
  const [currentRole, setCurrentRole] = useState<Role>('public');
  const auth = useAuth();
  const canister = useCanister(auth.identity);

  return (
    <div className="app-container">
      <Navbar
        currentRole={currentRole}
        onSelectRole={setCurrentRole}
        auth={auth}
      />

      {canister.error && (
        <div className="alert alert-danger">
          <AlertCircle size={18} />
          <span>Canister Connection Notice: {canister.error}</span>
        </div>
      )}

      <main>
        {currentRole === 'public' && <PublicView canister={canister} />}
        {currentRole === 'voter' && <VoterView canister={canister} auth={auth} />}
        {currentRole === 'admin' && <AdminView canister={canister} auth={auth} />}
        {currentRole === 'trustee' && <TrusteeView canister={canister} />}
      </main>
    </div>
  );
}

export default App;
