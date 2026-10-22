import {MyAccount} from '../../../shared/layout/my-account';
import {SessionProvider} from '../../../features/auth/session';
import {PortalShell} from '../../../features/portal/shell';
export default function Page(){return <SessionProvider audience="rider" ><PortalShell><MyAccount/></PortalShell></SessionProvider>}
