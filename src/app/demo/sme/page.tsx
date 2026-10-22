import {SessionProvider} from '../../../features/auth/session';
import {PortalShell} from '../../../features/portal/shell';
import {TrackingDashboard} from '../../../features/tracking/dashboard';
export default function Page(){return <SessionProvider demo audience="sme"><PortalShell><TrackingDashboard/></PortalShell></SessionProvider>}
