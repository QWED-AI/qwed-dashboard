import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { useSession } from './auth/session';
import { KeysPage } from './pages/KeysPage';
import { LedgerPage } from './pages/LedgerPage';
import { LoginPage } from './pages/LoginPage';
import { RecordPage } from './pages/RecordPage';

function RequireSession({ children }: { children: ReactNode }) {
  const { token } = useSession();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="login">
      <div className="login-card">
        <h1 className="h1">Page not found</h1>
        <Link className="btn" to="/ledger">
          Go to the ledger
        </Link>
      </div>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Navigate to="/ledger" replace />} />
      <Route
        path="/ledger"
        element={
          <RequireSession>
            <LedgerPage />
          </RequireSession>
        }
      />
      <Route
        path="/records/:id"
        element={
          <RequireSession>
            <RecordPage />
          </RequireSession>
        }
      />
      <Route
        path="/keys"
        element={
          <RequireSession>
            <KeysPage />
          </RequireSession>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
