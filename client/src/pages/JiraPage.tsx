import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  connectJira,
  createTicket,
  disconnectJira,
  jiraStatus,
  listProjects,
  listRecentTickets,
  type JiraConnectionState,
  type JiraProjectSummary,
  type JiraRecentTicket,
} from '../api/jira';
import { useCurrentUser } from '../hooks/useCurrentUser';

export function JiraPage(): JSX.Element {
  const auth = useCurrentUser();
  const [connection, setConnection] = useState<JiraConnectionState | null>(
    null,
  );
  const [siteUrl, setSiteUrl] = useState('');
  const [email, setEmail] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [projects, setProjects] = useState<JiraProjectSummary[]>([]);
  const [projectKey, setProjectKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recent, setRecent] = useState<JiraRecentTicket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    jiraStatus()
      .then((state) => {
        setConnection(state);
        if (state.connected) {
          void refreshProjects(state);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'unable to load status');
      });
  }, []);

  async function refreshProjects(state: JiraConnectionState): Promise<void> {
    try {
      setProjects(await listProjects());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unable to load projects');
    }
    if (state.siteUrl) {
      setSiteUrl(state.siteUrl);
    }
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  if (auth.status === 'loading') {
    return <main className="page">Checking session…</main>;
  }

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
      await refreshProjects(state);
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
      setProjects([]);
      setRecent([]);
      setProjectKey('');
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to disconnect');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createTicket(projectKey, title, description);
      setTitle('');
      setDescription('');
      setRecent(await listRecentTickets(projectKey));
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to create ticket',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleListRecent = async (refresh = false): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (projectKey === '') {
        throw new Error('Select a project first');
      }
      setRecent(await listRecentTickets(projectKey, refresh));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unable to load tickets');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <Link to="/">← Back</Link>
      <h1>Jira Integration</h1>

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

      {connection?.connected && (
        <>
          <h2>Projects</h2>
          {projects.length === 0 ? (
            <p>No projects found.</p>
          ) : (
            <label>
              Project
              <select
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
              >
                <option value="">Select a project…</option>
                {projects.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.key} — {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <form onSubmit={(e) => void handleCreate(e)}>
            <h2>Create ticket</h2>
            <label>
              Title
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>
            <label>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>
            {error !== null && <p className="err">{error}</p>}
            <button type="submit" disabled={busy || projectKey === ''}>
              {busy ? 'Creating…' : 'Create ticket'}
            </button>
          </form>
          <h2>Recent tickets</h2>
          <button
            type="button"
            disabled={busy || projectKey === ''}
            onClick={() => void handleListRecent(false)}
          >
            Load recent
          </button>{' '}
          <button
            type="button"
            disabled={busy || projectKey === ''}
            onClick={() => void handleListRecent(true)}
          >
            Refresh
          </button>
          {recent.length > 0 && (
            <ul>
              {recent.map((t) => (
                <li key={t.key}>
                  <a href={t.url} target="_blank" rel="noreferrer">
                    {t.key}
                  </a>{' '}
                  — {t.title}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error !== null && connection?.connected && (
        <p className="err">{error}</p>
      )}
    </main>
  );
}
