import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { login, signup } from '../api/auth';
import { useCurrentUser } from '../hooks/useCurrentUser';

interface AuthPageProps {
  mode: 'login' | 'signup';
}

export function AuthPage({ mode }: AuthPageProps): JSX.Element {
  const isSignup = mode === 'signup';
  const auth = useCurrentUser();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        await signup(email, password);
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
