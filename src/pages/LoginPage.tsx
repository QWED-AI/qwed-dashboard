import { useState, type SubmitEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError } from '../api/http';
import { useSession } from '../auth/session';
import { Mark } from '../components/Mark';

function signInError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return 'The email or password is wrong.';
    if (err.status === 403) return 'This account is deactivated.';
    if (err.status === 429)
      return err.retryAfter ? `Too many attempts. Try again in ${err.retryAfter} seconds.` : 'Too many attempts. Try again shortly.';
    if (err.unreachable) return `${err.message} Check that it is running and that the dashboard points at it.`;
    return `Sign-in failed: ${err.message}`;
  }
  return 'Sign-in failed.';
}

export function LoginPage() {
  const { token, signIn, signInDemo } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to={from} replace />;

  async function submit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      void navigate(from, { replace: true });
    } catch (err) {
      setError(signInError(err));
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    await signInDemo();
    void navigate('/', { replace: true });
  }

  return (
    <div className="login">
      <div className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="brand-tile">
            <Mark />
          </span>
          <span className="brand-name">
            <strong>QWED Dashboard</strong>
            <span>Sign in to your QWED server</span>
          </span>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="divider">or</div>
        <button type="button" className="btn" onClick={demo}>
          Explore with sample data
        </button>
        <p className="hint" style={{ margin: 0 }}>
          Sample data runs in your browser only. Nothing is sent to a server.
        </p>
      </div>
    </div>
  );
}
