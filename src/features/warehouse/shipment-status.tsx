import { Badge } from '../../shared/ui';
export const shipmentStatusHelp:Record<string,string>={
 expected:'Awaiting an inbound receipt.',partially_received:'A partial receipt is recorded; receiving is not final.',received:'Inbound receiving is complete.',received_with_discrepancies:'Inbound receiving is complete with a recorded discrepancy.',ready:'Ready for outbound handling; physical steps still require verification.',assigned:'An in-house delivery has been assigned.',picked_up:'Pickup has been recorded.',in_transit:'Delivery is in progress.',delayed:'A delivery delay has been recorded.',failed:'A delivery failure has been recorded.',delivered:'Delivery completion has been recorded.',cancelled:'The shipment has been cancelled.',handed_over:'Handover to the third-party courier has been recorded.'
};
export function ShipmentStatus({status}:{status:string}){
 const tone=['failed','received_with_discrepancies'].includes(status)?'danger':status==='delayed'?'warning':['received','delivered'].includes(status)?'complete':['handed_over','in_transit','picked_up'].includes(status)?'progress':'neutral';
 return <Badge className={`shipmentStatus shipmentStatus-${tone}`} title={shipmentStatusHelp[status]}>{status.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase())}</Badge>;
}
