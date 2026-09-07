import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  createAdminConnection,
  deleteAdminConnection,
  getAdminConnection,
  listAdminConnections,
  testAdminConnection,
  updateAdminConnection,
  type AdminConnection,
  type AdminTenant,
  type AdminUser,
  type JiraConnectionState,
} from '../api/admin';
import { ApiError } from '../api/client';
import { Modal } from '../components/Modal';

export interface TestResult {
  ok: boolean;
  message: string;
}

interface AdminConnectionsTabProps {
  tenants: AdminTenant[];
  users: AdminUser[];
}

interface CreateForm {
  user_id: string;
  site_url: string;
  email: string;
  api_token: string;
}

interface RotateForm {
  id: string;
  site_url: string;
  email: string;
  api_token: string;
}

function connectionName(connection: AdminConnection): string {
  if (connection.userEmail !== null) {
    return connection.userEmail;
  }
  if (connection.apiKeyName !== null) {
    return `API key · ${connection.apiKeyName}`;
  }
  return connection.id;
}

function stateLabel(state: JiraConnectionState, ok: boolean): string {
  if (ok && state.connected) {
    return `OK — ${state.displayName ?? state.email ?? state.accountId ?? 'connected'}`;
  }
  if (ok && !state.connected) {
    return 'OK — connected:false';
  }
  if (ok) {
    return 'OK';
  }
  return 'Error';
}

export function AdminConnectionsTab({
  tenants,
  users,
}: AdminConnectionsTabProps): JSX.Element {
  const [connections, setConnections] = useState<AdminConnection[]>([]);
  const [tenantFilter, setTenantFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>({
    user_id: '',
    site_url: '',
    email: '',
    api_token: '',
  });

  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {},
  );
  const [testingId, setTestingId] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const [rotate, setRotate] = useState<RotateForm | null>(null);

  async function reloadConnections(filter = tenantFilter): Promise<void> {
    const items = await listAdminConnections({
      tenantId: filter === '' ? undefined : filter,
    });
    setConnections(items);
  }

  useEffect(() => {
    reloadConnections().catch((err: unknown) =>
      setError(
        err instanceof Error ? err.message : 'unable to load connections',
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (createOpen && createForm.user_id === '') {
      const firstWithFiltered =
        tenantFilter === ''
          ? users[0]
          : (users.find((u) => u.tenantId === tenantFilter) ?? users[0]);
      if (firstWithFiltered !== undefined) {
        setCreateForm((prev) => ({
          ...prev,
          user_id: firstWithFiltered.id,
          email: firstWithFiltered.email,
        }));
      }
    }
  }, [createOpen, createForm.user_id, tenantFilter, users]);

  const handleCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await createAdminConnection({
        user_id: createForm.user_id,
        site_url: createForm.site_url,
        email: createForm.email,
        api_token: createForm.api_token,
      });
      const user = users.find((u) => u.id === createForm.user_id);
      setCreateOpen(false);
      setCreateForm({ user_id: '', site_url: '', email: '', api_token: '' });
      setNotice(
        `Linked Jira for ${user?.email ?? createForm.user_id} (reconnected if one already existed).`,
      );
      await reloadConnections();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to link connection',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRotate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (rotate === null) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await updateAdminConnection(rotate.id, {
        site_url: rotate.site_url,
        email: rotate.email,
        api_token: rotate.api_token,
      });
      setRotate(null);
      setNotice('Connection updated and verified against Jira.');
      await reloadConnections();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to update connection',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async (id: string): Promise<void> => {
    setTestingId(id);
    setError(null);
    setNotice(null);
    try {
      const state = await testAdminConnection(id);
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: true, message: stateLabel(state, true) },
      }));
    } catch (err: unknown) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          message:
            err instanceof ApiError ? err.message : 'unable to test connection',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  const handleReveal = async (id: string): Promise<void> => {
    if (revealed[id] !== undefined) {
      setRevealed((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setRevealingId(id);
    setError(null);
    try {
      const detail = await getAdminConnection(id, true);
      setRevealed((prev) => ({ ...prev, [id]: detail.apiToken ?? '' }));
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to reveal token',
      );
    } finally {
      setRevealingId(null);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!window.confirm('Delete this Jira connection?')) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await deleteAdminConnection(id);
      setNotice('Connection deleted.');
      await reloadConnections();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to delete connection',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="row-between">
        <h2>Jira connections</h2>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setError(null);
          }}
        >
          Link connection
        </button>
      </div>
      <label>
        Filter by tenant
        <select
          value={tenantFilter}
          onChange={(e) => {
            const value = e.target.value;
            setTenantFilter(value);
            void reloadConnections(value).catch((err: unknown) =>
              setError(
                err instanceof Error
                  ? err.message
                  : 'unable to load connections',
              ),
            );
          }}
        >
          <option value="">All tenants</option>
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.slug}
            </option>
          ))}
        </select>
      </label>
      {notice !== null && <p className="ok">{notice}</p>}
      {error !== null && <p className="err">{error}</p>}

      {connections.length === 0 ? (
        <p>No Jira connections yet.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Owner</th>
              <th>Tenant</th>
              <th>Mode</th>
              <th>Site URL</th>
              <th>Jira email</th>
              <th>Last tested</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {connections.map((connection) => {
              const result = testResults[connection.id];
              return (
                <tr key={connection.id}>
                  <td>{connectionName(connection)}</td>
                  <td>{connection.tenantSlug ?? connection.tenantId}</td>
                  <td>
                    <span className="badge badge-status-jira-ticket">
                      {connection.mode}
                    </span>
                  </td>
                  <td>
                    {connection.siteUrl ?? '—'}
                    {revealed[connection.id] !== undefined && (
                      <div className="token-reveal">
                        <code>{revealed[connection.id]}</code>
                        <button
                          type="button"
                          onClick={() => void handleReveal(connection.id)}
                        >
                          Hide
                        </button>
                      </div>
                    )}
                  </td>
                  <td>{connection.email ?? '—'}</td>
                  <td>
                    {connection.lastTestedAt === null
                      ? 'never'
                      : new Date(connection.lastTestedAt).toLocaleString()}
                    {result !== undefined && (
                      <div className={result.ok ? 'ok' : 'err'}>
                        {result.message}
                      </div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={busy || testingId === connection.id}
                      onClick={() => void handleTest(connection.id)}
                    >
                      {testingId === connection.id ? 'Testing…' : 'Test'}
                    </button>{' '}
                    {connection.mode === 'oauth' ||
                    connection.hasOauthTokens ? (
                      <span className="muted">(rotating OAuth: use user)</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setRotate({
                            id: connection.id,
                            site_url: connection.siteUrl ?? '',
                            email: connection.email ?? '',
                            api_token: '',
                          })
                        }
                      >
                        Rotate token
                      </button>
                    )}{' '}
                    <button
                      type="button"
                      disabled={busy || revealingId === connection.id}
                      onClick={() => void handleReveal(connection.id)}
                    >
                      {revealingId === connection.id
                        ? '…'
                        : revealed[connection.id] !== undefined
                          ? 'Hide token'
                          : 'Reveal token'}
                    </button>{' '}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDelete(connection.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {createOpen && (
        <Modal
          title="Link Jira connection"
          onClose={() => setCreateOpen(false)}
        >
          <p className="muted">
            Attaches an API-token connection to a user. This overwrites the
            user&apos;s existing connection if one exists.
          </p>
          <form onSubmit={(e) => void handleCreate(e)}>
            <label>
              User
              <select
                value={createForm.user_id}
                onChange={(e) => {
                  const user = users.find((u) => u.id === e.target.value);
                  setCreateForm((prev) => ({
                    ...prev,
                    user_id: e.target.value,
                    email: user?.email ?? prev.email,
                  }));
                }}
                required
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email} ({user.tenantSlug ?? user.tenantId})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Site URL
              <input
                type="url"
                value={createForm.site_url}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    site_url: e.target.value,
                  }))
                }
                placeholder="https://your-org.atlassian.net"
                required
              />
            </label>
            <label>
              Jira email (API-token account)
              <input
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
            </label>
            <label>
              API token
              <input
                type="password"
                value={createForm.api_token}
                onChange={(e) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    api_token: e.target.value,
                  }))
                }
                autoComplete="new-password"
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Verifying with Jira…' : 'Link connection'}
            </button>
            <button type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
          </form>
        </Modal>
      )}

      {rotate !== null && (
        <Modal title="Rotate API token" onClose={() => setRotate(null)}>
          <p className="muted">
            Re-verifies the connection against Jira with the new token.
          </p>
          <form onSubmit={(e) => void handleRotate(e)}>
            <label>
              Site URL
              <input
                type="url"
                value={rotate.site_url}
                onChange={(e) =>
                  setRotate((prev) =>
                    prev === null
                      ? prev
                      : { ...prev, site_url: e.target.value },
                  )
                }
                required
              />
            </label>
            <label>
              Jira email
              <input
                type="email"
                value={rotate.email}
                onChange={(e) =>
                  setRotate((prev) =>
                    prev === null ? prev : { ...prev, email: e.target.value },
                  )
                }
                required
              />
            </label>
            <label>
              New API token
              <input
                type="password"
                value={rotate.api_token}
                onChange={(e) =>
                  setRotate((prev) =>
                    prev === null
                      ? prev
                      : { ...prev, api_token: e.target.value },
                  )
                }
                autoComplete="new-password"
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Verifying…' : 'Save & verify'}
            </button>
            <button type="button" onClick={() => setRotate(null)}>
              Cancel
            </button>
          </form>
        </Modal>
      )}
    </section>
  );
}
