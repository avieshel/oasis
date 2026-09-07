import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { logout } from '../api/auth';
import { adminStatus } from '../api/admin';
import {
  createTicket,
  jiraStatus,
  listProjects,
  listRecentTickets,
  type JiraProjectSummary,
  type JiraRecentTicket,
} from '../api/jira';
import {
  createItemTicket,
  generateRandomItem,
  itemsSummary,
  listItems,
  updateItemStatus,
  type ItemSeverity,
  type ItemStatus,
  type ItemsSummary,
  type OasisItem,
} from '../api/items';
import { useCurrentUser } from '../hooks/useCurrentUser';

type MainTab = 'recent' | 'items';

const SEVERITY_FILTERS = [
  { value: '', label: 'All severities' },
  { value: 'info', label: 'Info' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'new', label: 'New' },
  { value: 'closed', label: 'Closed' },
  { value: 'jira-ticket', label: 'Jira ticket' },
];

export function HomePage(): JSX.Element {
  const auth = useCurrentUser();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adminEnabled, setAdminEnabled] = useState<boolean | null>(null);
  const [tab, setTab] = useState<MainTab>('recent');

  const [items, setItems] = useState<OasisItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ItemsSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [projects, setProjects] = useState<JiraProjectSummary[] | null>(null);
  const [manualProject, setManualProject] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [recent, setRecent] = useState<JiraRecentTicket[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [ticketTarget, setTicketTarget] = useState<string | null>(null);
  const [ticketProject, setTicketProject] = useState('');
  const [jiraConnected, setJiraConnected] = useState<boolean | null>(null);

  useEffect(() => {
    jiraStatus()
      .then((state) => setJiraConnected(state.connected))
      .catch(() => setJiraConnected(false));
  }, []);

  useEffect(() => {
    adminStatus()
      .then((status) => setAdminEnabled(status.enabled))
      .catch(() => setAdminEnabled(false));
  }, []);

  useEffect(() => {
    if (jiraConnected !== true) {
      return;
    }
    listProjects()
      .then((loaded) => {
        setProjects(loaded);
        setManualProject(loaded[0]?.key ?? '');
      })
      .catch((err: unknown) => {
        if (
          err instanceof ApiError &&
          err.body.error === 'JIRA_NOT_CONNECTED'
        ) {
          setJiraConnected(false);
          return;
        }
        setError(
          err instanceof Error ? err.message : 'unable to load projects',
        );
      });
  }, [jiraConnected]);

  useEffect(() => {
    itemsSummary()
      .then(setSummary)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'unable to load summary'),
      );
    listItems({
      status: statusFilter === '' ? undefined : (statusFilter as ItemStatus),
      severity:
        severityFilter === '' ? undefined : (severityFilter as ItemSeverity),
    })
      .then((page) => {
        setItems(page.items);
        setTotal(page.total);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'unable to load items'),
      );
  }, [statusFilter, severityFilter, reloadKey]);

  useEffect(() => {
    if (jiraConnected !== true || manualProject === '') {
      return;
    }
    listRecentTickets(manualProject)
      .then(setRecent)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'unable to load tickets'),
      );
  }, [jiraConnected, manualProject]);

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  if (auth.status === 'loading') {
    return <main className="page">Checking session…</main>;
  }

  const refresh = (): void => {
    setReloadKey((key) => key + 1);
  };

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

  const handleGenerate = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await generateRandomItem();
      refresh();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to generate item',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await updateItemStatus(id, 'closed');
      refresh();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to close item');
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await updateItemStatus(id, 'new');
      refresh();
    } catch (err: unknown) {
      setError(err instanceof ApiError ? err.message : 'unable to reopen item');
    } finally {
      setBusy(false);
    }
  };

  const handleTicketClick = async (id: string): Promise<void> => {
    setError(null);
    if (projects !== null) {
      setTicketTarget(id);
      return;
    }
    try {
      const loaded = await listProjects();
      setProjects(loaded);
      setTicketProject(loaded[0]?.key ?? '');
      setTicketTarget(id);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.body.error === 'JIRA_NOT_CONNECTED') {
        void navigate('/settings');
        return;
      }
      setError(
        err instanceof ApiError ? err.message : 'unable to load projects',
      );
    }
  };

  const handleTicketSubmit = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await createItemTicket(id, ticketProject);
      setTicketTarget(null);
      refresh();
      setManualProject(ticketProject);
      setRecent(await listRecentTickets(ticketProject));
      setTab('recent');
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to create ticket',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleCreateManual = async (
    e: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createTicket(manualProject, title, description);
      setTitle('');
      setDescription('');
      setShowCreate(false);
      setRecent(await listRecentTickets(manualProject));
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to create ticket',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleLoadRecent = async (refresh = false): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      if (manualProject === '') {
        throw new Error('Select a project first');
      }
      setRecent(await listRecentTickets(manualProject, refresh));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'unable to load tickets');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page page-wide">
      <div className="row-between">
        <div>
          <h1>IdentityHub — Oasis</h1>
          <p>
            Signed in as <strong>{auth.user.email}</strong>.
          </p>
        </div>
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleLogout()}
          >
            {busy ? 'Logging out…' : 'Log out'}
          </button>
        </div>
      </div>

      <nav className="nav-links">
        <Link to="/settings">Settings</Link>{' '}
        {adminEnabled === true && <Link to="/admin">Admin</Link>}
      </nav>

      {jiraConnected === false && (
        <p className="warn">
          No Jira connection yet —{' '}
          <Link to="/settings">set one up in Settings</Link> to create tickets
          from these findings.
        </p>
      )}

      {error !== null && <p className="err">{error}</p>}

      <div className="tabs">
        <button
          type="button"
          className={`tab-button${tab === 'recent' ? ' active' : ''}`}
          onClick={() => setTab('recent')}
        >
          Recent tickets
        </button>
        <button
          type="button"
          className={`tab-button${tab === 'items' ? ' active' : ''}`}
          onClick={() => setTab('items')}
        >
          Items
          {summary !== null && summary.new > 0 ? ` · ${summary.new} new` : ''}
        </button>
      </div>
      {tab === 'recent' ? (
        <section>
          <h2>Recent tickets</h2>
          {jiraConnected === true ? (
            <>
              <div className="inline-form">
                <button
                  type="button"
                  disabled={busy || manualProject === ''}
                  onClick={() => void handleLoadRecent(false)}
                >
                  Load recent
                </button>
                <button
                  type="button"
                  disabled={busy || manualProject === ''}
                  onClick={() => void handleLoadRecent(true)}
                >
                  Refresh
                </button>
              </div>
              {recent.length === 0 ? (
                <p className="muted">No tickets yet for this project.</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Title</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map((ticket) => (
                      <tr key={ticket.key}>
                        <td>
                          <a href={ticket.url} target="_blank" rel="noreferrer">
                            {ticket.key}
                          </a>
                        </td>
                        <td>{ticket.title}</td>
                        <td>
                          {ticket.createdAt === null
                            ? '—'
                            : new Date(ticket.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="inline-form">
                <button
                  type="button"
                  onClick={() => setShowCreate((open) => !open)}
                >
                  {showCreate ? 'Hide create form' : 'Create ticket'}
                </button>
              </div>
              {showCreate && (
                <form onSubmit={(e) => void handleCreateManual(e)}>
                  <label>
                    Project
                    <select
                      value={manualProject}
                      onChange={(e) => setManualProject(e.target.value)}
                    >
                      <option value="">Select a project…</option>
                      {projects?.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.key} — {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  <button type="submit" disabled={busy || manualProject === ''}>
                    {busy ? 'Creating…' : 'Create ticket'}
                  </button>
                </form>
              )}
            </>
          ) : null}
        </section>
      ) : (
        <section>
          <div className="row-between">
            <h2>Items</h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleGenerate()}
            >
              {busy ? '…' : 'Generate random item'}
            </button>
          </div>

          <div className="inline-form">
            <span className="chip">New {summary?.new ?? 0}</span>
            <span className="chip">Closed {summary?.closed ?? 0}</span>
            <span className="chip">
              Jira tickets {summary?.jiraTicket ?? 0}
            </span>
            <span className="chip">Total {summary?.total ?? 0}</span>
          </div>

          <div className="inline-form">
            <label>
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUS_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Severity
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                {SEVERITY_FILTERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {items.length === 0 ? (
            <p>No items yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Status</th>
                  <th>Ticket</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      {item.description !== null && (
                        <div className="muted">{item.description}</div>
                      )}
                      <div className="muted">{item.scanner}</div>
                    </td>
                    <td>
                      <code>{item.itemType}</code>
                    </td>
                    <td>
                      <span className={`badge badge-sev-${item.severity}`}>
                        {item.severity}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-status-${item.status}`}>
                        {item.status}
                      </span>
                    </td>
                    <td>
                      {item.jiraUrl !== null ? (
                        <a href={item.jiraUrl} target="_blank" rel="noreferrer">
                          {item.jiraKey}
                        </a>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>
                      {item.status === 'new' && (
                        <span className="inline-form">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void handleClose(item.id)}
                          >
                            Close
                          </button>
                          {ticketTarget === item.id ? (
                            <span className="inline-form">
                              <select
                                value={ticketProject}
                                onChange={(e) =>
                                  setTicketProject(e.target.value)
                                }
                              >
                                {projects?.map((p) => (
                                  <option key={p.key} value={p.key}>
                                    {p.key}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="button"
                                disabled={busy || ticketProject === ''}
                                onClick={() => void handleTicketSubmit(item.id)}
                              >
                                Create
                              </button>
                              <button
                                type="button"
                                onClick={() => setTicketTarget(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleTicketClick(item.id)}
                            >
                              Create Jira ticket
                            </button>
                          )}
                        </span>
                      )}
                      {item.status === 'closed' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleReopen(item.id)}
                        >
                          Reopen
                        </button>
                      )}
                      {item.status === 'jira-ticket' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleReopen(item.id)}
                        >
                          Reopen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="muted">
            Showing {items.length} of {total} items.
          </p>
        </section>
      )}
    </main>
  );
}
