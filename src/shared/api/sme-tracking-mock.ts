import fixture from '../../../contracts/fixtures/warehouse/initial.json';
import {ApiError,type Transport,type ApiRequest,validateRequest} from './transport';
// Read-only fictitious SME preview. Never used by authenticated live sessions.
export function createSmeTrackingMockTransport():Transport{
 const data=structuredClone(fixture.body),warehouse=data.directory.warehouse_id,sme=data.directory.smes[1].id;
 return async<T>(request:ApiRequest)=>{
  validateRequest(request);request.signal?.throwIfAborted();
  const url=new URL(request.path,'https://demo.invalid');
  if(request.method!=='GET')throw new ApiError(403,'DEMO_READ_ONLY','This SME tracking preview is read-only.');
  let value:unknown;
  if(url.pathname==='/api/me')value={actor_id:'10000000-0000-4000-8000-000000000098',memberships:[{warehouse_id:warehouse,sme_id:sme,role:'sme'}]};
  else if(url.pathname==='/api/sme/overview'&&url.searchParams.get('sme_id')===sme)value={inventory:data.inventory.filter(i=>i.sme_id===sme),shipments:data.shipments.filter(s=>s.sme_id===sme),cases:[],approvals:[]};
  else if(url.pathname.startsWith('/api/deliveries/')){
   const id=url.pathname.split('/').pop(),shipment=data.shipments.find(s=>s.id===id&&s.sme_id===sme);
   if(!shipment)throw new ApiError(403,'FORBIDDEN','This shipment is not available in the SME preview.');
   value={shipment,session_id:null};
  }else throw new ApiError(403,'FORBIDDEN','This resource is not available in the SME preview.');
  return structuredClone(value) as T;
 };
}
