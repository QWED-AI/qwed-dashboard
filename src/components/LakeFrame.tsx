import type { ReactNode } from 'react';
import { Mark } from './Mark';

/**
 * The frame for a page outside the shell (sign-in, not found), as the site's
 * dashboard page has it: one column with the mark and the page, beside the
 * still lake at dawn. A white card may stand on the water's edge; the lake
 * itself holds no words. On a narrow screen the lake is a strip on top and
 * the card is left out.
 */
export function LakeFrame({ children, card }: Readonly<{ children: ReactNode; card?: ReactNode }>) {
  return (
    <main className="login">
      <div className="login-col">
        <div className="login-brand">
          <span className="login-mark">
            <Mark width={34} />
          </span>
          <span className="brand-name">
            <strong>QWED Dashboard</strong>
            <span>Version {__APP_VERSION__}</span>
          </span>
        </div>
        {children}
      </div>
      <div className="login-scene">{card}</div>
    </main>
  );
}
