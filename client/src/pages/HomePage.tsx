import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { logout } from '../api/auth';
import { useCurrentUser } from '../hooks/useCurrentUser';

export function HomePage(): JSX.Element {
  const auth = useCurrentUser();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  if (auth.status === 'loading') {
    return <main className="page">Checking session…</main>;
  }

  const handleLogout = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await logout();
      void navigate('/login', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'logout failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1>IdentityHub — NHI Jira Integration</h1>
      <p>
        Signed in as <strong>{auth.user.email}</strong>.
      </p>
      <p className="ok">Connected ✓</p>
      {error !== null && <p className="err">{error}</p>}
      <button type="button" disabled={busy} onClick={() => void handleLogout()}>
        {busy ? 'Logging out…' : 'Log out'}
      </button>
    </main>
  );
}
