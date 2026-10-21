'use client';
import Link from 'next/link';
import { useSession } from '../auth/session';
import { Card } from '../../shared/ui';
import { Empty, ErrorPanel, Loading, PageTitle, human } from '../warehouse/shared';
import { usePolling } from './polling';
export function RiderTasks(){const{api,identity}=useSession();const resource=usePolling(identity!.actor_id,signal=>api!.listAssignments(signal));if(resource.error)return <ErrorPanel error={resource.error} retry={resource.reload}/>;if(!resource.data)return <Loading/>;
return <><PageTitle title="Rider tasks" my="မိမိပို့ဆောင်ရမည့်စာရင်း" description="Only active assignments. Start location sharing separately after acceptance and pickup."/>{resource.data.length?resource.data.map(item=><Card key={item.id} className="mb-4"><Link className="text-brand underline" href={`/rider/shipments/${item.shipment_id}`}>{item.reference??'Assigned delivery'}</Link><p className="mt-3 text-sm">{human(item.status??'assigned')} · {item.picked_up_at?'Picked up':item.accepted_at?'Accepted':'Awaiting acceptance'}</p></Card>):<Card><Empty text="No active rider assignments."/></Card>}</>;}
