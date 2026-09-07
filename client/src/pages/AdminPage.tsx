import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  adminStatus,
  createAdminTenant,
  createAdminUser,
  deleteAdminTenant,
  deleteAdminUser,
  listAdminTenants,
  listAdminUsers,
  updateAdminTenant,
  updateAdminUser,
  type AdminStatus,
  type AdminTenant,
  type AdminUser,
} from '../api/admin';
import { ApiError } from '../api/client';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { AdminConnectionsTab } from './AdminConnectionsTab';

const EMPTY = { slug: '', name: '' };

interface TenantEdit {
  id: string;
  slug: string;
  name: string;
}

interface UserCreate {
  tenant_id: string;
  email: string;
  name: string;
  password: string;
}

interface UserEdit {
  id: string;
  email: string;
  name: string;
  password: string;
}

type Tab = 'tenants' | 'users' | 'connections';

type SortDirection = 'asc' | 'desc';

interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

function useSort<K extends string>(
  initialKey: K,
): [SortState<K> | null, (key: K) => void] {
  const [sort, setSort] = useState<SortState<K> | null>({
    key: initialKey,
    direction: 'asc',
  });
  const toggle = (key: K): void => {
    setSort((prev) =>
      prev !== null && prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' },
    );
  };
  return [sort, toggle];
}

function compareValues(
  a: string | number | null | undefined,
  b: string | number | null | undefined,
): number {
  if (a === b) {
    return 0;
  }
  if (a === null || a === undefined) {
    return 1;
  }
  if (b === null || b === undefined) {
    return -1;
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

interface SortableHeaderProps {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
}

function SortableHeader({
  label,
  active,
  direction,
  onClick,
}: SortableHeaderProps): JSX.Element {
  return (
    <th>
      <button
        type="button"
        className="sort-header"
        onClick={onClick}
        aria-label={`Sort by ${label}`}
      >
        {label}
        {active ? (direction === 'asc' ? ' ↑' : ' ↓') : ''}
      </button>
    </th>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`tab-button${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export function AdminPage(): JSX.Element {
  const auth = useCurrentUser();
  const [enabled, setEnabled] = useState(false);
  const [counts, setCounts] = useState<AdminStatus | null>(null);
  const [tab, setTab] = useState<Tab>('tenants');
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tenantFilter, setTenantFilter] = useState('');
  const [tenantForm, setTenantForm] = useState({ ...EMPTY });
  const [tenantEdit, setTenantEdit] = useState<TenantEdit | null>(null);
  const [userForm, setUserForm] = useState<UserCreate>({
    tenant_id: '',
    email: '',
    name: '',
    password: '',
  });
  const [userEdit, setUserEdit] = useState<UserEdit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tenantSort, toggleTenantSort] = useSort<keyof AdminTenant>('name');
  const [userSort, toggleUserSort] = useSort<keyof AdminUser>('email');

  useEffect(() => {
    adminStatus()
      .then((status) => {
        setEnabled(status.enabled);
        setCounts(status);
        if (status.enabled) {
          return listAdminTenants()
            .then((items) => {
              setTenants(items);
              setUserForm((prev) => ({
                ...prev,
                tenant_id:
                  prev.tenant_id === '' ? (items[0]?.id ?? '') : prev.tenant_id,
              }));
              return listAdminUsers();
            })
            .then(setUsers);
        }
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'unable to load admin'),
      );
  }, []);

  async function reloadTenants(
    tenantIdFilter = tenantFilter,
  ): Promise<AdminTenant[]> {
    const items = await listAdminTenants();
    setTenants(items);
    setUserForm((prev) => ({
      ...prev,
      tenant_id: prev.tenant_id === '' ? (items[0]?.id ?? '') : prev.tenant_id,
    }));
    await reloadUsers(tenantIdFilter);
    return items;
  }

  async function reloadUsers(tenantIdFilter = tenantFilter): Promise<void> {
    const items = await listAdminUsers(
      tenantIdFilter === '' ? undefined : tenantIdFilter,
    );
    setUsers(items);
  }

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  if (auth.status === 'loading') {
    return <main className="page">Checking session…</main>;
  }
  if (!enabled) {
    return (
      <main className="page page-wide">
        <Link to="/">← Back</Link>
        <h1>Admin</h1>
        <p className="err">
          Admin mode is disabled. Set <code>ALLOW_ADMIN=true</code> in the
          environment to manage tenants and users.
        </p>
      </main>
    );
  }

  const handleCreateTenant = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createAdminTenant(tenantForm.slug, tenantForm.name);
      setTenantForm({ ...EMPTY });
      await reloadTenants();
      setTenantFilter(created.id);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to create tenant',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateTenant = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (tenantEdit === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminTenant(tenantEdit.id, {
        slug: tenantEdit.slug,
        name: tenantEdit.name,
      });
      setTenantEdit(null);
      await reloadTenants();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to update tenant',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteTenant = async (id: string) => {
    if (!window.confirm('Delete this tenant and all of its users?')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAdminTenant(id);
      if (tenantFilter === id) {
        setTenantFilter('');
      }
      await reloadTenants('');
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to delete tenant',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCreateUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createAdminUser({
        tenant_id: userForm.tenant_id,
        email: userForm.email,
        name: userForm.name === '' ? undefined : userForm.name,
        password: userForm.password,
      });
      setUserForm((prev) => ({ ...prev, email: '', name: '', password: '' }));
      await reloadUsers();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to create user');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateUser = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (userEdit === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminUser(userEdit.id, {
        email: userEdit.email,
        name: userEdit.name,
        password: userEdit.password === '' ? undefined : userEdit.password,
      });
      setUserEdit(null);
      await reloadUsers();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to update user');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (
      !window.confirm('Delete this user (sessions and connections removed)?')
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await deleteAdminUser(id);
      await reloadUsers();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to delete user');
    } finally {
      setBusy(false);
    }
  };

  const sortedTenants = [...tenants].sort((a, b) => {
    const key = tenantSort?.key ?? 'name';
    const factor = tenantSort?.direction === 'desc' ? -1 : 1;
    return factor * compareValues(a[key], b[key]);
  });

  const sortedUsers = [...users].sort((a, b) => {
    const key = userSort?.key ?? 'email';
    const factor = userSort?.direction === 'desc' ? -1 : 1;
    return factor * compareValues(a[key], b[key]);
  });

  const tenantHeader = (key: keyof AdminTenant, label: string) => (
    <SortableHeader
      label={label}
      active={tenantSort?.key === key}
      direction={tenantSort?.direction ?? 'asc'}
      onClick={() => toggleTenantSort(key)}
    />
  );

  const userHeader = (key: keyof AdminUser, label: string) => (
    <SortableHeader
      label={label}
      active={userSort?.key === key}
      direction={userSort?.direction ?? 'asc'}
      onClick={() => toggleUserSort(key)}
    />
  );

  return (
    <main className="page page-wide">
      <Link to="/">← Back</Link>
      <h1>Admin</h1>
      <p className="ok">
        Admin mode is on — this is a reviewer affordance. Any logged-in user can
        manage tenants and users while <code>ALLOW_ADMIN=true</code>.
      </p>
      {error !== null && <p className="err">{error}</p>}

      {counts !== null && (
        <div className="stat-grid">
          <div className="stat-card">
            <span className="stat-value">{counts.tenantCount}</span>
            <span className="stat-label">Tenants</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{counts.userCount}</span>
            <span className="stat-label">Users</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{counts.connectionCount}</span>
            <span className="stat-label">Jira connections</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{counts.apiKeyCount}</span>
            <span className="stat-label">Active API keys</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{counts.itemCount}</span>
            <span className="stat-label">Findings</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{counts.ticketCount}</span>
            <span className="stat-label">Jira tickets</span>
          </div>
        </div>
      )}

      <div className="tabs">
        <TabButton active={tab === 'tenants'} onClick={() => setTab('tenants')}>
          Tenants
        </TabButton>
        <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
          Users
        </TabButton>
        <TabButton
          active={tab === 'connections'}
          onClick={() => setTab('connections')}
        >
          Jira connections
        </TabButton>
      </div>

      {tab === 'tenants' ? (
        <section>
          <h2>Tenants</h2>
          <form onSubmit={(e) => void handleCreateTenant(e)}>
            <label>
              Slug
              <input
                type="text"
                value={tenantForm.slug}
                onChange={(e) =>
                  setTenantForm((prev) => ({ ...prev, slug: e.target.value }))
                }
                placeholder="acme"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                required
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={tenantForm.name}
                onChange={(e) =>
                  setTenantForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="Acme Corp"
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Working…' : 'Create tenant'}
            </button>
          </form>
          {sortedTenants.length === 0 ? (
            <p>No tenants yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  {tenantHeader('slug', 'Slug')}
                  {tenantHeader('name', 'Name')}
                  {tenantHeader('userCount', 'Users')}
                  {tenantHeader('createdAt', 'Created')}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedTenants.map((tenant) =>
                  tenantEdit !== null && tenantEdit.id === tenant.id ? (
                    <tr key={tenant.id}>
                      <td colSpan={5}>
                        <form
                          onSubmit={(e) => void handleUpdateTenant(e)}
                          className="inline-form"
                        >
                          <input
                            type="text"
                            value={tenantEdit.slug}
                            onChange={(e) =>
                              setTenantEdit((prev) =>
                                prev === null
                                  ? prev
                                  : { ...prev, slug: e.target.value },
                              )
                            }
                            pattern="[a-z0-9]+(-[a-z0-9]+)*"
                            required
                          />
                          <input
                            type="text"
                            value={tenantEdit.name}
                            onChange={(e) =>
                              setTenantEdit((prev) =>
                                prev === null
                                  ? prev
                                  : { ...prev, name: e.target.value },
                              )
                            }
                            required
                          />
                          <button type="submit" disabled={busy}>
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setTenantEdit(null);
                              setError(null);
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={tenant.id}>
                      <td>{tenant.slug}</td>
                      <td>{tenant.name}</td>
                      <td>{tenant.userCount}</td>
                      <td>{new Date(tenant.createdAt).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setTenantEdit({
                              id: tenant.id,
                              slug: tenant.slug,
                              name: tenant.name,
                            });
                            setError(null);
                          }}
                        >
                          Edit
                        </button>{' '}
                        <button
                          type="button"
                          onClick={() => void handleDeleteTenant(tenant.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </section>
      ) : tab === 'users' ? (
        <section>
          <h2>Users</h2>
          <label>
            Filter by tenant
            <select
              value={tenantFilter}
              onChange={(e) => {
                const value = e.target.value;
                setTenantFilter(value);
                void reloadUsers(value);
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
          <form onSubmit={(e) => void handleCreateUser(e)}>
            <label>
              Tenant
              <select
                value={userForm.tenant_id}
                onChange={(e) =>
                  setUserForm((prev) => ({
                    ...prev,
                    tenant_id: e.target.value,
                  }))
                }
                required
              >
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.slug}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Email
              <input
                type="email"
                value={userForm.email}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={userForm.name}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </label>
            <label>
              Password (min 8)
              <input
                type="password"
                value={userForm.password}
                onChange={(e) =>
                  setUserForm((prev) => ({ ...prev, password: e.target.value }))
                }
                autoComplete="new-password"
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Working…' : 'Create user'}
            </button>
          </form>
          {sortedUsers.length === 0 ? (
            <p>No users.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  {userHeader('email', 'Email')}
                  {userHeader('name', 'Name')}
                  {userHeader('tenantSlug', 'Tenant')}
                  {userHeader('createdAt', 'Created')}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sortedUsers.map((user) =>
                  userEdit !== null && userEdit.id === user.id ? (
                    <tr key={user.id}>
                      <td colSpan={5}>
                        <form
                          onSubmit={(e) => void handleUpdateUser(e)}
                          className="inline-form"
                        >
                          <input
                            type="email"
                            value={userEdit.email}
                            onChange={(e) =>
                              setUserEdit((prev) =>
                                prev === null
                                  ? prev
                                  : { ...prev, email: e.target.value },
                              )
                            }
                            required
                          />
                          <input
                            type="text"
                            value={userEdit.name}
                            placeholder="name"
                            onChange={(e) =>
                              setUserEdit((prev) =>
                                prev === null
                                  ? prev
                                  : { ...prev, name: e.target.value },
                              )
                            }
                          />
                          <input
                            type="password"
                            value={userEdit.password}
                            placeholder="new password (blank = keep)"
                            autoComplete="new-password"
                            onChange={(e) =>
                              setUserEdit((prev) =>
                                prev === null
                                  ? prev
                                  : { ...prev, password: e.target.value },
                              )
                            }
                          />
                          <button type="submit" disabled={busy}>
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setUserEdit(null);
                              setError(null);
                            }}
                          >
                            Cancel
                          </button>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>{user.name ?? '—'}</td>
                      <td>{user.tenantSlug ?? user.tenantId}</td>
                      <td>{new Date(user.createdAt).toLocaleString()}</td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setUserEdit({
                              id: user.id,
                              email: user.email,
                              name: user.name ?? '',
                              password: '',
                            });
                            setError(null);
                          }}
                        >
                          Edit
                        </button>{' '}
                        <button
                          type="button"
                          onClick={() => void handleDeleteUser(user.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
      {tab === 'connections' && (
        <AdminConnectionsTab tenants={tenants} users={users} />
      )}
    </main>
  );
}
