import type { ReactNode } from 'react';
import { SessionProvider } from '../../features/auth/session';
import { PortalShell } from '../../features/portal/shell';
export default function Layout({ children }: { children: ReactNode }) { return <SessionProvider audience="rider"><PortalShell>{children}</PortalShell></SessionProvider>; }
