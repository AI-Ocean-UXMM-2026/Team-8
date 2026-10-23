import type {Schemas} from './transport';
type Assignment={accepted_at:string|null;picked_up_at:string|null;cancelled_at?:string|null;completed_at?:string|null};
export function inHouseFlow(shipment:Pick<Schemas['ShipmentDetail'],'status'|'events'>,assignments:Assignment[],proofs:{confirmed_at:string|null}[]){
 const delivered=shipment.status==='delivered',cancelled=shipment.status==='cancelled';
 const active=assignments.find(a=>!a.cancelled_at&&!a.completed_at),event=(type:string)=>shipment.events.some(e=>e.type===type);
 const steps=[
  {id:'prepare',label:'Pick and pack',owner:'Warehouse',done:delivered||event('picked')&&event('packed')},
  {id:'assign',label:'Assign rider',owner:'Warehouse',done:delivered||!!active},
  {id:'accept',label:'Accept assignment',owner:'Rider',done:delivered||!!active?.accepted_at},
  {id:'pickup',label:'Confirm pickup',owner:'Rider',done:delivered||!!active?.picked_up_at},
  {id:'dispatch',label:'Dispatch shipment',owner:'Warehouse',done:delivered||event('dispatched')},
  {id:'proof',label:'Deliver to SME and submit proof',owner:'Rider',done:delivered||proofs.length>0},
  {id:'receipt',label:'Confirm goods received',owner:'SME',done:delivered},
 ];
 return {steps,next:cancelled?null:steps.find(s=>!s.done)??null,cancelled,delivered};
}
