import {Suspense} from 'react';
import {InventoryDetail} from '../../../../../features/warehouse/inventory';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Suspense fallback={<p>Loading…</p>}><InventoryDetail id={id}/></Suspense>}
