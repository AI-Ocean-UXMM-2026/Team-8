import type { ReactNode } from 'react';
import { SessionProvider } from '../../../features/auth/session';
import { WarehouseShell } from '../../../features/warehouse/shell';
export default function Layout({ children }: { children: ReactNode }) { return <SessionProvider demo><WarehouseShell>{children}</WarehouseShell></SessionProvider>; }
