import { DeliveryWorkspace } from '../../../../features/portal/delivery';
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <DeliveryWorkspace id={id}/>;}
