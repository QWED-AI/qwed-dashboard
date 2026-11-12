import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { demoApi } from '../api/demo';
import { httpApi, type QwedApi } from '../api/http';
import type { User } from '../api/types';
import { SAMPLE_ONLY_NOTE, sampleOnly } from '../lib/sampleOnly';
import { readStorage, writeStorage } from '../lib/storage';

type Mode = 'live' | 'demo';

interface Stored {
  mode: Mode;
  token: string;
  user: User;
}

interface SessionValue {
  mode: Mode | null;
  token: string | null;
  user: User | null;
  api: QwedApi;
  /** Owner or admin API key for the compliance routes. Kept in memory only. */
  adminKey: string | null;
  setAdminKey: (key: string | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signInDemo: () => Promise<void>;
  signOut: () => void;
}

const KEY = 'qwed-dashboard.session';
const SessionContext = createContext<SessionValue | null>(null);

function load(): Stored | null {
  const raw = readStorage('session', KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Stored>;
    if ((s.mode === 'live' || s.mode === 'demo') && typeof s.token === 'string' && s.user) {
      // A sample-only build keeps no session against a server: a live one left
      // in this tab by an earlier build is dropped, so its token is never sent.
      if (s.mode === 'live' && sampleOnly()) {
        writeStorage('session', KEY, null);
        return null;
      }
      return s as Stored;
    }
  } catch {
    // Corrupt entry: start signed out.
  }
  return null;
}

export function SessionProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [stored, setStored] = useState<Stored | null>(load);
  const [adminKey, setAdminKey] = useState<string | null>(null);

  const save = useCallback(
    (s: Stored | null) => {
      // The session token lives in sessionStorage so a reload keeps you signed
      // in, and closing the tab signs you out.
      writeStorage('session', KEY, s ? JSON.stringify(s) : null);
      // Drop every cached record (and any cached 401) so the next person to
      // sign in on this tab never sees the previous session's data.
      queryClient.clear();
      setStored(s);
      if (!s) setAdminKey(null);
    },
    [queryClient],
  );

  const value = useMemo<SessionValue>(() => {
    const api = stored?.mode === 'demo' ? demoApi : httpApi;
    return {
      mode: stored?.mode ?? null,
      token: stored?.token ?? null,
      user: stored?.user ?? null,
      api,
      adminKey,
      setAdminKey,
      async signIn(email, password) {
        // A sample-only copy sends no credentials anywhere, whatever calls this.
        if (sampleOnly()) throw new Error(SAMPLE_ONLY_NOTE);
        const res = await httpApi.signIn(email, password);
        save({ mode: 'live', token: res.access_token, user: res.user });
      },
      async signInDemo() {
        const res = await demoApi.signIn('', '');
        save({ mode: 'demo', token: res.access_token, user: res.user });
      },
      signOut() {
        save(null);
      },
    };
  }, [stored, adminKey, save]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
