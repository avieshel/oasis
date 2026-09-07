import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api/client';
import {
  connectJira,
  disconnectJira,
  jiraStatus,
  type JiraConnectionState,
} from '../api/jira';

export function JiraSettings(): JSX.Element {
  const [connection, setConnection] = useState<JiraConnectionState | null>(
    null,
  );
  const [siteUrl, setSiteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    jiraStatus()
      .then(setConnection)
      .catch((err: unknown) => {
        setConnection({ connected: false });
        setError(err instanceof Error ? err.message : 'unable to load status');
      });
  }, []);

  const handleConnect = async (
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const state = await connectJira(siteUrl, email, apiToken);
      setConnection(state);
      setApiToken('');
      if (state.siteUrl) {
        setSiteUrl(state.siteUrl);
      }
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to connect to Jira',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await disconnectJira();
      setConnection({ connected: false });
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to disconnect');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      {connection?.connected ? (
        <>
          <p className="ok">
            Connected ✓ {connection.siteUrl}
            {connection.displayName ? ` (${connection.displayName})` : ''}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleDisconnect()}
          >
            {busy ? 'Working…' : 'Disconnect'}
          </button>
        </>
      ) : (
        <form onSubmit={(e) => void handleConnect(e)}>
          <h2>Connect to Jira</h2>
          <label>
            Site URL
            <input
              type="text"
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://your-domain.atlassian.net"
              required
            />
          </label>
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
            API token
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          {error !== null && <p className="err">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </form>
      )}
    </section>
  );
}
