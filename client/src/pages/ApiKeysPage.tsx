import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import {
  connectKeyJira,
  createApiKey,
  disconnectKeyJira,
  keyJiraStatus,
  listApiKeys,
  revokeApiKey,
  type ApiKeyMeta,
} from '../api/keys';
import type { JiraConnectionState } from '../api/jira';
import { useCurrentUser } from '../hooks/useCurrentUser';

function parseProjectList(raw: string): string[] | null {
  const keys = raw
    .split(/[,\s]+/)
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k.length > 0);
  return keys.length === 0 ? null : keys;
}

export function ApiKeysPage(): JSX.Element {
  const auth = useCurrentUser();
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [name, setName] = useState('');
  const [projectsText, setProjectsText] = useState('');
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, JiraConnectionState>>(
    {},
  );
  const [keyForms, setKeyForms] = useState<
    Record<string, { siteUrl: string; email: string; apiToken: string }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadKeys(): Promise<void> {
    try {
      const items = await listApiKeys();
      setKeys(items);
      for (const key of items) {
        void loadKeyStatus(key.id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unable to load api keys');
    }
  }

  async function loadKeyStatus(id: string): Promise<void> {
    try {
      const state = await keyJiraStatus(id);
      setStatuses((prev) => ({ ...prev, [id]: state }));
    } catch {
      setStatuses((prev) => ({ ...prev, [id]: { connected: false } }));
    }
  }

  useEffect(() => {
    listApiKeys()
      .then((items) => {
        setKeys(items);
        for (const key of items) {
          keyJiraStatus(key.id)
            .then((state) =>
              setStatuses((prev) => ({ ...prev, [key.id]: state })),
            )
            .catch(() =>
              setStatuses((prev) => ({
                ...prev,
                [key.id]: { connected: false },
              })),
            );
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'unable to load keys'),
      );
  }, []);

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  if (auth.status === 'loading') {
    return <main className="page">Checking session…</main>;
  }

  const handleCreate = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createApiKey(name, parseProjectList(projectsText));
      setCreatedRawKey(created.rawKey);
      setName('');
      setProjectsText('');
      await loadKeys();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to create api key',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await revokeApiKey(id);
      await loadKeys();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to revoke key');
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = async (
    e: FormEvent<HTMLFormElement>,
    id: string,
  ): Promise<void> => {
    e.preventDefault();
    const form = keyForms[id];
    if (form === undefined) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await connectKeyJira(id, form.siteUrl, form.email, form.apiToken);
      setKeyForms((prev) => ({ ...prev, [id]: { ...form, apiToken: '' } }));
      await loadKeyStatus(id);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to connect to Jira',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await disconnectKeyJira(id);
      await loadKeyStatus(id);
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to disconnect');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <Link to="/">← Back</Link>
      <h1>API Keys</h1>
      <p>
        Keys let automated systems create tickets via{' '}
        <code>POST /api/v1/tickets</code> with{' '}
        <code>Authorization: Bearer &lt;key&gt;</code>. Each key gets its own
        Jira service-account connection below.
      </p>

      <form onSubmit={(e) => void handleCreate(e)}>
        <h2>New API key</h2>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. scanner"
            required
          />
        </label>
        <label>
          Allowed projects (comma separated — leave empty for any)
          <input
            type="text"
            value={projectsText}
            onChange={(e) => setProjectsText(e.target.value)}
            placeholder="SEC, OPS"
          />
        </label>
        {error !== null && <p className="err">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {createdRawKey !== null && (
        <div className="ok">
          <p>Copy this key now — it is shown only once:</p>
          <code>{createdRawKey}</code>
          <p>
            Use:{' '}
            <code>
              curl -H &quot;Authorization: Bearer {createdRawKey}&quot; …
            </code>
          </p>
          <button type="button" onClick={() => setCreatedRawKey(null)}>
            Dismiss
          </button>
        </div>
      )}

      <h2>Keys</h2>
      {keys.length === 0 ? (
        <p>No keys yet.</p>
      ) : (
        keys.map((key) => {
          const status = statuses[key.id] ?? { connected: false };
          const connected = status.connected === true;
          const form = keyForms[key.id] ?? {
            siteUrl: '',
            email: '',
            apiToken: '',
          };
          return (
            <section key={key.id}>
              <h3>
                {key.name} {key.revokedAt !== null && <span>(revoked)</span>}
              </h3>
              <p>
                Allowed projects:{' '}
                {key.allowedProjectKeys === null
                  ? 'any'
                  : key.allowedProjectKeys.join(', ')}
              </p>
              {key.revokedAt === null ? (
                <>
                  {connected ? (
                    <>
                      <p className="ok">
                        Jira connected ✓ {status.siteUrl}
                        {status.email ? ` (${status.email})` : ''}
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDisconnect(key.id)}
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <form onSubmit={(e) => void handleConnect(e, key.id)}>
                      <label>
                        Site URL
                        <input
                          type="text"
                          value={form.siteUrl}
                          onChange={(e) =>
                            setKeyForms((prev) => ({
                              ...prev,
                              [key.id]: { ...form, siteUrl: e.target.value },
                            }))
                          }
                          placeholder="https://your-domain.atlassian.net"
                          required
                        />
                      </label>
                      <label>
                        Service-account email
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) =>
                            setKeyForms((prev) => ({
                              ...prev,
                              [key.id]: { ...form, email: e.target.value },
                            }))
                          }
                          autoComplete="off"
                          required
                        />
                      </label>
                      <label>
                        Jira API token
                        <input
                          type="password"
                          value={form.apiToken}
                          onChange={(e) =>
                            setKeyForms((prev) => ({
                              ...prev,
                              [key.id]: { ...form, apiToken: e.target.value },
                            }))
                          }
                          autoComplete="off"
                          required
                        />
                      </label>
                      <button type="submit" disabled={busy}>
                        Tie Jira connection
                      </button>
                    </form>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRevoke(key.id)}
                  >
                    Revoke key
                  </button>
                </>
              ) : null}
            </section>
          );
        })
      )}
    </main>
  );
}
