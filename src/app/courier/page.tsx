import {SessionProvider} from '../../features/auth/session';
import {CourierWorkspace} from '../../features/courier/workspace';
export default function Page(){return <SessionProvider audience="rider"><CourierWorkspace/></SessionProvider>}
