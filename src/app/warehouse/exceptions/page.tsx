import { Suspense } from 'react';
import { Cases } from '../../../features/warehouse/cases';
import { Loading } from '../../../features/warehouse/shared';
export default function Page() { return <Suspense fallback={<Loading />}><Cases /></Suspense>; }
