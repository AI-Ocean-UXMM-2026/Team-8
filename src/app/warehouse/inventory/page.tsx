import { Suspense } from 'react';
import { Inventory } from '../../../features/warehouse/inventory';
import { Loading } from '../../../features/warehouse/shared';
export default function Page() { return <Suspense fallback={<Loading />}><Inventory /></Suspense>; }
