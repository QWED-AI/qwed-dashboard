import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router';
import { useSession } from './auth/session';
import { LakeFrame } from './components/LakeFrame';
import { BatchPage } from './pages/BatchPage';
import { HomePage } from './pages/HomePage';
import { KeysPage } from './pages/KeysPage';
import { LedgerPage } from './pages/LedgerPage';
import { LoginPage } from './pages/LoginPage';
import { RecordPage } from './pages/RecordPage';
import { AgentPage } from './pages/AgentPage';
import { AgentsPage } from './pages/AgentsPage';
import { MembersPage } from './pages/MembersPage';
import { SecurityEventsPage } from './pages/SecurityEventsPage';
import { ServerPage } from './pages/ServerPage';

function RequireSession({ children }: Readonly<{ children: ReactNode }>) {
  const { token } = useSession();
  const location = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function NotFound() {
  return (
    <LakeFrame>
      <div>
        <p className="login-kicker">Not found</p>
        <h1 className="login-title">Page not found</h1>
        <p className="login-lead">There is no page at this address. The ledger lists the records your server keeps.</p>
      </div>
      <Link className="btn" to="/ledger" style={{ alignSelf: 'flex-start' }}>
        Go to the ledger
      </Link>
    </LakeFrame>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireSession>
            <HomePage />
          </RequireSession>
        }
      />
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
        path="/batches/:jobId"
        element={
          <RequireSession>
            <BatchPage />
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
      <Route
        path="/agents"
        element={
          <RequireSession>
            <AgentsPage />
          </RequireSession>
        }
      />
      <Route
        path="/agents/:agentId"
        element={
          <RequireSession>
            <AgentPage />
          </RequireSession>
        }
      />
      <Route
        path="/members"
        element={
          <RequireSession>
            <MembersPage />
          </RequireSession>
        }
      />
      <Route
        path="/security"
        element={
          <RequireSession>
            <SecurityEventsPage />
          </RequireSession>
        }
      />
      <Route
        path="/server"
        element={
          <RequireSession>
            <ServerPage />
          </RequireSession>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
