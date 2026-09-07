import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ApiKeysSettings } from './ApiKeysSettings';
import { JiraSettings } from './JiraSettings';
import { useCurrentUser } from '../hooks/useCurrentUser';

type SettingsTab = 'jira' | 'keys';

export function SettingsPage(): JSX.Element {
  const auth = useCurrentUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: SettingsTab = searchParams.get('tab') === 'keys' ? 'keys' : 'jira';

  if (auth.status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }
  if (auth.status === 'loading') {
    return <main className="page">Checking session…</main>;
  }

  const selectTab = (next: SettingsTab): void => {
    setSearchParams(next === 'keys' ? { tab: 'keys' } : {});
  };

  return (
    <main className="page page-wide">
      <Link to="/" className="back-link">
        ← Back to findings
      </Link>
      <h1>Settings</h1>
      <div className="tabs">
        <button
          type="button"
          className={`tab-button${tab === 'jira' ? ' active' : ''}`}
          onClick={() => selectTab('jira')}
        >
          Jira connection
        </button>
        <button
          type="button"
          className={`tab-button${tab === 'keys' ? ' active' : ''}`}
          onClick={() => selectTab('keys')}
        >
          API keys
        </button>
      </div>
      {tab === 'jira' ? <JiraSettings /> : <ApiKeysSettings />}
    </main>
  );
}
