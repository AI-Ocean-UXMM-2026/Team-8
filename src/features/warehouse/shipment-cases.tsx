'use client';
import Link from 'next/link';
import {type Schemas} from '../../shared/api';
import {Card} from '../../shared/ui';
import {useSession} from '../auth/session';
import {ErrorPanel,Loading,human,useResource} from './shared';
export function ShipmentCases({shipmentId,base,version}:{shipmentId:string;base:string;version:number}){
 const {api,warehouseId}=useSession();
 const resource=useResource(`${warehouseId}:${shipmentId}:${version}`,async signal=>{const cases:Schemas['CaseSummary'][]=[];let cursor:string|undefined;const seen=new Set<string>();do{const page=await api!.listCases({warehouseId,status:'all',cursor,limit:100,signal});cases.push(...page.items.filter(c=>c.shipment_id===shipmentId));cursor=page.next_cursor||undefined;if(cursor&&seen.has(cursor))throw new Error('Case pagination did not advance.');if(cursor)seen.add(cursor);}while(cursor);return cases;});
 return <Card className="mt-6"><h2 className="font-semibold">Related cases</h2>{resource.error?<ErrorPanel error={resource.error} retry={resource.reload}/>:!resource.data?<Loading/>:resource.data.length?<ul className="shipmentEvidence">{resource.data.map(c=><li key={c.id}><Link className="shipmentReference" href={`${base}/exceptions/${c.id}`}>{human(c.type)} · {c.id.slice(-8)} →</Link><span className="text-sm text-muted">{human(c.status)}</span></li>)}</ul>:<p className="mt-3 text-sm text-muted">No related cases recorded.</p>}</Card>;
}
