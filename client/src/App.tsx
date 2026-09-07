import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { JiraPage } from './pages/JiraPage';
import { ApiKeysPage } from './pages/ApiKeysPage';
import { AdminPage } from './pages/AdminPage';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/jira" element={<JiraPage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
