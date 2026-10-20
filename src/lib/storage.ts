// Browser storage can be blocked or throw (private windows, strict settings).
// Every read and write goes through these helpers so the dashboard still works
// without it.

export function readStorage(storage: 'local' | 'session', key: string): string | null {
  try {
    return (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(storage: 'local' | 'session', key: string, value: string | null): void {
  try {
    const s = storage === 'local' ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Ignore: the value just will not survive a reload.
  }
}
