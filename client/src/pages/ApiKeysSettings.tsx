import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api/client';
import {
  connectKeyJira,
  createApiKey,
  disconnectKeyJira,
  keyJiraStatus,
  listApiKeys,
  revokeApiKey,
  testKeyJira,
  type ApiKeyMeta,
} from '../api/keys';
import type { JiraConnectionState } from '../api/jira';
import { Modal } from '../components/Modal';

function parseProjectList(raw: string): string[] | null {
  const keys = raw
    .split(/[,\s]+/)
    .map((k) => k.trim().toUpperCase())
    .filter((k) => k.length > 0);
  return keys.length === 0 ? null : keys;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const input = document.createElement('textarea');
      input.value = text;
      input.setAttribute('readonly', '');
      input.style.position = 'fixed';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(input);
      return ok;
    } catch {
      return false;
    }
  }
}

export function ApiKeysSettings(): JSX.Element {
  const [keys, setKeys] = useState<ApiKeyMeta[]>([]);
  const [name, setName] = useState('');
  const [projectsText, setProjectsText] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const [statuses, setStatuses] = useState<Record<string, JiraConnectionState>>(
    {},
  );
  const [keyForms, setKeyForms] = useState<
    Record<string, { siteUrl: string; email: string; apiToken: string }>
  >({});
  const [connectFor, setConnectFor] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { ok: boolean; message: string }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listApiKeys()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setKeys(items);
        items.forEach((key) => {
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
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'unable to load api keys',
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createApiKey(name, parseProjectList(projectsText));
      setName('');
      setProjectsText('');
      setCopied(false);
      setCreatedKey(created.rawKey);
      await loadKeys();
      copyButtonRef.current?.focus();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to create api key',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (): Promise<void> => {
    if (createdKey === null) {
      return;
    }
    setCopied(await copyText(createdKey));
  };

  async function loadKeys(): Promise<void> {
    try {
      const items = await listApiKeys();
      setKeys(items);
      items.forEach((key) => void loadKeyStatus(key.id));
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
      setConnectFor(null);
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

  const handleTestConnection = async (id: string): Promise<void> => {
    setTestingId(id);
    setError(null);
    setTestResults((prev) => ({
      ...prev,
      [id]: { ok: true, message: 'Testing…' },
    }));
    try {
      const state = await testKeyJira(id);
      const who = state.displayName ?? state.email ?? state.accountId ?? id;
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          ok: true,
          message: `Connection OK — authenticated as ${who}`,
        },
      }));
      await loadKeyStatus(id);
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          message:
            err instanceof ApiError ? err.message : 'connection test failed',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <section>
      <p>
        Keys let automated systems create tickets via{' '}
        <code>POST /api/v1/tickets</code> with{' '}
        <code>Authorization: Bearer &lt;key&gt;</code>. Each key gets its own
        Jira service-account connection.
      </p>
      <p>
        Interactive Swagger documentation:{' '}
        <a href="/swagger" target="_blank" rel="noreferrer">
          /swagger
        </a>
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

      <h2>Keys</h2>
      {keys.length === 0 ? (
        <p>No keys yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Projects</th>
              <th>Jira</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const status = statuses[key.id] ?? { connected: false };
              const connected = status.connected === true;
              const connecting = connectFor === key.id;
              const test = testResults[key.id];
              return (
                <Fragment key={key.id}>
                  <tr>
                    <td>
                      {key.name}
                      {connected && key.revokedAt === null && (
                        <span className="badge badge-connected">Connected</span>
                      )}
                      {key.revokedAt !== null && (
                        <span className="badge badge-status-closed">
                          revoked
                        </span>
                      )}
                    </td>
                    <td>
                      {key.allowedProjectKeys === null
                        ? 'Any project'
                        : key.allowedProjectKeys.join(', ')}
                    </td>
                    <td>
                      {connected ? (
                        <div className="ok">
                          Connected — {status.siteUrl}
                          {status.email ? ` (${status.email})` : ''}
                        </div>
                      ) : (
                        <span className="muted">Not connected</span>
                      )}
                      {test !== undefined && (
                        <div className={test.ok ? 'ok' : 'err'}>
                          {test.message}
                        </div>
                      )}
                    </td>
                    <td>{new Date(key.createdAt).toLocaleString()}</td>
                    <td>
                      {key.revokedAt === null && (
                        <>
                          {connected ? (
                            <>
                              <button
                                type="button"
                                disabled={
                                  busy ||
                                  (testingId !== null && testingId !== key.id)
                                }
                                onClick={() =>
                                  void handleTestConnection(key.id)
                                }
                              >
                                {testingId === key.id
                                  ? 'Testing…'
                                  : 'Test connection'}
                              </button>{' '}
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleDisconnect(key.id)}
                              >
                                Disconnect
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setConnectFor(connecting ? null : key.id)
                              }
                            >
                              {connecting ? 'Cancel' : 'Tie Jira connection'}
                            </button>
                          )}{' '}
                          <button
                            type="button"
                            className="btn-danger"
                            disabled={busy}
                            onClick={() => void handleRevoke(key.id)}
                          >
                            Revoke
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {connecting && (
                    <tr>
                      <td colSpan={5}>
                        <form
                          className="inline-form"
                          onSubmit={(e) => void handleConnect(e, key.id)}
                        >
                          <label>
                            Site URL
                            <input
                              type="text"
                              value={keyForms[key.id]?.siteUrl ?? ''}
                              onChange={(e) =>
                                setKeyForms((prev) => ({
                                  ...prev,
                                  [key.id]: {
                                    ...(prev[key.id] ?? {
                                      siteUrl: '',
                                      email: '',
                                      apiToken: '',
                                    }),
                                    siteUrl: e.target.value,
                                  },
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
                              value={keyForms[key.id]?.email ?? ''}
                              onChange={(e) =>
                                setKeyForms((prev) => ({
                                  ...prev,
                                  [key.id]: {
                                    ...(prev[key.id] ?? {
                                      siteUrl: '',
                                      email: '',
                                      apiToken: '',
                                    }),
                                    email: e.target.value,
                                  },
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
                              value={keyForms[key.id]?.apiToken ?? ''}
                              onChange={(e) =>
                                setKeyForms((prev) => ({
                                  ...prev,
                                  [key.id]: {
                                    ...(prev[key.id] ?? {
                                      siteUrl: '',
                                      email: '',
                                      apiToken: '',
                                    }),
                                    apiToken: e.target.value,
                                  },
                                }))
                              }
                              autoComplete="off"
                              required
                            />
                          </label>
                          <button type="submit" disabled={busy}>
                            Save connection
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setConnectFor(null)}
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {createdKey !== null && (
        <Modal title="API key created" onClose={() => setCreatedKey(null)}>
          <p className="warn">
            Copy this key now — it is shown only once. Anyone with the key can
            create tickets as this connection.
          </p>
          <div className="key-display">
            <input
              className="key-value"
              type="text"
              value={createdKey}
              readOnly
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              ref={copyButtonRef}
              type="button"
              autoFocus
              onClick={() => void handleCopy()}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          {copied && <p className="ok">Key copied to clipboard.</p>}
          <p>
            Use:{' '}
            <code>
              curl -H &quot;Authorization: Bearer {createdKey}&quot; … -d
              &#123;&quot;project_key&quot;:&quot;OASIS&quot;&#125;
            </code>
          </p>
          <button type="button" onClick={() => setCreatedKey(null)}>
            Done — I saved it
          </button>
        </Modal>
      )}
    </section>
  );
}
