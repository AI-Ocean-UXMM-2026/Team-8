import {Suspense,type ReactNode} from 'react';
import {DemoGate} from '../../features/auth/demo-gate';
export default function Layout({children}:{children:ReactNode}){return <Suspense fallback={<p role="status" className="p-6 pt-24">Checking demo access…</p>}><DemoGate>{children}</DemoGate></Suspense>;}
