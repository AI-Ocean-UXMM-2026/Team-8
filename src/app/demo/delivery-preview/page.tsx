import {SessionProvider} from '../../../features/auth/session';
import {DeliveryPreview} from '../../../features/tracking/delivery-preview';
import {previewRole} from '../../../shared/api/delivery-preview';
export const metadata={title:'Delivery tracking preview | ParcelCare'};
export default async function Page({searchParams}:{searchParams:Promise<{role?:string}>}){
 const role=previewRole((await searchParams).role);
 return <SessionProvider key={role} demo audience={role==='courier'?'rider':role}><DeliveryPreview role={role}/></SessionProvider>;
}
