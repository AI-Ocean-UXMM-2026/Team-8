import { Suspense } from 'react';
import { Shipments } from '../../../features/warehouse/shipments';
import { Loading } from '../../../features/warehouse/shared';
export default function Page() { return <Suspense fallback={<Loading />}><Shipments /></Suspense>; }
