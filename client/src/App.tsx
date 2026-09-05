import { useEffect, useState } from 'react';

type HealthStatus =
  { state: 'checking' } | { state: 'ok' } | { state: 'error'; message: string };

export function App(): JSX.Element {
  const [health, setHealth] = useState<HealthStatus>({ state: 'checking' });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/healthz')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`health check failed: ${res.status}`);
        }
        return res.json();
      })
      .then(() => {
        if (!cancelled) {
          setHealth({ state: 'ok' });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'unable to reach backend';
          setHealth({ state: 'error', message });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="page">
      <h1>IdentityHub — NHI Jira Integration</h1>
      <p>
        {health.state === 'checking' && <span>Checking backend…</span>}
        {health.state === 'ok' && (
          <span className="ok">IdentityHub — connected ✓</span>
        )}
        {health.state === 'error' && (
          <span className="err">Backend unreachable: {health.message}</span>
        )}
      </p>
    </main>
  );
}
