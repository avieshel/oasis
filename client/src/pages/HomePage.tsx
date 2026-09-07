import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client';
import { logout } from '../api/auth';
import { adminStatus } from '../api/admin';
import { listProjects, type JiraProjectSummary } from '../api/jira';
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

  const [items, setItems] = useState<OasisItem[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<ItemsSummary | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const [projects, setProjects] = useState<JiraProjectSummary[] | null>(null);
  const [projectsFailed, setProjectsFailed] = useState(false);
  const [ticketTarget, setTicketTarget] = useState<string | null>(null);
  const [ticketProject, setTicketProject] = useState('');

  useEffect(() => {
    adminStatus()
      .then((status) => setAdminEnabled(status.enabled))
      .catch(() => setAdminEnabled(false));
  }, []);

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
      setProjectsFailed(false);
      setTicketProject(loaded[0]?.key ?? '');
      setTicketTarget(id);
    } catch {
      setProjectsFailed(true);
      setError('Connect Jira first to create tickets.');
    }
  };

  const handleTicketSubmit = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await createItemTicket(id, ticketProject);
      setTicketTarget(null);
      refresh();
    } catch (err: unknown) {
      setError(
        err instanceof ApiError ? err.message : 'unable to create ticket',
      );
    } finally {
      setBusy(false);
    }
  };

  const chipClass = 'chip';

  return (
    <main className="page page-wide">
      <div className="row-between">
        <div>
          <h1>IdentityHub — Oasis findings</h1>
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
        <Link to="/jira">Jira integration</Link>{' '}
        <Link to="/api-keys">API keys</Link>{' '}
        {adminEnabled === true && <Link to="/admin">Admin</Link>}
      </nav>

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
          <span className={chipClass}>New {summary?.new ?? 0}</span>
          <span className={chipClass}>Closed {summary?.closed ?? 0}</span>
          <span className={chipClass}>
            Jira tickets {summary?.jiraTicket ?? 0}
          </span>
          <span className={chipClass}>Total {summary?.total ?? 0}</span>
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
          {projectsFailed && <Link to="/jira">Connect Jira…</Link>}
        </div>

        {error !== null && <p className="err">{error}</p>}

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
                              onChange={(e) => setTicketProject(e.target.value)}
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
    </main>
  );
}
