import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { HomePage } from './pages/HomePage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminPage } from './pages/AdminPage';

export function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/jira" element={<Navigate to="/settings" replace />} />
        <Route
          path="/api-keys"
          element={<Navigate to="/settings?tab=keys" replace />}
        />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
