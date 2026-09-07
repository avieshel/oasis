import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  listTenants,
  login,
  signup,
  type TenantSummary,
  type SignupTenantSelection,
} from '../api/auth';
import { useCurrentUser } from '../hooks/useCurrentUser';

interface AuthPageProps {
  mode: 'login' | 'signup';
}

type TenantMode = 'join' | 'create';

export function AuthPage({ mode }: AuthPageProps): JSX.Element {
  const isSignup = mode === 'signup';
  const auth = useCurrentUser();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [tenantMode, setTenantMode] = useState<TenantMode>('join');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!isSignup) return;
    let cancelled = false;
    void listTenants()
      .then((list) => {
        if (cancelled) return;
        setTenants(list);
        if (list.length > 0) {
          setSelectedTenantId(list[0].id);
        } else {
          setTenantMode('create');
        }
      })
      .catch(() => {
        // Tenant list is optional — fall back to create mode.
        if (!cancelled) setTenantMode('create');
      });
    return () => {
      cancelled = true;
    };
  }, [isSignup]);

  if (auth.status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  if (auth.status === 'loading') {
    return <main className="page">Checking session…</main>;
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSignup) {
        const selection: SignupTenantSelection =
          tenantMode === 'join'
            ? { tenant_id: selectedTenantId }
            : { new_tenant: { slug: newSlug, name: newName } };
        await signup(email, password, selection);
      }
      await login(email, password);
      void navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : isSignup
            ? 'unable to create account'
            : 'unable to log in',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <h1>{isSignup ? 'Create account' : 'Log in'}</h1>
      <form onSubmit={(e) => void handleSubmit(e)}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Password{isSignup && ' (at least 8 characters)'}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            minLength={isSignup ? 8 : undefined}
            required
          />
        </label>
        {isSignup && (
          <fieldset className="tenant-picker">
            <legend>Tenant</legend>
            <label className="radio">
              <input
                type="radio"
                name="tenant-mode"
                value="join"
                checked={tenantMode === 'join'}
                onChange={() => setTenantMode('join')}
                disabled={tenants.length === 0}
              />
              Join existing
            </label>
            <label className="radio">
              <input
                type="radio"
                name="tenant-mode"
                value="create"
                checked={tenantMode === 'create'}
                onChange={() => setTenantMode('create')}
              />
              Create new
            </label>
            {tenantMode === 'join' && (
              <label>
                Tenant
                <select
                  value={selectedTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                  required
                  disabled={tenants.length === 0}
                >
                  {tenants.length === 0 && (
                    <option value="">No tenants yet</option>
                  )}
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tenantMode === 'create' && (
              <>
                <label>
                  Tenant slug
                  <input
                    type="text"
                    value={newSlug}
                    onChange={(e) => setNewSlug(e.target.value)}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="acme-corp"
                    required
                  />
                </label>
                <label>
                  Tenant name
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Acme Corp"
                    required
                  />
                </label>
              </>
            )}
          </fieldset>
        )}
        {error !== null && <p className="err">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy
            ? isSignup
              ? 'Creating account…'
              : 'Logging in…'
            : isSignup
              ? 'Create account'
              : 'Log in'}
        </button>
      </form>
      <p>
        {isSignup ? (
          <>
            Already have an account? <Link to="/login">Log in</Link>
          </>
        ) : (
          <>
            No account? <Link to="/signup">Create one</Link>
          </>
        )}
      </p>
    </main>
  );
}
