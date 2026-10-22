'use client';
import Link from 'next/link';
import {useSession} from '../auth/session';
import {useResource,Loading,ErrorPanel} from '../warehouse/shared';
import {trackingAccess} from '../../shared/api/tracking';
import {LiveCourierTracking} from './live-tracking';
export function SmeShipment({id}:{id:string}){
 const session=useSession();
 if(session.status==='loading')return <Loading/>;
 if(session.status!=='ready')return <main className="mx-auto max-w-5xl p-6"><h1 className="text-xl font-semibold">SME shipment tracking</h1><p className="my-4">Sign in with the SME account that owns this shipment.</p><Link href={`/login?next=/sme/shipments/${id}`}>Sign in</Link></main>;
 return <SmeContent key={session.identity!.actor_id+id} id={id}/>;
}
function SmeContent({id}:{id:string}){
 const {api,identity}=useSession();
 const resource=useResource(id,async signal=>{
  const shipment=await api!.getTrackingShipment(id,signal);
  if(!trackingAccess(identity!.memberships,shipment))throw new Error('This shipment is not available to your SME account.');
  return shipment;
 });
 if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;
 if(!resource.data)return <Loading/>;
 return <main className="mx-auto max-w-5xl p-6 pt-20"><h1 className="text-xl font-semibold" data-user-content>{resource.data.reference}</h1><p className="mt-2 text-sm text-muted">Shipment tracking</p><LiveCourierTracking shipment={resource.data}/></main>;
}
